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

'use strict';

let RosNode = require('./RosNode.js');
const messageUtils = require('../utils/message_utils.js');
const namespaceUtils = require('../utils/namespace_utils.js');
const ActionClient = require('./ActionClient');

class NodeHandle {
  constructor(node, namespace=null) {
    this._node = node;

    this._namespace = namespace;
  }

  setNamespace(namespace) {
    this._namespace = namespace;
  }

  getNodeName() {
    return this._node.getNodeName();
  }

//------------------------------------------------------------------
// Pubs, Subs, Services
//------------------------------------------------------------------
  /**
   * Creates a ros publisher with the provided options
   * @param topic {string}
   * @param type {string|Object} string representing message type or instance
   * @param [options] {object}
   * @param [options.latching] {boolean} latch messages
   * @param [options.tpcNoDelay] {boolean} set TCP no delay option on Socket
   * @param [options.queueSize] {number} number of messages to queue when publishing
   * @param [options.throttleMs] {number} milliseconds to throttle when publishing
   * @return {Publisher}
   */
  advertise(topic, type, options={}) {
    if (!topic) {
      throw new Error(`Unable to advertise unnamed topic - got ${topic}`);
    }
    if (!type) {
      throw new Error(`Unable to advertise topic ${topic} without type - got ${type}`);
    }

    try {
      options.topic = this._resolve(topic);
      if (typeof type === 'string' || type instanceof String) {
        options.type = type;
        options.typeClass = messageUtils.getHandlerForMsgType(type, true);
      }
      else {
        options.typeClass = type;
        options.type = type.datatype();
      }
      return this._node.advertise(options);
    }
    catch (err) {
      this._node._log.error(`Exception trying to advertise topic ${topic}`);
      throw err;
    }
  }

  /**
   * Creates a ros subscriber with the provided options
   * @param topic {string}
   * @param type {string|Object} string representing message type or instance
   * @param callback {function} function to call when message is received
   * @param [options] {object}
   * @param [options.queueSize] {number} number of messages to queue when subscribing
   * @param [options.throttleMs] {number} milliseconds to throttle when subscribing
   * @return {Subscriber}
   */
  subscribe(topic, type, callback, options={}) {
    if (!topic) {
      throw new Error(`Unable to subscribe to unnamed topic - got ${topic}`);
    }
    if (!type) {
      throw new Error(`Unable to subscribe to topic ${topic} without type - got ${type}`);
    }

    try {
      options.topic = this._resolve(topic);
      if (typeof type === 'string' || type instanceof String) {
        options.type = type;
        options.typeClass = messageUtils.getHandlerForMsgType(type, true);
      }
      else {
        options.typeClass = type;
        options.type = type.datatype();
      }
      return this._node.subscribe(options, callback);
    }
    catch (err) {
      this._node._log.error(`Exception trying to subscribe to topic ${topic}`);
      throw err;
    }
  }

  /**
   * Creates a ros Service server with the provided options
   * @param service {string}
   * @param type {string|Object} string representing service type or instance
   * @param callback {function} function to call when this service is called
   *   e.g.
   *     (request, response) => {
   *       response.data = !request.data;
   *       return true;
   *     }
   * @return {ServiceServer}
   */
  advertiseService(service, type, callback) {
    if (!service) {
      throw new Error(`Unable to advertise unnamed service - got ${service}`);
    }
    if (!type) {
      throw new Error(`Unable to advertise service ${service} without type - got ${type}`);
    }

    try {
      let options = {service: this._resolve(service)};
      if (typeof type === 'string' || type instanceof String) {
        options.type = type;
        options.typeClass = messageUtils.getHandlerForSrvType(type, true);
      }
      else {
        options.typeClass = type;
        options.type = type.datatype();
      }

      return this._node.advertiseService(options, callback);
    }
    catch (err) {
      this._node._log.error(`Exception trying to advertise service ${service}`);
      throw err;
    }
  }

  /**
   * Creates a ros Service client with the provided options
   * @param service {string}
   * @param type {string|Object} string representing service type or instance
   * @param options {Object} extra options to pass to service client
   * @return {ServiceClient}
   */
  serviceClient(service, type, options={}) {
    if (!service) {
      throw new Error(`Unable to create unnamed service client - got ${service}`);
    }
    if (!type) {
      throw new Error(`Unable to create service client ${service} without type - got ${type}`);
    }
    options.service = this._resolve(service);

    try {
      if (typeof type === 'string' || type instanceof String) {
        options.type = type;
        options.typeClass = messageUtils.getHandlerForSrvType(type, true);
      }
      else {
        options.typeClass = type;
        options.type = type.datatype();
      }
      return this._node.serviceClient(options);
    }
    catch (err) {
      this._node._log.error(`Exception trying to create service client ${service}`);
      throw err;
    }
  }

  actionClient(actionServer, type, options={}) {
    if (!actionServer) {
      throw new Error(`Unable to create action client to unspecified server - [${actionServer}]`);
    }
    else if (!type) {
      throw new Error(`Unable to create action client ${actionServer} without type - got ${type}`);
    }

    // don't namespace action client - topics will be resolved by
    // advertising through this NodeHandle
    return new ActionClient(Object.assign({}, options, {
      actionServer,
      type,
      nh: this
    }));
  }

  /**
   * Stop receiving callbacks for this topic
   * Unregisters subscriber from master
   * @param topic {string} topic to unsubscribe from
   */
  unsubscribe(topic) {
    return this._node.unsubscribe(this._resolve(topic));
  }

  /**
   * Stops publishing on this topic
   * Unregisters publisher from master
   * @param topic {string} topic to unadvertise
   */
  unadvertise(topic) {
    return this._node.unadvertise(this._resolve(topic));
  }

  /**
   * Unregister service from master
   * @param service {string} service to unadvertise
   */
  unadvertiseService(service) {
    return this._node.unadvertiseService(this._resolve(service));
  }

  /**
   * Polls master for service
   * @param service {string} name of service
   * @param [timeout] {number} give up after some time
   * @return {Promise} resolved when service exists or timeout occurs. Returns true/false for service existence
   */
  waitForService(service, timeout) {
    service = this._resolve(service);

    let _waitForService = (callback, timeout) => {
      setTimeout( () => {
        this._node.lookupService(service)
        .then((resp) => {
          callback(true);
        })
        .catch((err, resp) => {
          _waitForService(callback, 500);
        })
      }, timeout);
    };

    let waitPromise = new Promise((resolve, reject) => {
      _waitForService(resolve, 0);
    });

    if (typeof timeout === 'number') {
      let timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(resolve.bind(null, false), timeout);
      });

      return Promise.race([waitPromise, timeoutPromise]);
    }
    // else
    return waitPromise;
  }

  getMasterUri() {
    return this._node.getMasterUri();
  }

//------------------------------------------------------------------
// Param Interface
//------------------------------------------------------------------
  deleteParam(key) {
    return this._node.deleteParam(this._resolve(key));
  }

  setParam(key, value) {
    return this._node.setParam(this._resolve(key), value);
  }

  getParam(key) {
    return this._node.getParam(this._resolve(key));
  }

  hasParam(key) {
    return this._node.hasParam(this._resolve(key));
  }
//------------------------------------------------------------------
// Namespacing
//------------------------------------------------------------------
  _resolve(name) {
    return namespaceUtils.resolve(name, this._namespace, this.getNodeName());
  }
}

//------------------------------------------------------------------

module.exports = NodeHandle;
