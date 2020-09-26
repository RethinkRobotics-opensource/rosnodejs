import type * as XmlrpcTypes from './XmlrpcTypes';
import type Spinner from './Spinner';
import { MessageConstructor, ServiceConstructor } from './Message';
import { ISubscriber, SubscriberOptions, SubscriberCallback } from './Subscriber';
import { ServerCallback, IServiceServer, ServerOptions } from './ServiceServer';
import { IPublisher, PublisherOptions } from './Publisher';
import type Logger from '../utils/log/Logger';
import { ServiceClientOptions, IServiceClient } from './ServiceClient';

export type SpinnerOptions = {
  type?: string;
  [key: string]: any;
}

export default interface IRosNode {
  _log: Logger;
  _udprosPort: number;

  getSpinner(): Spinner;
  getNodeName(): string;
  hasService(service: string): boolean;
  hasPublisher(topic: string): boolean;
  hasSubscriber(topic: string): boolean;
  serversReady(): boolean;
  getRosMasterUri(): string;

  shutdown(): Promise<void>
  isShutdown(): boolean;
  on(evt: string, handler: (...args: any[])=>void): void;
  once(evt: string, handler: (...args: any[])=>void): void;
  removeListener(evt: string, handler: (...args: any[])=>void): void;

  advertise<M>(options: PublisherOptions<M>): IPublisher<M>;
  subscribe<M>(options: SubscriberOptions<M>, callback?: SubscriberCallback<M>): ISubscriber<M>;
  advertiseService<Req,Res>(options: ServerOptions<Req,Res>, callback: ServerCallback<Req,Res>): IServiceServer;
  serviceClient<Req,Res>(options: ServiceClientOptions<Req,Res>): IServiceClient<Req,Res>;
  unadvertise(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  unadvertiseService(topic: string): Promise<void>;

  // Slave Api interface
  requestTopic(host: string, port: number, topic: string, protocols: any[]): Promise<XmlrpcTypes.RequestTopic['Resp']>;

  // Master Api interface
  registerPublisher(topic: string, type: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterPublisher['Resp']>;
  unregisterPublisher(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterPublisher['Resp']>;
  registerSubscriber(topic: string, type: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterSubscriber['Resp']>;
  unregisterSubscriber(topic: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterSubscriber['Resp']>;
  registerService(service: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.RegisterService['Resp']>;
  unregisterService(service: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.UnregisterService['Resp']>;
  lookupNode(nodeName: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.LookupNode['Resp']>;
  lookupService(service:string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.LookupService['Resp']>;
  getMasterUri(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.GetMasterUri['Resp']>;
  getPublishedTopics(subgraph: string, options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.TopicInfo>;
  getTopicTypes(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.TopicInfo>;
  getSystemState(options?: XmlrpcTypes.XmlrpcCallOptions): Promise<XmlrpcTypes.SystemState>;

  // Param Server Api interface
  deleteParam(key: string): Promise<void>;
  setParam(key: string, value: any): Promise<void>;
  getParam<T>(key: string): Promise<T>;
  hasParam(key: string): Promise<boolean>;

}
