/*
 *    Copyright 2016 Rethink Robotics
 *
 *    Copyright 2016 Chris Smith
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

import * as net from 'net';
import * as xmlrpc from 'xmlrpc-rosnodejs';
import MasterApiClient from './MasterApiClient';
import SlaveApiClient from './SlaveApiClient';
import ParamServerApiClient from './ParamServerApiClient';
import Subscriber from './Subscriber';
import Publisher from './Publisher';
import PublisherImpl from './impl/PublisherImpl';
import SubscriberImpl from './impl/SubscriberImpl';
import ServiceClient from './ServiceClient';
import ServiceServer from './ServiceServer';
import GlobalSpinner from '../utils/spinners/GlobalSpinner';
import * as NetworkUtils from '../utils/network_utils';
import * as messageUtils from '../utils/message_utils';
import * as tcprosUtils from '../utils/tcpros_utils';
import { DeserializeStream, serializeString } from '../utils/serialization_utils';
import { EventEmitter } from 'events';
import Logging from './LoggingManager';
import * as UdprosUtils from '../utils/udpros_utils';
import * as UDPSocket from 'dgram';
import IRosNode, { SpinnerOptions } from '../types/RosNode';
import type Logger from '../utils/log/Logger';
import type * as XmlrpcTypes from '../types/XmlrpcTypes';
import type Spinner from '../types/Spinner';
import { PublisherOptions } from '../types/Publisher';
import { MessageConstructor, ServiceConstructor } from '../types/Message';
import { SubscriberOptions, SubscriberCallback } from '../types/Subscriber';
import { ServerOptions, ServerCallback, IServiceServer } from '../types/ServiceServer';
import { ServiceClientOptions } from '../types/ServiceClient';

type NodeOptions = {
  tcprosPort?: number;
  xmlrpcPort?: number;
  udprosPort?: number;
  forceExit?: boolean;
  spinner?: any;
}

/**
 * Create a ros node interface to the master
 * @param name {string} name of the node
 * @param rosMaster {string} full uri of ros maxter (http://localhost:11311)
 */
export default class RosNode extends EventEmitter implements IRosNode {
  private _udpConnectionCounter: number = 0;
  _log: Logger;
  private _debugLog: Logger;
  private _slaveApiServer: xmlrpc.Server = null;
  private _xmlrpcPort: number = null;
  private _tcprosServer: net.Server = null;
  private _udprosServer: UDPSocket.Socket = null;
  private _tcprosPort: number = null;
  _udprosPort: number = null;
  private _nodeName: string;
  private _rosMasterAddress: string;
  private _masterApi: MasterApiClient;
  private _paramServerApi: ParamServerApiClient;
  private _publishers: {[key: string]: PublisherImpl<any> } = {};
  private _subscribers: {[key: string]: SubscriberImpl<any> } = {};
  private _services: {[key: string]: ServiceServer<any, any> } = {};
  private _spinner: Spinner;
  private _shutdown: boolean;
  private _exit: (k?: boolean)=>Promise<void>

  constructor(nodeName: string, rosMaster: string, options: NodeOptions ={}) {
    super();

  	// ActionServers are listening to the shutdown event right now, each of which will add
  	// listeners to RosNode for shutdown
    this.setMaxListeners(0);
    this._udpConnectionCounter = 0
    this._log = Logging.getLogger('ros.rosnodejs');
    this._debugLog = Logging.getLogger('ros.superdebug');

    this._nodeName = nodeName;

    this._rosMasterAddress = rosMaster;

    this._masterApi = new MasterApiClient(this._rosMasterAddress);

    // the param server is hosted on the master -- share its xmlrpc client
    this._paramServerApi = new ParamServerApiClient(this._masterApi.getXmlrpcClient());

    this._setupTcprosServer(options.tcprosPort)
      .then(this._setupSlaveApi.bind(this, options.xmlrpcPort));

    this._setupUdprosServer(options.udprosPort)

    this._setupExitHandler(options.forceExit);

    this._setupSpinner(options.spinner);

    this._shutdown = false;
  }

  getLogger() {
    return this._log;
  }

  getSpinner() {
    return this._spinner;
  }

  getRosMasterUri(): string {
    return this._rosMasterAddress;
  }

