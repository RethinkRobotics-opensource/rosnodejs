/*
 *    Copyright 2017 Rethink Robotics
 *
 *    Copyright 2017 Chris Smith
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

import * as NetworkUtils from '../../utils/network_utils.js'
import * as SerializationUtils from '../../utils/serialization_utils.js'
const DeserializeStream = SerializationUtils.DeserializeStream;
const PrependLength = SerializationUtils.PrependLength;
import * as TcprosUtils from '../../utils/tcpros_utils.js'
import * as UdprosUtils from '../../utils/udpros_utils.js'

import { Socket } from 'net';
import { EventEmitter } from 'events'
import Logging from '../LoggingManager.js'
import type Logger from '../../utils/log/Logger';
import ClientStates from '../../utils/ClientStates'
import { SubscriberOptions, SubscriberClientMap, UdpInfo } from '../../types/Subscriber';
import IRosNode from '../../types/RosNode';
import { MessageConstructor } from '../../types/Message';
import * as XmlrpcTypes from '../../types/XmlrpcTypes';

//-----------------------------------------------------------------------

/**
 * Implementation class for a Subscriber. Handles registration, connecting to
 * publishers, etc. Public-facing subscriber classes will be given an instance
 * of this to use
 */
export default class SubscriberImpl<M> extends EventEmitter {
  count: number = 0;
  _topic: string;
  _type: string;
  _udp: boolean;
  _dgramSize?: number;
  _tcp: boolean;
  _udpFirst: boolean;
  _queueSize: number = 1;
  _throttleMs: number = 0;
  _tcpNoDelay: boolean = false;
  _nodeHandle: IRosNode;
  _messageHandler: MessageConstructor<M>;
  _pubClients: SubscriberClientMap = {};
  _pendingPubClients: SubscriberClientMap = {};
  _state: ClientStates;
  _log: Logger;
  _connectionId?: number;
  _udpMessage: UdpInfo;

  constructor(options: SubscriberOptions<M>, nodeHandle: IRosNode) {
    super();

    this._topic = options.topic;

    this._type = options.type;

    this._udp = !!~options.transports.indexOf('UDPROS')

    if(this._udp){
      this._dgramSize = typeof options.dgramSize === 'number' && options.dgramSize ? options.dgramSize : 1500
    }

    this._tcp = !!~options.transports.indexOf('TCPROS');

    this._udpFirst = options.transports.indexOf('TCPROS') > options.transports.indexOf('UDPROS')

    if (options.hasOwnProperty('queueSize')) {
      this._queueSize = options.queueSize;
    }

    /**
     * throttleMs interacts with queueSize to determine when to handle callbacks
     *  < 0  : handle immediately - no interaction with queue
     *  >= 0 : place event at end of event queue to handle after minimum delay (MS)
     */
    if (options.hasOwnProperty('throttleMs')) {
      this._throttleMs = options.throttleMs;
    }

    // tcpNoDelay will be set as a field in the connection header sent to the
    // relevant publisher - the publisher should then set tcpNoDelay on the socket
    this._tcpNoDelay =  !!options.tcpNoDelay;

    this._nodeHandle = nodeHandle;
    this._nodeHandle.getSpinner().addClient(this, this._getSpinnerId(), this._queueSize, this._throttleMs);

    this._log = Logging.getLogger('ros.rosnodejs');

    if (!options.typeClass) {
      throw new Error(`Unable to load message for subscriber ${this.getTopic()} with type ${this.getType()}`);
    }
    this._messageHandler = options.typeClass;
    this._pubClients = {};

    this._pendingPubClients = {};

    this._state = ClientStates.REGISTERING;

    this._connectionId = null

    this._udpMessage = {
      blkN: 0,
      msgId: -1,
      buffer: Buffer.alloc(0),
    }
    this._register();
  }

  private _getSpinnerId(): string {
    return `Subscriber://${this.getTopic()}`;
  }

  getTopic(): string {
    return this._topic;
  }

  getType(): string {
    return this._type;
  }

  getNumPublishers(): number {
    return Object.keys(this._pubClients).length;
  }

  getNode(): IRosNode {
    return this._nodeHandle;
  }

  getConnectionId(): number {
    return this._connectionId
  }

  getTransport(): string {
    return this._udpFirst && this._udp ? 'UDPROS' : 'TCPROS'
  }

  handleMessageChunk(header: UdpInfo, dgramMsg: Buffer) {
    const { connectionId, opCode, blkN, msgId } = header
    switch(opCode){
      // DATA0
      case 0:
        // no chunk
        if(blkN === 1){
          this._handleMessage(dgramMsg.slice(12));
        } else {
          this._udpMessage = {
            blkN,
            msgId,
            buffer: dgramMsg.slice(12),
            connectionId
          };
        }
        break;
      // DATAN
      case 1:
        if(msgId === this._udpMessage.msgId && connectionId === this._udpMessage.connectionId){
          let buffer = Buffer.from(dgramMsg.slice(8));
          this._udpMessage.buffer = Buffer.concat([this._udpMessage.buffer, buffer]);
          // last chunk
          if(this._udpMessage.blkN -1 === header.blkN ){
            this._handleMessage(Buffer.from(this._udpMessage.buffer));
          }
        }
        break;

      // PING
      case 2:
        break;

      // ERR
      case 3:
        break;
    }
  }

