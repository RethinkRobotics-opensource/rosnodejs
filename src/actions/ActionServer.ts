/*
 *    Copyright 2017 Rethink Robotics
 *
 *    Copyright 2017 Chris Smith
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

import * as msgUtils from '../utils/message_utils';
import { EventEmitter } from 'events';
import * as Ultron from 'ultron';

import ActionServerInterface, { ActionServerInterfaceOptions } from '../lib/ActionServerInterface';
import GoalHandle from './GoalHandle';
import Time from '../lib/Time';

import ThisNode from '../lib/ThisNode';
import { ActionConstructor, ActionMsgs } from '../types/Message';
import { RosTime } from '../types/RosTypes';

export interface ActionServerOptions extends ActionServerInterfaceOptions {
  statusFrequency?: number;
}

/**
 * @class ActionServer
 * EXPERIMENTAL
 *
 */
export default class ActionServer<G,F,R> extends EventEmitter {
  _options: ActionServerOptions;
  _pubSeqs = { result: 0, feedback: 0, status: 0 };
  _goalHandleList: GoalHandle<G,F,R>[] = [];
  _goalHandleCache: {[key: string]: GoalHandle<G,F,R>} = {};
  _lastCancelStamp: RosTime;
  _statusListTimeout: RosTime = { secs: 5, nsecs: 0 };
  _shutdown: boolean = false;
  _started: boolean = false;
  _ultron: Ultron.Ultron;
  _asInterface: ActionServerInterface<G,F,R>;
  _messageTypes: MessageLookup<G,F,R>;
  _statusFreqInt?: NodeJS.Timer;

  constructor(options: ActionServerOptions) {
    super();

    this._options = options;

    this._lastCancelStamp = Time.epoch();

    this._ultron = new Ultron.Ultron(ThisNode);
  }

  start() {
    this._started = true;
    this._asInterface = new ActionServerInterface(this._options);

    this._asInterface.on('goal', this._handleGoal.bind(this));
    this._asInterface.on('cancel', this._handleCancel.bind(this));

    const actionType = this._asInterface.getType();

    this._messageTypes = {
      result: msgUtils.getHandlerForMsgType(actionType + 'Result'),
      feedback: msgUtils.getHandlerForMsgType(actionType + 'Feedback'),
      actionResult: msgUtils.getHandlerForMsgType(actionType + 'ActionResult'),
      actionFeedback: msgUtils.getHandlerForMsgType(actionType + 'ActionFeedback')
    };

    this.publishStatus();

    let statusFreq = 5;
    if (this._options.statusFrequency !== undefined) {
      if (typeof this._options.statusFrequency !== 'number') {
        throw new Error(`Invalid value (${this._options.statusFrequency}) for statusFrequency - expected number`);
      }

      statusFreq = this._options.statusFrequency;
    }

    if (statusFreq > 0) {
      this._statusFreqInt = setInterval(() => {
        this.publishStatus();
      }, 1000 / statusFreq);
    }

    // FIXME: how to handle shutdown? Should user be responsible?
    // should we check for shutdown in interval instead of listening
    // to events here?
    this._ultron.once('shutdown', () => { this.shutdown(); });
  }

  generateGoalId() {
    return this._asInterface.generateGoalId();
  }

  async shutdown(): Promise<void> {
    if (!this._shutdown) {
      this._shutdown = true;
      this.removeAllListeners();

      clearInterval(this._statusFreqInt);
      this._statusFreqInt = null;

      this._ultron.destroy();
      this._ultron = null;

      if (this._asInterface) {
        return this._asInterface.shutdown();
      }
    }
  }

  _getGoalHandle(id: string): GoalHandle<G,F,R> {
    return this._goalHandleCache[id];
  }

  _handleGoal(msg: ActionMsgs.ActionGoal<G>): void {
    if (!this._started) {
      return;
    }

    const newGoalId = msg.goal_id.id;

    let handle = this._getGoalHandle(newGoalId);

    if (handle) {
      // check if we already received a request to cancel this goal
      if (handle.getStatusId() === ActionMsgs.Status.RECALLING) {
        handle.setCancelled(new this._messageTypes.result());
      }

      handle._destructionTime = msg.goal_id.stamp;
      return;
    }

    handle = new GoalHandle(msg.goal_id, this, ActionMsgs.Status.PENDING, msg.goal);
    this._goalHandleList.push(handle);
    this._goalHandleCache[handle.id] = handle;

    const goalStamp = msg.goal_id.stamp;
    // check if this goal has already been cancelled based on its timestamp
    if (!Time.isZeroTime(goalStamp) &&
        Time.timeComp(goalStamp, this._lastCancelStamp) < 0) {
      handle.setCancelled(new this._messageTypes.result());
      return;
    }
    else {
      // track goal, I guess
      this.emit('goal', handle);
    }

    return;
  }

