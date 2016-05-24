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

"use strict";

let net = require('net');
let NetworkUtils = require('../utils/network_utils.js');
let SerializationUtils = require('../utils/serialization_utils.js');
let DeserializeStream = SerializationUtils.DeserializeStream;
let Deserialize = SerializationUtils.Deserialize;
let Serialize = SerializationUtils.Serialize;
let TcprosUtils = require('../utils/tcpros_utils.js');
let EventEmitter = require('events');
let log = require('../utils/logger.js');

class ServiceServer extends EventEmitter {
  constructor(options, callback, nodeHandle) {
    super();
    this._service = options.service;

    this._type = options.type;

    this._port = null;

    this._nodeHandle = nodeHandle;

    this._log = log.createLogger({
      name: 'srvServer' + this.getService()
    });

    this._requestCallback = callback;

    this._messageHandler = options.typeClass;

    this._register();
  };

  getService() {
    return this._service;
  }

  getType() {
    return this._type;
  }

  getPersist() {
    return this._persist;
  }

  isCallInProgress() {
    return this._calling;
  }

  getServiceUri() {
    return NetworkUtils.formatServiceUri(this._port);
  }

  handleClientConnection(client, header) {
    // TODO: verify header data
    this._log.debug('Service %s handling new client connection ', this.getService());

    let respHeader =
      TcprosUtils.createServiceServerHeader(
        this._nodeHandle.getNodeName(),
        this._messageHandler.Request.md5sum(),
        this.getType());
    client.write(respHeader);

    client.$persist = (header['persistent'] === '1');

    // bind to message handler
    client.$messageHandler = this._handleMessage.bind(this, client);
    client.$deserializeStream.on('message', client.$messageHandler);

    client.on('close', () => {
      this._log.debug('Service client %s disconnected!', client.name);
    });
  }

  _handleMessage(client, data) {
    this._log.trace('Service  ' + this.getService() + ' got message! ' + data.toString('hex'));
    // deserialize msg
    let req = this._messageHandler.Request.deserialize(data).data;

    // call service callback
    let resp = new this._messageHandler.Response();
    let success = this._requestCallback(req, resp);

    // serialize response
    let bufferInfo = {buffer: [], length: 0};
    bufferInfo = this._messageHandler.Response.serialize(resp, bufferInfo);

    // prepend the length
    let lenBuf = new Buffer(4);
    lenBuf.writeUInt32LE(bufferInfo.length, 0);
    bufferInfo.buffer.unshift(lenBuf);
    bufferInfo.length += 4;

    // add service success byte
    let statusBuffer;
    if (success) {
      statusBuffer = new Buffer(1).fill(1);
    }
    else {
      statusBuffer = new Buffer(1).fill(0);
    }
    bufferInfo.buffer.unshift(statusBuffer);
    ++bufferInfo.length;

    // finish serialization and write msg
    client.write(Buffer.concat(bufferInfo.buffer, bufferInfo.length));
    if (!client.$persist) {
      this._log.info('closing non-persistent client');
      client.end();
    }
  }

  _register() {
    this._nodeHandle.registerService(this.getService())
    .then((resp) => {
      this.emit('registered');
    });
  }
};

module.exports = ServiceServer;
