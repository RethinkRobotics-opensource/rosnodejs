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
let Console = require('console').Console;
let moment = require('moment');
let util = require('util');

//-----------------------------------------------------------------------

let levels = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50
};

let nameFromLevel = {};
Object.keys(levels).forEach((level) => {
  nameFromLevel[levels[level]] = level;
});

let defaultFormatter = function(name, msg, level) {
  let now =  moment().format('YYYY-MM-DD HH:mm:ss.SSSZZ');
  let timeMsg = '[' + nameFromLevel[level] + '] ' + now + ': ' + msg;
  if (name) {
    return '[' + name + ']' + timeMsg;
  }
  return timeMsg;
};

let levelMethodMap = {};
levelMethodMap[levels.TRACE] = 'log';
levelMethodMap[levels.DEBUG] = 'log';
levelMethodMap[levels.INFO] = 'log';
levelMethodMap[levels.WARN] = 'warn';
levelMethodMap[levels.ERROR] = 'error';

const DefaultStream = {
  stream: new Console(process.stdout, process.stderr),
  levelMethodMap: levelMethodMap
};

let logger;
let loggerMap = {};

//-----------------------------------------------------------------------

class Logger {
  constructor(options) {
    options = options || {};

    this._name = options.name;

    this._streams = options.streams || [DefaultStream];

    this._formatter = options.formatter || defaultFormatter;

    this.setLevel(options.level || levels.INFO);
  }

  setLevel(level) {
    if (nameFromLevel.hasOwnProperty(level)) {
      this._level = level;
    }
    else if (levels.hasOwnProperty(level.toUpperCase())) {
      this._level = levels[level];
    }
  }

  getLevel() {
    return this._level;
  }

  getName() {
    return this._name;
  }

  trace(args) {
    if (this._level <= levels.TRACE) {
      this._log(util.format.apply(this, arguments), levels.TRACE);
    }
  }

  debug(args) {
    if (this._level <= levels.DEBUG) {
      this._log(util.format.apply(this, arguments), levels.DEBUG);
    }
  }

  info(args) {
    if (this._level <= levels.INFO) {
      this._log(util.format.apply(this, arguments), levels.INFO);
    }
  }

  warn(args) {
    if (this._level <= levels.WARN) {
      this._log(util.format.apply(this, arguments), levels.WARN);
    }
  }

  error(args) {
    if (this._level <= levels.ERROR) {
      this._log(util.format.apply(this, arguments), levels.ERROR);
    }
  }

  _log(msg, level) {
    this._streams.forEach((stream) => {
      let levelMethodMap = stream.levelMethodMap || levelMethodMap;
      stream.stream[levelMethodMap[level]](this._formatter(this._name, msg, level));
    });
  }
};

//-----------------------------------------------------------------------

module.exports = {
  init(options) {
    if (!logger) {
      logger = new Logger(options);
    }
  },

  createLogger(options) {
    // initialize 'global' logger if needed
    if (!logger) {
      this.init();
    }

    options = options || {};
    let loggerName = options.name;
    if (!loggerName) {
      loggerName = 'DefaultLogger';
    }

    // if this logger doesn't exist yet, actually create it
    // with provided options
    // otherwise, we'll just return the existing logger
    if (!loggerMap.hasOwnProperty(loggerName)) {
      // have this new logger use the 'global' logger's streams
      options.streams = logger._streams;

      // use the 'global' logger's level if not specified
      if (!options.hasOwnProperty('level')) {
        options.level = logger.getLevel();
      }

      // add the logger to the map
      loggerMap[loggerName] = new Logger(options);
    }
    return loggerMap[loggerName];
  },

  getLogger(loggerName) {
    return loggerMap[loggerName];
  },

  getLoggers() {
    return Object.keys(loggerMap);
  }
};