  advertise<M>(options: PublisherOptions<M>): Publisher<M> {
    let topic = options.topic;
    let pubImpl = this._publishers[topic];
    if (!pubImpl) {
      pubImpl = new PublisherImpl(options, this);
      this._publishers[topic] = pubImpl;
    }

    return new Publisher(pubImpl);
  }

  subscribe<M>(options: SubscriberOptions<M>, callback?: SubscriberCallback<M>): Subscriber<M> {
    let topic = options.topic;
    let subImpl = this._subscribers[topic];
    if (!subImpl) {
      subImpl = new SubscriberImpl(options, this);
      this._subscribers[topic] = subImpl;
    }

    const sub = new Subscriber(subImpl);
    if (callback && typeof callback === 'function') {
      sub.on('message', callback);
    }

    return sub;
  }

  advertiseService<Req, Res>(options: ServerOptions<Req,Res>, callback: ServerCallback<Req,Res>): IServiceServer {
    let service = options.service;
    let serv = this._services[service];
    if (serv) {
      this._log.warn('Tried to advertise a service that is already advertised in this node [%s]', service);
      return;
    }
    // else
    serv = new ServiceServer(options, callback, this);
    this._services[service] = serv;
    return serv;
  }

  serviceClient<Req,Res>(options: ServiceClientOptions<Req,Res>): ServiceClient<Req,Res> {
    return new ServiceClient(options, this);
  }

