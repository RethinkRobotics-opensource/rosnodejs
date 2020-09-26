import { EventEmitter } from 'events';
import ClientQueue from './ClientQueue';
import type Spinner from '../../types/Spinner';
import type { SpinnerOptions } from '../../types/RosNode';

/**
 * @class GlobalSpinner
 * Clients (subscribers and publishers) will register themselves with the node's spinner
 * when they're created. Clients will disconnect from the spinner whenever they're shutdown.
 * Whenever they receive a new message to handle, those clients will "ping" the spinner,
 * which will push the new message onto that client's queue and add the client to a list
 * of clients to be handled on the next spin. While spinning, the spinner is locked and
 * ping and disconnect operations are cached in order to ensure that changes aren't
 * made to the spinner during its execution (e.g. subscriber callback publishes a message,
 * publisher pings the spinner which queues the new message and adds the client to its callback
 * list, the client list is cleared at the end of the spin and this client has a
 * message hanging in its queue that will never be handled). Once all of the messages
 * received since the last spin are handled the Spinner is unlocked and all cached
 * ping and disconnect operations are replayed in order.
 */
export default class GlobalSpinner extends EventEmitter implements Spinner {
  private _spinTime: number;
  private _spinTimer: NodeJS.Timer;
  private _clientCallQueue: string[];
  private _clientQueueMap: Map<string, ClientQueue>;
  private _queueLocked: boolean;
  private _lockedOpCache: LockedOpInfo[];
  private _emit: boolean;
  constructor(options: GlobalSpinnerOptions = { emit: false }) {
    super();

    if (typeof options.spinRate === 'number') {
      this._spinTime = 1 / options.spinRate;
    }
    else {
      this._spinTime = 0;
    }

    this._spinTimer = null;

    this._clientCallQueue = [];
    this._clientQueueMap = new Map();

    /**
     * Acts as a mutex while handling messages in _handleQueue
     * @type {boolean}
     * @private
     */
    this._queueLocked = false;
    this._lockedOpCache = [];

    // emit is just for testing purposes
    this._emit = options.emit;
  }

  clear(): void  {
    clearTimeout(this._spinTimer);
    this._queueLocked = false;
    this._clientQueueMap.forEach((clientQueue) => {
      clientQueue.destroy();
    });
    this._clientQueueMap.clear();
    this._clientCallQueue = [];
  }

  addClient(client: any, clientId: string, queueSize: number, throttleMs: number): void {
    if (this._queueLocked) {
      this._lockedOpCache.push({op: LockedOp.ADD, client, clientId, queueSize, throttleMs});
    }
    else if (queueSize > 0) {
      this._clientQueueMap.set(clientId, new ClientQueue(client, queueSize, throttleMs));
    }
  }

  /**
   * When subscribers/publishers receive new messages to handle, they will
   * "ping" the spinner.
   * @param clientId
   * @param msg
   */
  ping(clientId: string=null, msg: any=null) {
    if (!clientId || !msg) {
      throw new Error('Trying to ping spinner without clientId')
    }

    if (this._queueLocked) {
      this._lockedOpCache.push({op: LockedOp.PING, clientId, msg});
    }
    else {
      this._queueMessage(clientId, msg);
      this._setTimer();
    }
  }

  disconnect(clientId: string): void {
    if (this._queueLocked) {
      this._lockedOpCache.push({op: LockedOp.DELETE, clientId});
    }
    else {
      const index = this._clientCallQueue.indexOf(clientId);
      if (index !== -1) {
        this._clientCallQueue.splice(index, 1);
      }
      this._clientQueueMap.delete(clientId);
    }
  }

  _queueMessage(clientId: string, message: any): void {
    const clientQueue = this._clientQueueMap.get(clientId);
    if (!clientQueue) {
      throw new Error(`Unable to queue message for unknown client ${clientId}`);
    }
    // else
    if (clientQueue.length === 0) {
      this._clientCallQueue.push(clientId);
    }

    clientQueue.push(message);
  }

  _handleLockedOpCache(): void {
    const len = this._lockedOpCache.length;
    for (let i = 0; i < len; ++i) {
      const {op, clientId, msg, client, queueSize, throttleMs} = this._lockedOpCache[i];
      if (op === LockedOp.PING) {
        this.ping(clientId, msg);
      }
      else if (op === LockedOp.DELETE) {
        this.disconnect(clientId);
      }
      else if (op === LockedOp.ADD) {
        this.addClient(client, clientId, queueSize, throttleMs);
      }
    }
    this._lockedOpCache = [];
  }

  _setTimer(): void {
    if (this._spinTimer === null) {
      if (this._emit) {
        this._spinTimer = setTimeout(() => {
          this._handleQueue();
          this.emit('tick');
        }, this._spinTime);
      }
      else {
        this._spinTimer = setTimeout(this._handleQueue.bind(this), this._spinTime);
      }
    }
  }

  _handleQueue(): void {
    // lock the queue so that ping and disconnect operations are cached
    // while we're running through the call list instead of modifying
    // the list beneath us.
    this._queueLocked = true;
    const now = Date.now();
    const keepOnQueue = [];
    let len = this._clientCallQueue.length;
    for (let i = 0; i < len; ++i) {
      const clientId = this._clientCallQueue[i];
      const clientQueue = this._clientQueueMap.get(clientId);
      if (!clientQueue.handleClientMessages(now)) {
        keepOnQueue.push(clientId);
      }
    }

    this._clientCallQueue = keepOnQueue;

    // unlock the queue now that we've handled everything
    this._queueLocked = false;
    // handle any operations that occurred while the queue was locked
    this._handleLockedOpCache();

    // TODO: figure out if these clients that are throttling messages are
    // consistently keeping the timer running when it otherwise wouldn't be
    // and eating up CPU. Consider starting a slower timer if the least-throttled
    // client won't be handled for N cycles (e.g N === 5).
    this._spinTimer = null;
    if (this._clientCallQueue.length > 0) {
      this._setTimer();
    }
  }
}

enum LockedOp {
  PING,
  DELETE,
  ADD
}

interface GlobalSpinnerOptions extends SpinnerOptions {
  spinRate?: number,
  emit?: boolean
};

type LockedOpInfo = {
  op: LockedOp
  [key: string]: any;
}
