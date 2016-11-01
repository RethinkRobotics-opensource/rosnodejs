'use strict';

const DEFAULT_SPIN_RATE_HZ = 200;
const events = require('events');
const LoggingManager = require('../lib/Logging.js');
const log = LoggingManager.getLogger('ros.spinner');

const PING_OP = 'ping';
const DELETE_OP = 'delete';

/**
 * @class ClientQueue
 * Queue of messages to handle for an individual client (subscriber or publisher)
 */
class ClientQueue {
  constructor(client, queueSize, throttleMs) {
    if (queueSize < 1) {
      throw new Error(`Unable to create client message queue with size ${queueSize} - minimum is 1`);
    }

    this._client = client;

    this._queue = [];
    this._queueSize = queueSize;

    this.throttleMs = throttleMs;
    this._handleTime = null;
  }

  push(item) {
    this._queue.push(item);
    if (this.length > this._queueSize) {
      this._queue.shift();
    }
  }

  get length() {
    return this._queue.length;
  }

  handleClientMessages(time) {
    if (this._handleTime === null || time - this._handleTime >= this.throttleMs) {
      this._handleTime = time;
      try {
        this._client._handleMsgQueue(this._queue);
      }
      catch (err) {
        // log something?
      }
      this._queue = [];
      return true;
    }
    // else
    return false;
  }
}

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
class GlobalSpinner extends events {
  constructor(spinRate=DEFAULT_SPIN_RATE_HZ, emit=false) {
    super();

    if (typeof spinRate !== 'number') {
      spinRate = DEFAULT_SPIN_RATE_HZ;
    }

    this._spinTime = 1 / spinRate;
    this._expectedSpinExpire = null;
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
    this._emit = emit;
  }

  addClient(client, clientId, queueSize, throttleMs) {
    if (queueSize > 0) {
      this._clientQueueMap.set(clientId, new ClientQueue(client, queueSize, throttleMs));
    }
  }

  /**
   * When subscribers/publishers receive new messages to handle, they will
   * "ping" the spinner.
   * @param clientId
   * @param msg
   */
  ping(clientId=null, msg=null) {
    if (!clientId || !msg) {
      throw new Error('Trying to ping spinner without clientId')
    }

    if (this._queueLocked) {
      this._lockedOpCache.push({op: PING_OP, clientId, msg});
    }
    else {
      this._queueMessage(clientId, msg);
      this._setTimer();
    }
  }

  disconnect(clientId) {
    if (this._queueLocked) {
      this._lockedOpCache.push({op: DELETE_OP, clientId});
    }
    else {
      const index = this._clientCallQueue.indexOf(clientId);
      if (index !== -1) {
        this._clientCallQueue.splice(index, 1);
      }
      this._clientQueueMap.delete(clientId);
    }
  }

  _queueMessage(clientId, message) {
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

  _handleLockedOpCache() {
    const len = this._lockedOpCache.length;
    for (let i = 0; i < len; ++i) {
      const {op, clientId, msg} = this._lockedOpCache[i];
      if (op === PING_OP) {
        this.ping(clientId, msg);
      }
      else if (op === DELETE_OP) {
        this.disconnect(clientId);
      }
    }
    this._lockedOpCache = [];
  }

  _getClientsWithQueuedMessages() {
    const clients = {};
    this._clientQueueMap.forEach((value, clientId) => {
      const queueSize = value.length;
      clients[clientId] = queueSize;
      if (queueSize > 0 && this._clientCallQueue.indexOf(clientId) === -1) {
        throw new Error(`Client ${clientId} has ${value.length} queued messages but is not in call list!`);
      }
    });
  }

  _setTimer() {
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
      this._expectedSpinExpire = Date.now() + this._spinTime;
    }
  }

  _handleQueue() {
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

    if (keepOnQueue.length > 0) {
      this._clientCallQueue = keepOnQueue;
    }
    else {
      this._clientCallQueue = [];
    }

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

module.exports = GlobalSpinner;