  shutdown(): void {
    this._state = ClientStates.SHUTDOWN;
    this._log.debug('Shutting down subscriber %s', this.getTopic());

    for (const client in this._pubClients) {
      this._disconnectClient(client);
    }
    for (const client in this._pendingPubClients) {
      this._disconnectClient(client);
    }

    // disconnect from the spinner in case we have any pending callbacks
    this._nodeHandle.getSpinner().disconnect(this._getSpinnerId());
    this._pubClients = {};
    this._pendingPubClients = {};
  }

  isShutdown(): boolean {
    return this._state === ClientStates.SHUTDOWN;
  }

  getClientUris(): string[] {
    return Object.keys(this._pubClients);
  }

  requestTopicFromPubs(pubs: string[]): void {
    pubs.forEach((pubUri) => {
      pubUri = pubUri.trim();
      this._requestTopicFromPublisher(pubUri)
    });
  }

  _handlePublisherUpdate(publisherList: string[]): void {
    const missingPublishers = new Set(Object.keys(this._pubClients));

    for (let pubUri of publisherList) {
      pubUri = pubUri.trim();
      if (!this._pubClients.hasOwnProperty(pubUri)) {
        this._requestTopicFromPublisher(pubUri)
      }

      missingPublishers.delete(pubUri);
    }

    for (const pubUri in missingPublishers) {
      this._disconnectClient(pubUri);
    }
  }

  private async _requestTopicFromPublisher(pubUri: string): Promise<void> {
    let info = NetworkUtils.getAddressAndPortFromUri(pubUri);
    this._log.debug('Sending topic request to ' + JSON.stringify(info));

    let protocols: XmlrpcTypes.Protocol[] = []
    if(this._tcp){
      protocols.push(['TCPROS'])
    }
    if(this._udp){
      let header = UdprosUtils.createSubHeader(this._nodeHandle.getNodeName(), this._messageHandler.md5sum(), this.getTopic(), this.getType())
      protocols.push(['UDPROS', header, info.host, this._nodeHandle._udprosPort, this._dgramSize || 1500])
    }
    if(this._udpFirst){
      protocols.reverse();
    }
    try {
      const resp = await this._nodeHandle.requestTopic(info.host, info.port, this._topic, protocols);
      this.emit('registered');
      this._handleTopicRequestResponse(resp, pubUri);
    }
    catch(err) {
      // there was an error in the topic request
      this._log.warn('Error requesting topic on %s: %s', this.getTopic(), err);
    }
  }

  /**
   * disconnects and clears out the specified client
   * @param clientId {string}
   */
  private _disconnectClient(clientId: string): void {
    let entry = this._pubClients[clientId];

    const hasValidatedClient = !!entry;
    if (!hasValidatedClient) {
      entry = this._pendingPubClients[clientId];
    }

    if (entry) {
      const { socket, deserializer } = entry;
      this._log.debug('Subscriber %s disconnecting client %s', this.getTopic(), clientId);
      socket.end();

      socket.removeAllListeners();
      deserializer.removeAllListeners();

      deserializer.end();
      socket.unpipe(deserializer);

      delete this._pubClients[clientId];
      delete this._pendingPubClients[clientId];

      if (hasValidatedClient) {
        this.emit('disconnect');
      }
    }
  }

  /**
   * Registers the subscriber with the ROS master
   * will connect to any existing publishers on the topic that are included in the response
   */
  private async _register(): Promise<void> {
    try {
      const resp = await this._nodeHandle.registerSubscriber(this._topic, this._type);
      // if we were shutdown between the starting the registration and now, bail
      if (this.isShutdown()) {
        return;
      }

      // else handle response from register subscriber call
      const [ code, msg, pubs ] = resp;
      if ( code === 1 ) {
        // success! update state to reflect that we're registered
        this._state = ClientStates.REGISTERED;

        if (pubs.length > 0) {
          // this means we're ok and that publishers already exist on this topic
          // we should connect to them
          this.requestTopicFromPubs(pubs);
        }
        this.emit('registered');
      }
    }
    catch(err) {
      this._log.warn('Error during subscriber %s registration: %s', this.getTopic(), err);
    }
  }

