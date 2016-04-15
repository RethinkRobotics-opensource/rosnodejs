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

class NodeHandle {
  constructor(node) {
    if (!(node instanceof RosNode)) {
      throw new Error('Unable to create NodeHandle from type ' + typeof(node));
    }

    this._node = node;
  }

  getNodeName() {
    return this._node.getNodeName();
  }

//------------------------------------------------------------------
// Pubs, Subs, Services
//------------------------------------------------------------------
  /**
   * Create a ros publisher with the provided options
   * @param options {object}
   * @param options.topic {string} topic to publish on ('/chatter')
   * @param options.type {string} type of message to publish ('std_msgs/String')
   * @param options.latching {boolean} latch messages
   * @param options.tpcNoDelay {boolean} set TCP no delay option on Socket
   * @param options.queueSize {number} number of messages to queue when publishing
   * @param options.throttleMs {number} milliseconds to throttle when publishing
   * @return {Publisher}
   */
  advertise(options) {
    return this._node.advertise(options);
  }

  /**
   * Create a ros subscriber with the provided options
   * @param options {object}
   * @param options.topic {string} topic to publish on ('/chatter')
   * @param options.type {string} type of message to publish ('std_msgs/String')
   * @param options.queueSize {number} number of messages to queue when subscribing
   * @param options.throttleMs {number} milliseconds to throttle when subscribing
   * @return {Subscriber}
   */
  subscribe(options, callback) {
    return this._node.subscribe(options, callback);
  }

  /**
   * Create a ros Service server with the provided options
   * @param options {object}
   * @param options.service {string} service to provide e.g ('/add_two_ints')
   * @param options.type {string} type of service ('tutorial_msgs/AddTwoInts')
   * @return {ServiceServer}
   */
  advertiseService(options, callback) {
    return this._node.advertiseService(options, callback);
  }

  /**
   * Create a ros Service server with the provided options
   * @param options {object}
   * @param options.service {string} service to provide e.g ('/add_two_ints')
   * @param options.type {string} type of service ('tutorial_msgs/AddTwoInts')
   * @return {ServiceClient}
   */
  serviceClient(options) {
    return this._node.serviceClient(options);
  }

  /**
   * Stop receiving callbacks for this topic
   * Unregisters subscriber from master
   * @param topic {string} topic to unsubscribe from
   */
  unsubscribe(topic) {
    return this._node.unsubscribe(topic);
  }

  /**
   * Stops publishing on this topic
   * Unregisters publisher from master
   * @param topic {string} topic to unadvertise
   */
  unadvertise(topic) {
    return this._node.unadvertise(topic);
  }

  /**
   * Unregister service from master
   * @param service {string} service to unadvertise
   */
  unadvertiseService(service) {
    return this._node.unadvertiseService(service);
  }

  /**
   * Polls master for service
   * @param service {string} name of service
   * @param [timeout] {number} give up after some time
   * @return {Promise} resolved when service exists or timeout occurs. Returns true/false for service existence
   */
  waitForService(service, timeout) {
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

//------------------------------------------------------------------
// Param Interface
//------------------------------------------------------------------
  deleteParam(key) {
    return this._node.deleteParam(key);
  }

  setParam(key, value) {
    return this._node.setParam(key, value);
  }

  getParam(key) {
    return this._node.getParam(key);
  }

  hasParam(key) {
    return this._node.hasParam(key);
  }
};

//------------------------------------------------------------------

module.exports = NodeHandle;
