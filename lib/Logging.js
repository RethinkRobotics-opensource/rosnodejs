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
    const nh = rosnodejs.nh;
    const defaultOptions = {
      streams: [{
        type: 'raw',
        level: 'info',
        stream: new RosLogStream(nh, rosnodejs.require('rosgraph_msgs').msg.Log)
      }]
    };
    if (!options) {
      this.initializeOptions(rosnodejs, defaultOptions);
      return;
    }
    // else

    // try to set up logging services
    try {
      rosnodejs.require('roscpp');
      const getLoggerSrv = '/' + nh.getNodeName() + '/get_loggers';
      const setLoggerSrv = '/' + nh.getNodeName() + '/set_logger_level';
      nh.advertiseService(getLoggerSrv, 'roscpp/GetLoggers', this._handleGetLoggers.bind(this))
      nh.advertiseService(setLoggerSrv, 'roscpp/SetLoggerLevel', this._handleSetLoggerLevel.bind(this))
    }
    catch (err) {
      this.rootLogger.warn('Unable to setup ros logging services');
    }

    // setup desired streams
    if (options.hasOwnProperty('streams')) {
      options.streams.forEach((stream) => {
        this.addStream(stream);
      });
    }
    // set desired log level
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
    let newLogger = this._createChildLogger(loggerName, this.rootLogger, options);

    // stash the logger and return it
    this.loggerMap[loggerName] = newLogger;
    return newLogger;
  }

  getLogger(loggerName, options) {
    if (!loggerName) {
      return this.rootLogger;
    }
    else if (!this.hasLogger(loggerName)) {
      options = options || {};
      options.name = loggerName;
      return this.generateLogger(options);
    }
    // else
    return this.loggerMap[loggerName];
  }

  hasLogger(loggerName) {
    return this.loggerMap.hasOwnProperty(loggerName);
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

  _handleGetLoggers(req, resp) {
    this._forEachLogger((logger) => {
      resp.loggers.push({
        name: logger.getName(),
        level: bunyan.nameFromLevel[logger.getLevel()]
      });
    }, true);

    return true;
  }

  _handleSetLoggerLevel(req, resp) {
    if (!this.hasLogger(req.logger)) {
      return false;
    }
    // else
    const logger = this.getLogger(req.logger);
    logger.setLevel(req.level);

    return true;
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

  _createChildLogger(childLoggerName, parentLogger, options) {
    // setup options
    options = options || {};
    options.name = childLoggerName;
    options.$parent = parentLogger._logger;

    // create logger
    const childLogger =  new Logger(options);

    // cache in map
    this.loggerMap[childLoggerName] = childLogger;
    return childLogger;
  };
};

module.exports = new LoggingManager();
