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
let messageUtils = require('../utils/message_utils.js');
let EventEmitter = require('events');
let log = require('../utils/logger.js');

class ServiceServer extends EventEmitter {
	constructor(options, callback, nodeHandle) {
		super();
		this._service = options.service;

		this._type = options.type;

    this._port = null;

		this._nodeHandle = nodeHandle;

    this._log = log.createLogger({name: 'srvServer' + this.getService()});

    this._requestCallback = callback;

		this._messageHandler = messageUtils.getHandlerForSrvType(this._type);

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


	_handleMessage(client, data) {
		this._log.trace('Service  ' + this.getService() + ' got message! ' + data.toString('hex'));
    if (!client.$initialized) {
      let header = TcprosUtils.parseServiceClientHeader(data);
      // TODO: verify header data
      this._log.debug('Service header ' + JSON.stringify(header));

      let respHeader = TcprosUtils.createServiceServerHeader(this._nodeHandle.getNodeName(), this._messageHandler.Request.md5sum(), this.getType());
      client.write(respHeader);
      client.$initialized = true;
    }
    else {
      // deserialize msg
      let req = this._messageHandler.Request.deserialize(data).data;

      // call service callback
      let resp = {};
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
    }
	}

  _register() {
    this._setupTcp()
    .then((port) => {
      return this._nodeHandle.registerService(this.getService(), NetworkUtils.formatServiceUri(port));
    })
    .then((resp) => {
      this.emit('registered');
    });
  }

  _setupTcp() {
    let _createServer = (callback) => {
      NetworkUtils.getFreePort()
      .then((port) => {
        this._log.trace('got ' + port);
        let server = net.createServer((client) => {
          let clientName = client.remoteAddress + ":" + client.remotePort;
          this._log.debug('Service ' + this.getService() + ' got connection from ' + clientName);

          // subscriber will send us tcpros handshake before we can start publishing
          // to it.
          client.$handshake = this._handleMessage.bind(this, client);

          // handshake will be TCPROS encoded, so use a DeserializeStream to
          // handle any chunking
          let deserializeStream = new DeserializeStream();
          client.pipe(deserializeStream);
          deserializeStream.on('message', client.$handshake);

          client.on('close', () => {
            this._log.debug('Service client ' + clientName + ' disconnected!');
          });
        }).listen(port);

        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            _createServer(callback);
          }
        });

        server.on('listening', () => {
          this._log.debug('Listening on port ' + port);
		  this._port = port;
          callback(port);
        });
      })
    }
    return new Promise((resolve, reject) => {
      _createServer(resolve);
    });
  }
};

module.exports = ServiceServer;
