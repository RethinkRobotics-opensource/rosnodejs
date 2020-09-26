import { ServiceConstructor } from './Message';

export type ServiceClientOptions<Req,Res> = {
  service: string;
  type: string;
  typeClass: ServiceConstructor<Req,Res>;
  persist?: boolean;
  queueLength?: number;
  resolve?: boolean;
}

export type ServiceConnectionHeader = {
  [key: string]: any;
};

export type IServiceClient<Req,Res> = {
  getService(): string;
  getType(): string;
  isCallInProgress(): boolean;
  close(): void;
  shutdown(): void;
  call(request: Req): Promise<Res>;
  isShutdown(): boolean;
}
