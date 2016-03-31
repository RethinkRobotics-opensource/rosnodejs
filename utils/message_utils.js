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

//-----------------------------------------------------------------------
// Utilities for loading, finding handlers for
// message serialization/deserialization
//-----------------------------------------------------------------------

let MessageUtils = {
	loadMessageFiles() {
		messagePackageMap = {};
		cmakePaths.forEach((cmakePath) => {
			let path_ = path.join(cmakePath, jsMsgPath);
			if (fs.existsSync(path_)) {
				let msgPackages = fs.readdirSync(path_);
				msgPackages.forEach((msgPackage) => {
					let indexPath = path.join(path_, msgPackage, '_index.js');
					try {
						messagePackageMap[msgPackage] = require(indexPath);
					}
					catch (err) {
						log.error('Unable to include message package ' + msgPackage + ' - ' + err);
					}
				});
			}
		});
	},

	getHandlerForMsgType(rosDataType) {
		let parts = rosDataType.split('/');
		let msgPackage = parts[0];
		let messagePackage = messagePackageMap[msgPackage];
		if (messagePackage) {
			let type = parts[1];
			return messagePackage.msg[type];
		}
		else {
			throw new Error('Unable to find message handler for package ' + msgPackage);
		}
	},

	getHandlerForSrvType(rosDataType) {
		let parts = rosDataType.split('/');
		let msgPackage = parts[0];
		let messagePackage = messagePackageMap[msgPackage];
		if (messagePackage) {
			let type = parts[1];
			return messagePackage.srv[type];
		}
		else {
			throw new Error('Unable to find message handler for package ' + msgPackage);
		}
	}
};

//-----------------------------------------------------------------------

module.exports = MessageUtils;
