import { MessageConstructor, ServiceConstructor } from './Message';
import { Socket } from 'net';
import type { DeserializeStream } from '../utils/serialization_utils';
import type { EventEmitter } from 'events';

export type ServerOptions<Req, Res> = {
  service: string;
  type: string;
  typeClass: ServiceConstructor<Req,Res>;
}

export type ServiceClientMap = { [key: string]: {
  deserializer: DeserializeStream,
  socket: Socket;
  persist: boolean;
} };

export type ServiceConnectionHeader = {
  [key: string]: any;
};

interface ServiceEvents {
  'registered': ()=>void;
  'connection': (header: any, uri: string)=>void;
}
export type ServerCallback<Req, Res> = (req: Req, resp: Res)=>boolean|Promise<boolean>;

export interface IServiceServer extends EventEmitter {
  getService(): string;
  getType(): string;
  shutdown(): Promise<void>;
  isShutdown(): boolean;

  on<U extends keyof ServiceEvents>(
    event: U, listener: ServiceEvents[U]
  ): this;
  once<U extends keyof ServiceEvents>(
    event: U, listener: ServiceEvents[U]
  ): this;
  removeListener<U extends keyof ServiceEvents>(
    event: U, listener: ServiceEvents[U]
  ): this;
  emit<U extends keyof ServiceEvents>(
    event: U, ...args: Parameters<ServiceEvents[U]>
  ): boolean;
}
