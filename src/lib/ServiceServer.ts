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

import * as net from 'net';
import * as NetworkUtils from '../utils/network_utils';
import * as ros_msg_utils from '../ros_msg_utils';
const base_serializers = ros_msg_utils.Serialize;
import * as SerializationUtils from '../utils/serialization_utils';
type DeserializeStream = SerializationUtils.DeserializeStream;
const PrependLength = SerializationUtils.PrependLength;
import * as TcprosUtils from '../utils/tcpros_utils';
import { EventEmitter } from 'events';
import Logging from './LoggingManager';
import ClientStates from '../utils/ClientStates'
import type Logger from '../utils/log/Logger';
import { IServiceServer, ServerCallback, ServerOptions, ServiceClientMap, ServiceConnectionHeader } from '../types/ServiceServer';
import { Socket } from 'net';
import IRosNode from '../types/RosNode';
import { ServiceConstructor } from '../types/Message';

export default class ServiceServer<Req,Res>extends EventEmitter implements IServiceServer {
  private _service: string;
  private _type: string;
  private _port: null; // FIXME: remove this??
  private _nodeHandle: IRosNode;
  private _log: Logger;
  private _requestCallback: ServerCallback<Req,Res>;
  private _messageHandler: ServiceConstructor<Req,Res>;
  private _state: ClientStates = ClientStates.REGISTERING;
  private _clients: ServiceClientMap = {};

  constructor(options: ServerOptions<Req,Res>, callback: ServerCallback<Req,Res>, nodeHandle: IRosNode) {
    super();
    this._service = options.service;

    this._type = options.type;

    this._port = null;

    this._nodeHandle = nodeHandle;

    this._log = Logging.getLogger('ros.rosnodejs');

    this._requestCallback = callback;

    if (!options.typeClass) {
      throw new Error(`Unable to load service for service ${this.getService()} with type ${this.getType()}`);
    }
    this._messageHandler = options.typeClass;

    this._register();
  };

  getService(): string {
    return this._service;
  }

  getType(): string {
    return this._type;
  }

  // FIXME: remove this?
  getServiceUri(): string {
    return NetworkUtils.formatServiceUri(this._port);
  }

  getClientUris(): string[] {
    return Object.keys(this._clients);
  }

  /**
   * The ROS client shutdown code is a little noodly. Users can close a client through
   * the ROS node or the client itself and both are correct. Either through a node.unadvertise()
   * call or a client.shutdown() call - in both instances a call needs to be made to the ROS master
   * and the client needs to tear itself down.
   */
  async shutdown(): Promise<void> {
    await this._nodeHandle.unadvertiseService(this.getService());
  }

  isShutdown(): boolean {
    return this._state === ClientStates.SHUTDOWN;
  }

  disconnect(): void {
    this._state = ClientStates.SHUTDOWN;

    for (const clientId in this._clients) {
      const client = this._clients[clientId];

      client.deserializer.removeAllListeners();

      client.socket.end();
      client.socket.destroy();
    }

    this._clients = {};
  }

  handleClientConnection(socket: Socket, name: string, deserializer: DeserializeStream, header: ServiceConnectionHeader) {
    if (this.isShutdown()) {
      return;
    }
    // else
    // TODO: verify header data
    this._log.debug('Service %s handling new client connection ', this.getService());

    const error = TcprosUtils.validateServiceClientHeader(header, this.getService(), this._messageHandler.md5sum());
    if (error) {
      this._log.error('Error while validating service %s connection header: %s', this.getService(), error);
      socket.end(PrependLength(TcprosUtils.createTcpRosError(error)));
      return;
    }

    let respHeader =
      TcprosUtils.createServiceServerHeader(
        this._nodeHandle.getNodeName(),
        this._messageHandler.md5sum(),
        this.getType());
    socket.write(respHeader);

    const persist = (header['persistent'] === '1');

    // bind to message handler
    deserializer.on('message', (msg: Buffer) => {
      this._handleMessage(socket, msg, name, persist);
    });

    socket.on('close', () => {
      delete this._clients[name];
      this._log.debug('Service client %s disconnected!', name);
    });

    this._clients[name] = {
      socket,
      persist,
      deserializer
    };
    this.emit('connection', header, name);
  }

  private async _handleMessage(client: Socket, data: Buffer, name: string, persist?: boolean): Promise<void> {
    this._log.trace('Service  ' + this.getService() + ' got message! ' + data.toString('hex'));
    // deserialize msg
    const req = this._messageHandler.Request.deserialize(data);

    // call service callback
    const resp = new this._messageHandler.Response();
    const success = await this._requestCallback(req, resp);
    // client should already have been closed, so if we got here just cut out early
    if (this.isShutdown()) {
      return;
    }

    const serializeResponse = TcprosUtils.serializeServiceResponse(
      this._messageHandler.Response,
      resp,
      success
    );

    // send service response
    client.write(serializeResponse);

    if (!persist) {
      this._log.debug('Closing non-persistent client');
      client.end();
      delete this._clients[name];
    }
  }

  private async _register(): Promise<void> {
    const resp = await this._nodeHandle.registerService(this.getService());
    // if we were shutdown between the starting the registration and now, bail
    if (this.isShutdown()) {
      return;
    }

    this._state = ClientStates.REGISTERED;
    this.emit('registered');
  }
}
