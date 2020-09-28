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
 *    Unless required by applicable law or agreed to in writing,
 *    software distributed under the License is distributed on an "AS
 *    IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *    express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 */


import * as Udp from 'dgram';
import type { Socket } from 'net';
import * as SerializationUtils from '../../utils/serialization_utils';
const PrependLength = SerializationUtils.PrependLength;
import * as TcprosUtils from '../../utils/tcpros_utils';
import { EventEmitter } from 'events';
import Logging from '../LoggingManager';
import ClientStates from '../../utils/ClientStates';
import * as UdprosUtils from '../../utils/udpros_utils';
import { PublisherOptions, TcpClientMap, UdpClientMap } from '../../types/Publisher';
import IRosNode from '../../types/RosNode';
import { MessageConstructor, Message } from '../../types/Message';
import { SubscriberHeader } from '../../types/Subscriber';

let msgCount = 0;
/**
 * Implementation class for a Publisher. Handles registration, connecting to
 * subscribers, etc. Public-facing publisher classes will be given an instance
 * of this to use
 */
export default class PublisherImpl<M> extends EventEmitter {
  count: number = 0;
  _topic: string;
  _type: string;
  _latching: boolean = false;
  _tcpNoDelay: boolean = false;
  _queueSize: number = 1;
  _throttleMs: number = 0;
  _resolve: boolean = false;
  _lastSentMsg: Buffer|null = null;
  _nodeHandle: IRosNode;
  _subClients: TcpClientMap = {};
  _udpSubClients: UdpClientMap = {};
  _messageHandler: MessageConstructor<M>;
  _state: ClientStates;
  _log: any;
  udpSocket: Udp.Socket|null = null;

  constructor(options: PublisherOptions<M>, nodeHandle: IRosNode) {
    super();

    this.count = 0;

    this._topic = options.topic;

    this._type = options.type;

    this._latching = !!options.latching;

    this._tcpNoDelay =  !!options.tcpNoDelay;

    if (options.hasOwnProperty('queueSize')) {
      this._queueSize = options.queueSize;
    }

    /**
     * throttleMs interacts with queueSize to determine when to send
     * messages.
     *  < 0  : send immediately - no interaction with queue
     * >= 0 : place event at end of event queue to publish message
         after minimum delay (MS)
     */
    if (options.hasOwnProperty('throttleMs')) {
      this._throttleMs = options.throttleMs;
    }

    // OPTIONS STILL NOT HANDLED:
    //  headers: extra headers to include
    //  subscriber_listener: callback for new subscribers connect/disconnect

    this._resolve = !!options.resolve;

    this._nodeHandle = nodeHandle;
    this._nodeHandle.getSpinner().addClient(this, this._getSpinnerId(), this._queueSize, this._throttleMs);

    this._log = Logging.getLogger('ros.rosnodejs');

    if (!options.typeClass) {
      throw new Error(`Unable to load message for publisher ${this.getTopic()} with type ${this.getType()}`);
    }
    this._messageHandler = options.typeClass;

    this._state = ClientStates.REGISTERING;
    this._register();
  }

  private _getSpinnerId(): string {
    return `Publisher://${this.getTopic()}`;
  }

  getTopic(): string {
    return this._topic;
  }

  getType(): string {
    return this._type;
  }

  getLatching(): boolean {
    return this._latching;
  }

  getNumSubscribers(): number {
    return Object.keys(this._subClients).length + Object.keys(this._udpSubClients).length;
  }

  getClientUris(): string[] {
    return Object.keys(this._subClients).concat(Object.keys(this._udpSubClients));
  }

  isUdpSubscriber(topic: string): boolean {
    return this._udpSubClients[topic] !== undefined
  }

  getNode(): IRosNode {
    return this._nodeHandle;
  }

  /**
   * Clears and closes all client connections for this publisher.
   */
  shutdown() {
    this._state = ClientStates.SHUTDOWN;
    this._log.debug('Shutting down publisher %s', this.getTopic());

    for (const clientId in this._subClients) {
      this._subClients[clientId].end();
    }

    if (this.udpSocket) {
      this.udpSocket.close();
    }

    // disconnect from the spinner in case we have any pending callbacks
    this._nodeHandle.getSpinner().disconnect(this._getSpinnerId());
    this._subClients = {};
  }

  isShutdown(): boolean {
    return this._state === ClientStates.SHUTDOWN;
  }

  publish(msg: M, throttleMs?: number) {
    if (this.isShutdown()) {
      return;
    }

    if (typeof throttleMs !== 'number') {
      throttleMs = this._throttleMs;
    }

    if (throttleMs < 0) {
      // short circuit JS event queue, publish "synchronously"
      this._handleMsgQueue([msg]);
    }
    else {
      this._nodeHandle.getSpinner().ping(this._getSpinnerId(), msg);
    }
  }

