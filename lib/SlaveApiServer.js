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

let xmlrpc = require('xmlrpc');
let EventEmitter =  require('events');
let log = require('../utils/logger.js').createLogger({name: 'rosNode'});

//-----------------------------------------------------------------------

// TODO: Pretty sure I can remove this... RosNode inherited from this at one point
class SlaveApiServer {
  constructor(host, port) {
    this._slaveApiServer = xmlrpc.createServer({host: host, port: port});

    this._slaveApiServer.on('NotFound', (method, params) => {
      log.warn('Method ' + method + ' does not exist: ' + params );
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
    log.info('Listening on ' + port + '.');
  }

  _handleTopicRequest(err, params, callback) {
    emit('requestTopic', err, params, callback);
  }

  _handlePublisherUpdate(err, params, callback) {
    emit('publisherUpdate', err, params, callback);
  }

  _handleParamUpdate(err, params, callback) {
    emit('paramUpdate', err, params, callback);
  }

  _handleGetPublications(err, params, callback) {
    emit('getPublications', err, params, callback);
  }

  _handleGetSubscriptions(err, params, callback) {
    emit('getSubscriptions', err, params, callback);
  }

  _handleGetPid(err, params, callback) {
    // this we can actually do without needing to be inherited somehow............
    let caller = params[0];
    callback(null, [1, 'Returning process id', process.pid]);
  }

  _handleShutdown(err, params, callback) {
    emit('shutdown', err, params, callback);
  }

  _handleGetMasterUri(err, params, callback) {
    emit('getMasterUri', err, params, callback);
  }

  _handleGetBusInfo(err, params, callback) {
    emit('getBusInfo', err, params, callback);
  }

  _handleGetBusStats(err, params, callback) {
    emit('getBusStats', err, params, callback);
  }
}

//-----------------------------------------------------------------------

module.exports = SlaveApiServer;
