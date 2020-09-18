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

import * as os from 'os';
import { SPECIAL_KEYS, RemapT } from './remapping_utils';

let HOST: string|null = null;

export function init(remappings: RemapT): void {
  const ip = remappings[SPECIAL_KEYS.ip];
  const host = remappings[SPECIAL_KEYS.hostname];

  const ROS_IP = process.env.ROS_IP;
  const ROS_HOSTNAME = process.env.ROS_HOSTNAME;

  HOST = ip || host || ROS_IP || ROS_HOSTNAME || os.hostname();
}

export function getHost(): string {
  return HOST;
}

export function getAddressAndPortFromUri(uriString: string): { host: string, port: number} {
  let regexStr = /(?:http:\/\/|rosrpc:\/\/)?([a-zA-Z\d\-_.]+):(\d+)/;
  let match = uriString.match(regexStr);
  if (match === null) {
    throw new Error ('Unable to find host and port from uri ' + uriString + ' with regex ' +  regexStr);
  }
  // else
  return {
    host: match[1],
    port: +match[2]
  };
}

export function formatServiceUri(port: number): string {
  return 'rosrpc://' + this.getHost() + ':' + port;
}

//------------------------------------------------------------------
