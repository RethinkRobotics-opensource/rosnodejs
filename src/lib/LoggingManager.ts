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

/// <reference path="../../types.d.ts"/>
import * as bunyan from 'bunyan';
import Logger, { Options as LoggerOptions } from '../utils/log/Logger';
import RosLogStream from '../utils/log/RosLogStream';
import ConsoleLogStream from '../utils/log/ConsoleLogStream';
import LogFormatter from '../utils/log/LogFormatter';
import type { GetLoggers, SetLoggerLevel } from '../types/RosTypes';
import type { INodeHandle } from '../types/NodeHandle';
import * as msgUtils from '../utils/message_utils';

//-----------------------------------------------------------------------

const DEFAULT_LOGGER_NAME = 'ros';
const LOG_CLEANUP_INTERVAL_MS = 30000; // 30 seconds

// TODO: put this in a config file somewhere
const KNOWN_LOGS = [
  {
    name: `${DEFAULT_LOGGER_NAME}.superdebug`,
    level: bunyan.FATAL
  },
  {
    name: `${DEFAULT_LOGGER_NAME}.rosnodejs`,
    level: bunyan.WARN
  },
  {
    name: `${DEFAULT_LOGGER_NAME}.masterapi`,
    level: bunyan.WARN
  },
  {
    name: `${DEFAULT_LOGGER_NAME}.params`,
    level: bunyan.WARN
  },
  {
    name: `${DEFAULT_LOGGER_NAME}.spinner`,
    level: bunyan.ERROR
  }
];

//-----------------------------------------------------------------------

type NodeLoggerOptions = {
  streams?: bunyan.Stream[];
  level?: bunyan.LogLevel;
  getLoggers?: ExternalLogInterface['getLoggers'];
  setLoggerLevel?: ExternalLogInterface['setLoggerLevel'];
}

type RosLoggerOptions = {
  skipRosLogging?: boolean;
  waitOnRosOut?: boolean;
}

// in case the node we're running has it's own logging system, we'll
// allow users to pass in callbacks for getting and setting loggers
// through the logging services (_handleGetLoggers, _handleSetLoggerLevel)
type ExternalLogInterface = {
  getLoggers?: (req: GetLoggers['Req'], resp: GetLoggers['Resp'])=>boolean;
  setLoggerLevel?: (req: SetLoggerLevel['Req'], resp: SetLoggerLevel['Resp'])=>boolean;
}

export class LoggingManager {
  loggerMap: { [key: string]: Logger };
  rootLogger: Logger;
  nameFromLevel: typeof bunyan.nameFromLevel;
  levelFromName: typeof bunyan.levelFromName;
  DEFAULT_LOGGER_NAME: string;
  private _cleanLoggersInterval: NodeJS.Timer|null = null;
  private _externalLog: ExternalLogInterface = {};

  constructor() {
    this.loggerMap = {};

    // initialize the root logger with a console stream
    const rootLoggerOptions = {
      name: DEFAULT_LOGGER_NAME,
      streams: [{
        type: 'raw',
        name: 'ConsoleLogStream',
        stream: new ConsoleLogStream({formatter: LogFormatter}),
        level: bunyan.INFO
      }],
      level: bunyan.INFO
    };
    this.rootLogger = new Logger(rootLoggerOptions);

    this.nameFromLevel = bunyan.nameFromLevel;
    this.levelFromName = bunyan.levelFromName;
    this.DEFAULT_LOGGER_NAME = DEFAULT_LOGGER_NAME;

    KNOWN_LOGS.forEach((log) => {
      this._generateLogger(log);
    });
  }

  initializeNodeLogger(nodeName: string, options: NodeLoggerOptions ={}): void {
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

    // automatically clear out expired throttled logs every so often unless specified otherwise
    if (!options.hasOwnProperty('overrideLoggerCleanup')) {
      this._cleanLoggersInterval = setInterval(this.clearThrottledLogs.bind(this), LOG_CLEANUP_INTERVAL_MS);
    }

    if (typeof options.getLoggers === 'function') {
      this._externalLog.getLoggers = options.getLoggers;
    }

    if (typeof options.setLoggerLevel === 'function') {
      this._externalLog.setLoggerLevel = options.setLoggerLevel;
    }
  }

  initializeRosOptions(nh: INodeHandle, options: RosLoggerOptions={}) {
    if (options.skipRosLogging) {
      return Promise.resolve();
    }

    let rosLogStream: RosLogStream|undefined;
    try {
      const rosgraphMsgs = msgUtils.requireMsgPackage('rosgraph_msgs');
      const rosLogStream = new RosLogStream(nh, rosgraphMsgs.msg.Log);
      this.addStream({
        type: 'raw',
        name: 'RosLogStream',
        stream: rosLogStream
      });
    }
    catch (err) {
      this.rootLogger.warn('Unable to setup ros logging stream');
    }

    // try to set up logging services
    try {
      const roscpp = msgUtils.requireMsgPackage('roscpp');
      const getLoggerSrv = nh.getNodeName() + '/get_loggers';
      const setLoggerSrv = nh.getNodeName() + '/set_logger_level';
      nh.advertiseService(getLoggerSrv, roscpp.srv.GetLoggers, this._handleGetLoggers.bind(this));
      nh.advertiseService(setLoggerSrv, roscpp.srv.SetLoggerLevel, this._handleSetLoggerLevel.bind(this));
    }
    catch (err) {
      this.rootLogger.warn('Unable to setup ros logging services');
    }

    if (rosLogStream && options.waitOnRosOut !== undefined && options.waitOnRosOut) {
      this.rootLogger.debug('Waiting for /rosout connection before resolving node initialization...');
      return new Promise((resolve) => {
        rosLogStream.getPub().once('connection', () => {
          this.rootLogger.debug('Got connection to /rosout !');
          resolve();
        });
      });
    }
    return Promise.resolve();
  }

