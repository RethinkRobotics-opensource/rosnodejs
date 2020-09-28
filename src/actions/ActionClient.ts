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

import ActionClientInterface, { ActionClientInterfaceOptions } from '../lib/ActionClientInterface';

import { EventEmitter }  from 'events';
import Ultron = require('ultron');

import ClientGoalHandle from './ClientGoalHandle';
import Time from '../lib/Time';

import Logging from '../lib/LoggingManager';
const log = Logging.getLogger('actionlib_nodejs');
import ThisNode from '../lib/ThisNode';
import GoalIdGenerator from './GoalIdGenerator';
import { ActionConstructor, ActionMsgs } from '../types/Message';
import { RosTime } from '../types/RosTypes';

/**
 * @class ActionClient
 * EXPERIMENTAL
 *
 */
export default class ActionClient<G,F,R> extends EventEmitter {
  private _acInterface: ActionClientInterface<G,F,R>;
  private _goalLookup: {[key: string]: ClientGoalHandle<G,F,R> } = {};
  private _shutdown: boolean = false;
  private _ultron: Ultron;
  private _messageTypes: MessageLookup<G,F,R>;

  constructor(options: ActionClientInterfaceOptions) {
    super();

    this._acInterface = new ActionClientInterface(options);

    this._acInterface.on('status', this._handleStatus.bind(this));
    this._acInterface.on('feedback', this._handleFeedback.bind(this));
    this._acInterface.on('result', this._handleResult.bind(this));

    const actionType = this._acInterface.getType();
    this._messageTypes = {
      result: msgUtils.getHandlerForMsgType(actionType + 'Result'),
      feedback: msgUtils.getHandlerForMsgType(actionType + 'Feedback'),
      goal: msgUtils.getHandlerForMsgType(actionType + 'Goal'),
      actionResult: msgUtils.getHandlerForMsgType(actionType + 'ActionResult'),
      actionFeedback: msgUtils.getHandlerForMsgType(actionType + 'ActionFeedback'),
      actionGoal: msgUtils.getHandlerForMsgType(actionType + 'ActionGoal')
    };

    this._ultron = new Ultron(ThisNode);

    // FIXME: how to handle shutdown? Should user be responsible?
    // should we check for shutdown in interval instead of listening
    // to events here?
    this._ultron.once('shutdown', () => { this.shutdown(); });
  }

  shutdown() {
    if (!this._shutdown) {
      this._shutdown = true;

      this._ultron.destroy();
      this._ultron = null;

      return this._acInterface.shutdown();
    }
    // else
    return Promise.resolve();
  }

  sendGoal(goal: G, transitionCb: ()=>void = null, feedbackCb:(f: F)=>void = null): ClientGoalHandle<G,F,R> {
    const actionGoal = new (this._messageTypes.actionGoal)();

    const now = Time.now();
    actionGoal.header.stamp = now;
    actionGoal.goal_id.stamp = now;
    const goalIdStr = GoalIdGenerator((this._acInterface as any)._nh, now);
    actionGoal.goal_id.id = goalIdStr;
    actionGoal.goal = goal;

    this._acInterface.sendGoal(actionGoal);

    const handle = new ClientGoalHandle<G,F,R>(actionGoal, this._acInterface);

    if (transitionCb && typeof transitionCb === 'function') {
      handle.on('transition', transitionCb);
    }
    if (feedbackCb && typeof feedbackCb === 'function') {
      handle.on('feedback', feedbackCb);
    }

    this._goalLookup[goalIdStr] = handle;

    return handle;
  }

  cancelAllGoals() {
    this._acInterface.cancel("", { secs: 0, nsecs: 0});
  }

  cancelGoalsAtAndBeforeTime(stamp: RosTime) {
    this._acInterface.cancel("", stamp);
  }

  waitForActionServerToStart(timeout: number) {
    return this._acInterface.waitForActionServerToStart(timeout);
  }

  isServerConnected(): boolean {
    return this._acInterface.isServerConnected();
  }

  _handleStatus(msg: ActionMsgs.GoalStatusArray): void {
    const list = msg.status_list;
    const len = list.length;

    const statusMap: {[key: string]: ActionMsgs.GoalStatus} = {};

    for (let i = 0; i < len; ++i) {
      const entry = list[i];
      const goalId = entry.goal_id.id;

      statusMap[goalId] = entry;
    }

    for (let goalId in this._goalLookup) {
      const goalHandle = this._goalLookup[goalId];
      goalHandle.updateStatus(statusMap[goalId]);
    }
  }

  _handleFeedback(msg: ActionMsgs.ActionFeedback<F>): void {
    const goalId = msg.status.goal_id.id;
    const goalHandle = this._goalLookup[goalId];
    if (goalHandle) {
      goalHandle.updateFeedback(msg);
    }
  }

  _handleResult(msg: ActionMsgs.ActionResult<R>): void {
    const goalId = msg.status.goal_id.id;
    const goalHandle = this._goalLookup[goalId];
    if (goalHandle) {
      delete this._goalLookup[goalId];
      goalHandle.updateResult(msg);
    }
  }
}

type MessageLookup<G,F,R> = {
  result: ActionConstructor<G,F,R>['Result'],
  feedback: ActionConstructor<G,F,R>['Feedback'],
  goal: ActionConstructor<G,F,R>['Goal'],
  actionResult: ActionConstructor<G,F,R>['ActionResult'],
  actionFeedback: ActionConstructor<G,F,R>['ActionFeedback'],
  actionGoal: ActionConstructor<G,F,R>['ActionGoal']
};