  /**
   * Handles the response to a topicRequest message (to connect to a publisher)
   * @param resp {Array} xmlrpc response to a topic request
   */
  private _handleTopicRequestResponse(resp: any, nodeUri: string): void {
    if (this.isShutdown()) {
      return;
    }
    // resp[2] has port and address for where to connect
    let proto = resp[2][0];
    if(proto === 'UDPROS' && this._udp){
      this._handleUdpTopicRequestResponse(resp, nodeUri)
    } else if (proto === 'TCPROS' && this._tcp){
      this._handleTcpTopicRequestResponse(resp, nodeUri)
    } else {
      this._log.warn(`Publisher supports only ${proto} but is not enabled`)
    }
  }

  _handleUdpTopicRequestResponse(resp: any, nodeUri: string): void {
    this._connectionId = resp[2][3]
  }

  _handleTcpTopicRequestResponse(resp: any, nodeUri: string): void {
    let info = resp[2];
    let port = info[2];
    let address = info[1];
    let socket = new Socket();
    const socketHost = address + ':' + port;

    socket.on('end', () => {
      this._log.info('Subscriber client socket %s on topic %s ended the connection',
        socketHost, this.getTopic());
    });

    socket.on('error', (err) => {
      this._log.warn('Subscriber client socket %s on topic %s had error: %s',
        socketHost, this.getTopic(), err);
    });

    // hook into close event to clean things up
    socket.on('close', () => {
      this._log.info('Subscriber client socket %s on topic %s disconnected',
        socketHost, this.getTopic());
      this._disconnectClient(socketHost);
    });

    // open the socket at the provided address, port
    socket.connect(port, address, () => {
      if (this.isShutdown()) {
        socket.end();
        return;
      }

      this._log.debug('Subscriber on ' + this.getTopic() + ' connected to publisher at ' + address + ':' + port);
      socket.write(this._createTcprosHandshake());
    });
    let deserializer = new DeserializeStream();
    socket.pipe(deserializer);

    // cache client in "pending" map.
    // It's not validated yet so we don't want it to show up as a client.
    // Need to keep track of it in case we're shutdown before it can be validated.
    this._pendingPubClients[nodeUri] = {
      socket,
      deserializer
    }

    // create a one-time handler for the connection header
    // if the connection is validated, we'll listen for more events
    deserializer.once('message', (msg) => {
      this._handleConnectionHeader(socket, nodeUri, msg);
    });
  }

  /**
   * Convenience function - creates the connection header for this subscriber to send
   * @returns {string}
   */
  _createTcprosHandshake() {
    return TcprosUtils.createSubHeader(this._nodeHandle.getNodeName(), this._messageHandler.md5sum(),
      this.getTopic(), this.getType(), this._messageHandler.messageDefinition(), this._tcpNoDelay);
  }

  _handleConnectionHeader(socket: Socket, nodeUri: string, msg: Buffer) {
    if (this.isShutdown()) {
      this._disconnectClient(nodeUri);
      return;
    }

    let header = TcprosUtils.parseTcpRosHeader(msg);
    // check if the publisher had a problem with our connection header
    if (header.error) {
      this._log.error(header.error);
      return;
    }

    // now do our own validation of the publisher's header
    const error = TcprosUtils.validatePubHeader(header, this.getType(), this._messageHandler.md5sum());
    if (error) {
      this._log.error(`Unable to validate subscriber ${this.getTopic()} connection header ${JSON.stringify(header)}`);
      socket.end(PrependLength(error));
      return;
    }
    // connection header was valid - we're good to go!
    this._log.debug('Subscriber ' + this.getTopic() + ' got connection header ' + JSON.stringify(header));

    const { deserializer } = this._pendingPubClients[nodeUri];
    // cache client now that we've verified the connection header
    this._pubClients[nodeUri] = {
      socket,
      deserializer
    };
    // remove client from pending map now that it's validated
    delete this._pendingPubClients[nodeUri];

    // pipe all future messages to _handleMessage
    deserializer.on('message', (msg: Buffer) =>
      this._handleMessage(msg, nodeUri));

    this.emit('connection', header, nodeUri);
  }



  /**
   * Handles a single message from a publisher. Passes message off to
   * Spinner if we're queueing, otherwise handles it immediately.
   * @param msg {string}
   */
  _handleMessage(msg: Buffer, nodeUri?: string) {
    if (this._throttleMs < 0) {
      this._handleMsgQueue([{msg, nodeUri}]);
    }
    else {
      this._nodeHandle.getSpinner().ping(this._getSpinnerId(), {msg, nodeUri});
    }
  }

  /**
   * Deserializes and events for the list of messages
   * @param msgQueue {Array} array of strings - each string is its own message.
   */
  _handleMsgQueue(msgQueue: [{ msg: Buffer, nodeUri?: string }]) {
    try {
      msgQueue.forEach(({msg, nodeUri}) => {
        this.emit('message', this._messageHandler.deserialize(msg), msg.length, nodeUri);
      });
    }
    catch (err) {
      this._log.error('Error while dispatching message on topic %s: %s', this.getTopic(), err);
      this.emit('error', err);
    }
  }
}