  async unsubscribe(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<void> {
    const sub = this._subscribers[topic];
    if (sub) {
      this._debugLog.info('Unsubscribing from topic %s', topic);
      delete this._subscribers[topic];
      sub.shutdown();
      await this.unregisterSubscriber(topic, options);
    }
  }

  async unadvertise(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<void> {
    const pub = this._publishers[topic];
    if (pub) {
      this._debugLog.info('Unadvertising topic %s', topic);
      delete this._publishers[topic];
      pub.shutdown();
      await this.unregisterPublisher(topic, options);
    }
  }

  async unadvertiseService(service: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<void> {
    const server = this._services[service];
    if (server) {
      this._debugLog.info('Unadvertising service %s', service);
      server.disconnect();
      delete this._services[service];
      await this.unregisterService(service, options);
    }
  }

  hasSubscriber(topic: string): boolean {
    return this._subscribers.hasOwnProperty(topic);
  }

  hasPublisher(topic: string): boolean {
    return this._publishers.hasOwnProperty(topic);
  }

  hasService(service: string): boolean {
    return this._services.hasOwnProperty(service);
  }

  getNodeName(): string {
    return this._nodeName;
  }

//------------------------------------------------------------------
// Master API
//------------------------------------------------------------------

  async registerService(service: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterService['Resp']> {
    await this._whenReady();
    return this._masterApi.registerService(
      this._nodeName,
      service,
      NetworkUtils.formatServiceUri(this._tcprosPort),
      this._getXmlrpcUri(),
      options
    );
  }

  async unregisterService(service: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterService['Resp']> {
    await this._whenReady();
    return this._masterApi.unregisterService(
      this._nodeName,
      service,
      NetworkUtils.formatServiceUri(this._tcprosPort),
      options
    );
  }

  async registerSubscriber(topic: string, type: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterSubscriber['Resp']> {
    await this._whenReady();
    return this._masterApi.registerSubscriber(
      this._nodeName,
      topic,
      type,
      this._getXmlrpcUri(),
      options
    );
  }

  async unregisterSubscriber(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterSubscriber['Resp']> {
    await this._whenReady()
    return this._masterApi.unregisterSubscriber(
      this._nodeName,
      topic,
      this._getXmlrpcUri(),
      options
    );
  }

  async registerPublisher(topic: string, type: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterPublisher['Resp']> {
    await this._whenReady();
    return this._masterApi.registerPublisher(
      this._nodeName,
      topic,
      type,
      this._getXmlrpcUri(),
      options
    );
  }

  async unregisterPublisher(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterPublisher['Resp']> {
    await this._whenReady();
    return this._masterApi.unregisterPublisher(
      this._nodeName,
      topic,
      this._getXmlrpcUri(),
      options
    );
  }

  lookupNode(nodeName: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.LookupNode['Resp']> {
    return this._masterApi.lookupNode(this._nodeName, nodeName, options);
  }

  lookupService(service:string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.LookupService['Resp']> {
    return this._masterApi.lookupService(this._nodeName, service, options);
  }

  getMasterUri(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.GetMasterUri['Resp']> {
    return this._masterApi.getUri(this._nodeName, options);
  }

  getPublishedTopics(subgraph: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.TopicInfo> {
    return this._masterApi.getPublishedTopics(this._nodeName, subgraph, options);
  }

  getTopicTypes(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.TopicInfo> {
    return this._masterApi.getTopicTypes(this._nodeName, options);
  }

  getSystemState(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.SystemState> {
    return this._masterApi.getSystemState(this._nodeName, options);
  }

  /**
   * Delays xmlrpc calls until our servers are set up
   * Since we need their ports for most of our calls.
   * @returns {Promise}
   * @private
   */
  private async _whenReady(): Promise<void> {
    if (!this.serversReady()) {
      return new Promise((resolve) => {
        this.once('slaveApiSetupComplete', () => {
          resolve();
        });
      });
    }
  }

  private _getXmlrpcUri(): string {
    // TODO: get host or ip or ...
    return 'http://' + NetworkUtils.getHost() + ':' + this._xmlrpcPort;
  }

//------------------------------------------------------------------
// Parameter Server API
//------------------------------------------------------------------

  deleteParam(key: string): Promise<void> {
    return this._paramServerApi.deleteParam(this._nodeName, key);
  }

  setParam(key: string, value: any): Promise<void> {
    return this._paramServerApi.setParam(this._nodeName, key, value);
  }

  getParam<T>(key: string): Promise<T> {
    return this._paramServerApi.getParam(this._nodeName, key);
  }

  hasParam(key: string): Promise<boolean> {
    return this._paramServerApi.hasParam(this._nodeName, key);
  }
//------------------------------------------------------------------
// Slave API
//------------------------------------------------------------------

  /**
   * Send a topic request to another ros node
   * @param remoteAddress {string} ip address/hostname of node
   * @param remotePort {number} port of node
   * @param topic {string} topic we want a connection for
   * @param protocols {object} communication protocols this node supports (just TCPROS, really)
   */
  requestTopic(remoteAddress: string, remotePort: number, topic: string, protocols: any[]): Promise<XmlrpcTypes.RequestTopic['Resp']> {
    // every time we request a topic, it could be from a new node
    // so we create an xmlrpc client here instead of having a single one
    // for this object, like we do with the MasterApiClient
    let slaveApi = new SlaveApiClient(remoteAddress, remotePort);
    return slaveApi.requestTopic(this._nodeName, topic, protocols);
  }

  serversReady(): boolean {
    return this._xmlrpcPort !== null && this._tcprosPort !== null && this._udprosPort !== null;
  }

  shutdown(): Promise<void> {
    return this._exit();
  }

  isShutdown(): boolean {
    return this._shutdown;
  }

  private _setupSlaveApi(xmlrpcPort: number=null): Promise<void> {
    if (xmlrpcPort === null) {
      xmlrpcPort = 0;
    }

    return new Promise<void>((resolve, reject) => {
      const server = xmlrpc.createServer({port: xmlrpcPort}, () => {
        const { port } = server.httpServer.address() as net.AddressInfo;
        this._debugLog.debug('Slave API Listening on port ' + port);
        this._xmlrpcPort = port;
        this.emit('slaveApiSetupComplete', port);
      });

      server.on('NotFound', (method, params) => {
        this._log.warn('Method ' + method + ' does not exist: ' + params);
      });

      server.on('requestTopic', this._handleTopicRequest.bind(this));
      server.on('publisherUpdate', this._handlePublisherUpdate.bind(this));
      server.on('paramUpdate', this._handleParamUpdate.bind(this));
      server.on('getPublications', this._handleGetPublications.bind(this));
      server.on('getSubscriptions', this._handleGetSubscriptions.bind(this));
      server.on('getPid', this._handleGetPid.bind(this));
      server.on('shutdown', this._handleShutdown.bind(this));
      server.on('getMasterUri', this._handleGetMasterUri.bind(this));
      server.on('getBusInfo', this._handleGetBusInfo.bind(this));
      server.on('getBusStats', this._handleGetBusStats.bind(this));

      server.httpServer.on('clientError', (err, socket) => {
        this._log.error('XMLRPC Server socket error: %j', err);
      });

      this._slaveApiServer = server;
    });
  }

  private _setupTcprosServer(tcprosPort: number=null): Promise<void> {
    let _createServer = (callback: ()=>void) => {
      const server = net.createServer((connection) => {
        const conName = connection.remoteAddress + ":" + connection.remotePort;
        this._debugLog.info('Node %s got connection from %s', this.getNodeName(), conName);

        // data from connections will be TCPROS encoded, so use a
        // DeserializeStream to handle any chunking
        const deserializeStream = new DeserializeStream();
        connection.pipe(deserializeStream);

        deserializeStream.once('message', (headerData: Buffer) => {
          const header = tcprosUtils.parseTcpRosHeader(headerData);
          if (!header) {
            this._log.error('Unable to validate connection header %s', headerData);
            connection.end(serializeString('Unable to validate connection header'));
            return;
          }
          this._debugLog.info('Got connection header: %j', header);

          if (header.hasOwnProperty('topic')) {
            // this is a subscriber, validate header and pass off connection to appropriate publisher
            const topic = header.topic;
            const pub = this._publishers[topic];
            if (pub) {
              pub.handleSubscriberConnection(connection, conName, header);
            }
            else {
              // presumably this just means we shutdown the publisher after this
              // subscriber started trying to connect to us
              this._log.info('Got connection header for unknown topic %s', topic);
            }
          }
          else if (header.hasOwnProperty('service')) {
            // this is a service client, validate header and pass off connection to appropriate service provider
            const service = header.service;
            const serviceProvider = this._services[service];
            if (serviceProvider) {
              serviceProvider.handleClientConnection(connection, conName, deserializeStream, header);
            }
          }
        });
      });

      if (tcprosPort === null) {
        tcprosPort = 0;
      }
      server.listen(tcprosPort);

      this._tcprosServer = server;

      // it's possible the port was taken before we could use it
      server.on('error', (err) => {
        this._log.warn('Error on tcpros server! %j', err);
      });

      // the port was available
      server.on('listening', () => {
        const { port } = server.address() as net.AddressInfo;
        this._debugLog.info('Listening on %j', server.address());
        this._tcprosPort = port;
        callback();
      });
    };

    return new Promise((resolve) => {
      _createServer(resolve);
    });
  }

  private _setupUdprosServer(udprosPort: number=null): Promise<void> {
    return new Promise((resolve) => {

      const socket = UDPSocket.createSocket('udp4');
      socket.on('error', (err) => {
        this._log.warn('Error on UDP client socket: %s', err);
        socket.close();
      });
      // init empty msg

      socket.on('message', (dgramMsg, rinfo) => {
        let header = UdprosUtils.deserializeHeader(dgramMsg)
        if(!header){
          this._log.warn('Unable to parse packet\'s header')
          return
        }
        // first dgram message
        const { connectionId } = header
        let topic = Object.keys(this._subscribers).find(s => this._subscribers[s].getConnectionId() === connectionId)
        if(!this._subscribers[topic]){
          this._log.warn('Unable to find subscriberImpl for connection id: '  + connectionId)
          return
        }
        this._subscribers[topic].handleMessageChunk(header, dgramMsg)
      });

      socket.on('listening', () => {
        const address = socket.address();
        this._log.debug(`UDP socket bound: ${address.address}:${address.port}`);
        this._debugLog.info('Listening on %j', address);
        this._udprosPort = address.port;
        resolve()
      });

      this._udprosServer = socket
      if(udprosPort === null){
        udprosPort = 0;
      }
      socket.bind(udprosPort);
    });
  }

  private _handleTopicRequest(...[err, req, callback]: ApiArgs<XmlrpcTypes.RequestTopic>): void {
    this._debugLog.info('Got topic request %j', req);
    const [_, topic, params] = req;
    if (!err) {
      let pub = this._publishers[topic];
      if (pub) {
        const protocol = params[0][0];
        if(protocol === 'TCPROS') {
          let port = this._tcprosPort;
          let resp: XmlrpcTypes.RequestTopic['Resp'] = [
            1,
            'Allocated topic connection on port ' + port,
            [
              'TCPROS',
              NetworkUtils.getHost(),
              port
            ]
          ];
          callback(null, resp);
        }
        else if (protocol === 'UDPROS') {
          const [_, rawHeader, host, port, dgramSize] = params[0];
          const header = tcprosUtils.parseTcpRosHeader(rawHeader);
          const typeClass = messageUtils.getHandlerForMsgType(header.type, true);

          const thishost = NetworkUtils.getHost();
          const connId = ++this._udpConnectionCounter;
          let resp: XmlrpcTypes.RequestTopic['Resp'] = [
            1,
            '',
            [
              'UDPROS',
              thishost, //maybe wrong
              port,
              connId, //connection Id
              dgramSize,
              UdprosUtils.createPubHeader(this.getNodeName(), typeClass.md5sum(), header.type, typeClass.messageDefinition())
            ]
          ];
          pub.addUdpSubscriber(connId, thishost, port, dgramSize);
          callback(null, resp)
        }
        else {
          this._log.warn('Got topic request for unknown protocol [%s]', protocol);
        }
      }
    }
    else {
      this._log.error('Error during topic request: %s, %j', err, params);
      let resp: XmlrpcTypes.RequestTopic['Resp'] = [
        0,
        'Unable to allocate topic connection for ' + topic,
        []
      ];
      callback('Error: Unknown topic ' + topic, resp);
    }
  }

  /**
   * Handle publisher update message from master
   * @param err was there an error
   * @param params {Array} [caller_id, topic, publishers]
   * @param callback function(err, resp) call when done handling message
   */
  private _handlePublisherUpdate(...[err, params, callback]: ApiArgs<XmlrpcTypes.PublisherUpdate>): void {
    this._debugLog.info('Publisher update ' + err + ' params: ' + JSON.stringify(params));
    let topic = params[1];
    let sub = this._subscribers[topic];
    if (sub) {
      this._debugLog.info('Got sub for topic ' + topic);
      sub._handlePublisherUpdate(params[2]);

      callback(null, [ 1, 'Handled publisher update for topic ' + topic, 0 ]);
    }
    else {
      this._debugLog.warn(`Got publisher update for unknown topic ${topic}`);

      let err = 'Error: Unknown topic ' + topic;
      callback(err, [0, "Don't have topic " + topic, 0]);
    }
  }

  private _handleParamUpdate(...[err, params, callback]: ApiArgs<XmlrpcTypes.ParamUpdate>): void {
    this._log.error('ParamUpdate not implemented');
    callback('Not Implemented');
  }

  private _handleGetPublications(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetPublications>): void {
    let pubs: [string, string][] = [];
    Object.keys(this._publishers).forEach((topic) => {
      let pub = this._publishers[topic];
      pubs.push([topic, pub.getType()]);
    });

    callback(null, [
      1,
      'Returning list of publishers on node ' + this._nodeName,
      pubs
    ]);
  }

  private _handleGetSubscriptions(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetSubscriptions>): void {
    let subs: [string, string][] = [];
    Object.keys(this._subscribers).forEach((topic) => {
      let sub = this._subscribers[topic];
      subs.push([topic, sub.getType()]);
    });

    callback(null, [
      1,
      'Returning list of publishers on node ' + this._nodeName,
      subs
    ]);
  }

  private _handleGetPid(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetPid>): void {
    callback(null, [1, 'Returning process id', process.pid]);
  }

  private _handleShutdown(...[err, params, callback]: ApiArgs<XmlrpcTypes.Shutdown>): void {
    let caller = params[0];
    this._log.warn('Received shutdown command from ' + caller);
    this.shutdown();
    callback(null, [1, 'Shutdown', 1]);
  }

  private _handleGetMasterUri(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetMasterUri>): void {
    callback(null, [1, 'Returning master uri for node ' + this._nodeName, this._rosMasterAddress]);
  }

  private _handleGetBusInfo(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetBusInfo>): void {
    const busInfo: XmlrpcTypes.Stats[] = [];
    let count = 0;
    Object.keys(this._subscribers).forEach((topic) => {
      const sub = this._subscribers[topic];
      sub.getClientUris().forEach((clientUri) => {
        busInfo.push([
          ++count,
          clientUri,
          'i',
          sub.getTransport(),
          sub.getTopic(),
          true
        ]);
      });
    });

    Object.keys(this._publishers).forEach((topic) => {
      const pub = this._publishers[topic];
      pub.getClientUris().forEach((clientUri) => {
        busInfo.push([
          ++count,
          clientUri,
          'o',
          pub.isUdpSubscriber(clientUri) ? 'UDPROS' : 'TCPROS',
          pub.getTopic(),
          true
        ]);
      });
    });

    callback(null, [1, this.getNodeName(), busInfo]);
  }

  private _handleGetBusStats(...[err, params, callback]: ApiArgs<XmlrpcTypes.GetBusStats>) {
    this._log.error('GetBusStats not implemented');
    callback('Not implemented');
  }

  /**
   * Initializes the spinner for this node.
   * @param [spinnerOpts] {object} either an instance of a spinner to use or the parameters to configure one
   * @param [spinnerOpts.type] {string} type of spinner to create
   */
  private _setupSpinner(spinnerOpts?: SpinnerOptions|Spinner): void {
    if (spinnerOpts) {
      if (isSpinner(spinnerOpts)) {
        // looks like they created their own spinner
        this._spinner = spinnerOpts;
      }
      else {
        switch (spinnerOpts.type) {
          case 'Global':
            this._spinner = new GlobalSpinner(spinnerOpts);
            break;
        }
      }
    }
    else {
      this._spinner = new GlobalSpinner();
    }
  }

  _setupExitHandler(forceExit?: boolean): void {
    // we need to catch that this process is about to exit so we can unregister all our
    // publishers, subscribers, and services

    let exitHandler: ()=>Promise<void>;
    let sigIntHandler: ()=>Promise<void>;

    const exitImpl = async function exit(killProcess=false): Promise<void> {
      this._shutdown = true;
      this.emit('shutdown');

      this._log.info('Ros node ' + this._nodeName + ' beginning shutdown at ' + Date.now());

      const clearXmlrpcQueues = () => {
        this._masterApi.getXmlrpcClient().clear();
      };

      type Server = { close(cb: ()=>void): void };
      const shutdownServer = async (server: Server, name: string): Promise<void> => {
        return new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            this._log.info('Timed out shutting down %s server', name);
            resolve();
          }, 200);

          server.close(() => {
            clearTimeout(timeout);
            this._log.info('Server %s shutdown', name);
            resolve();
          });
        })
        .catch((err) => {
          // no op
          this._log.warn('Error shutting down server %s: %s', name, err);
        });
      };

      // shutdown servers first so we don't accept any new connections
      // while unregistering
      const promises = [
        shutdownServer(this._slaveApiServer, 'slaveapi'),
        shutdownServer(this._tcprosServer, 'tcpros'),
        shutdownServer(this._udprosServer, 'udpros')
      ];

      // clear out any existing calls that may block us when we try to unregister
      clearXmlrpcQueues();

      // remove all publishers, subscribers, and services.
      // remove subscribers first so that master doesn't send
      // publisherUpdate messages.
      // set maxAttempts so that we don't spend forever trying to connect
      // to a possibly non-existant ROS master.
      const unregisterPromises: Promise<void>[] = [];
      Object.keys(this._subscribers).forEach((topic) => {
        unregisterPromises.push(this.unsubscribe(topic, { maxAttempts: 1 }));
      });

      Object.keys(this._publishers).forEach((topic) => {
        unregisterPromises.push(this.unadvertise(topic, { maxAttempts: 1 }));
      });

      Object.keys(this._services).forEach((service) => {
        unregisterPromises.push(this.unadvertiseService(service, { maxAttempts: 1 }));
      });

      const waitForUnregister = async (): Promise<void> => {
        // catch any errors while unregistering
        // and don't bother external callers about it.
        try {
          await Promise.all(unregisterPromises);
          this._log.info('Finished unregistering from ROS master!');
        }
        catch(err) {
          this._log.warn('Error unregistering from ROS master: %s', err);
        }
        finally {
          clearXmlrpcQueues();
        }
      }

      promises.push(waitForUnregister());

      this._spinner.clear();
      Logging.stopLogCleanup();

      process.removeListener('exit', exitHandler);
      process.removeListener('SIGINT', sigIntHandler);

      if (killProcess) {
        // we can't really block the exit process, just have to hope it worked...
        try {
          await Promise.all(promises);
        }
        finally {
          process.exit();
        }
      }
      // else
      await Promise.all(promises);
    };

    this._exit = exitImpl;

    exitHandler = exitImpl.bind(this);
    sigIntHandler = exitImpl.bind(this, !!forceExit);

    process.once('exit', exitHandler );
    process.once('SIGINT', sigIntHandler );
  }
}

function isSpinner(s: SpinnerOptions|Spinner): s is Spinner {
  return typeof (s as any).type !== 'string';
}

type ApiArgs<T extends XmlrpcTypes.XmlrpcCall<any, any>> = [Error|null, T['Req'], (e: any, r?: T['Resp'])=>void];
