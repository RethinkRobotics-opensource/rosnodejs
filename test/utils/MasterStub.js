const xmlrpc = require('xmlrpc');
const EventEmitter = require('events').EventEmitter;

class RosMasterStub extends EventEmitter {
  constructor(host, port) {
    super();

    this._host = host;
    this._port = port;

    this._server = xmlrpc.createServer({host, port}, () => {
      this.emit('ready');
    });

    this._server.on('NotFound', (method, params) => {
      console.error('Method %s does not exist', method);
    });

    this._apiMap = {
      getUri: this._onGetUri.bind(this),
      getParam: this._onGetParam.bind(this)
    };

    this._providedApis = new Set();
  }

  shutdown() {
    return new Promise((resolve, reject) => {
      this._server.close(resolve);
    });
  }

  provide(api) {
    const method = this._apiMap[api];
    if (method && !this._providedApis.has(api)) {
      this._server.on(api, method);
      this._providedApis.add(api);
    }
  }

  provideAll() {
    Object.keys(this._apiMap).forEach((api) => {
      this.provide(api);
    });
  }

  _onGetUri(err, params, callback) {
    const resp = [ 1, '', `${this._host}:${this._port}`];
    callback(null, resp);
  }

  _onGetParam(err, params, callback) {
    const resp = [0, '', 'Not implemented in stub'];
    callback(null, resp);
  }
}

module.exports = RosMasterStub;