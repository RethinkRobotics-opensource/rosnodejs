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

const EventEmitter = require('events');
const {rebroadcast} = require('../utils/event_utils.js');

class Publisher extends EventEmitter {
  constructor(impl) {
    super();

    ++impl.count;
    this._impl = impl;

    rebroadcast('registered', this._impl, this);
    rebroadcast('connection', this._impl, this);
    rebroadcast('disconnect', this._impl, this);
    rebroadcast('error', this._impl, this);
  }

  getTopic() {
    if (this._impl) {
      return this._impl.getTopic();
    }
    // else
    return null;
  }

  getType() {
    if (this._impl) {
      return this._impl.getType();
    }
    // else
    return null;
  }

  getLatching() {
    if (this._impl) {
      return this._impl.getLatching();
    }
    // else
    return false;
  }

  getNumSubscribers() {
    if (this._impl) {
      return this._impl.getNumSubscribers();
    }
    // else
    return 0;
  }

  shutdown() {
    const topic= this.getTopic();
    if (this._impl) {
      const impl = this._impl
      this._impl = null;
      this.removeAllListeners();

      --impl.count;
      if (impl.count <= 0) {
        return impl.shutdown();
      }
    }
    // else
    return Promise.resolve();
  }

  isShutdown() {
    return !!this._impl;
  }

  /**
   * Schedule the msg for publishing - or publish immediately if we're
   * supposed to
   * @param msg {object} object type matching this._type
   * @param [throttleMs] {number} optional override for publisher setting
   */
  publish(msg, throttleMs) {
    this._impl.publish(msg, throttleMs);
  }
}

module.exports = Publisher;
