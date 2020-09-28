// modified from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/xmlrpc/index.d.ts
declare module 'xmlrpc-rosnodejs' {
  import { EventEmitter } from 'events';
  import { Server as HttpServer } from 'http';
  import { Server as HttpsServer } from 'https';
  import { TlsOptions } from 'tls';

  interface ClientOptions {
      host?: string;
      path?: string;
      port?: number;
      url?: string;
      cookies?: boolean;
      headers?: { [header: string]: string };
      basic_auth?: { user: string, pass: string };
      method?: string;
  }

  interface ServerOptions {
      host?: string;
      path?: string;
      port?: number;
  }

  interface DateFormatterOptions {
      colons?: boolean;
      hyphens?: boolean;
      local?: boolean;
      ms?: boolean;
      offset?: boolean;
  }

  class Cookies {
      get(name: string): string;
      set(name: string, value: string, options?: { secure: boolean, expires: Date }): void;
      toString(): string;
  }

  namespace xmlrpc {
      function createClient(options: string | ClientOptions): Client;
      function createSecureClient(options: string | ClientOptions): Client;

      function createServer(options: string | ServerOptions, callback?: () => void): Server;
      function createSecureServer(options: string | TlsOptions, callback?: () => void): Server;

      interface Client {
          options: ClientOptions;
          isSecure: boolean;
          headersProcessors: { processors: HeadersProcessor[] };
          cookies?: Cookies;

          methodCall(method: string, params: any[], callback: (error: Object, value: any) => void): void;

          getCookie(name: string): string;
          setCookie(name: string, value: string): this;
      }

      type ServerFunction = (error: any, params: any, callback: (error: any, value: any) => void) => void;
      type ServerNotFoundFunction = (methodName: string, params: any[]) => void;

      interface Server extends EventEmitter {
          httpServer: HttpServer | HttpsServer;

          close(cb: ()=>void): void;

          on(eventName: 'NotFound', callback: ServerNotFoundFunction): this;
          on(eventName: string, callback: ServerFunction): this;
      }

      type Headers = { [header: string]: string };

      interface HeadersProcessor {
          composeRequest(headers: Headers): void;
          parseResponse(headers: Headers): void;
      }

      export var dateFormatter: {
          setOpts(opts: DateFormatterOptions): void;

          decodeIso8601(time: string): Date;
          encodeIso8601(date: Date): string;
      }

      export class CustomType {
          tagName: string;
          raw: string;
          constructor(raw: string);
          serialize(xml: any): any; // XMLElementOrXMLNode declared by xmlbuilder
      }
  }

  export = xmlrpc;
}

declare module 'ultron' {
  interface EmitterLike {
    on(evt: string, listener: (...args: any[])=>void): void;
    once(evt: string, listener: (...args: any[])=>void): void;
    removeListener(evt: string, listener: (...args: any[])=>void): void;
  }

  class Ultron {
    constructor(e: EmitterLike);
    destroy(): void;
    on(evt: string, listener: (...args: any[])=>void): void;
    once(evt: string, listener: (...args: any[])=>void): void;
    remove(...evts: string[]): void;
  }
  export = Ultron
}

// modified from https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/bunyan/index.d.ts
declare module 'bunyan' {
  import { EventEmitter } from 'events';

  export const TRACE: number;
  export const DEBUG: number;
  export const INFO: number;
  export const WARN: number;
  export const ERROR: number;
  export const FATAL: number;

  export type LogLevelString = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  export type LogLevel = LogLevelString | number;

  export const levelFromName: { [name in LogLevelString]: number };
  export const nameFromLevel: { [level: number]: string };

  export const stdSerializers: StdSerializers;

  export function createLogger(options: LoggerOptions): Logger;

  export function safeCycles(): (key: string, value: any) => any;

  export function resolveLevel(value: LogLevel): number;

  export interface Stream {
    type?: string;
    level?: LogLevel;
    path?: string;
    stream?: NodeJS.WritableStream | Stream | { write: (...a: any)=>void };
    closeOnExit?: boolean;
    period?: string;
    count?: number;
    name?: string;
    reemitErrorEvents?: boolean;
  }

  export interface LoggerOptions {
    name: string;
    streams?: Stream[];
    level?: LogLevel;
    stream?: NodeJS.WritableStream;
    serializers?: Serializers;
    src?: boolean;
    [custom: string]: any;
  }

  export type Serializer = (input: any) => any;

  export interface Serializers {
    [key: string]: Serializer;
  }

  export interface StdSerializers extends Serializers {
    err: Serializer;
    res: Serializer;
    req: Serializer;
  }

  export interface RingBufferOptions {
    limit?: number;
  }

  export class RingBuffer extends EventEmitter {
    constructor(options: RingBufferOptions);

    writable: boolean;
    records: any[];

    write(record: any): boolean;
    end(record?: any): void;
    destroy(): void;
    destroySoon(): void;
  }

  export interface RotatingFileStreamOptions {
    path: string;
    count?: number;
    period?: string;
  }

  export class RotatingFileStream extends EventEmitter {
    constructor(options: RotatingFileStreamOptions);

    writable: boolean;
    periodNum: number;
    periodScope: string;
    stream: any;
    rotQueue: any[];
    rotating: boolean;

    write(record: any): boolean;
    end(record?: any): void;
    destroy(): void;
    destroySoon(): void;
    rotate(): void;
  }

  export class Logger extends EventEmitter {
    constructor(options: LoggerOptions);
    addStream(stream: Stream): void;
    addSerializers(serializers: Serializers): void;
    child(options: Object, simple?: boolean): Logger;
    reopenFileStreams(): void;

    level(): number;
    level(value: LogLevel): void;
    levels(): number[];
    levels(name: number | string): number;
    levels(name: number | string, value: LogLevel): void;

    fields: any;
    src: boolean;
    streams: Stream[];

    trace(): boolean;
    trace(error: Error, ...params: any[]): void;
    trace(obj: Object, ...params: any[]): void;
    trace(format: any, ...params: any[]): void;

    debug(): boolean;
    debug(error: Error, ...params: any[]): void;
    debug(obj: Object, ...params: any[]): void;
    debug(format: any, ...params: any[]): void;

    info(): boolean;
    info(error: Error, ...params: any[]): void;
    info(obj: Object, ...params: any[]): void;
    info(format: any, ...params: any[]): void;

    warn(): boolean;
    warn(error: Error, ...params: any[]): void;
    warn(obj: Object, ...params: any[]): void;
    warn(format: any, ...params: any[]): void;

    error(): boolean;
    error(error: Error, ...params: any[]): void;
    error(obj: Object, ...params: any[]): void;
    error(format: any, ...params: any[]): void;

    fatal(): boolean;
    fatal(error: Error, ...params: any[]): void;
    fatal(obj: Object, ...params: any[]): void;
    fatal(format: any, ...params: any[]): void;
  }
}
