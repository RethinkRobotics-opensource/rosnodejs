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
const Logger = require('./Logger.js');

//-----------------------------------------------------------------------

const DEFAULT_LOGGER_NAME = 'ros';

//-----------------------------------------------------------------------

const loggerMap = {};
let logger;

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
function createChildLogger(fullScope, options) {
  let parentLogger = logger;
  let childLogger = null;

  const childScopes = fullScope.split('.');
  let scope = '';
  childScopes.forEach((scopeFragment) => {
    scope = (scope ? scope + '.' : '') + scopeFragment;
    childLogger = loggerMap[scope];
    if (!childLogger) {
      var childOptions = (fullScope === scope && options
                          ? options
                          : { name: scope });
      childLogger = parentLogger.child(childOptions);

      loggerMap[scope] = childLogger;
    }
    // If there are nested scopes (separated by '.'), then the new childLogger
    // will be the parent of the next scopeFragment.
    parentLogger = childLogger;
  });

  console.log('created child logger: ' + Object.keys(loggerMap));
  return childLogger;
};

module.exports = {
  init(options) {
    if (!logger) {
      options = options || {};
      if  (!options.hasOwnProperty('name')) {
        options.name = DEFAULT_LOGGER_NAME;
      }
      logger = new Logger(options);
      loggerMap[options.name] = logger;
    }
  },

  createLogger(options) {
    // initialize 'global' logger if needed
    if (!logger) {
      // default options
      this.init({name: DEFAULT_LOGGER_NAME});
    }

    options = options || {};
    let loggerName = options.name;
    if (!loggerName) {
      loggerName = DEFAULT_LOGGER_NAME;
    }

    // if this logger doesn't exist yet, actually create it
    // with provided options
    // otherwise, we'll just return the existing logger
    if (!loggerMap.hasOwnProperty(loggerName)) {
      options.$parent = logger._logger;

      loggerMap[loggerName] = createChildLogger(loggerName, options);
    }
    return loggerMap[loggerName];
  },

  getLogger(loggerName, options) {
    if (!loggerName) {
      return logger;
    }
    else if (!loggerMap.hasOwnProperty(loggerName)) {
      options = options || {};
      options.name = loggerName;
      return this.createLogger(options);
    }
    // else
    return loggerMap[loggerName];
  },

  getLoggers() {
    return Object.keys(loggerMap);
  },

  addStream(stream) {
    logger.addStream(stream);
    Object.keys(loggerMap).forEach((loggerName) => {
      loggerMap[loggerName].addStream(stream);
    });
  },

  DEFAULT_LOGGER_NAME: DEFAULT_LOGGER_NAME
};
