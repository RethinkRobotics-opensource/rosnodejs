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

import { CommState } from './ClientStates';

import { EventEmitter } from 'events';

import Logging from '../lib/LoggingManager';
import { ActionMsgs } from '../types/Message';
import type ActionClientInterface from '../lib/ActionClientInterface';
const log = Logging.getLogger('actionlib_nodejs');

export default class ClientGoalHandle<G,F,R> extends EventEmitter {
  private _clientInterface: ActionClientInterface<G,F,R>;
  private _state: CommState = CommState.WAITING_FOR_GOAL_ACK;
  private _goalStatus: ActionMsgs.GoalStatus|null = null;
  private _result: ActionMsgs.ActionResult<R>|null = null;
  private _goal: ActionMsgs.ActionGoal<G>;
  private _active = true;

  constructor(actionGoal: ActionMsgs.ActionGoal<G>, actionClientInterface: ActionClientInterface<G,F,R>) {
    super();

    this._goal = actionGoal;
    this._clientInterface = actionClientInterface;
  }

  reset() {
    this._active = false;
    this._clientInterface = null;
    this.removeAllListeners();
  }

  getGoalStatus() {
    return this._goalStatus;
  }

  resend() {
    if (!this._active) {
      log.error('Trying to resend on an inactive ClientGoalHandle!');
    }

    this._clientInterface.sendGoal(this._goal);
  }

  cancel(): void {
    if (!this._active) {
      log.error('Trying to cancel on an inactive ClientGoalHandle!');
    }

    switch(this._state) {
      case CommState.WAITING_FOR_GOAL_ACK:
      case CommState.PENDING:
      case CommState.ACTIVE:
      case CommState.WAITING_FOR_CANCEL_ACK:
        break;
      case CommState.WAITING_FOR_RESULT:
      case CommState.RECALLING:
      case CommState.PREEMPTING:
      case CommState.DONE:
        log.debug('Got a cancel request while in state [%s], ignoring it', this._state);
        return;
      default:
        log.error('BUG: Unhandled CommState: %s', this._state);
        return;
    }

    this._clientInterface.cancel(this._goal.goal_id.id, { secs: 0, nsecs: 0 });
    this._transition(CommState.WAITING_FOR_CANCEL_ACK);
  }

  getResult(): R {
    if (!this._active) {
      log.error('Trying to getResult on an inactive ClientGoalHandle!');
    }

    if (this._result) {
      return this._result.result;
    }
  }

  getTerminalState() {
    if (!this._active) {
      log.error('Trying to getTerminalState on an inactive ClientGoalHandle!');
    }

    if (this._state !== CommState.DONE) {
      log.warn('Asking for terminal state when we\'re in %s', this._state);
    }

    if (this._goalStatus) {
      switch (this._goalStatus.status) {
        case ActionMsgs.Status.PENDING:
        case ActionMsgs.Status.ACTIVE:
        case ActionMsgs.Status.PREEMPTING:
        case ActionMsgs.Status.RECALLING:
          log.error('Asking for terminal state, but latest goal status is %s', this._goalStatus.status);
          return ActionMsgs.Status.LOST;
        case ActionMsgs.Status.PREEMPTED:
        case ActionMsgs.Status.SUCCEEDED:
        case ActionMsgs.Status.ABORTED:
        case ActionMsgs.Status.REJECTED:
        case ActionMsgs.Status.RECALLED:
        case ActionMsgs.Status.LOST:
          return this._goalStatus.status;
        default:
          log.error('Unknown goal status: %s', this._goalStatus.status);
      }
    }
  }

  getCommState(): CommState {
    return this._state;
  }

  isExpired(): boolean {
    return !this._active;
  }

  updateFeedback(feedback: ActionMsgs.ActionFeedback<F>): void {
    this.emit('feedback', feedback);
  }

