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

import ActionServer, { ActionServerOptions } from './ActionServer';
import Ultron = require('ultron');
import { EventEmitter } from 'events';

import Time from '../lib/Time';

import Logging from '../lib/LoggingManager'
const log = Logging.getLogger('actionlib_nodejs');
import ThisNode from '../lib/ThisNode';
import { ActionConstructor, ActionMsgs } from '../types/Message';
import type GoalHandle from './GoalHandle';


type ExecuteCb<G,F,R> = (g: GoalHandle<G,F,R>)=>Promise<void>;
interface SimpleActionServerOptions<G,F,R> extends ActionServerOptions {
  executeCallback?: ExecuteCb<G,F,R>;
}

export default class SimpleActionServer<G,F,R> extends EventEmitter {
  _as: ActionServer<G,F,R>
  _currentGoal: GoalHandle<G,F,R>|null = null;
  _nextGoal: GoalHandle<G,F,R>|null = null;
  _preemptRequested = false;
  _newGoalPreemptRequest = false;
  _shutdown = false;
  _ultron: Ultron;
  _executeCallback?: ExecuteCb<G,F,R>;
  _executeLoopTimer?: NodeJS.Timer;

  constructor(options: SimpleActionServerOptions<G,F,R>) {
    super();

    this._as = new ActionServer(options);

    this._executeCallback = options.executeCallback;

    this._ultron = new Ultron(ThisNode);
  }

  start() {
    this._as.start();

    this._as.on('goal', this._handleGoal.bind(this));
    this._as.on('cancel', this._handleCancel.bind(this));

    if (this._executeCallback) {
      this._runExecuteLoop();
    }

    // FIXME: how to handle shutdown? Should user be responsible?
    // should we check for shutdown in interval instead of listening
    // to events here?
    this._ultron.once('shutdown', () => { this.shutdown(); });
  }

  isActive() {
    if (this._currentGoal) {
      const status = this._currentGoal.getStatusId();
      return status === ActionMsgs.Status.ACTIVE || status === ActionMsgs.Status.PREEMPTING;
    }
    return false;
  }

  isNewGoalAvailable() {
    return !!this._nextGoal;
  }

  isPreemptRequested() {
    return this._preemptRequested;
  }

  async shutdown() {
    if (!this._shutdown) {
      this._shutdown = true;
      this.removeAllListeners();

      this._currentGoal = null;
      this._nextGoal = null;
      clearTimeout(this._executeLoopTimer);

      this._ultron.destroy();
      this._ultron = null;

      return this._as.shutdown();
    }
  }

  acceptNewGoal(): GoalHandle<G,F,R>|undefined {
    if (!this._nextGoal) {
      log.error('Attempting to accept the next goal when a new goal is not available');
      return;
    }

    if (this.isActive()) {
      const result = this._as._createMessage('result') as R;

      this._currentGoal.setCancelled(
        result,
        'This goal was canceled because another goal was received by the simple action server'
      );
    }

    this._currentGoal = this._nextGoal;
    this._nextGoal = null;

    this._preemptRequested = this._newGoalPreemptRequest;
    this._newGoalPreemptRequest = false;

    this._currentGoal.setAccepted('This goal has been accepted by the simple action server');

    return this._currentGoal;
  }

  publishFeedback(feedback: F): void {
    if (this._currentGoal) {
      this._currentGoal.publishFeedback(feedback);
    }
  }

  setAborted(result?: R, text?: string) {
    if (this._currentGoal) {
      if (!result) {
        result = this._as._createMessage('result') as R;
      }

      this._currentGoal.setAborted(result, text);
    }
  }

  setPreempted(result?: R, text?: string) {
    if (this._currentGoal) {
      if (!result) {
        result = this._as._createMessage('result') as R;
      }

      this._currentGoal.setCanceled(result, text);
    }
  }

  setSucceeded(result?: R, text?: string) {
    if (this._currentGoal) {
      if (!result) {
        result = this._as._createMessage('result') as R;
      }

      this._currentGoal.setSucceeded(result, text);
    }
  }

  _handleGoal(newGoal: GoalHandle<G,F,R>): void {
    const hasGoal = this.isActive();
    let acceptGoal = false;
    if (!hasGoal) {
      acceptGoal = true;
    }
    else {
      let stamp = this._nextGoal ? this._nextGoal.getGoalId().stamp
                                 : this._currentGoal.getGoalId().stamp;
      let newStamp = newGoal.getGoalId().stamp;

      acceptGoal = Time.timeComp(stamp, newStamp) <= 0;
    }

    if (acceptGoal) {
      if (this._nextGoal) {
        const result = this._as._createMessage('result') as R;
        this._nextGoal.setCancelled(
          result,
          'This goal was canceled because another goal was received by the simple action server'
        );
      }

      this._nextGoal = newGoal;
      this._newGoalPreemptRequest = false;

      if (hasGoal) {
        this._preemptRequested = true;
        this.emit('preempt');
      }

      this.emit('goal');
    }
    else {
      // FIXME: make debug
      log.warn('Not accepting new goal');
    }
  }

  _handleCancel(goal: GoalHandle<G,F,R>) {
    if (this._currentGoal && this._currentGoal.id === goal.id) {
      this._preemptRequested = true;
      this.emit('preempt');
    }
    else if (this._nextGoal && this._nextGoal.id === goal.id) {
      this._newGoalPreemptRequest = true;
    }
  }

  async _runExecuteLoop(timeoutMs = 100): Promise<void> {
    while (!this._shutdown) {
      log.infoThrottle(1000, 'execute loop');
      if (this.isActive()) {
        log.error('Should never reach this code with an active goal!');
      }
      else if (this.isNewGoalAvailable()) {
        const goal = this.acceptNewGoal();
        await this._executeCallback(goal)
        if (this.isActive()) {
          log.warn('%s\n%s\n%s',
            'Your executeCallback did not set the goal to a terminate status',
            'This is a bug in your ActionServer implementation. Fix your code!',
            'For now, the ActionServer will set this goal to aborted'
          );

          this.setAborted(
            this._as._createMessage('result') as R,
            'This goal was aborted by the simple action server. The user should have set a terminal status on this goal and did not'
          );
        }
        await sleep(0);
      }
      else {
        await sleep(timeoutMs);
      }
    }
  }
}

function sleep(timeout: number): Promise<void> {
  return new Promise(r => setTimeout(r, timeout));
}
