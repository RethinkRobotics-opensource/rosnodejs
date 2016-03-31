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

let xmlrpc = require('xmlrpc');
let networkUtils = require('../utils/network_utils.js');
let logger = require('../utils/logger.js');

//-----------------------------------------------------------------------

class MasterApiClient {

	constructor(rosMasterUri, logName) {
		this._log = logger.createLogger({name: logName});
		this._log.info('Connecting to ROS Master at ' + rosMasterUri);
		this._xmlrpcClient = xmlrpc.createClient(networkUtils.getAddressAndPortFromUri(rosMasterUri));
	};

	getXmlrpcClient() {
		return this._xmlrpcClient;
	}

	registerService(callerId, service, serviceUri, uri) {
		let data = [
			callerId,
			service,
			serviceUri,
			uri
		];

		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('registerService', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	unregisterService(callerId, service, serviceUri) {
		let data = [
			callerId,
			service,
			serviceUri
		];

		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('unregisterService', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	registerSubscriber(callerId, topic, topicType, uri) {
		let data = [
			callerId,
			topic,
			topicType,
			uri
		];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('registerSubscriber', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	unregisterSubscriber(callerId, topic, uri) {
		let data = [
			callerId,
			topic,
			uri
		];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('unregisterSubscriber', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	registerPublisher(callerId, topic, topicType, uri) {
		let data = [
			callerId,
			topic,
			topicType,
			uri
		];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('registerPublisher', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	unregisterPublisher(callerId, topic, uri) {
		let data = [
			callerId,
			topic,
			uri
		];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('unregisterPublisher', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	lookupNode(callerId, nodeName) {
		let data = [callerId, nodeName];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('lookupNode', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	getPublishedTopics(callerId, subgraph) {
		throw new Error('NOT SUPPORTED');
	}

	getTopicTypes(callerId) {
		throw new Error('NOT SUPPORTED');
	}

	getSystemState(callerId) {
		throw new Error('NOT SUPPORTED');
	}

	getUri(callerId) {
		let data = [callerId];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('getUri', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

	lookupService(callerId, service) {
		let data = [callerId, service];
		return new Promise((resolve, reject) => {
			this._xmlrpcClient.methodCall('lookupService', data, (err, resp) => {
				if (err || resp[0] !== 1) {
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		});
	}

};

//-----------------------------------------------------------------------

module.exports = MasterApiClient;
