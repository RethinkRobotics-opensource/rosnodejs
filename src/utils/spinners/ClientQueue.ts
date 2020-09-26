import { EventEmitter } from 'events';

/**
 * @class ClientQueue
 * Queue of messages to handle for an individual client (subscriber or publisher)
 */
export default class ClientQueue extends EventEmitter {
  _queue: any[];
  _queueSize: number;
  throttleMs: number;
  _handleTime: number|null;
  _client: any;

  constructor(client: any, queueSize: number, throttleMs: number)  {
    super();

    if (queueSize < 1) {
      queueSize = Number.POSITIVE_INFINITY;
    }

    this._client = client;

    this._queue = [];
    this._queueSize = queueSize;

    this.throttleMs = throttleMs;
    this._handleTime = null;
  }

  destroy(): void {
    this._queue = [];
    this._client = null;
    this._handleTime = null;
  }

  push(item: any): void {
    this._queue.push(item);
    if (this.length > this._queueSize) {
      this._queue.shift();
    }
  }

  get length() {
    return this._queue.length;
  }

  handleClientMessages(time: number): boolean {
    if (this._handleTime === null || time - this._handleTime >= this.throttleMs) {
      this._handleTime = time;
      this._client._handleMsgQueue(this._queue);
      this._queue = [];
      return true;
    }
    // else
    return false;
  }
}
