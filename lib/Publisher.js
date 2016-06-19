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
 *    Unless required by applicable law or agreed to in writing,
 *    software distributed under the License is distributed on an "AS
 *    IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 *    express or implied. See the License for the specific language
 *    governing permissions and limitations under the License.
 */

"use strict";

let net = require('net');
let NetworkUtils = require('../utils/network_utils.js');
let SerializationUtils = require('../utils/serialization_utils.js');
const ros_msg_utils = require('ros_msg_utils');
const base_serializers = ros_msg_utils.Serialize;
let DeserializeStream = SerializationUtils.DeserializeStream;
let Deserialize = SerializationUtils.Deserialize;
let Serialize = SerializationUtils.Serialize;
let TcprosUtils = require('../utils/tcpros_utils.js');
let EventEmitter = require('events');
let log = require('../utils/logger.js');

class Publisher extends EventEmitter {
  constructor(options, nodeHandle) {
    super();
    this._topic = options.topic;

    this._type = options.type;

    this._latching = !!options.latching;

    this._tcpNoDelay =  !!options.tcpNoDelay;


    if (options.queueSize) {
      this._queueSize = options.queueSize;
    }
    else {
      this._queueSize = 1;
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
    else {
      this._throttleMs = 0;
    }
    this._pubTimeout = null;
    this._pubTime = null;

    // OPTIONS STILL NOT HANDLED:
    //  headers: extra headers to include
    //  subscriber_listener: callback for new subscribers connect/disconnect

    this._lastSentMsg = null;

    this._nodeHandle = nodeHandle;
    this._log = log.createLogger({name: 'pub' + this.getTopic()});

    this._ready = false;

    this._subClients = {};

    this._port = 0;

    this._server = null;

    this._messageHandler = options.typeClass;

    // messages published before this publisher
    // was registered will be held here
    this._msgQueue = [];

    this._setupTcp()
    .then(() => {
      this._register();
    });
  };

  getTopic() {
    return this._topic;
  }

  getType() {
    return this._type;
  }

  getLatching() {
    return this._latching;
  }

  getNumSubscribers() {
    return Object.keys(this._subClients).length;
  }

  disconnect() {
    Object.keys(this._subClients).forEach((clientId) => {
      const client = this._subClients[clientId];
      client.end();
      client.destroy();
    });

    clearTimeout(this._pubTimeout);
    this._pubClients = {};
  }

  /**
   * Schedule the msg for publishing - or publish immediately if we're
   * supposed to
   * @param msg {object} object type matching this._type
   * @param [throttleMs] {number} optional override for publisher setting
   */
  publish(msg, throttleMs) {
    if (typeof throttleMs !== 'number') {
      throttleMs = this._throttleMs;
    }

    if (throttleMs < 0) {
      // short circuit JS event queue, publish synchronously
      this._msgQueue.push(msg);
      this._publish();
    }
    else {
      // msg will be queued - msgs in queue will be sent when timer expires
      this._msgQueue.push(msg);

      // remove old messages from queue if necesary
      let queueSize = this._queueSize;
      if (queueSize > 0) {
        if (this._msgQueue.length > queueSize) {
          this._msgQueue.shift();
        }
      }

      // if there's not currently a timer running, set one.
      // msgs in queue will be published when it times out
      if (this._pubTimeout === null) {
        let now = Date.now();
        if (this._pubTime !== null) {
          // check how long to throttle for based on the last time we
          // published
          if (now - this._pubTime > throttleMs) {
            throttleMs = 0;
          }
          else {
            throttleMs -= now - this._pubTime;
          }
        }
        else {
          // never published, so publish 'immediately'
          throttleMs = 0;
        }

        // any other messages we try to publish will be throttled
        this._pubTimeout = setTimeout(() => {
          this._publish();
          this._pubTimeout = null;
        }, throttleMs);
      }
    }
  }

  /**
   * Pulls all msgs off queue, serializes, and publishes them
   */
  _publish() {
    this._pubTime = Date.now();
    this._msgQueue.forEach((msg) => {
      try {
        // serialize pushes buffers onto buffInfo.buffer in order
        // concat them, and preprend the byte length to the message
        // before sending
        // console.log("_publish", this._messageHandler, msg);
        const msgSize = this._messageHandler.getMessageSize(msg);

        // extra 4 bytes is for message size
        let buffer = new Buffer(4 + msgSize);
        base_serializers.uint32(msgSize, buffer, 0);
        this._messageHandler.serialize(msg, buffer, 4);

        Object.keys(this._subClients).forEach((client) => {
          this._subClients[client].write(buffer);
        });

        // if this publisher is supposed to latch,
        // save the last message. Any subscribers that connect
        // before another call to publish() will receive this message
        if (this._latching) {
          this._lastSentMsg = serialized;
        }
      }
      catch (err) {
        this._log.warn('Error when publishing message ', err.stack);
      }
    });

    // clear out the msg queue
    this._msgQueue = [];
  }

  _setupTcp() {
    // recursively tries to setup server on open port
    // calls callback when setup is done
    let _createServer = (callback) => {
      NetworkUtils.getFreePort()
      .then((port) => {
        let server = net.createServer((subscriber) => {
          let subName = subscriber.remoteAddress + ":"
            + subscriber.remotePort;
          subscriber.name = subName;
          this._log.debug('Publisher ' + this.getTopic()
                          + ' got connection from ' + subName);

          // subscriber will send us tcpros handshake before we can
          // start publishing to it.
          subscriber.$handshake =
            this._handleHandshake.bind(this, subscriber);

          // handshake will be TCPROS encoded, so use a DeserializeStream to
          // handle any chunking
          let deserializeStream = new DeserializeStream();
          subscriber.pipe(deserializeStream);
          deserializeStream.on('message', subscriber.$handshake);

          // if this publisher had the tcpNoDelay option set
          // disable the nagle algorithm
          if  (this._tcpNoDelay) {
            subscriber.setNoDelay(true);
          }

          subscriber.on('close', () => {
            this._log.info('Publisher ' + this.getTopic() + ' client '
                           + subscriber.name + ' disconnected!');
            delete this._subClients[subscriber.name];
          });

          subscriber.on('end', () => {
            this._log.info('Sub %s sent END', subscriber.name);
          });

          subscriber.on('error', () => {
            this._log.info('Sub %s had error', subscriber.name);
          });
        }).listen(port);

        // it's possible the port was taken before we could use it
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            _createServer(callback);
          }
        });

        // the port was available
        server.on('listening', () => {
          this._log.debug('Listening on port ' + port);
          this._port = port;
          this._server = server;
          callback(port);
        });
      });
    };

    return new Promise((resolve, reject) => {
      _createServer(resolve);
    });
  }

  _handleHandshake(subscriber, data) {
    if (!subscriber.$initialized) {
      let header = TcprosUtils.parseSubHeader(data);
      let valid = TcprosUtils.validateSubHeader(
        header, this.getTopic(), this.getType(),
        this._messageHandler.md5sum());
      if (valid !== null) {
        this._log.error('Unable to validate connection header '
                        + JSON.stringify(header));
        subscriber.write(Serialize(valid));
        return;
      }
      this._log.debug('Pub ' + this.getTopic()
                      + ' got connection header ' + JSON.stringify(header));

      let respHeader =
        TcprosUtils.createPubHeader(
          this._nodeHandle.getNodeName(),
          this._messageHandler.md5sum(),
          this.getType(),
          this.getLatching());
      subscriber.write(respHeader);

      if (this._lastSentMsg !== null) {
        this._log.debug('Sending latched msg to new subscriber');
        subscriber.write(this._lastSentMsg);
      }

      // if handshake good, add to list, we'll start publishing to it
      this._subClients[subscriber.name] = subscriber;

      this.emit('connection', subscriber.name);
    }
    else {
      this._log.error(
        'Got message from subscriber after handshake - what gives!!');
    }
  }

  _register() {
    this._nodeHandle.registerPublisher(this._topic, this._type)
    .then((resp) => {
      let code = resp[0];
      let msg = resp[1];
      let subs = resp[2];
      if (code === 1) {
        // registration worked
        this._ready = true;
        this.emit('registered');
      }
    })
    .catch((err, resp) => {
      this._log.error('reg pub err ' + err + ' resp: '
                      + JSON.stringify(resp));
    })
  }

  getSubPort() {
    return this._port;
  }
};

module.exports = Publisher;
