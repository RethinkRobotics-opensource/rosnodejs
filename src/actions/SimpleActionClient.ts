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

import { EventEmitter } from 'events';
import { Ultron } from 'ultron';

import ActionClient from './ActionClient';
import { CommState, SimpleGoalState, SimpleClientGoalState } from './ClientStates';
import Time from '../lib/Time';

import Logging from '../lib/LoggingManager'
const log = Logging.getLogger('actionlib_nodejs');
import ThisNode from '../lib/ThisNode';
import type { ActionClientInterfaceOptions } from '../lib/ActionClientInterface';
import { ActionConstructor, ActionMsgs } from '../types/Message';
import type ClientGoalHandle from './ClientGoalHandle';
import { RosTime } from '../types/RosTypes';

type ActiveCb = ()=>void;
type DoneCb<R> = (state: SimpleGoalState, result: R)=>void;
type FeedbackCb<F> = (feedback: F)=>void;

export default class SimpleActionClient<G,F,R> extends EventEmitter {
  _ac: ActionClient<G,F,R>;
  _simpleState: SimpleGoalState;
  _goalHandle: ClientGoalHandle<G,F,R> = null;
  _ultron: Ultron;
  _activeCb: ActiveCb = null;
  _doneCb: DoneCb<R> = null;
  _feedbackCb: FeedbackCb<F> = null;
  _shutdown = false;

  constructor(options: ActionClientInterfaceOptions) {
    super();

    this._ac = new ActionClient(options);
    this._simpleState = SimpleGoalState.PENDING;

    // FIXME: how to handle shutdown? Should user be responsible?
    // should we check for shutdown in interval instead of listening
    // to events here?
    this._ultron = new Ultron(ThisNode);
    this._ultron.once('shutdown', () => { this.shutdown(); });
  }

  async shutdown(): Promise<void> {
    if (!this._shutdown) {
      this._shutdown = true;

      this._ultron.destroy();
      this._ultron = null;

      return this._ac.shutdown();
    }
  }

  waitForServer(timeout: number): Promise<boolean> {
    return this._ac.waitForActionServerToStart(timeout);
  }

  isServerConnected(): boolean {
    return this._ac.isServerConnected();
  }

  sendGoal(goal: G, doneCb?: DoneCb<R>, activeCb?: ActiveCb, feedbackCb?: FeedbackCb<F>) {
    if (this._goalHandle) {
      this._goalHandle.reset();
    }

    this._simpleState = SimpleGoalState.PENDING;

    // NOTE: should these automatically be attached to events like we do elsewhere?
    // If so, how do we clean up old listeners?
    this._activeCb = activeCb;
    this._doneCb = doneCb;
    this._feedbackCb = feedbackCb;

    const gh = this._ac.sendGoal(goal);
    gh.on('transition', this._handleTransition.bind(this));
    gh.on('feedback', this._handleFeedback.bind(this));

    this._goalHandle = gh;
  }

  async sendGoalAndWait(goal: G, execTimeout: RosTime, preemptTimeout: RosTime) {
    this.sendGoal(goal);

    const finished = await this.waitForResult(execTimeout)
    if (finished) {
      log.debug('Goal finished within specified timeout');
    }
    else {
      log.debug('Goal didn\'t finish within specified timeout');
      // it didn't finish in time, so we need to cancel it
      this.cancelGoal();

      // wait again and see if it finishes
      const finished = await this.waitForResult(preemptTimeout)
      if (finished) {
        log.debug('Preempt finished within specified timeout');
      }
      else {
        log.debug('Preempt didn\'t finish within specified timeout');
      }

      return this.getState();
    }

    return this.getState();
  }

  async waitForResult(timeout: RosTime): Promise<boolean> {
    if (!this._goalHandle || this._goalHandle.isExpired()) {
      log.error('Trying to waitForResult() when no goal is running');
      return false;
    }

    if (Time.lt(timeout, {secs: 0, nsecs: 0})) {
      log.warn('Timeout [%s] is invalid - timeouts can\'t be negative');
    }

    if (Time.isZeroTime(timeout)) {
      return this._waitForResult();
    }
    // else
    return this._waitForResult(Time.add(timeout, Time.now()));
  }

  async _waitForResult(timeoutTime?: RosTime): Promise<boolean> {
    const WAIT_TIME_MS = 10;

    while (true) {
      const now = Time.now();
      if (timeoutTime && Time.timeComp(timeoutTime, now) <= 0) {
        return this._simpleState === SimpleGoalState.DONE;
      }
      else if (this._simpleState === SimpleGoalState.DONE) {
        return true;
      }
      await sleep(WAIT_TIME_MS);
    }
  }

  getResult(): R {
    if (!this._goalHandle || this._goalHandle.isExpired()) {
      log.error('Trying to getResult() when no goal is running.');
    }
    else {
      return this._goalHandle.getResult();
    }
  }

