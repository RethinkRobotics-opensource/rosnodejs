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

let os = require('os');
let portscanner = require('portscanner');

let USE_ROS_ENV_VARS = false;
let MIN_PORT = 49152;
let MAX_PORT = 65535;

let getRandomPort = function() {
	return Math.round(Math.random() * (MAX_PORT - MIN_PORT) + MIN_PORT);
}

let NetworkUtils = {
	/**
	 * FIXME: should this just return ROS_IP?
	 * get this computer's (non-internal) ip address
	 * @param [family] {string} 'IPv4', 'IPv6', ... 'IPv4' default
	 * @param [networkInterface] {string} network interface to use ('eth0') else finds first match
	 */
	getIpAddress: function(family, networkInterface) {
		family = family || 'IPv4';
		let interfaces = os.networkInterfaces();
		let interfaceNames;
		if (networkInterface && !ifaces.hasOwnProperty(networkInterface)) {
			return null;
		}
		else if (networkInterface) {
			interfaceNames = [ networkInterface ];
		}
		else {
			interfaceNames = Object.keys(interfaces);
		}

		let ipAddress = null;
		interfaceNames.some((ifName) => {
		  interfaces[ifName].forEach((iface) => {
		    if (iface.internal || family !== iface.family) {
		      // skip over internal (i.e. 127.0.0.1) and addresses from different families
		      return false;
		    }

				ipAddress = iface.address;
				return true;
		  });
		});
		return ipAddress;
	},

	/**
   * FIXME: should this just return ROS_HOSTNAME
	 */
	getHost() {
		if (USE_ROS_ENV_VARS) {
			const envVars = process.env;
			return envVars.ROS_IP || envVars.ROS_HOSTNAME;
		}
		else {
			return os.hostname();
		}
	},

	useRosEnvironmentVariables() {
		USE_ROS_ENV_VARS = true;
	},

	setPortRange(range) {
		MIN_PORT = range.min;
		MAX_PORT = range.max;
	},

	getFreePort() {
		// recursive check for free port
		// chooses random port within range [minPort, maxPort] to check
		let _freePortCheck = (callback) => {
			let port = getRandomPort();
			portscanner.checkPortStatus(port, '127.0.0.1', (err, status) => {
				// if the port is 'closed' then its not in use
				if (status === 'closed') {
					callback(port);
					return;
				}
				//else
				_freePortCheck(minPort, maxPort, callback);
			});
		};

		return new Promise((resolve, reject) => {
			_freePortCheck(resolve);
		});
	},

	getAddressAndPortFromUri(uriString) {
		let regexStr = /(?:http:\/\/|rosrpc:\/\/)?([a-zA-Z\d\-.:]+):(\d+)/;
		let match = uriString.match(regexStr);
		if (match.length !== 3) {
			throw new Error ('Unable to find host and port from uri ' + uriString + ' with regex ' +  regexStr);
		}
		// else
		return {
			host: match[1],
			port: match[2]
		};
	},

	formatServiceUri(port) {
		return 'rosrpc://' + this.getHost() + ':' + port;
	}
};

//------------------------------------------------------------------

module.exports = NetworkUtils;