  _handleCancel(msg: ActionMsgs.GoalID): void {
    if (!this._started) {
      return;
    }

    const cancelId = msg.id;
    const cancelStamp = msg.stamp;
    const cancelStampIsZero = Time.isZeroTime(cancelStamp);

    const shouldCancelEverything = (cancelId === '' && cancelStampIsZero);

    let goalIdFound = false;

    for (let i = 0, len = this._goalHandleList.length; i < len; ++i) {
      const handle = this._goalHandleList[i];
      const handleId = handle.id;
      const handleStamp = handle.getStatus().goal_id.stamp;

      if (shouldCancelEverything ||
          cancelId === handleId ||
          (!Time.isZeroTime(handleStamp) &&
           Time.timeComp(handleStamp, cancelStamp) < 0))
      {
        if (cancelId === handleId) {
          goalIdFound = true;
        }

        if (handle.setCancelRequested()) {
          this.emit('cancel', handle);
        }
      }
    }

    // if the requested goal_id was not found and it is not empty,
    // then we need to store the cancel request
    if (cancelId !== '' && !goalIdFound) {
      const handle = new GoalHandle<G,F,R>(msg, this, ActionMsgs.Status.RECALLING);
      this._goalHandleList.push(handle);
      this._goalHandleCache[handle.id] = handle;
    }

    // update the last cancel stamp if new one occurred later
    if (Time.timeComp(cancelStamp, this._lastCancelStamp) > 0) {
      this._lastCancelStamp = cancelStamp;
    }
  }

  publishResult(status: ActionMsgs.GoalStatus, result: R): void {
    const msg = new this._messageTypes.actionResult({ status, result });
    msg.header.stamp = Time.now();
    msg.header.seq = this._getAndIncrementSeq('result');
    this._asInterface.publishResult(msg);
    this.publishStatus();
  }

  publishFeedback(status: ActionMsgs.GoalStatus, feedback: F) {
    const msg = new this._messageTypes.actionFeedback({ status, feedback });
    msg.header.stamp = Time.now();
    msg.header.seq = this._getAndIncrementSeq('feedback');
    this._asInterface.publishFeedback(msg);
    this.publishStatus();
  }

  publishStatus(): void {
    const msg: ActionMsgs.GoalStatusArray = {
      header: {
        stamp: Time.now(),
        seq: this._getAndIncrementSeq('status'),
        frame_id: ''
      },
      status_list: []
    };

    let goalsToRemove = new Set();

    const now = Time.now();

    for (let i = 0, len = this._goalHandleList.length; i < len; ++i) {
      const goalHandle = this._goalHandleList[i];
      msg.status_list.push(goalHandle.getGoalStatus());

      const t = goalHandle._destructionTime;
      if (!Time.isZeroTime(t) &&
          Time.lt(Time.add(t, this._statusListTimeout), now))
      {
        goalsToRemove.add(goalHandle);
      }
    }

    // clear out any old goal handles
    this._goalHandleList = this._goalHandleList.filter((goal) => {
      // kind of funky to remove from another object in this filter...
      if (goalsToRemove.has(goal)) {
        delete this._goalHandleCache[goal.id];
        return false;
      }
      return true;
    });

    this._asInterface.publishStatus(msg as any);
  }

  _getAndIncrementSeq(type: 'result'|'feedback'|'status') {
    return this._pubSeqs[type]++
  }

  _createMessage(type: keyof MessageLookup<G,F,R>, args = {}) {
    return new this._messageTypes[type](args);
  }
}

type MessageLookup<G,F,R> = {
  result: ActionConstructor<G,F,R>['Result'],
  feedback: ActionConstructor<G,F,R>['Feedback'],
  actionResult: ActionConstructor<G,F,R>['ActionResult'],
  actionFeedback: ActionConstructor<G,F,R>['ActionFeedback']
};
