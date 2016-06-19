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
const ros_msg_utils = require('ros_msg_utils');
const base_serializers = ros_msg_utils.Serialize;
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

    // TODO: support this case
    this._persist = !!options.persist;

    this._calling = false;

    this._log = log.createLogger({name: 'srvClient' + this.getService()});

    this._nodeHandle = nodeHandle;

    this._messageHandler = options.typeClass;
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

  /**
   * Call the service - if a current call is in progress, nothing will be done
   * @return {Promise}
   */
  call(request, responseCallback) {
    if (this.isCallInProgress()) {
      return false;
    }
    this._calling = true;
    // find the service uri
    this._nodeHandle.lookupService(this.getService())
    .then((resp) => {
      let serviceUri = resp[2];
      // connect to the service
      return this._connectToService(
        NetworkUtils.getAddressAndPortFromUri(serviceUri),
        request
      );
    })
    .then((msg) => {
      responseCallback(msg);
      this._calling = false;
    })
    .catch((err) => {
      this._log.warn('Error during service call ' + err);
      this._calling = false;
    });
  }

  _connectToService(serviceInfo, request) {
    this._log.debug('Service client ' + this.getService() + ' connecting to ' + JSON.stringify(serviceInfo));
    let client = new net.Socket();

    client.connect(serviceInfo, () => {
      this._log.debug('Sending connection header');
      let serviceClientHeader = TcprosUtils.createServiceClientHeader(this._nodeHandle.getNodeName(),
        this.getService(), this._messageHandler.md5sum(), this.getType());
      client.write(serviceClientHeader);
    });

    let deserializer = new DeserializeStream()
    client.pipe(deserializer);
    return new Promise((resolve, reject) => {
      deserializer.on('message', (msg, success) => {
        if (!client.$initialized) {
          // TODO: validate header?
          let header = TcprosUtils.parseServiceServerHeader(msg);

          // serialize request
          const msgSize = this._messageHandler.Request.getMessageSize(request);

          // extra 5 bytes is for success byte and message size
          serializedRequest = new Buffer(4 + msgSize);
          base_serializers.uint32(msgSize, serializedRequest, 1);
          this._messageHandler.Response.serialize(resp, serializedRequest, 4);

          // stream deserialization for service response is different - set that up for next message
          deserializer.setServiceRespDeserialize();

          client.$initialized = true;
          client.write(serializedRequest);
        }
        else {
          // this is the actual response
          if (success) {
            resolve(this._messageHandler.Response.deserialize(msg).data);
          }
          else {
            this._log.warn('Service error: %s', msg);
          }
        }
      });
    });
  }


  _handleHandshake(subscriber, data) {
    this._log.trace('Pub ' + this._topic + ' got message!');
    if (!subscriber.$initialized) {
      let header = TcprosUtils.parseSubHeader(data);
      // FIXME: Actually verify header info...
      this._log.debug('Pub ' + this._topic + ' got handshake ' + JSON.stringify(header) + ' from ' + subscriber.name);

      let respHeader = TcprosUtils.createPubHeader(this._nodeHandle.getNodeName(), this._messageHandler.md5sum(), this.getType(), this.getLatching());
      subscriber.write(respHeader);

      if (this._lastSentMsg !== null) {
        this._log.debug('sending latched message to subscriber');
        subscriber.write(this._lastSentMsg);
      }

      // if handshake good, add to list, we'll start publishing to it
      this._subClients[subscriber.name] = subscriber;
    }
    else {
      this._log.error('Got message from subscriber after handshake - what gives!!');
    }
  }
};

module.exports = ServiceClient;
