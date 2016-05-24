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

class ServiceClient extends EventEmitter {
  constructor(options, nodeHandle) {
    super();
    this._service = options.service;

    this._type = options.type;

    this._persist = !!options.persist;

    this._calling = false;

    this._log = log.createLogger({name: 'srvClient' + this.getService()});

    this._nodeHandle = nodeHandle;

    this._messageHandler = options.typeClass;

    this._serviceClient = null;
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

  close() {
    // don't remove service client if call is in progress
    if (!this.isCallInProgress()) {
      this._serviceClient = null;
    }
  }

  /**
   * Call the service - if a current call is in progress, nothing will be done
   * @return {Promise}
   */
  call(request) {
    if (this.isCallInProgress()) {
      return Promise.reject();
    }
    this._calling = true;
    // find the service uri
    return (() => {
      // if we haven't connected to the service yet, create the connection
      // this will always be the case unless this is persistent service client
      // calling for a second time.
      if (this._serviceClient === null) {
        console.log('lookup service');
        return this._nodeHandle.lookupService(this.getService())
          .then((resp) => {
            let serviceUri = resp[2];
            // connect to the service
            return this._connectToService(
              NetworkUtils.getAddressAndPortFromUri(serviceUri),
              request
            );
          });
      }
      else {
        console.log('skip looking up service');
        return Promise.resolve();
      }
    })()
    .then(() => {
      return this._sendRequest(request);
    })
    .then((msg) => {
      this._calling = false;
      return msg;
    })
    .catch((err) => {
      this._log.warn('Error during service call ' + err);
      this._calling = false;
      throw err;
    });
  }

  _sendRequest(request) {
    // serialize request
    let bufferInfo = {buffer: [], length: 0};
    this._messageHandler.Request.serialize(request, bufferInfo);
    let serialized = Serialize(Buffer.concat(bufferInfo.buffer, bufferInfo.length));

    this._serviceClient.write(serialized);

    return new Promise((resolve, reject) => {
      this._serviceClient.$deserializeStream.once('message', (msg, success) => {
        if (success) {
          resolve(this._messageHandler.Response.deserialize(msg).data);
        }
        else {
          this._log.warn('Service error: %s', msg);
          reject();
        }
      });
    });
  }

  _connectToService(serviceInfo, request) {
    this._log.debug('Service client ' + this.getService() + ' connecting to ' + JSON.stringify(serviceInfo));
    this._serviceClient = new net.Socket();

    this._serviceClient.connect(serviceInfo, () => {
      this._log.debug('Sending connection header');
      let serviceClientHeader = TcprosUtils.createServiceClientHeader(this._nodeHandle.getNodeName(),
        this.getService(), this._messageHandler.Response.md5sum(), this.getType(), this.getPersist());
      this._serviceClient.write(serviceClientHeader);
    });

    let deserializer = new DeserializeStream()
    this._serviceClient.$deserializeStream = deserializer;
    this._serviceClient.pipe(deserializer);

    this._serviceClient.on('end', () => { this._serviceClient = null; });

    return new Promise((resolve, reject) => {
      deserializer.once('message', (msg, success) => {
        if (!this._serviceClient.$initialized) {
          // TODO: validate header?
          let header = TcprosUtils.parseServiceServerHeader(msg);

          // stream deserialization for service response is different - set that up for next message
          deserializer.setServiceRespDeserialize();
          this._serviceClient.$initialized = true;
          resolve();
        }
      });
    });
  }
};

module.exports = ServiceClient;
