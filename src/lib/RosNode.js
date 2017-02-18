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

"use strict"

let net = require('net');
let xmlrpc = require('xmlrpc');
let MasterApiClient  = require('./MasterApiClient.js');
let SlaveApiClient = require('./SlaveApiClient.js');
let ParamServerApiClient = require('./ParamServerApiClient.js');
let Subscriber = require('./Subscriber.js');
let Publisher = require('./Publisher.js');
const PublisherImpl = require('./impl/PublisherImpl.js');
const SubscriberImpl = require('./impl/SubscriberImpl.js');
let ServiceClient = require('./ServiceClient.js');
let ServiceServer = require('./ServiceServer.js');
const Spinner = require('../utils/GlobalSpinner.js');
let NetworkUtils = require('../utils/network_utils.js');
let messageUtils = require('../utils/message_utils.js');
let tcprosUtils = require('../utils/tcpros_utils.js');
let SerializationUtils = require('../utils/serialization_utils.js');
let DeserializeStream = SerializationUtils.DeserializeStream;
let Deserialize = SerializationUtils.Deserialize;
let Serialize = SerializationUtils.Serialize;
let EventEmitter = require('events');
let Logging = require('./Logging.js');

/**
 * Create a ros node interface to the master
 * @param name {string} name of the node
 * @param rosMaster {string} full uri of ros maxter (http://localhost:11311)
 */
class RosNode extends EventEmitter {

  constructor(nodeName, rosMaster, options={}) {
    super();

    this._log = Logging.getLogger('ros.rosnodejs');
    this._debugLog = Logging.getLogger('ros.superdebug');

    this._slaveApiServer = null;
    this._xmlrpcPort = null;

    this._tcprosServer = null;
    this._tcprosPort = null;

    this._nodeName = nodeName;

    this._rosMasterAddress = rosMaster;

    this._masterApi = new MasterApiClient(this._rosMasterAddress);

    // the param server is hosted on the master -- share its xmlrpc client
    this._paramServerApi = new ParamServerApiClient(this._masterApi.getXmlrpcClient());

    this._publishers = {};

    this._subscribers = {};

    this._services = {};

    this._setupTcprosServer(options.tcprosPort)
    .then(this._setupSlaveApi.bind(this, options.xmlrpcPort));

    this._setupExitHandler();

    this._spinner = new Spinner();
  }

  getLogger() {
    return this._log;
  }

  getSpinner() {
    return this._spinner;
  }

  getRosMasterUri() {
    return this._rosMasterAddress;
  }

  advertise(options) {
    let topic = options.topic;
    let pubImpl = this._publishers[topic];
    if (!pubImpl) {
      pubImpl = new PublisherImpl(options, this);
      this._publishers[topic] = pubImpl;
    }

    return new Publisher(pubImpl);
  }

