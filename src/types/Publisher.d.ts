import type * as net from 'net';
import type { MessageConstructor, Message } from './Message';
import type { EventEmitter } from 'events';

export type PublisherOptions<M> = {
  topic: string;
  type: string;
  typeClass: MessageConstructor<M>;
  latching?: boolean;
  tcpNoDelay?: boolean;
  queueSize?: number;
  throttleMs?: number;
  resolve?: boolean;
}

export type TcpClientMap = {
  [key: string]: net.Socket;
}

export type UdpClientMap = {
  [key: string]: {
    port: number;
    host: string;
    dgramSize: number;
    connId: number;
  }
}

export type PublisherHeader = {

}

interface PublisherEvents {
  'registered': ()=>void;
  'connection': (header: any, uri: string)=>void;
  'error': (error: any)=>void;
  'disconnect': ()=>void;
}

export interface IPublisher<M extends Message> extends EventEmitter {
  getTopic(): string;
  getType(): string;
  getLatching(): boolean;
  getNumSubscribers(): number;
  shutdown(): Promise<void>;
  isShutdown(): boolean;
  publish(msg: M, throttleMs?: number): void;

  on<U extends keyof PublisherEvents>(
    event: U, listener: PublisherEvents[U]
  ): this;
  once<U extends keyof PublisherEvents>(
    event: U, listener: PublisherEvents[U]
  ): this;
  removeListener<U extends keyof PublisherEvents>(
    event: U, listener: PublisherEvents[U]
  ): this;
  emit<U extends keyof PublisherEvents>(
    event: U, ...args: Parameters<PublisherEvents[U]>
  ): boolean;
}
