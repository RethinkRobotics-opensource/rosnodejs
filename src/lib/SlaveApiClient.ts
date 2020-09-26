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

import * as xmlrpc from 'xmlrpc-rosnodejs';
import * as XmlTypes from '../types/XmlrpcTypes';

//-----------------------------------------------------------------------

export default class SlaveApiClient {
  _xmlrpcClient: xmlrpc.Client;

  constructor(host: string, port: number) {
    this._xmlrpcClient = xmlrpc.createClient({host: host, port: port});
  };

  requestTopic(callerId: string, topic: string, protocols: XmlTypes.Protocol[]) {
    return makeCall<XmlTypes.RequestTopic>(this._xmlrpcClient, 'requestTopic', [callerId, topic, protocols]);
  }
}

function makeCall<T extends XmlTypes.XmlrpcCall>(client: xmlrpc.Client, method: string, params: T['Req']): Promise<T['Resp']> {
  return new Promise((resolve, reject) => {
    client.methodCall(method, params, (err: Error, resp: T['Resp']) => {
      if (err || resp[0] !== 1) {
        reject(err || new Error(`Unable to complete ${method}`));
      }
      else {
        resolve(resp);
      }
    });
  });
}