  subscribe(options, callback) {
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

  advertiseService(options, callback) {
    let service = options.service;
    let serv = this._services[service];
    if (!serv) {
      serv = new ServiceServer(options, callback, this);
      this._services[service] = serv;
    }
    return serv;
  }

  serviceClient(options) {
    return new ServiceClient(options, this);
  }

  unsubscribe(topic) {
    const sub = this._subscribers[topic];
    if (sub) {
      this._debugLog.info('Unsubscribing from topic %s', topic);
      delete this._subscribers[topic];
      sub._shutdown();
      return this.unregisterSubscriber(topic);
    }
  }

  unadvertise(topic) {
    const pub = this._publishers[topic];
    if (pub) {
      this._debugLog.info('Unadvertising topic %s', topic);
      delete this._publishers[topic];
      pub._shutdown();
      return this.unregisterPublisher(topic);
    }
  }

  unadvertiseService(service) {
    const server = this._services[service];
    if (server) {
      this._debugLog.info('Unadvertising service %s', service);
      server.disconnect();
      delete this._services[service];
      return this.unregisterService(service, server.getServiceUri());
    }
  }

  hasSubscriber(topic) {
    return this._subscribers.hasOwnProperty(topic);
  }

  hasPublisher(topic) {
    return this._publisheres.hasOwnProperty(topic);
  }

  hasService(service) {
    return this._services.hasOwnProperty(service);
  }

  getNodeName() {
    return this._nodeName;
  }

//------------------------------------------------------------------
// Master API
//------------------------------------------------------------------

  registerService(service) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.registerService(this._nodeName, service, NetworkUtils.formatServiceUri(this._tcprosPort), this._getXmlrpcUri());
    });
  }

  unregisterService(service) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.unregisterService(this._nodeName, service, NetworkUtils.formatServiceUri(this._tcprosPort));
    });
  }

  registerSubscriber(topic, topicType) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.registerSubscriber(this._nodeName, topic, topicType, this._getXmlrpcUri());
    });
  }

  unregisterSubscriber(topic) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.unregisterSubscriber(this._nodeName, topic, this._getXmlrpcUri());
    });
  }

  registerPublisher(topic, topicType) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.registerPublisher(this._nodeName, topic, topicType, this._getXmlrpcUri());
    });
  }

  unregisterPublisher(topic) {
    return this._whenReady()
    .then(() => {
      return this._masterApi.unregisterPublisher(this._nodeName, topic, this._getXmlrpcUri());
    });
  }

  lookupNode(nodeName) {
    return this._masterApi.lookupNode(this._nodeName, nodeName);
  }

  lookupService(service) {
    return this._masterApi.lookupService(this._nodeName, service);
  }

  getMasterUri() {
    return this._masterApi.getUri(this._nodeName);
  }

  /**
   * Delays xmlrpc calls until our servers are set up
   * Since we need their ports for most of our calls.
   * @returns {Promise}
   * @private
   */
  _whenReady() {
    if (this.slaveApiSetupComplete()) {
      return Promise.resolve();
    }
    else {
      return new Promise((resolve, reject) => {
        this.on('slaveApiSetupComplete', () => {
          resolve();
        });
      })
    }
  }

  _getXmlrpcUri() {
    // TODO: get host or ip or ...
    return 'http://' + NetworkUtils.getHost() + ':' + this._xmlrpcPort;
  }

