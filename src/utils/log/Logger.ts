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

/// <reference path="../../../types.d.ts"/>
import * as bunyan from 'bunyan';
import * as crypto from 'crypto';

//------------------------------------------------------------------------

export type Options = {
  name?: string;
  $parent?: bunyan.Logger;
  level?: bunyan.LogLevel;
  streams?: bunyan.Stream[];
  childOptions?: Options;
}

type LogFuncType = InstanceType<typeof bunyan.Logger>['info'];
type ThrottleArgs = [string, ...any[]]|[any, string];
type ThrottledMethodType = (t: number, ...p: ThrottleArgs)=>boolean;

/**
 * Logger is a minimal wrapper around a bunyan logger. It adds useful methods
 * to throttle/limit logging.
 * @class Logger
 */
export default class Logger {
  private _name: string;
  private _logger: bunyan.Logger;
  private _throttledLogs: Map<string, ThrottledLog> = new Map();
  private _onceLogs: Set<string> = new Set();

  constructor(options: Options = {}) {
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
  }

  getStreams(): bunyan.Stream[] {
    return this._logger.streams;
  }

  child(childOptions: Options): Logger {
    // setup options
    const name = childOptions.name;
    delete childOptions.name;
    const options = {
      childOptions: childOptions,
      $parent: this._logger,
      name
    };

    // create logger
    return new Logger(options);
  }

  level(level: bunyan.LogLevel=null) {
    this._logger.level(level);
  }

  setLevel(level: number|string) {
    this._logger.level(level as bunyan.LogLevel);
  }

  getLevel(): number {
    return this._logger.level();
  }

  getName(): string {
    return this._name;
  }

  addStream(stream: bunyan.Stream) {
    this._logger.addStream(stream);
  }

  clearStreams(): void {
    (this._logger as any)['streams'] = [];
  }

  trace = this._logger.trace;
  debug = this._logger.debug;
  info = this._logger.info;
  warn = this._logger.warn;
  error = this._logger.error;
  fatal = this._logger.fatal;

  traceThrottle = this._makeThrottleMethod(this._logger.trace);
  debugThrottle = this._makeThrottleMethod(this._logger.debug);
  infoThrottle = this._makeThrottleMethod(this._logger.info);
  warnThrottle = this._makeThrottleMethod(this._logger.warn);
  errorThrottle = this._makeThrottleMethod(this._logger.error);
  fatalThrottle = this._makeThrottleMethod(this._logger.fatal);

  traceOnce = this._makeOnceMethod(this._logger.trace);
  debugOnce = this._makeOnceMethod(this._logger.debug);
  infoOnce = this._makeOnceMethod(this._logger.info);
  warnOnce = this._makeOnceMethod(this._logger.warn);
  errorOnce = this._makeOnceMethod(this._logger.error);
  fatalOnce = this._makeOnceMethod(this._logger.fatal);

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
  private _makeThrottleMethod(method: LogFuncType): ThrottledMethodType {
    // there's currently a bug using arguments in a () => {} function
    return (throttleTimeMs: number, ...args: ThrottleArgs) => {
      // If the desired log level is enabled and the message
      // isn't being throttled, then log the message.
      if (method.call(this) && !this._throttle(throttleTimeMs, args)) {
        method.apply(this, args);
        return true;
      }
      return false;
    }
  }

  private _makeOnceMethod(method: LogFuncType): (...a: ThrottleArgs)=>boolean {
    return (...args: ThrottleArgs) => {
      if (method.call(this) && this._once(args)) {
        method.apply(this, args);
        return true;
      }
      return false;
    }
  }

  //--------------------------------------------------------------
  // Throttled loggers
  //  These will generally be slower. Performance will also degrade the more
  //  places where you throttle your logs. Keep this in mind. Make child loggers.
  //--------------------------------------------------------------

  /**
   * Handles throttling logic for each log statement. Throttles logs by attempting
   * to create a string log 'key' from the arguments.
   * @param throttleTimeMs {number}
   * @param args {Array} arguments provided to calling function
   * @return {boolean} should this log be throttled (if true, the log should not be written)
   */
  private _throttle(throttleTimeMs: number, args: ThrottleArgs): boolean {
    const now = Date.now();
    const throttlingMsg = this._getThrottleMsg(args);
    if (throttlingMsg === null) {
      // we couldn't get a msg to hash - fall through and log the message
      return false;
    }
    // else
    const msgHash = hashMessage(throttlingMsg);

    const throttledLog = this._throttledLogs.get(msgHash);

    if (throttledLog === undefined || now  > throttledLog.startTime + throttledLog.throttleTime) {
      const newThrottledLog = { startTime: now, throttleTime: throttleTimeMs };
      this._throttledLogs.set(msgHash, newThrottledLog);
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
  _once(args: ThrottleArgs): boolean {
    const throttleMsg = this._getThrottleMsg(args);
    if (throttleMsg === null) {
      // we couldn't get a msg to hash - fall through and log the message
      return true;
    }

    const logKey = hashMessage(throttleMsg);

    if (!this._onceLogs.has(logKey)) {
      this._onceLogs.add(logKey);
      return true;
    }
    return false;
  }

  _getThrottleMsg(args: ThrottleArgs): string|null {
    const firstArg = args[0];
    if (typeof firstArg === 'string') {
      return firstArg;
    }
    else if (typeof firstArg === 'object') {
      // bunyan supports passing an object as the first argument with
      // optional fields to add to the log record - the second argument
      // is the actual string 'log message' in this case, so just return that
      return args[1] as string;
    }
    // fall through *womp womp*
    return null;
  }

  /**
   * Remove old throttled logs (logs that were throttled whose throttling time has passed) from the throttling map
   * @returns {Number} number of logs that were cleaned out
   */
  clearExpiredThrottledLogs(): number {
    const logsToRemove: string[] = [];
    const now = Date.now();
    this._throttledLogs.forEach((log, key) => {
      if (now - log.startTime >= log.throttleTime) {
        logsToRemove.push(key);
      }
    });

    logsToRemove.forEach((logKey) => {
      this._throttledLogs.delete(logKey);
    });

    return logsToRemove.length;
  }

  getThrottledLogSize(): number {
    return this._throttledLogs.size;
  }
}

//-----------------------------------------------------------------------

interface ThrottledLog {
  startTime: number;
  throttleTime: number;
}

// Utility function to help hash messages when we throttle them.
function hashMessage(msg: string): string {
  const sha1 = crypto.createHash('sha1');
  sha1.update(msg);
  return sha1.digest('hex');
}
