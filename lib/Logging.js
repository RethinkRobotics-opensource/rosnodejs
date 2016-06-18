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
const Logger = require('../utils/log/Logger.js');
const RosLogStream = require('../utils/log/RosLogStream.js');
const ConsoleLogStream = require('../utils/log/ConsoleLogStream.js');
const LogFormatter = require('../utils/log/LogFormatter.js');

//-----------------------------------------------------------------------

const DEFAULT_LOGGER_NAME = 'ros';

//-----------------------------------------------------------------------

class LoggingManager {
  constructor() {
    this.loggerMap = {};

    // initialize the root logger with a console stream
    const rootLoggerOptions = {
      name: DEFAULT_LOGGER_NAME,
      streams: [{
        type: 'raw',
        stream: new ConsoleLogStream({formatter: LogFormatter.ROS}),
        level: 'info'
      }]
    }
    this.rootLogger = new Logger(rootLoggerOptions);
    this._bindRootLoggerMethods();

    this.DEFAULT_LOGGER_NAME = DEFAULT_LOGGER_NAME;
  }

  initializeOptions(rosnodejs, options) {
    const defaultOptions = {
      streams: [{
        type: 'raw',
        level: 'info',
        stream: new RosLogStream(rosnodejs.nh, rosnodejs.require('rosgraph_msgs').msg.Log)
      }]
    };
    if (!options) {
      this.initializeOptions(rosnodejs, defaultOptions);
      return;
    }
    // else
    if (options.hasOwnProperty('streams')) {
      options.streams.forEach((stream) => {
        this.addStream(stream);
      });
    }
    if (options.hasOwnProperty('level')) {
      this.setLevel(options.level);
    }
  }

  generateLogger(options) {
    if (!options.hasOwnProperty('name')) {
      throw new Error('Unable to generate logger without name');
    }
    const loggerName = options.name;

    // don't regenerate the logger if it exists
    if (this.loggerMap.hasOwnProperty(loggerName)) {
      return this.loggerMap[loggerName];
    }
    // else
    // generate a child logger from root
    options.$parent = this.rootLogger._logger;
    let newLogger = this._createChildLogger(loggerName, options);

    // stash the logger and return it
    this.loggerMap[loggerName] = newLogger;
    return newLogger;
  }

  getLogger(loggerName, options) {
    if (!loggerName) {
      return this.rootLogger;
    }
    else if (!this.loggerMap.hasOwnProperty(loggerName)) {
      options = options || {};
      options.name = loggerName;
      return this.generateLogger(options);
    }
    // else
    return this.loggerMap[loggerName];
  }

  removeLogger(loggerName) {
    if (loggerName !== DEFAULT_LOGGER_NAME) {
      delete this.loggerMap[loggerName];
    }
  }

  getLoggers() {
    return Object.keys(loggerMap);
  }

  setLevel(level) {
    this._forEachLogger((logger) => logger.setLevel(level), true);
  }

  addStream(stream) {
    this._forEachLogger((logger) => logger.addStream(stream), true);
  }

  clearStreams() {
    this._forEachLogger((logger) => logger.clearStreams(), true);
  }

  _bindRootLoggerMethods() {
    const rawMethods = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
    let methods = [];
    rawMethods.forEach((method) => methods.push(method));
    rawMethods.forEach((method) => methods.push(method + 'Throttle'));
    rawMethods.forEach((method) => methods.push(method + 'Once'));
    methods.forEach((method) => {
      this[method] = this.rootLogger[method].bind(this.rootLogger);
    });
  }

  _forEachLogger(perLoggerCallback, includeRoot) {
    if (includeRoot) {
      perLoggerCallback(this.rootLogger);
    }
    Object.keys(this.loggerMap).forEach((loggerName) => {
      perLoggerCallback(this.loggerMap[loggerName])
    });
  }

  /**
   * Creates a child logger. If the fullScope contains one or more '.', then
   * nested child loggers will be created. The final (deepest) child logger will
   * be returned.
   * @param {string} fullScope The full scope of the child. Can contain '.' to
   *     create nested child loggers.
   * @param {object} [options] Logging options passed only to the last child
   *     logger created.
   * @returns {logger} Child logger object
   * @private
   */
  _createChildLogger(fullScope, options) {
    let parentLogger = this.rootLogger;
    let childLogger = null;

    const childScopes = fullScope.split('.');
    let scope = '';
    childScopes.forEach((scopeFragment) => {
      scope = (scope ? scope + '.' : '') + scopeFragment;
      childLogger = this.loggerMap[scope];
      if (!childLogger) {
        let childOptions = (fullScope === scope && options
                            ? options
                            : { name: scope });
        childLogger = parentLogger.child(childOptions);

        this.loggerMap[scope] = childLogger;
      }
      // If there are nested scopes (separated by '.'), then the new childLogger
      // will be the parent of the next scopeFragment.
      parentLogger = childLogger;
    });

    return childLogger;
  };
};

module.exports = new LoggingManager();