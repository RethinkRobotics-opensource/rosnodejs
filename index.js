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
msgUtils.findMessageFiles();

// these will be modules, they depend on logger which isn't initialized yet
// though so they'll be required later (in initNode)
let logger = null;
let RosNode = null;
let NodeHandle = null;

// will be initialized through call to initNode
let log = null;
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
      log.info('Connected to master!');
      callback(Rosnodejs.getNodeHandle());
    })
    .catch((err, resp) => {
      if (firstCheck) {
        log.warn('Unable to connect to master. ' + err);
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

let Rosnodejs = {
  /**
   * Initializes a ros node for this process. Only one ros node can exist per process
   * If called a second time with the same nodeName, returns a handle to that node.
   * @param nodeName {string} name of the node to initialize
   * @param options {object} overrides for this node
   * @return {Promise} resolved when connection to master is established
   */
  initNode(nodeName, options) {
    nodeName = _validateNodeName(nodeName);

    if (rosNode !== null) {
      if (nodeName === rosNode.getNodeName()) {
        return Promise.resolve(this.getNodeHandle());
      }
      // else
      throw new Error('Unable to initialize node [' + nodeName + '] - node [' + rosNode.getNodeName() + '] already exists');
    }

    // FIXME: validate nodeName -- MUST START WITH '/'
    options = options || {};
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

    // setup logger
    logger = require('./utils/logger.js');
    logger.init(options.logger);
    log = logger.createLogger();

    // require other necessary modules...
    RosNode = require('./lib/RosNode.js');
    NodeHandle = require('./lib/NodeHandle.js');

    // create the ros node. Return a promise that will
    // resolve when connection to master is established
    let checkMasterTimeout =  0;
    rosNode = new RosNode(nodeName, rosMasterUri);
    return new Promise((resolve, reject) => {
      _checkMasterHelper(resolve, 0);
    })
    .catch((err) => {
      log.error('Error: ' + err);
    });
  },

  require(msgPackage) {
    let pack = msgUtils.getPackage(msgPackage);
    if (!pack) {
      msgUtils.loadMessagePackage(msgPackage);
      return msgUtils.getPackage(msgPackage);
    }
    // else
    return pack;
  },

  /** get new object of the message class type for the given ROS
   * message type
   */
  getMessage(type, cb) {
    messages.getMessage(type, function(error, Message) {
      // console.log(error, Message);
      if (error) {
        cb(error, null);
      } else {
        cb(null, new Message());
      }
    });
  },

  /** create message classes for all the given types */
  use(types, callback) {
    var Messages = [];
    types.forEach(function(type) { 
      messages.getMessage(type, function(error, Message) {
        Messages.push(Message);
        if (Messages.length === types.length) {
          callback();
        }
      });
    });
  },

  /** get message definition class from registry. Do not generate it
   * from .msg file if it doesn't already exist. This is mostly
   * because that would need to be async right now and we want a sync
   * method. */
  message(type) {
    return messages.getMessageFromRegistry(type);
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
  }
}

module.exports = Rosnodejs;
