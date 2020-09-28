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

import * as net from 'net'
import * as NetworkUtils from '../utils/network_utils'
import { DeserializeStream } from '../utils/serialization_utils'
import * as TcprosUtils from '../utils/tcpros_utils'
import { EventEmitter } from 'events'
import Logging from './LoggingManager'
import { ServiceClientOptions } from '../types/ServiceClient';
import IRosNode from '../types/RosNode';
import type Logger from '../utils/log/Logger';
import { ServiceConstructor } from '../types/Message';

/**
 * @class ServiceClient
 * ServiceClient provides an interface to querying a service in ROS.
 * Typically ROS service calls are blocking. This isn't an option for JS though.
 * To accommodate multiple successive service calls, calls are queued along with
 * resolve/reject handlers created for that specific call. When a call completes, the
 * next call in the queue is handled
 */
export default class ServiceClient<Req,Res>
    extends EventEmitter
{
  private _service: string;
  private _type: string;
  private _persist: boolean = false;
  private _maxQueueLength: number = -1;
  private _resolve: boolean = false;
  private _calling: boolean = false;
  private _log: Logger;
  private _nodeHandle: IRosNode;
  private _messageHandler: ServiceConstructor<Req,Res>;
  private _serviceClient: net.Socket|null = null;
  private _callQueue: CallType<Req,Res>[] = [];
  private _currentCall: CallType<Req,Res>|null = null;
  // ServiceClients aren't "registered" anywhere but it's not
  // waiting to get registered either so REGISTERING doesn't make sense...
  // Hence, we'll just call it REGISTERED.
  private _isShutdown: boolean = false;

  constructor(options: ServiceClientOptions<Req,Res>, nodeHandle: IRosNode) {
    super();
    this._service = options.service;
    this._type = options.type;

    this._persist = !!options.persist;
    this._maxQueueLength = options.queueLength || -1;
    this._resolve = !!options.resolve;

    this._log = Logging.getLogger('ros.rosnodejs');

    this._nodeHandle = nodeHandle;

    if (!options.typeClass) {
      throw new Error(`Unable to load service for service client ${this.getService()} with type ${this.getType()}`);
    }
    this._messageHandler = options.typeClass;
  };

  getService(): string {
    return this._service;
  }

  getType(): string {
    return this._type;
  }

  getPersist(): boolean {
    return this._persist;
  }

  isCallInProgress(): boolean {
    return this._calling;
  }

  close() {
    // don't remove service client if call is in progress
    if (!this.isCallInProgress()) {
      this._serviceClient = null;
    }
  }

  shutdown(): void {
    this._isShutdown = true;
    if (this._currentCall) {
      this._currentCall.reject('SHUTDOWN');
      this._currentCall = null;
    }
    if (this._serviceClient) {
      this._serviceClient.end();
      this._serviceClient = null;
    }
    for (const call of this._callQueue) {
      call.reject('SHUTDOWN');
    }
    this._callQueue = [];
  }

  isShutdown(): boolean {
    return this._isShutdown;
  }

  call(request: Req): Promise<Res> {
    return new Promise((resolve, reject) => {
      const newCall = makeServiceCall(request, resolve, reject);
      this._callQueue.push(newCall);

      // shift off old calls if user specified a max queue length
      if (this._maxQueueLength > 0 && this._callQueue.length > this._maxQueueLength) {
        const oldCall = this._callQueue.shift();
        const err = new Error('Unable to complete service call because of queue limitations');
        (err as any).code = 'E_ROSSERVICEQUEUEFULL';
        oldCall.reject(err);
      }

      // if there weren't any other calls in the queue and there's no current call, execute this new call
      // otherwise new call will be handled in order when others complete
      if (this._callQueue.length === 1 && this._currentCall === null) {
        this._executeCall();
      }
    });
  }

  private async _executeCall(): Promise<void> {
    if (this.isShutdown()) {
      return;
    }
    else if (this._callQueue.length === 0) {
      this._log.warn('Tried executing service call on empty queue');
      return;
    }
    // else
    const call = this._callQueue.shift();
    this._currentCall = call;
    this._calling = true;

    try {
      await this._initiateServiceConnection(call);
      if (this.isShutdown()) {
        return;
      }
      const msg = await this._sendRequest(call);
      if (this.isShutdown()) {
        return;
      }

      this._calling = false;
      this._currentCall = null;

      this._scheduleNextCall();
      call.resolve(msg);
    }
    catch(err) {
      if (!this.isShutdown()) {
        // this probably just means the service didn't exist yet - don't complain about it
        // We should still reject the call
        if (err.code !== 'EROSAPIERROR') {
          this._log.error(`Error during service ${this.getService()} call ${err}`);
        }

        this._calling = false;
        this._currentCall = null;

        this._scheduleNextCall();

        call.reject(err);
      }
    }
  }

  private _scheduleNextCall(): void {
    if (this._callQueue.length > 0 && !this.isShutdown()) {
      process.nextTick(() => {
        this._executeCall();
      });
    }
  }

  private async _initiateServiceConnection(call: CallType<Req,Res>): Promise<void> {
    // if we haven't connected to the service yet, create the connection
    // this will always be the case unless this is persistent service client
    // calling for a second time.
    if (!this.getPersist() || this._serviceClient === null) {
      const resp = await this._nodeHandle.lookupService(this.getService())
      if (this.isShutdown()) {
        return;
      }

      const serviceUri = resp[2];
      const serviceHost = NetworkUtils.getAddressAndPortFromUri(serviceUri);

      // connect to the service's tcpros server
      return this._connectToService(serviceHost, call);
    }
    else {
      // this is a persistent service that we've already set up
      call.serviceClient = this._serviceClient;
    }
  }

  private async _sendRequest(call: CallType<Req,Res>): Promise<Res> {
    if (this._resolve) {
      call.request = this._messageHandler.Request.Resolve(call.request);
    }

    // serialize request
    const serializedRequest = TcprosUtils.serializeMessage(this._messageHandler.Request, call.request);
    call.serviceClient.write(serializedRequest);

    const { msg, success } = await waitForMessage(call);
    if (this.isShutdown()) {
      throw new Error('Shutdown');
    }
    else if (success) {
      return this._messageHandler.Response.deserialize(msg);
    }
    else {
      const error = new Error(`Call to service [${this.getService()}] failed`);
      (error as any).code = 'E_ROSSERVICEFAILED';
      throw error;
    }
  }

  private async _connectToService(serviceHost: HostType, call: CallType<Req,Res>): Promise<void> {
    this._log.debug('Service client %s connecting to %j', this.getService(), serviceHost);

    this._createCallSocketAndHandlers(serviceHost, call);

    this._cacheSocketIfPersistent(call);

    const deserializer = call.deserializer = new DeserializeStream();
    call.serviceClient.pipe(deserializer);

    const { msg } = await waitForMessage(call);
    if (this.isShutdown()) {
      throw new Error('Shutdown');
    }
    else if (!call.initialized) {
      let header = TcprosUtils.parseTcpRosHeader(msg);
      if (header.error) {
        throw new Error(header.error);
      }

      // stream deserialization for service response is different - set that up for next message
      deserializer.setServiceRespDeserialize();
      call.initialized = true;
    }
  }

  private _createCallSocketAndHandlers(serviceHost: HostType, call: CallType<Req,Res>): void {
    // create a socket connection to the service provider
    call.serviceClient = net.connect(serviceHost, () => {

      // Connection to service's TCPROS server succeeded - generate and send a connection header
      this._log.debug('Sending service client %s connection header', this.getService());

      let serviceClientHeader = TcprosUtils.createServiceClientHeader(this._nodeHandle.getNodeName(),
        this.getService(), this._messageHandler.md5sum(), this.getType(), this.getPersist());

      call.serviceClient.write(serviceClientHeader);
    });

    // bind a close handling function
    call.serviceClient.once('close', () => {
      call.serviceClient = null;
      // we could probably just always reset this._serviceClient to null here but...
      if (this.getPersist()) {
        this._serviceClient = null;
      }
    });

    // bind an error function - any errors connecting to the service
    // will cause the call to be rejected (in this._executeCall)
    call.serviceClient.on('error', (err) => {
      this._log.info(`Service Client ${this.getService()} error: ${err}`);
      call.reject(err);
    });
  }

  _cacheSocketIfPersistent(call: CallType<Req,Res>): void {
    // If this is a persistent service client, we're here because we haven't connected to this service before.
    // Cache the service client for later use. Future calls won't need to lookup the service with the ROS master
    // or deal with the connection header.
    if (this.getPersist()) {
      this._serviceClient = call.serviceClient;
    }
  }
}

function waitForMessage<Req, Res>(call: CallType<Req, Res>): Promise<{ msg: Buffer, success?: boolean }> {
  return new Promise((resolve, reject) => {
    function closeHandler(): void {
      reject(new Error(`Socket closed while waiting for message on service`));
    }

    call.serviceClient.once('close', closeHandler);
    call.deserializer.once('message', (msg: Buffer, success: boolean) => {
      call.serviceClient.removeListener('close', closeHandler);
      resolve({msg, success});
    });
  });
}

type HostType = {
  host: string;
  port: number;
}

/**
 * @class ServiceCall
 * A small utility class for ServiceClient...
 * basically just a struct.
 */
interface ServiceCall<Req,Res> {
  request: Req;
  resolve: (v: Res)=>void;
  reject: (e: any)=>void;
  initialized: boolean;
  serviceClient: net.Socket|null;
  deserializer: DeserializeStream|null;
}

function makeServiceCall<Req, Res>(request: Req, resolve: (v: Res)=>void, reject: (e:any)=>void): ServiceCall<Req,Res> {
  return {
    request,
    resolve,
    reject,
    initialized: false,
    serviceClient: null,
    deserializer: null
  };
}

export type CallType<Req,Res> = ServiceCall<Req,Res>;
