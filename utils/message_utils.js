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

let fs = require('fs');
let path = require('path');
let log = require('./logger.js').createLogger();

let cmakePath = process.env.CMAKE_PREFIX_PATH;
let cmakePaths = cmakePath.split(':');
let jsMsgPath = 'share/node_js/ros';

let messagePackageMap = {};
let messagePackagePathMap = {};

//-----------------------------------------------------------------------
// Utilities for loading, finding handlers for
// message serialization/deserialization
//
//  When rosjs starts, it searches through your cmakepath for generated
//  javascript messages. It caches paths for any of the packages it finds.
//  Then, in rosjs when you ask to use a message package we check for it
//  in the cache and require it if found.
//-----------------------------------------------------------------------

let MessageUtils = {
  findMessageFiles() {
    if (Object.keys(messagePackagePathMap).length > 0) {
      return;
    }
    cmakePaths.forEach((cmakePath) => {
      let path_ = path.join(cmakePath, jsMsgPath);
      if (fs.existsSync(path_)) {
        let msgPackages = fs.readdirSync(path_);
        msgPackages.forEach((msgPackage) => {
          let indexPath = path.join(path_, msgPackage, '_index.js');
          messagePackagePathMap[msgPackage] = indexPath;
        });
      }
    });
  },

  loadMessagePackage(msgPackage) {
    const indexPath = messagePackagePathMap[msgPackage];
    if (indexPath === undefined) {
      throw new Error('Unable to find message package %s', msgPackage);
    }
    try {
      messagePackageMap[msgPackage] = require(indexPath);
    }
    catch (err) {
      console.error('Unable to include message package ' + msgPackage + ' - ' + err);
      throw new Error();
    }
  },

  getPackage(msgPackage) {
    return messagePackageMap[msgPackage];
  },

  getHandlerForMsgType(rosDataType) {
    let parts = rosDataType.split('/');
    let msgPackage = parts[0];
    let messagePackage = this.getPackage(msgPackage);
    if (messagePackage) {
      let type = parts[1];
      return messagePackage.msg[type];
    }
    else {
      console.error('Unable to find message package ' + msgPackage);
      throw new Error();
    }
  },

  getHandlerForSrvType(rosDataType) {
    let parts = rosDataType.split('/');
    let msgPackage = parts[0];
    let messagePackage = this.getPackage(msgPackage);
    if (messagePackage) {
      let type = parts[1];
      return messagePackage.srv[type];
    }
    else {
      console.error('Unable to find message package ' + msgPackage);
      throw new Error();
    }
  }
};

//-----------------------------------------------------------------------

module.exports = MessageUtils;
