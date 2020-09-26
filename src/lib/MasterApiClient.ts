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

import * as networkUtils from '../utils/network_utils.js';
import Logging from './LoggingManager.js';
import XmlrpcClient from '../utils/XmlrpcClient.js';
import * as XmlTypes from '../types/XmlrpcTypes';
type XmlrpcCallOptions = XmlTypes.XmlrpcCallOptions;

//-----------------------------------------------------------------------

export default class MasterApiClient {
  _log: any;
  _xmlrpcClient: XmlrpcClient;

  constructor(rosMasterUri: string) {
    this._log = Logging.getLogger(Logging.DEFAULT_LOGGER_NAME + '.masterapi');
    this._log.info('Connecting to ROS Master at ' + rosMasterUri);
    this._xmlrpcClient = new XmlrpcClient(networkUtils.getAddressAndPortFromUri(rosMasterUri), this._log);
  };

  getXmlrpcClient(): XmlrpcClient {
    return this._xmlrpcClient;
  }

  _call<T extends XmlTypes.XmlrpcCall>(method: string, data: T['Req'], options: XmlrpcCallOptions = {}): Promise<T['Resp']> {
    return this._xmlrpcClient.call<T>(method, data, options);
  }

  registerService(callerId: string, service: string, serviceUri: string, uri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.RegisterService>(
      'registerService',
      [callerId, service, serviceUri, uri],
      options
    );
  }

  unregisterService(callerId: string, service: string, serviceUri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.UnregisterService>(
      'unregisterService',
      [callerId, service, serviceUri],
      options
    );
  }

  registerSubscriber(callerId: string, topic: string, topicType: string, uri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.RegisterSubscriber>(
      'registerSubscriber',
      [callerId, topic, topicType, uri],
      options
    );
  }

  unregisterSubscriber(callerId: string, topic: string, uri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.UnregisterSubscriber>(
      'unregisterSubscriber',
      [callerId, topic, uri],
      options
    );
  }

  registerPublisher(callerId: string, topic: string, topicType: string, uri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.RegisterPublisher>(
      'registerPublisher',
      [callerId, topic, topicType, uri],
      options
    );
  }

  unregisterPublisher(callerId: string, topic: string, uri: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.UnregisterPublisher>(
      'unregisterPublisher',
      [callerId, topic, uri],
      options
    );
  }

  lookupNode(callerId: string, nodeName: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.LookupNode>('lookupNode', [callerId, nodeName], options);
  }

  async getPublishedTopics(callerId: string, subgraph: string, options: XmlrpcCallOptions): Promise<XmlTypes.TopicInfo> {
    const resp = await this._call<XmlTypes.GetPublishedTopics>('getPublishedTopics', [callerId, subgraph], options);

    return {
      topics: resp[2].map(([name, type]) => {
        return {
          name, type
        }
      })
    };
  }

  async getTopicTypes(callerId: string, options: XmlrpcCallOptions): Promise<XmlTypes.TopicInfo> {
    const resp = await this._call<XmlTypes.GetTopicTypes>('getTopicTypes', [callerId], options);

    return {
      topics: resp[2].map(([name, type]) => { return {
        name, type
      }})
    }
  }

  async getSystemState(callerId: string, options: XmlrpcCallOptions): Promise<XmlTypes.SystemState> {
    function toObject(memo: {[key: string]: string[]}, [topic, clients]: [string, string[]]) {
      memo[topic] = clients;
      return memo;
    }

    const resp = await this._call<XmlTypes.GetSystemState>('getSystemState', [callerId], options);
    return {
      publishers: resp[2][0].reduce(toObject, {}),
      subscribers: resp[2][1].reduce(toObject, {}),
      services: resp[2][2].reduce(toObject, {})
    };
  }

  getUri(callerId: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.GetUri>('getUri', [callerId], options);
  }

  lookupService(callerId: string, service: string, options: XmlrpcCallOptions) {
    return this._call<XmlTypes.LookupService>('lookupService', [callerId, service], options);
  }
};
