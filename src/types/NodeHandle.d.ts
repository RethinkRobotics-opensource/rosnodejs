import { MessageConstructor, ServiceConstructor } from "./Message";
import { IPublisher } from "./Publisher";
import { ISubscriber, Transport } from "./Subscriber";
import { IServiceServer, ServerCallback } from "./ServiceServer";
import { IServiceClient } from "./ServiceClient";

export type AdvertiseOptions = {
  latching?: boolean;
  tcpNoDelay?: boolean;
  queueSize?: number;
  throttleMs?: number;
  resolve?: boolean;
}

export type SubscribeOptions = {
  queueSize?: number;
  throttleMs?: number;
  transports?: Transport[];
  dgramSize?: number;
}

export type ClientOptions = {
  persist?: boolean;
  queueLength?: number;
  resolve?: boolean;
}

export interface INodeHandle {
  setNamespace(namespace: string): void;
  getNodeName(): string;
  isShutdown(): boolean;
  advertise<M>(topic: string, type: string|MessageConstructor<M>, options?: AdvertiseOptions): IPublisher<M>;
  subscribe<M>(
    topic: string,
    type: string|MessageConstructor<M>,
    callback?: (d: M, len?: number, nodeUri?: string)=>void,
    options?: SubscribeOptions): ISubscriber<M>;
  advertiseService<Req,Res>(
    service: string,
    type: string|ServiceConstructor<Req,Res>,
    callback?: ServerCallback<Req,Res>
  ): IServiceServer;
  serviceClient<Req,Res>(
    service: string,
    type: ServiceConstructor<Req,Res>|string,
    options?: ClientOptions): IServiceClient<Req,Res>;

  waitForService(service: string, timeout?: number): Promise<boolean>;

  unadvertise(topic: string): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  unadvertiseService(service: string): Promise<void>;
}
