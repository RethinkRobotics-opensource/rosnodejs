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

"use strict";

//------------------------------------------------------------------

const netUtils = require('./utils/network_utils.js');
const msgUtils = require('./utils/message_utils.js');
const messages = require('./utils/messages.js');
const util = require('util');
const RosLogStream = require('./utils/log/RosLogStream.js');
const ConsoleLogStream = require('./utils/log/ConsoleLogStream.js');
const LogFormatter = require('./utils/log/LogFormatter.js');
const RosNode = require('./lib/RosNode.js');
const NodeHandle = require('./lib/NodeHandle.js');
const Logging = require('./lib/Logging.js');

msgUtils.findMessageFiles();

// these will be modules, they depend on logger which isn't initialized yet
// though so they'll be required later (in initNode)
// let RosNode = null;
// let NodeHandle = null;

// will be initialized through call to initNode
let log = Logging.getLogger();
let rosNode = null;
let firstCheck = true;

//------------------------------------------------------------------

function _checkMasterHelper(callback, timeout) {
  setTimeout(() => {
    // also check that the slave api server is set up
    if (!rosNode.slaveApiSetupComplete()) {
      _checkMasterHelper(callback, 500);
      return;
    }
    // else
    rosNode.getMasterUri()
    .then((resp) => {
      log.infoOnce('Connected to master!');
      callback();
    })
    .catch((err, resp) => {
      if (firstCheck) {
        log.warnOnce('Unable to connect to master. ' + err);
        firstCheck = false;
      }
      _checkMasterHelper(callback, 500);
    })
  }, timeout);
}

/**
 * Very basic validation of node name - needs to start with a '/'
 * TODO: more
 * @return {string} name of node after validation
 */
function _validateNodeName(nodeName) {
  if (!nodeName.startsWith('/')) {
    nodeName = '/' + nodeName;
  }
  return nodeName;
}

/**
 * Appends a random string of numeric characters to the end
 * of the node name. Follows rospy logic.
 * @param nodeName {string} string to anonymize
 * @return {string} anonymized nodeName
 */
function _anonymizeNodeName(nodeName) {
  return util.format('%s_%s_%s', nodeName, process.pid, Date.now());
}

let Rosnodejs = {
  /**
   * Initializes a ros node for this process. Only one ros node can exist per process
   * If called a second time with the same nodeName, returns a handle to that node.
   * @param nodeName {string} name of the node to initialize
   * @param options {object} overrides for this node
   * @return {Promise} resolved when connection to master is established
   */
  initNode(nodeName, options) {
    options = options || {};
    if (options.anonymous) {
      nodeName = _anonymizeNodeName(nodeName);
    }

    nodeName = _validateNodeName(nodeName);

    if (rosNode !== null) {
      if (nodeName === rosNode.getNodeName()) {
        return Promise.resolve(this.getNodeHandle());
      }
      // else
      throw new Error('Unable to initialize node [' + nodeName + '] - node ['
                      + rosNode.getNodeName() + '] already exists');
    }

    let rosMasterUri = process.env.ROS_MASTER_URI;
    if (options.rosMasterUri) {
      rosMasterUri = options.rosMasterUri;
    }

    if (options.useRosEnvVars) {
      netUtils.useRosEnvironmentVariables();
    }

    if (options.portRange) {
      netUtils.setPortRange(options.portRange);
    }

    // create the ros node. Return a promise that will
    // resolve when connection to master is established
    let checkMasterTimeout =  0;
    rosNode = new RosNode(nodeName, rosMasterUri);

    return new Promise((resolve, reject) => {
      this.use(options.messages, options.services).then(() => {

        const connectedToMasterCallback = () => {
          Logging.initializeOptions(this, options.logging);
          resolve(this.getNodeHandle());
        };

        _checkMasterHelper(connectedToMasterCallback, 0);
      });
    })
    .catch((err) => {
      log.error('Error: ' + err);
    });
  },

  require(msgPackage) {
    // check our registry of on-demand generate message definition
    var fromRegistry = messages.getPackageFromRegistry(msgPackage);
    if (fromRegistry) {
      return fromRegistry;
    }

    // if we can't find it in registry, check for gennodejs
    // pre-compiled versions
    let pack = msgUtils.getPackage(msgPackage);
    if (!pack) {
      msgUtils.loadMessagePackage(msgPackage);
      return msgUtils.getPackage(msgPackage);
    }
    // else
    return pack;
  },

  /** create message classes and services classes for all the given
   * types before calling callback */
  use(messages, services) {
    const self = this;
    return new Promise((resolve, reject) => {
      self._useMessages(messages)
        .then(() => {
          return self._useServices(services);
        }).then(() => {
          resolve();
        });
    });
  },

  /** create message classes for all the given types */
  _useMessages(types) {
    if (!types || types.length == 0) {
      return Promise.resolve();
    }
    var count = types.length;
    return new Promise((resolve, reject) => {
      types.forEach(function(type) {
        messages.getMessage(type, function(error, Message) {
          if (--count == 0) {
            resolve();
          }
        });
      });
    });
  },

  /** create message classes for all the given types */
  _useServices(types) {
    if (!types || types.length == 0) {
      return Promise.resolve();
    }
    var count = types.length;
    return new Promise((resolve, reject) => {
      types.forEach(function(type) {
        messages.getServiceRequest(type, function() {
          messages.getServiceResponse(type, function() {
            if (--count == 0) {
              resolve();
            }
          });
        });
      });
    });
  },

  /**
   * @return {NodeHandle} for initialized node
   */
  getNodeHandle() {
    return new NodeHandle(rosNode);
  },

  get nodeHandle() {
    return new NodeHandle(rosNode);
  },

  get nh() {
    return new NodeHandle(rosNode);
  },

  get log() {
    return Logging;
  },

  get logStreams() {
    return {
      console: ConsoleLogStream,
      ros:     RosLogStream
    }
  }
}

module.exports = Rosnodejs;
