import type * as net from 'net';
import { MessageConstructor, Message } from './Message';

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

export type IPublisher<M extends Message> = {
  getTopic(): string;
  getType(): string;
  getLatching(): boolean;
  getNumSubscribers(): number;
  shutdown(): Promise<void>;
  isShutdown(): boolean;
  publish(msg: M, throttleMs?: number): void;
}