  getState(): SimpleClientGoalState {
    if (!this._goalHandle || this._goalHandle.isExpired()) {
      log.error('Trying to getState() when no goal is running. You are incorrectly using SimpleActionClient');
      return SimpleClientGoalState.LOST;
    }

    const commState = this._goalHandle.getCommState();

    switch (commState) {
      case CommState.WAITING_FOR_GOAL_ACK:
      case CommState.PENDING:
      case CommState.RECALLING:
        return SimpleClientGoalState.PENDING;
      case CommState.ACTIVE:
      case CommState.PREEMPTING:
        return SimpleClientGoalState.ACTIVE;
      case CommState.DONE:
      {
        const termState = this._goalHandle.getTerminalState();
        switch(termState) {
          case ActionMsgs.Status.RECALLED:
            return SimpleClientGoalState.RECALLED;
          case ActionMsgs.Status.REJECTED:
            return SimpleClientGoalState.REJECTED;
          case ActionMsgs.Status.PREEMPTED:
            return SimpleClientGoalState.PREEMPTED;
          case ActionMsgs.Status.ABORTED:
            return SimpleClientGoalState.ABORTED;
          case ActionMsgs.Status.SUCCEEDED:
            return SimpleClientGoalState.SUCCEEDED;
          case ActionMsgs.Status.LOST:
            return SimpleClientGoalState.LOST;
          default:
            log.error('Unknown terminal state %s', termState);
            return SimpleClientGoalState.LOST;
        }
      }
      case CommState.WAITING_FOR_RESULT:
      case CommState.WAITING_FOR_CANCEL_ACK:
        switch(this._simpleState) {
          case SimpleGoalState.PENDING:
            return SimpleClientGoalState.PENDING;
          case SimpleGoalState.ACTIVE:
            return SimpleClientGoalState.ACTIVE;
          default:
            log.error('BUG: In WAITING_FOR_RESULT or WAITING_FOR_CANCEL_ACK, yet we are in SimpleGoalState DONE.');
            return SimpleClientGoalState.LOST;
        }
      default:
        log.error('Error trying to interpret CommState - %s', commState);
        return SimpleClientGoalState.LOST;
    }
  }

  cancelAllGoals() {
    return this._ac.cancelAllGoals();
  }

  cancelGoalsAtAndBeforeTime(stamp: RosTime) {
    return this._ac.cancelGoalsAtAndBeforeTime(stamp);
  }

  cancelGoal() {
    if (!this._goalHandle || this._goalHandle.isExpired()) {
      log.error('Trying to cancelGoal() when no goal is running');
    }
    else {
      this._goalHandle.cancel();
    }
  }

  stopTrackingGoal() {
    if (!this._goalHandle || this._goalHandle.isExpired()) {
      log.error('Trying to stopTrackingGoal() when no goal is running');
    }
    else {
      this._goalHandle.reset();
    }
  }

  _handleTransition() {
    const commState = this._goalHandle.getCommState();

    switch(commState) {
      case CommState.WAITING_FOR_GOAL_ACK:
        log.error('BUG: shouldn\'t ever get a transition callback for WAITING_FOR_GOAL_ACK');
        break;
      case CommState.PENDING:
        if (this._simpleState !== SimpleGoalState.PENDING) {
          log.error('BUG: Got a transition to CommState [%s] when our SimpleGoalState is [%s]',
            commState, this._simpleState
          );
        }
        break;
      case CommState.ACTIVE:
        switch (this._simpleState) {
          case SimpleGoalState.PENDING:
            this._setSimpleState(SimpleGoalState.ACTIVE);

            if (this._activeCb) {
              this._activeCb();
            }
            break;
          case SimpleGoalState.ACTIVE:
            break;
          case SimpleGoalState.DONE:
            log.error('BUG: Got a transition to CommState [%s] when in SimpleGoalState [%s]',
              commState, this._simpleState
            );
            break;
          default:
            log.error('Unknown SimpleGoalState %s', this._simpleState);
            break;
        }
        break;
      case CommState.WAITING_FOR_RESULT:
        break;
      case CommState.WAITING_FOR_CANCEL_ACK:
        break;
      case CommState.RECALLING:
        if (this._simpleState !== SimpleGoalState.PENDING) {
          log.error('BUG: Got a transition to CommState [%s] when in SimpleGoalState [%s]',
            commState, this._simpleState
          );
        }
        break;
      case CommState.PREEMPTING:
        switch (this._simpleState) {
          case SimpleGoalState.PENDING:
            this._setSimpleState(SimpleGoalState.ACTIVE);
            if (this._activeCb) {
              this._activeCb();
            }
            break;
          case SimpleGoalState.ACTIVE:
            break;
          case SimpleGoalState.DONE:
            log.error('BUG: Got a transition to CommState [%s] when in SimpleGoalState [%s]',
              commState, this._simpleState
            );
            break;
          default:
            log.error('Unknown SimpleGoalState %s', this._simpleState);
            break;
        }
        break;
      case CommState.DONE:
        switch(this._simpleState) {
          case SimpleGoalState.PENDING:
          case SimpleGoalState.ACTIVE:
            this._setSimpleState(SimpleGoalState.DONE);
            if (this._doneCb) {
              this._doneCb(this._simpleState, this._goalHandle.getResult());
            }
            break;
          case SimpleGoalState.DONE:
            log.error('BUG: Got a second transition to DONE');
            break;
          default:
            log.error('Unknown SimpleGoalState %s', this._simpleState);
            break;
        }
        break;
      default:
        log.error('Unknown CommState received %s', commState);
    }
  }

  _handleFeedback(feedback: ActionMsgs.ActionFeedback<F>): void {
    if (this._feedbackCb) {
      this._feedbackCb(feedback.feedback);
    }
  }

  _setSimpleState(newState: SimpleGoalState): void {
    log.debug('Transitioning SimpleState from [%s] to [%s]',
      this._simpleState, newState);

    this._simpleState = newState;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
