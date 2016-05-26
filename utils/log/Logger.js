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
const bunyan = require('bunyan');

//-----------------------------------------------------------------------

/**
 * Logger is a minimal wrapper around a bunyan logger. It adds useful methods
 * to throttle/limit logging.
 * @class Logger
 */
class Logger {
  constructor(options) {
    options = options || {};

    this._name = options.name;

    if (options.$parent) {
      this._logger = options.$parent.child(options.childOptions);
    }
    else {
      this._logger = bunyan.createLogger({
        name: this._name,
        level: options.level || bunyan.INFO,
        streams: options.streams
      });
    }

    this._throttledLogs = new Set();
    this._onceLogs = new Set();

    const logMethods = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
    this._createLogMethods(logMethods);
    this._createThrottleLogMethods(logMethods);
    this._createOnceLogMethods(logMethods);
  }

  setLevel(level) {
    this._logger.level(level);
  }

  getLevel() {
    return this._logger.level();
  }

  getName() {
    return this._name;
  }

  addStream(stream) {
    this._logger.addStream(stream);
  }

  child(options) {
    options = options || {};
    options.$parent = this._logger;
    return new Logger(options);
  }

  /**
   * Binds to bunyan logger's method for each method (info, debug, etc)
   * @param methods {Set.<String>}
   */
  _createLogMethods(methods) {
    methods.forEach((method) => {
      if (this.hasOwnProperty(method)) {
        throw new Error('Unable to create method %s', method);
      }
      this[method] = this._logger[method].bind(this._logger);
    });
  }

  /**
   * Attaches throttled logging functions to this object for each level method
   * (info, debug, etc)
   * e.g.
   *  logger.infoThrottle(1000, 'Hi');
   *  logger.debugThrottle(1000, 'Hi');
   * Logs are throttled by a String key taken from the second argument (first
   * should always be throttle time in ms). So if you're logging something with
   * variable values, using format strings should be preferred since it will
   * throttle appropriately while composition will not.
   * e.g.
   *   let i = 0;
   *   setInterval(() => {
   *     logger.infoThrottle(1000, 'Counter: %d', i); // prints once second
   *     logger.infoThrottle(1000, 'Counter: ' + i);  // prints twice a second
   *     ++i;
   *   }, 500);
   *
   * @param methods {Set.<String>}
   */
  _createThrottleLogMethods(methods) {
    methods.forEach((method) => {
      let throttleMethod = method + 'Throttle';
      if (this.hasOwnProperty(throttleMethod)) {
        throw new Error('Unable to create method %s', throttleMethod);
      }

      // there's currently a bug using arguments in a () => {} function
      this[throttleMethod] = function(throttleTime, args) {
        if (this[method]() && !this._throttle(arguments)) {
          return this[method].apply(this, Array.from(arguments).slice(1));
        }
        return false;
      }.bind(this);
    });
  }

  _createOnceLogMethods(methods) {
    methods.forEach((method) => {
      let onceMethod = method + 'Once';
      if (this.hasOwnProperty(onceMethod)) {
        throw new Error('Unable to create method %s', onceMethod);
      }

      // there's currently a bug using arguments in a () => {} function
      this[onceMethod] = function(args) {
        if (this[method]() && this._once(arguments)) {
          return this[method].apply(this, arguments);
        }
        return false;
      }.bind(this);
    });
  }

  //--------------------------------------------------------------
  // Throttled loggers
  //  These will generally be slower. Performance will also degrade the more
  //  places where you throttle your logs. Keep this in mind. Make child loggers.
  //--------------------------------------------------------------

  /**
   * Handles throttling logic for each log statement. Throttles logs by attempting
   * to create a string log 'key' from the arguments.
   * @param args {Array} arguments provided to calling function
   * @return {boolean} should this log be throttled (if true, the log should not be written)
   */
  _throttle(args) {
    const timeArg = args[0];
    let stringArg = args[1];

    const addLog = (logId) => {
      this._throttledLogs.add(logId);
      setTimeout(() => {
        this._throttledLogs.delete(logId)
      }, timeArg);
    };

    if (typeof stringArg !== 'string' && !(stringArg instanceof String)) {
      if (typeof stringArg === 'object') {
        // if its an object, use its keys as a throttling key
        stringArg = Object.keys(stringArg).toString();
      }
      else {
        // can't create a key - just log it
        return false;
      }
    }

    if (!this._throttledLogs.has(stringArg)) {
      addLog(stringArg);
      return false;
    }
    return true;
  }

  //--------------------------------------------------------------
  // Throttled loggers
  //  These will generally be slower. Performance will also degrade the more
  //  places where you throttle your logs. Keep this in mind. Make child loggers.
  //--------------------------------------------------------------

  /**
   * Handles once logic for each log statement. Throttles logs by attempting
   * to create a string log 'key' from the arguments.
   * @param args {Array} arguments provided to calling function
   * @return {boolean} should this be written
   */
  _once(args) {
    let logKey = args[0];

    if (typeof logKey !== 'string' && !(logKey instanceof String)) {
      if (typeof logKey === 'object') {
        // if its an object, use its keys as a throttling key
        logKey = Object.keys(logKey).toString();
      }
      else {
        // can't create a key - just log it
        return true;
      }
    }

    if (!this._onceLogs.has(logKey)) {
      this._onceLogs.add(logKey);
      return true;
    }
    return false;
  }
};

//-----------------------------------------------------------------------

module.exports = Logger;
