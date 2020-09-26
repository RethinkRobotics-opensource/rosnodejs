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

import * as msgUtils from '../utils/message_utils';
import { EventEmitter }  from 'events';
import Time from './Time';
import GoalIdGenerator from '../actions/GoalIdGenerator';
import { IPublisher } from '../types/Publisher';
import { ISubscriber } from '../types/Subscriber';
import { RosTime } from '../types/RosTypes';
import { INodeHandle, AdvertiseOptions, SubscribeOptions } from '../types/NodeHandle';
import { ActionConstructor, MessageConstructor, ActionMsgs } from '../types/Message';
let GoalID: any = null;
let Header: any = null;

export type ActionClientInterfaceOptions = {
  type: string;
  actionServer: string;
  nh: INodeHandle;
  goal?: AdvertiseOptions;
  cancel?: AdvertiseOptions;
  status?: SubscribeOptions;
  feedback?: SubscribeOptions;
  result?: SubscribeOptions;
}

export default class ActionClientInterface<G,F,R> extends EventEmitter {
  private _actionType: string;
  private _actionServer: string;
  private _goalPub: IPublisher<ActionMsgs.ActionGoal<G>>;
  private _cancelPub: IPublisher<ActionMsgs.GoalID>;
  private _statusSub: ISubscriber<ActionMsgs.GoalStatusArray>;
  private _feedbackSub: ISubscriber<ActionMsgs.ActionFeedback<F>>;
  private _resultSub: ISubscriber<ActionMsgs.ActionResult<R>>;
  private _hasStatus: boolean;
  private _nh: INodeHandle;

  constructor(options: ActionClientInterfaceOptions) {
    super();

    if (GoalID === null) {
      GoalID = msgUtils.requireMsgPackage('actionlib_msgs').msg.GoalID;
    }

    if (Header === null) {
      Header = msgUtils.requireMsgPackage('std_msgs').msg.Header;
    }

    this._actionType = options.type;

    this._actionServer = options.actionServer;

    const nh = this._nh = options.nh;

    const goalOptions = Object.assign({ queueSize: 10, latching: false }, options.goal);
    this._goalPub = nh.advertise<ActionMsgs.ActionGoal<G>>(this._actionServer + '/goal',
                                 this._actionType + 'ActionGoal',
                                 goalOptions);

    const cancelOptions = Object.assign({ queueSize: 10, latching: false }, options.cancel);
    this._cancelPub = nh.advertise<ActionMsgs.GoalID>(this._actionServer + '/cancel',
                                   'actionlib_msgs/GoalID',
                                   cancelOptions);

    const statusOptions = Object.assign({ queueSize: 1 }, options.status);
    this._statusSub = nh.subscribe<ActionMsgs.GoalStatusArray>(this._actionServer + '/status',
                                   'actionlib_msgs/GoalStatusArray',
                                   (msg) => { this._handleStatus(msg); },
                                   statusOptions);

    const feedbackOptions = Object.assign({ queueSize: 1 }, options.feedback);
    this._feedbackSub = nh.subscribe<ActionMsgs.ActionFeedback<F>>(this._actionServer + '/feedback',
                                     this._actionType + 'ActionFeedback',
                                     (msg) => { this._handleFeedback(msg); },
                                     feedbackOptions);

    const resultOptions = Object.assign({ queueSize: 1 }, options.result);
    this._resultSub = nh.subscribe<ActionMsgs.ActionResult<R>>(this._actionServer + '/result',
                                   this._actionType + 'ActionResult',
                                   (msg) => { this._handleResult(msg); },
                                   resultOptions);

    this._hasStatus = false;
  }

  getType() {
    return this._actionType;
  }

  /**
   * Cancel the given goal. If none is given, send an empty goal message,
   * i.e. cancel all goals. See
   * http://wiki.ros.org/actionlib/DetailedDescription#The_Messages
   * @param [goalId] {string} id of the goal to cancel
   */
  cancel(goalId: string, stamp: RosTime|null = null) {
    if (!stamp) {
      stamp = Time.now();
    }

    const cancelGoal = new GoalID({ stamp });
    if (!goalId) {
      this._cancelPub.publish(cancelGoal);
    }
    else {
      cancelGoal.id = goalId;
      this._cancelPub.publish(cancelGoal);
    }
  }

  sendGoal(goal: ActionMsgs.ActionGoal<G>): void {
    this._goalPub.publish(goal);
  }

  async waitForActionServerToStart(timeoutMs: number): Promise<boolean> {
    let isConnected = this.isServerConnected();
    if (isConnected) {
      return true;
    }
    else {
      if (typeof timeoutMs  !== 'number') {
        timeoutMs = 0;
      }

      const start = Date.now();
      do {
        await sleep(100);
        if (this.isServerConnected()) {
          return true;
        }
        else if (timeoutMs > 0 && start + timeoutMs > Date.now()) {
          return false;
        }
      } while (!this.isServerConnected())
    }
  }

  generateGoalId(now: RosTime): string {
    return GoalIdGenerator(this._nh, now);
  }

  isServerConnected(): boolean {
    return this._hasStatus &&
      this._goalPub.getNumSubscribers() > 0 &&
      this._cancelPub.getNumSubscribers() > 0 &&
      this._statusSub.getNumPublishers() > 0 &&
      this._feedbackSub.getNumPublishers() > 0 &&
      this._resultSub.getNumPublishers() > 0;
  }

  /**
   * Shuts down this ActionClient. It shuts down publishers, subscriptions
   * and removes all attached event listeners.
   * @returns {Promise}
   */

  async shutdown(): Promise<void> {
    this.removeAllListeners();

    await Promise.all([
      this._goalPub.shutdown(),
      this._cancelPub.shutdown(),
      this._statusSub.shutdown(),
      this._feedbackSub.shutdown(),
      this._resultSub.shutdown()
    ]);
  }

  private _handleStatus(msg: ActionMsgs.GoalStatusArray): void {
    this._hasStatus = true;
    this.emit('status', msg);
  }

  private _handleFeedback(msg: ActionMsgs.ActionFeedback<F>): void {
    this.emit('feedback', msg);
  }

  private _handleResult(msg: ActionMsgs.ActionResult<R>): void {
    this.emit('result', msg);
  }
}

function sleep(timeoutMs: number): Promise<void> {
  return new Promise(function(resolve) {
    setTimeout(resolve, timeoutMs);
  });
}
