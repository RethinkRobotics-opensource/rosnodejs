import { MessageConstructor } from "./Message"
import type { Socket } from 'net';
import type { Transform } from 'stream';
import type { EventEmitter } from 'events';

export type Transport = 'TCPROS'|'UDPROS';

export type SubscriberOptions<M> = {
  topic: string;
  type: string;
  typeClass: MessageConstructor<M>;
  tcpNoDelay?: boolean;
  queueSize?: number;
  throttleMs?: number;
  transports: Transport[];
  dgramSize?: number;
  port?: number;
}

export type SubscriberHeader = {
  tcp_nodelay?: string;
}

export type SubscriberClientMap = {
  [key: string]: {
    socket: Socket;
    deserializer: Transform;
  };
}

export type UdpInfo = {
  connectionId?: number;
  opCode?: number;
  blkN: number;
  msgId: number;
  buffer?: Buffer;
}

export type SubscriberCallback<T> = (msg: T, len: number, uri?: string)=>void;
interface SubscriberEvents<T> {
  'message': SubscriberCallback<T>;
  'registered': ()=>void;
  'connection': (header: any, uri: string)=>void;
  'error': (error: any)=>void;
  'disconnect': ()=>void;
}

export interface ISubscriber<M> extends EventEmitter {
  getTopic(): string;
  getType(): string;
  getNumPublishers(): number;
  shutdown(): Promise<void>;
  isShutdown(): boolean;
  on<U extends keyof SubscriberEvents<M>>(
    event: U, listener: SubscriberEvents<M>[U]
  ): this;
  once<U extends keyof SubscriberEvents<M>>(
    event: U, listener: SubscriberEvents<M>[U]
  ): this;
  removeListener<U extends keyof SubscriberEvents<M>>(
    event: U, listener: SubscriberEvents<M>[U]
  ): this;

  emit<U extends keyof SubscriberEvents<M>>(
    event: U, ...args: Parameters<SubscriberEvents<M>[U]>
  ): boolean;
}