  trace = this.rootLogger.trace;
  debug = this.rootLogger.debug;
  info = this.rootLogger.info;
  warn = this.rootLogger.warn;
  error = this.rootLogger.error;
  fatal = this.rootLogger.fatal;

  traceThrottle = this.rootLogger.traceThrottle;
  debugThrottle = this.rootLogger.debugThrottle
  infoThrottle = this.rootLogger.infoThrottle
  warnThrottle = this.rootLogger.warnThrottle
  errorThrottle = this.rootLogger.errorThrottle
  fatalThrottle = this.rootLogger.fatalThrottle

  traceOnce = this.rootLogger.traceOnce
  debugOnce = this.rootLogger.debugOnce
  infoOnce = this.rootLogger.infoOnce
  warnOnce = this.rootLogger.warnOnce
  errorOnce = this.rootLogger.errorOnce
  fatalOnce = this.rootLogger.fatalOnce

  getLogger(loggerName?: string, options?: LoggerOptions): Logger {
    if (!loggerName || loggerName === this.rootLogger.getName()) {
      return this.rootLogger;
    }
    else if (!this.hasLogger(loggerName)) {
      options = options || {};
      options.name = loggerName;
      return this._generateLogger(options);
    }
    // else
    return this.loggerMap[loggerName];
  }

  hasLogger(loggerName: string): boolean {
    return this.loggerMap.hasOwnProperty(loggerName);
  }

  removeLogger(loggerName: string): void {
    if (loggerName !== DEFAULT_LOGGER_NAME) {
      delete this.loggerMap[loggerName];
    }
  }

  getLoggers(): string[] {
    const loggerNames = Object.keys(this.loggerMap);
    loggerNames.push(this.rootLogger.getName());
    return loggerNames;
  }

  getStreams(): bunyan.Stream[] {
    return this.rootLogger.getStreams();
  }

  getStream(streamName: string): bunyan.Stream {
    const streams = this.getStreams();
    for (let i = 0; i < streams.length; ++i) {
      const stream = streams[i];
      if (stream.name === streamName) {
        return stream;
      }
    }
  }

  setLevel(level: bunyan.LogLevel): void {
    this._forEachLogger((logger) => logger.setLevel(level), true);
  }

  addStream(stream: bunyan.Stream): void {
    this._forEachLogger((logger) => logger.addStream(stream), true);
  }

  clearStreams(): void {
    this._forEachLogger((logger) => logger.clearStreams(), true);
  }

  clearThrottledLogs(): void {
    this._forEachLogger((logger) => logger.clearExpiredThrottledLogs(), true);
  }

  stopLogCleanup(): void {
    clearInterval(this._cleanLoggersInterval);
    this._cleanLoggersInterval = null;
  }

  private _generateLogger(options: LoggerOptions): Logger {
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

  private _handleGetLoggers(req: GetLoggers['Req'], resp: GetLoggers['Resp']): boolean {
    if (this._externalLog.getLoggers) {
      this._externalLog.getLoggers(req, resp);
    }

    this._forEachLogger((logger) => {
      resp.loggers.push({
        name: logger.getName(),
        level: bunyan.nameFromLevel[logger.getLevel()]
      });
    }, true);

    return true;
  }

  private _handleSetLoggerLevel(req: SetLoggerLevel['Req'], resp: SetLoggerLevel['Resp']): boolean {
    let handled = false;
    if (this._externalLog.setLoggerLevel) {
      handled = this._externalLog.setLoggerLevel(req, resp);
    }

    if (!handled) {
      const logger = this.getLogger(req.logger);
      if (!logger) {
        return false;
      }
      // else
      logger.setLevel(req.level);
    }

    return true;
  }

  _forEachLogger(perLoggerCallback: (l: Logger) => void, includeRoot: boolean): void {
    if (includeRoot) {
      perLoggerCallback(this.rootLogger);
    }
    for (const loggerName in this.loggerMap) {
      perLoggerCallback(this.loggerMap[loggerName])
    }
  }

  _createChildLogger(childLoggerName: string, parentLogger: Logger, options: LoggerOptions) {
    // setup options
    options = options || {};
    options.name = childLoggerName;

    // create logger
    const childLogger = parentLogger.child(options);

    // cache in map
    this.loggerMap[childLoggerName] = childLogger;
    return childLogger;
  };
}

export default new LoggingManager();