  private _handleMsgQueue(msgQueue: M[]): void {
    // There's a small chance that we were shutdown while the spinner was locked
    // which could cause _handleMsgQueue to be called if this publisher was in there.
    if (this.isShutdown()) {
      return;
    }

    const numClients = this.getNumSubscribers();
    if (numClients === 0) {
      this._log.debugThrottle(2000, `Publishing message on ${this.getTopic()} with no subscribers`);
    }

    try {
      for (let msg of msgQueue) {
        if (this._resolve) {
          msg = this._messageHandler.Resolve(msg);
        }

        const serializedMsg = TcprosUtils.serializeMessage(this._messageHandler, msg);

        for (const client in this._subClients) {
          this._subClients[client].write(serializedMsg);
        }

        // Sending msgs to udp subscribers
        this._sendMsgToUdpClients(serializedMsg)

        // if this publisher is supposed to latch,
        // save the last message. Any subscribers that connects
        // before another call to publish() will receive this message
        if (this.getLatching()) {
          this._lastSentMsg = serializedMsg;
        }
        msgCount++;
      }
    }
    catch (err) {
      this._log.error('Error when publishing message on topic %s: %s', this.getTopic(), err.stack);
      this.emit('error', err);
    }
  }

  private _sendMsgToUdpClients(serializedMsg: Buffer) {
    for (const client in this._udpSubClients) {
      let serializedH;
      let payloadSize = this._udpSubClients[client].dgramSize - 8;
      if(serializedMsg.length > payloadSize){
        let totalChunks = Math.ceil(serializedMsg.length / payloadSize)
        let index = 0, offset = payloadSize;
        let chunk = serializedMsg.slice(0, payloadSize);

        serializedH = UdprosUtils.serializeUdpHeader(this._udpSubClients[client].connId, 0, msgCount, totalChunks)
        let msg = Buffer.concat([serializedH, chunk]);

        // sending first message opcode 0
        this.udpSocket.send(msg, this._udpSubClients[client].port, this._udpSubClients[client].host, (err) => {
          if(err){
            throw err;
          }
        })

        // sending other chuncks
        do{
          chunk = serializedMsg.slice(offset, offset + payloadSize);
          index++;
          serializedH = UdprosUtils.serializeUdpHeader(this._udpSubClients[client].connId, 1, msgCount, index)

          offset += payloadSize;

          msg = Buffer.concat([serializedH, chunk]);
          this.udpSocket.send(msg, this._udpSubClients[client].port, this._udpSubClients[client].host, (err) => {
            if(err){
              throw err;
            }
          })

        } while(index < totalChunks)
      }
      else{
        serializedH = UdprosUtils.serializeUdpHeader(this._udpSubClients[client].connId, 0, msgCount, 1)
        let msg = Buffer.concat([serializedH, serializedMsg]);
        this.udpSocket.send(msg, this._udpSubClients[client].port, this._udpSubClients[client].host, (err) => {
          if(err){
            throw err;
          }
        })
      }
    }
  }

  handleSubscriberConnection(socket: Socket, name: string, header: SubscriberHeader): void {
    let error = TcprosUtils.validateSubHeader(
      header, this.getTopic(), this.getType(),
      this._messageHandler.md5sum());

    if (error !== null) {
      this._log.error('Unable to validate subscriber connection header '
                      + JSON.stringify(header));
      socket.end(PrependLength(error));
      return;
    }
    // else
    this._log.info('Pub %s got connection header %s', this.getTopic(), JSON.stringify(header));

    // create and send response
    let respHeader =
      TcprosUtils.createPubHeader(
        this._nodeHandle.getNodeName(),
        this._messageHandler.md5sum(),
        this.getType(),
        this.getLatching(),
        this._messageHandler.messageDefinition());
    socket.write(respHeader);

    // if this publisher had the tcpNoDelay option set
    // disable the nagle algorithm
    if  (this._tcpNoDelay || header.tcp_nodelay === '1') {
      socket.setNoDelay(true);
    }

    socket.on('close', () => {
      this._log.info('Publisher client socket %s on topic %s disconnected',
                     name, this.getTopic());
      socket.removeAllListeners();
      delete this._subClients[name];
      this.emit('disconnect');
    });

    socket.on('end', () => {
      this._log.info('Publisher client socket %s on topic %s ended the connection',
                     name, this.getTopic());
    });

    socket.on('error', (err) => {
      this._log.warn('Publisher client socket %s on topic %s had error: %s',
                     name, this.getTopic(), err);
    });

    // if we've cached a message from latching, send it now
    if (this._lastSentMsg !== null) {
      this._log.debug('Sending latched msg to new subscriber');
      socket.write(this._lastSentMsg);
    }

    // handshake was good - we'll start publishing to it
    this._subClients[name] = socket;

    this.emit('connection', header, name);
  }

  addUdpSubscriber(connId: number, host: string, port: number, dgramSize: number): void {
    if(Object.keys(this._udpSubClients).length === 0){
      this.udpSocket = Udp.createSocket('udp4');
    }
    this._udpSubClients[connId] = {
      port,
      host,
      dgramSize,
      connId
    }
  }

  removeUdpSubscriber(connId: string): void {
    delete this._udpSubClients[connId]
    if(Object.keys(this._udpSubClients).length === 0){
      this.udpSocket.close();
      this.udpSocket = null;
    }
  }

  private async _register(): Promise<void> {
    try {
      const resp = await this._nodeHandle.registerPublisher(this._topic, this._type)
      // if we were shutdown between the starting the registration and now, bail
      if (this.isShutdown()) {
        return;
      }
      this._log.info('Registered %s as a publisher: %j', this._topic, resp);
      const [ code, msg, subs ] = resp;
      if (code === 1) {
        // registration worked
        this._state = ClientStates.REGISTERED;
        this.emit('registered');
      }
    }
    catch(err) {
      if (!this._nodeHandle.isShutdown()) {
        this._log.error('Error while registering publisher %s: %s', this.getTopic(), err);
      }
    }
  }
}