  updateResult(actionResult: ActionMsgs.ActionResult<R>): void {
    this._goalStatus = actionResult.status;
    this._result = actionResult;

    switch(this._state) {
      case CommState.WAITING_FOR_GOAL_ACK:
      case CommState.PENDING:
      case CommState.ACTIVE:
      case CommState.WAITING_FOR_RESULT:
      case CommState.WAITING_FOR_CANCEL_ACK:
      case CommState.RECALLING:
      case CommState.PREEMPTING:
        // trigger all the state transitions users would expect
        this.updateStatus(actionResult.status);

        this._transition(CommState.DONE);
        break;
      case CommState.DONE:
        log.error('Got a result when we were already in the DONE state');
        break;
      default:
        log.error('In a funny comm state: %s', this._state);
    }
  }

  updateStatus(status: ActionMsgs.GoalStatus): void {
    // it's apparently possible to receive old GoalStatus messages, even after
    // transitioning to a terminal state.
    if (this._state === CommState.DONE) {
      return;
    }
    // else
    if (status) {
      this._goalStatus = status;
    }
    else {
      // this goal wasn't included in the latest status message!
      // it may have been lost. No need to check for DONE since we already did
      if (this._state !== CommState.WAITING_FOR_GOAL_ACK &&
          this._state !== CommState.WAITING_FOR_RESULT)
      {
        log.warn('Transitioning goal to LOST');
        this._goalStatus.status === ActionMsgs.Status.LOST;
        this._transition(CommState.DONE);
      }
      return;
    }

    switch (this._state) {
      case CommState.WAITING_FOR_GOAL_ACK:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            this._transition(CommState.PENDING);
            break;
          case ActionMsgs.Status.ACTIVE:
            this._transition(CommState.ACTIVE);
            break;
          case ActionMsgs.Status.PREEMPTED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.PREEMPTING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.SUCCEEDED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.REJECTED:
            this._transition(CommState.PENDING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.RECALLED:
            this._transition(CommState.PENDING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.PREEMPTING:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.PREEMPTING);
            break;
          case ActionMsgs.Status.RECALLING:
            this._transition(CommState.PENDING);
            this._transition(CommState.RECALLING);
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.PENDING:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            break;
          case ActionMsgs.Status.ACTIVE:
            this._transition(CommState.ACTIVE);
            break;
          case ActionMsgs.Status.PREEMPTED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.PREEMPTING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.SUCCEEDED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.REJECTED:
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.RECALLED:
            this._transition(CommState.RECALLING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.PREEMPTING:
            this._transition(CommState.ACTIVE);
            this._transition(CommState.PREEMPTING);
            break;
          case ActionMsgs.Status.RECALLING:
            this._transition(CommState.RECALLING);
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.ACTIVE:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            log.error('Invalid transition from ACTIVE to PENDING');
            break;
          case ActionMsgs.Status.REJECTED:
            log.error('Invalid transition from ACTIVE to REJECTED');
            break;
          case ActionMsgs.Status.RECALLED:
            log.error('Invalid transition from ACTIVE to RECALLED');
            break;
          case ActionMsgs.Status.RECALLING:
            log.error('Invalid transition from ACTIVE to RECALLING');
            break;
          case ActionMsgs.Status.ACTIVE:
            break;
          case ActionMsgs.Status.PREEMPTED:
            this._transition(CommState.PREEMPTING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.SUCCEEDED:
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.PREEMPTING:
            this._transition(CommState.PREEMPTING);
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.WAITING_FOR_RESULT:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            log.error('Invalid transition from WAITING_FOR_RESULT to PENDING');
            break;
          case ActionMsgs.Status.PREEMPTING:
            log.error('Invalid transition from WAITING_FOR_RESULT to PREEMPTING');
            break;
          case ActionMsgs.Status.RECALLING:
            log.error('Invalid transition from WAITING_FOR_RESULT to RECALLING');
            break;
          case ActionMsgs.Status.ACTIVE:
          case ActionMsgs.Status.PREEMPTED:
          case ActionMsgs.Status.SUCCEEDED:
          case ActionMsgs.Status.ABORTED:
          case ActionMsgs.Status.REJECTED:
          case ActionMsgs.Status.RECALLED:
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.WAITING_FOR_CANCEL_ACK:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
          case ActionMsgs.Status.ACTIVE:
            break;
          case ActionMsgs.Status.PREEMPTED:
          case ActionMsgs.Status.SUCCEEDED:
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.PREEMPTING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.RECALLED:
            this._transition(CommState.RECALLING);
            this._transition(CommState.WAITING_FOR_RESULT);
          case ActionMsgs.Status.REJECTED:
            this._transition(CommState.WAITING_FOR_RESULT);
          case ActionMsgs.Status.PREEMPTING:
            this._transition(CommState.PREEMPTING);
            break;
          case ActionMsgs.Status.RECALLING:
            this._transition(CommState.RECALLING);
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.RECALLING:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            log.error('Invalid transition from RECALLING to PENDING');
            break;
          case ActionMsgs.Status.ACTIVE:
            log.error('Invalid transition from RECALLING to ACTIVE');
            break;
          case ActionMsgs.Status.PREEMPTED:
          case ActionMsgs.Status.SUCCEEDED:
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.PREEMPTING);
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.RECALLED:
            this._transition(CommState.WAITING_FOR_RESULT);
          case ActionMsgs.Status.REJECTED:
            this._transition(CommState.WAITING_FOR_RESULT);
          case ActionMsgs.Status.PREEMPTING:
            this._transition(CommState.PREEMPTING);
            break;
          case ActionMsgs.Status.RECALLING:
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      case CommState.PREEMPTING:
        switch(status.status) {
          case ActionMsgs.Status.PENDING:
            log.error('Invalid transition from PREEMPTING to PENDING');
            break;
          case ActionMsgs.Status.ACTIVE:
            log.error('Invalid transition from PREEMPTING to ACTIVE');
            break;
          case ActionMsgs.Status.REJECTED:
            log.error('Invalid transition from PREEMPTING to REJECTED');
          case ActionMsgs.Status.RECALLING:
            log.error('Invalid transition from PREEMPTING to RECALLING');
            break;
          case ActionMsgs.Status.RECALLED:
            log.error('Invalid transition from PREEMPTING to RECALLED');
            break;
          case ActionMsgs.Status.PREEMPTED:
          case ActionMsgs.Status.SUCCEEDED:
          case ActionMsgs.Status.ABORTED:
            this._transition(CommState.WAITING_FOR_RESULT);
            break;
          case ActionMsgs.Status.PREEMPTING:
            break;
          default:
            log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
            break;
        }
        break;
      // actionlib has this case but we can't get here because we've already checked
      // DONE above and so Typescript complains about this case;
      // case CommState.DONE:
      //
      //   switch(status.status) {
      //     case ActionMsgs.Status.PENDING:
      //       log.error('Invalid transition from DONE to PENDING');
      //       break;
      //     case ActionMsgs.Status.ACTIVE:
      //       log.error('Invalid transition from DONE to ACTIVE');
      //       break;
      //     case ActionMsgs.Status.RECALLING:
      //       log.error('Invalid transition from DONE to RECALLING');
      //       break;
      //     case ActionMsgs.Status.PREEMPTING:
      //       log.error('Invalid transition from DONE to PREEMPTING');
      //       break;
      //     case ActionMsgs.Status.RECALLED:
      //     case ActionMsgs.Status.REJECTED:
      //     case ActionMsgs.Status.PREEMPTED:
      //     case ActionMsgs.Status.SUCCEEDED:
      //     case ActionMsgs.Status.ABORTED:
      //       break;
      //     default:
      //       log.error('BUG: Got an unknown status from the ActionServer: status = ' + status.status);
      //       break;
      //   }
      //   break;
      default:
        log.error('In a funny comm state: %s', this._state);
    }
  }

  _transition(newState: CommState): void {
    log.debug('Trying to transition to %s', newState);
    this._state = newState;
    this.emit('transition');
  }
}
