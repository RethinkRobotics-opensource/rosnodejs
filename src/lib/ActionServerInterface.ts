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

import Time from './Time';
import { EventEmitter } from 'events';
import { INodeHandle, SubscribeOptions, AdvertiseOptions } from '../types/NodeHandle';
import { ISubscriber } from '../types/Subscriber';
import { IPublisher } from '../types/Publisher';
import GoalIdGenerator from '../actions/GoalIdGenerator';
import { ActionConstructor, MessageConstructor, ActionMsgs } from '../types/Message';

export type ActionServerInterfaceOptions = {
  type: string;
  actionServer: string;
  nh: INodeHandle;
  goal?: SubscribeOptions;
  cancel?: SubscribeOptions;
  status?: AdvertiseOptions;
  feedback?: AdvertiseOptions;
  result?: AdvertiseOptions;
}

export default class ActionServerInterface<G,F,R> extends EventEmitter {
  private _actionType: string;
  private _actionServer: string;
  private _goalSub: ISubscriber<ActionMsgs.ActionGoal<G>>;
  private _cancelSub: ISubscriber<ActionMsgs.GoalID>;
  private _statusPub: IPublisher<ActionMsgs.GoalStatusArray>;
  private _feedbackPub: IPublisher<ActionMsgs.ActionFeedback<F>>;
  private _resultPub: IPublisher<ActionMsgs.ActionResult<R>>;
  private _nh: INodeHandle;

  constructor(options: ActionServerInterfaceOptions) {
    super();

    this._actionType = options.type;

    this._actionServer = options.actionServer;

    const nh = options.nh;
    this._nh = nh;

    const goalOptions = Object.assign({ queueSize: 50 }, options.goal);
    this._goalSub = nh.subscribe<ActionMsgs.ActionGoal<G>>(this._actionServer + '/goal',
                                 this._actionType + 'ActionGoal',
                                 (msg) => { this._handleGoal(msg); },
                                 goalOptions);

    const cancelOptions = Object.assign({ queueSize: 50 }, options.cancel);
    this._cancelSub = nh.subscribe<ActionMsgs.GoalID>(this._actionServer + '/cancel',
                                   'actionlib_msgs/GoalID',
                                   (msg) => { this._handleCancel(msg); },
                                   cancelOptions);

    const statusOptions = Object.assign({ queueSize: 50 }, options.status);
    this._statusPub = nh.advertise<ActionMsgs.GoalStatusArray>(this._actionServer + '/status',
                                   'actionlib_msgs/GoalStatusArray',
                                   statusOptions);

    const feedbackOptions = Object.assign({ queueSize: 50 }, options.feedback);
    this._feedbackPub = nh.advertise<ActionMsgs.ActionFeedback<F>>(this._actionServer + '/feedback',
                                     this._actionType + 'ActionFeedback',
                                     feedbackOptions);

    const resultOptions = Object.assign({ queueSize: 50 }, options.result);
    this._resultPub = nh.advertise<ActionMsgs.ActionResult<R>>(this._actionServer + '/result',
                                   this._actionType + 'ActionResult',
                                   resultOptions);
  }

  getType(): string {
    return this._actionType;
  }

  generateGoalId(): ActionMsgs.GoalID {
    const now = Time.now();
    return {
      id: GoalIdGenerator(this._nh, now),
      stamp: now
    }
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this._goalSub.shutdown(),
      this._cancelSub.shutdown(),
      this._statusPub.shutdown(),
      this._feedbackPub.shutdown(),
      this._resultPub.shutdown(),
    ]);
  }

  _handleGoal(msg: ActionMsgs.ActionGoal<G>): void {
    this.emit('goal', msg);
  }

  _handleCancel(msg: ActionMsgs.GoalID): void {
    this.emit('cancel', msg);
  }

  publishResult(resultMsg: ActionMsgs.ActionResult<R>): void {
    this._resultPub.publish(resultMsg);
  }

  publishFeedback(feedbackMsg: ActionMsgs.ActionFeedback<F>): void {
    this._feedbackPub.publish(feedbackMsg);
  }

  publishStatus(statusMsg: ActionMsgs.GoalStatusArray): void {
    this._statusPub.publish(statusMsg);
  }
}
