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
let utils = require('util');
let log = require('./logger.js').createLogger();
const messages = require('./messages.js');

// When sourcing your workspace, CMAKE_PREFIX_PATH is AUTOMATICALLY
// prepended with the devel directory of your workspace. Workspace
// chaining works by continuing this path prepending.
let cmakePath = process.env.CMAKE_PREFIX_PATH;
let cmakePaths = cmakePath.split(':');
let jsMsgPath = path.join('share', 'gennodejs', 'ros');

let messagePackageMap = {};
let messagePackagePathMap = {};

//-----------------------------------------------------------------------
// Utilities for loading, finding handlers for
// message serialization/deserialization
//
//  When rosnodejs starts, it searches through your cmakepath for generated
//  javascript messages. It caches paths for any of the packages it finds.
//  Then, in rosnodejs when you ask to use a message package we check for it
//  in the cache and require it if found.
//-----------------------------------------------------------------------

function createDirectory(directory) {
  let curPath = '/';
  const paths = directory.split(path.sep);
  paths.forEach((part, index) => {
    if (!part) {
      return;
    }
    curPath = path.join(curPath, part);
    const thisPath = curPath;

    try {
      fs.mkdirSync(thisPath);
    }
    catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  });
}

function copyFile(from, to, replaceCallback) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(from);
    let fileData = '';
    readStream.on('data', (data) => {
      fileData += data;
    });

    readStream.on('end', () => {
      if (typeof replaceCallback === 'function') {
        fileData = replaceCallback(fileData);
      }

      // open the output file for writing
      const writeStream = fs.createWriteStream(to);
      writeStream.on('open', () => {
        writeStream.write(fileData);
        writeStream.end();
        resolve();
      });
    });
  });
}

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
          // If the message package has been found in a previous workspace,
          // don't overwrite it now. This is critical to enabling ws overlays.
          if (!messagePackagePathMap.hasOwnProperty(msgPackage)) {
            let indexPath = path.join(path_, msgPackage, '_index.js');
            messagePackagePathMap[msgPackage] = indexPath;
          }
        });
      }
    });
  },

  flatten(outputDir) {
    const finderDeclRegex = /^let _finder = require\('\.\.\/\.\.\/\.\.\/find\.js'\);/m;
    const finderCallRegex = /^let (\w+) = _finder\(\'\1\'\);/gm;

    const flatten_local = (packageName, startPath, localPath, outputDir) => {
      const flattenPath = path.join(startPath, localPath);
      fs.readdir(flattenPath, (err, files) => {
        if (err) {
          // if the path doesn't exist, it just means the package currently
          // being flattened doesn't have either msgs or srvs
          if (err.code !== 'ENOENT') {
            throw new Error('Error while flattening generated messages ' + err);
          }
          return;
        }
        // else
        const outputPath = path.join(outputDir, packageName, localPath);
        createDirectory(outputPath)

        files.forEach((file) => {
          const filePath = path.join(flattenPath, file);
          const outputFilePath = path.join(outputDir, packageName, localPath, file);
          let callback;
          if (file !== '_index.js') {
            callback = (fileData) => {
              fileData = fileData.replace(finderDeclRegex, '');
              let matchData;
              while ((matchData = finderCallRegex.exec(fileData)) !== null) {
                const matchStr = matchData[0];
                const msgPackage = matchData[1];
                const replaceStr = utils.format('let %s = require(\'../../%s/_index.js\');', msgPackage, msgPackage);
                fileData = fileData.replace(matchStr, replaceStr);
              }
              return fileData;
            };
          }
          copyFile(filePath, outputFilePath, callback);
        });
      });
    };

    outputDir = path.resolve(outputDir);
    const messageDirectory = path.join(outputDir, 'ros');
    createDirectory(messageDirectory);

    // find relevant genjs base files and copy to output directory
    const filesToCopy = ['base_deserialize.js', 'base_serialize.js'];
    cmakePaths.some((cmakePath) => {
      const checkPath = path.join(cmakePath, 'share', 'node_js');
      let files = fs.readdirSync(checkPath);
      if (!files) {
        return false;
      }
      files.forEach((fileName) => {
        if (filesToCopy.indexOf(fileName) !== -1) {
          copyFile(path.join(checkPath, fileName), path.join(outputDir, fileName));
        }
      });
      return true;
    });

    Object.keys(messagePackagePathMap).forEach((packageName) => {
      const messagePackagePath = messagePackagePathMap[packageName];
      const dir = path.dirname(messagePackagePath)

      flatten_local(packageName, dir, 'msg', messageDirectory);
      flatten_local(packageName, dir, 'srv', messageDirectory);
      // copy the index
      copyFile(messagePackagePath, path.join(messageDirectory, packageName, '_index.js'));
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
    } else {
      let type = messages.getFromRegistry(rosDataType, ["msg"]);
      if (type) {
        return new type();
      } else {
        console.error('Unable to find message package ' + msgPackage);
        throw new Error();
      }
    }
  },

  getHandlerForSrvType(rosDataType) {
    let parts = rosDataType.split('/');
    let msgPackage = parts[0];
    let messagePackage = this.getPackage(msgPackage);
    if (messagePackage) {
      let type = parts[1];
      return messagePackage.srv[type];
    } else {
      let request = 
        messages.getFromRegistry(rosDataType, ["srv", "Request"]);
      let response = 
        messages.getFromRegistry(rosDataType, ["srv", "Response"]);
      if (request && response) {
        return { 
          Request: request,
          Response: response
        };
      } else {
        console.error('Unable to find service package %s: %j %j', 
                      msgPackage, request, response);
        throw new Error();
      }
    }
  }
};

//-----------------------------------------------------------------------

module.exports = MessageUtils;
