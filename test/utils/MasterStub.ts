import * as xmlrpc from 'xmlrpc-rosnodejs';
import { EventEmitter } from 'events';
import * as XmlrpcTypes from '../../src/types/XmlrpcTypes';

type Callback = (e: any, resp: any[])=>void;

export default class RosMasterStub extends EventEmitter {
  _host: string;
  _port: number;
  _apiMap: {[key: string]: (err: any, params: any[], callback: Callback)=>void};
  _providedApis: Set<string> = new Set();
  _clientCache: { service: any, sub: any, pub: any };
  _params: {[key: string]: any} = {};
  verbose = true;
  _server: xmlrpc.Server;

  constructor(host: string, port: number) {
    super();

    this._host = host;
    this._port = port;

    this._apiMap = {
      getUri: this._onGetUri.bind(this),
      registerService: this._onRegisterService.bind(this),
      unregisterService: this._onUnregisterService.bind(this),
      registerSubscriber: this._onRegisterSubscriber.bind(this),
      unregisterSubscriber: this._onUnregisterSubscriber.bind(this),
      registerPublisher: this._onRegisterPublisher.bind(this),
      unregisterPublisher: this._onUnregisterPublisher.bind(this),
      deleteParam: this._deleteParam.bind(this),
      setParam: this._setParam.bind(this),
      getParam: this._getParam.bind(this),
      hasParam: this._hasParam.bind(this),
      getParamNames: this._getParamNames.bind(this)
    };

    this._clientCache = {
      service: null,
      sub: null,
      pub: null
    };

    this.listen();
  }

  listen() {
    console.log('create server on %s:%s', this._host, this._port);
    this._server = xmlrpc.createServer({host: this._host, port: this._port}, () => {
      this.emit('ready');
      console.log('master listening on %s:%s', this._host, this._port);
    });

    this._server.on('NotFound', (method) => {
      if (this.verbose) {
        console.error('Method %s does not exist', method);
      }
    });
  }

  shutdown() {
    this._params = {};
    this._providedApis.clear();
    this.removeAllListeners();
    if (this._server) {
      return new Promise<void>((resolve) => {
        this._server.close(resolve);
        this._server = null;
      });
    }
  }

  provide(api: string) {
    const method = this._apiMap[api];
    if (method && !this._providedApis.has(api)) {
      this._server.on(api, (err, params, callback) => {
        this.emit(api, err, params, callback);
        method(err, params, callback);
      });
      this._providedApis.add(api);
    }
  }

  provideAll() {
    Object.keys(this._apiMap).forEach((api) => {
      this.provide(api);
    });
  }

  _onGetUri(err: any, params: any[], callback: Callback) {
    const resp = [ 1, '', `${this._host}:${this._port}`];
    callback(null, resp);
  }

  _onGetParam(err: any, params: any[], callback: Callback) {
    const resp = [0, '', 'Not implemented in stub'];
    callback(null, resp);
  }

  _onRegisterService(err: any, params: any[], callback: Callback) {
    this._clientCache.service = params[2];

    callback(null, [1, 'You did it!', []]);
  }

  _onUnregisterService(err: any, params: any[], callback: Callback) {
    callback(null, [1, 'You did it!', this._clientCache.service ? 1 : 0]);
    this._clientCache.service = null;
  }

  _onLookupService(err: any, params: any[], callback: Callback) {
    const { service } = this._clientCache;
    if (service) {
      callback(null, [1, "you did it", service]);
    }
    else {
      callback(null, [-1, "no provider", ""]);
    }
  }

  _onRegisterSubscriber(err: any, params: any[], callback: Callback) {
    this._clientCache.sub = params[3];

    const resp: XmlrpcTypes.RegisterSubscriber['Resp'] =  [1, 'You did it!', []];
    if (this._clientCache.pub) {
      resp[2].push(this._clientCache.pub);
    }
    callback(null, resp);
  }

  _onUnregisterSubscriber(err: any, params: any[], callback: Callback) {
    const resp: XmlrpcTypes.UnregisterSubscriber['Resp'] =  [1, 'You did it!', this._clientCache.sub ? 1 : 0];
    callback(null, resp);
    this._clientCache.sub = null;
  }

  _onRegisterPublisher(err: any, params: any[], callback: Callback) {
    const pubInfo = params[3];
    const topic = params[1];
    this._clientCache.pub = pubInfo;

    const resp: XmlrpcTypes.RegisterPublisher['Resp'] =  [1, 'You did it!', []];
    if (this._clientCache.sub) {
      resp[2].push(this._clientCache.sub);
      let subAddrParts = this._clientCache.sub.replace('http://', '').split(':');
      let client = xmlrpc.createClient({host: subAddrParts[0], port: subAddrParts[1]});
      let data = [1, topic, [pubInfo]];
      client.methodCall('publisherUpdate', data, (err, response) => { });
    }
    callback(null, resp);
  }

  _onUnregisterPublisher(err: any, params: any[], callback: Callback) {
    const resp: XmlrpcTypes.UnregisterPublisher['Resp'] =  [1, 'You did it!', this._clientCache.pub ? 1 : 0];
    callback(null, resp);
    this._clientCache.pub = null;
  }

  // Param stubbing
  // NOTE: this is NOT a spec ParamServer implementation,
  // but it provides simple stubs for calls

  _deleteParam(err: any, params: any[], callback: Callback) {
    const key = params[1];
    if (this._params.hasOwnProperty(key)) {
      delete this._params[key];
      callback(null, [1, 'delete value for ' + key, 1]);
    }
    else {
      callback(null, [0, 'no value for ' + key, 1]);
    }
  }

  _setParam(err: any, params: any[], callback: Callback) {
    const key = params[1];
    const val = params[2];
    this._params[key] = val;
    callback(null, [1, 'set value for ' + key, 1]);
  }

  _getParam(err: any, params: any[], callback: Callback) {
    const key = params[1];
    const val = this._params[key];
    if (val !== undefined) {
      callback(null, [1, 'data for ' + key, val]);
    }
    else {
      callback(null, [0, 'no data for ' + key, null]);
    }
  }

  _hasParam(err: any, params: any[], callback: Callback) {
    const key = params[1];
    callback(null, [1, 'check param ' + key, this._params.hasOwnProperty(key)]);
  }

  _getParamNames(err: any, params: any[], callback: Callback) {
    const names = Object.keys(this._params);
    callback(null, [1, 'get param names', names]);
  }
}