//------------------------------------------------------------------
// Parameter Server API
//------------------------------------------------------------------

  deleteParam(key) {
    return this._paramServerApi.deleteParam(this._nodeName, key);
  }

  setParam(key, value) {
    return this._paramServerApi.setParam(this._nodeName, key, value);
  }

  getParam(key) {
    return this._paramServerApi.getParam(this._nodeName, key);
  }

  hasParam(key) {
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
  requestTopic(remoteAddress, remotePort, topic, protocols) {
    // every time we request a topic, it could be from a new node
    // so we create an xmlrpc client here instead of having a single one
    // for this object, like we do with the MasterApiClient
    let slaveApi = new SlaveApiClient(remoteAddress, remotePort);
    return slaveApi.requestTopic(this._nodeName, topic, protocols);
  }

  slaveApiSetupComplete() {
    return !!this._xmlrpcPort;
  }

  shutdown() {
    this.emit('shutdown');
    return this._exit();
  }

  _setupSlaveApi(xmlrpcPort=null) {
    if (xmlrpcPort === null) {
      xmlrpcPort = 0;
    }

    return new Promise((resolve, reject) => {
      let server = xmlrpc.createServer({host: '0.0.0.0', port: xmlrpcPort}, () => {
        const {port} = server.httpServer.address();
        this._debugLog.debug('Slave API Listening on port ' + port);
        this._xmlrpcPort = port;
        this._slaveApiServer = server;

        this._slaveApiServer.on('NotFound', (method, params) => {
          this._log.warn('Method ' + method + ' does not exist: ' + params);
        });

        this._slaveApiServer.on('requestTopic', this._handleTopicRequest.bind(this));
        this._slaveApiServer.on('publisherUpdate', this._handlePublisherUpdate.bind(this));
        this._slaveApiServer.on('paramUpdate', this._handleParamUpdate.bind(this));
        this._slaveApiServer.on('getPublications', this._handleGetPublications.bind(this));
        this._slaveApiServer.on('getSubscriptions', this._handleGetSubscriptions.bind(this));
        this._slaveApiServer.on('getPid', this._handleGetPid.bind(this));
        this._slaveApiServer.on('shutdown', this._handleShutdown.bind(this));
        this._slaveApiServer.on('getMasterUri', this._handleGetMasterUri.bind(this));
        this._slaveApiServer.on('getBusInfo', this._handleGetBusInfo.bind(this));
        this._slaveApiServer.on('getBusStats', this._handleGetBusStats.bind(this));
        resolve(port);
        this.emit('slaveApiSetupComplete', port);
      });

      server.httpServer.on('clientError', (err, socket) => {
        this._log.error('XMLRPC Server socket error: %j', err);
      });
    });
  }

  _setupTcprosServer(tcprosPort=null) {
    let _createServer = (callback) => {
      let server = net.createServer((connection) => {
        let conName = connection.remoteAddress + ":"
          + connection.remotePort;
        connection.name = conName;
        this._debugLog.info('Node %s got connection from %s', this.getNodeName(), conName);

        // data from connections will be TCPROS encoded, so use a
        // DeserializeStream to handle any chunking
        let deserializeStream = new DeserializeStream();
        connection.$deserializeStream = deserializeStream;
        connection.pipe(deserializeStream);

        const checkConnectionHeader = (headerData) => {
          const header = tcprosUtils.parseTcpRosHeader(headerData);
          if (!header) {
            this._log.error('Unable to validate connection header %s', headerData);
            connection.end(tcprosUtils.serializeString('Unable to validate connection header'));
            return;
          }
          this._debugLog.info('Got connection header: %j', header);

          if (header.hasOwnProperty('topic')) {
            // this is a subscriber, validate header and pass off connection to appropriate publisher
            const topic = header.topic;
            const pub = this._publishers[topic];
            if (pub) {
              pub.handleSubscriberConnection(connection, header);
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
              serviceProvider.handleClientConnection(connection, header);
            }
          }
        };
        deserializeStream.once('message', checkConnectionHeader);
      });

      if (tcprosPort === null) {
        tcprosPort = 0;
      }
      server.listen(tcprosPort, '0.0.0.0');

      // it's possible the port was taken before we could use it
      server.on('error', (err) => {
        this._log.warn('Error on tcpros server! %j', err);
      });

      // the port was available
      server.on('listening', () => {
        const {port} = server.address();
        this._debugLog.info('Listening on %j', server.address());
        this._tcprosPort = port;
        this._server = server;
        callback(port);
      });

      this._tcprosServer = server;
    };

    return new Promise((resolve, reject) => {
      _createServer(resolve);
    });
  }

  _handleTopicRequest(err, params, callback) {
    this._debugLog.info('Got topic request ' + JSON.stringify(params));
    if (!err) {
      let topic = params[1];
      let pub = this._publishers[topic];
      if (pub) {
        let port = this._tcprosPort;
        let resp = [
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
    }
    else {
      this._log.error('Error during topic request: %s, %j', err, params);
      let resp = [
        0,
        'Unable to allocate topic connection for ' + topic,
        []
      ];
      let err = 'Error: Unknown topic ' + topic;
      callback(err, resp);
    }
  }

  /**
   * Handle publisher update message from master
   * @param err was there an error
   * @param params {Array} [caller_id, topic, publishers]
   * @param callback function(err, resp) call when done handling message
   */
  _handlePublisherUpdate(err, params, callback) {
    this._debugLog.info('Publisher update ' + err + ' params: ' + JSON.stringify(params));
    let topic = params[1];
    let sub = this._subscribers[topic];
    if (sub) {
      this._debugLog.info('Got sub for topic ' + topic);
      let pubs = params[2];
      sub._handlePublisherUpdate(params[2]);
      let resp = [
        1,
        'Handled publisher update for topic ' + topic,
        0
      ];
      callback(null, resp);
    }
    else {
      this._debugLog.warn(`Got publisher update for unknown topic ${topic}`);
      let resp = [
        0,
        'Don\'t have topic ' + topic,
        0
      ];
      let err = 'Error: Unknown topic ' + topic;
      callback(err, resp);
    }
  }

  _handleParamUpdate(err, params, callback) {
    this._log.info('Got param update! Not really doing anything with it...' + params);
  }

  _handleGetPublications(err, params, callback) {
    let pubs = [];
    Object.keys(this._publishers).forEach((topic) => {
      let pub = this._publishers[topic];
      pubs.push([topic, pub.getType()]);
    });
    let resp = [
      1,
      'Returning list of publishers on node ' + this._nodeName,
      pubs
    ];
    callback(null, resp);
  }

  _handleGetSubscriptions(err, params, callback) {
    let subs = [];
    Object.keys(this._subscribers).forEach((topic) => {
      let sub = this._subscribers[topic];
      subs.push([topic, sub.getType()]);
    });
    let resp = [
      1,
      'Returning list of publishers on node ' + this._nodeName,
      subs
    ];
    callback(null, resp);
  }

  _handleGetPid(err, params, callback) {
    let caller = params[0];
    callback(null, [1, 'Returning process id', process.pid]);
  }

  _handleShutdown(err, params, callback) {
    let caller = params[0];
    this._log.warn('Received shutdown command from ' + caller);
    return this.shutdown();
  }

  _handleGetMasterUri(err, params, callback) {
    let resp = [
      1,
      'Returning master uri for node ' + this._nodeName,
      this._rosMasterAddress
    ];
    callback(null, resp);
  }

  _handleGetBusInfo(err, params, callback) {
    this._log.error('Not implemented');
  }

  _handleGetBusStats(err, params, callback) {
    this._log.error('Not implemented');
  }

  // HAVEN'T TESTED YET
  _setupExitHandler() {
    // we need to catch that this process is about to exit so we can unregister all our
    // publishers, subscribers, and services

    let exitHandler;
    let sigIntHandler;

    let exitImpl = function(killProcess=false) {
      this._log.debug('Ros node ' + this._nodeName + ' beginning shutdown at ' + Date.now());
      let promises = [];

      // remove subscribers first so that master doesn't send
      // publisherUpdate messages
      Object.keys(this._subscribers).forEach((topic) => {
        promises.push(this.unsubscribe(topic));
      });

      Object.keys(this._publishers).forEach((topic) => {
        promises.push(this.unadvertise(topic));
      });

      Object.keys(this._services).forEach((service) => {
        promises.push(this.unadvertiseService(service));
      });

      const clearXmlrpcQueues = () => {
        return Promise.resolve(() => {
          this._masterApi.getXmlrpcClient().clear();
        }).
        catch((err) => {
          // no op
        });
      };

      const shutdownServer = (server, name) => {
        return new Promise((resolve) => {
          server.close(() => {
            resolve();
          });
        })
        .catch((err) => {
          // no op
        })
      };

      const shutdownServers = () => {
        return Promise.all([
          shutdownServer(this._slaveApiServer, 'slaveapi'),
          shutdownServer(this._tcprosServer, 'tcpros')
        ]);
      };

      promises.push(shutdownServers());
      promises.push(clearXmlrpcQueues());

      process.removeListener('exit', exitHandler);
      process.removeListener('SIGINT', sigIntHandler);

      if (killProcess) {
        // we can't really block the exit process, just have to hope it worked...
        return Promise.all(promises).then(() => {
          process.exit();
        })
        .catch((err) => {
          process.exit();
        })
      }
      // else
      return Promise.all(promises);
    };

    this._exit = exitImpl;

    exitHandler = exitImpl.bind(this);
    sigIntHandler = exitImpl.bind(this, true);

    process.once('exit', exitHandler );
    process.once('SIGINT', sigIntHandler );
  }
}

//------------------------------------------------------------------

module.exports = RosNode;
