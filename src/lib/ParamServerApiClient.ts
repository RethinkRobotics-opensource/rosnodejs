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

import Logging from './LoggingManager';
import type XmlrpcClient from '../utils/XmlrpcClient';
import type Logger from '../utils/log/Logger';
import * as XmlTypes from '../types/XmlrpcTypes';
type XmlrpcCallOptions = XmlTypes.XmlrpcCallOptions;

//-----------------------------------------------------------------------

export default class ParamServerApiClient {
  private _log: Logger;
  private _xmlrpcClient: XmlrpcClient;

  constructor(xmlrpcClient: XmlrpcClient) {
    this._log = Logging.getLogger(Logging.DEFAULT_LOGGER_NAME + '.params');
    this._xmlrpcClient = xmlrpcClient;
  }

  _call<T extends XmlTypes.XmlrpcCall>(method: string, data: T['Req'], options: XmlrpcCallOptions = {}): Promise<T['Resp']> {
    return this._xmlrpcClient.call<T>(method, data, options);
  }

  async deleteParam(callerId: string, key: string): Promise<void> {
    await this._call('deleteParam', [callerId, key]);
  }

  async setParam(callerId: string, key: string, value: any): Promise<void> {
    await this._call('setParam', [callerId, key, value]);
  }

  async getParam<T = any>(callerId: string, key: string): Promise<T> {
    const resp = await this._call('getParam', [callerId, key]);
    // resp[2] is parameter value
    return resp[2];
  }

  searchParam(callerId: string, key: string) {
    throw new Error('NOT IMPLEMENTED');
  }

  subscribeParam(callerId: string, key: string) {
    throw new Error('NOT IMPLEMENTED');
  }

  unsubscribeParam(callerId: string, key: string) {
    throw new Error('NOT IMPLEMENTED');
  }

  async hasParam(callerId: string, key: string): Promise<boolean> {
    const resp = await this._call('hasParam', [callerId, key]);
    // resp[2] is whether it actually has param
    return resp[2];
  }

  async getParamNames(callerId: string) {
    const resp = await this._call('getParamNames', [callerId]);
    // resp[2] is parameter name list
    return resp[2];
  }
}
