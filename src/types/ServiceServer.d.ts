import { MessageConstructor, ServiceConstructor } from './Message';
import { Socket } from 'net';
import type { DeserializeStream } from '../utils/serialization_utils';

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

export type ServerCallback<Req, Res> =
  (req: Req, resp: Res)=>boolean|Promise<boolean>;

export type IServiceServer = {
  getService(): string;
  getType(): string;
  shutdown(): Promise<void>;
  isShutdown(): boolean;
}
