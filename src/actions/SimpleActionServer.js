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

'use strict';

const ActionServer = require('./ActionServer.js');

const EventEmitter = require('events');

const Time = require('../lib/Time.js');

const log = require('../lib/Logging.js').getLogger('actionlib_nodejs');

let GoalStatuses = null;

class SimpleActionServer extends EventEmitter {
  constructor(options) {

    this._as = new ActionServer(options);

    if (GoalStatuses === null) {
      GoalStatuses = msgUtils.requireMsgPackage('actionlib_msgs').msg.GoalStatus.Constants;
    }

    this._executeCallback = options.executeCallback;

    this._currentGoal = null;
    this._nextGoal = null;

    this._preemptRequested = false;
    this._newGoalPreemptRequest = false;
  }

  start() {
    this._as.start();

    this._as.on('goal', this._handleGoal.bind(this));
    this._as.on('cancel', this._handleCancel.bind(this));

    if (this._executeCallback) {
      this.on('goal', () => {
        const goal = this.acceptNewGoal();
        this._executeCallback(goal)
        .then(() => {
          if (this.isActive()) {
            log.warn('%s\n%s\n%s',
              'Your executeCallback did not set the goal to a terminate status',
              'This is a bug in your ActionServer implementation. Fix your code!',
              'For now, the ActionServer will set this goal to aborted'
            );

            this.setAborted(
              this._as._createMessage('result'),
              'This goal was aborted by the simple action server. The user should have set a terminal status on this goal and did not'
            );
          }
        });
      });
    }
  }

  isActive() {
    if (this._currentGoal) {
      const status = this._currentGoal.getStatusId();
      return status === GoalStatuses.ACTIVE || status === GoalStatuses.PREEMPTING;
    }
    return false;
  }

  isNewGoalAvailable() {
    return !!this._nextGoal;
  }

  isPreemptRequested() {
    return this._preemptRequested;
  }

  shutdown() {
    this.removeAllListeners();

    this._currentGoal = null;
    this._nextGoal = null;

    return this._as.shutdown();
  }

  acceptNewGoal() {
    if (!this._nextGoal) {
      log.error('Attempting to accept the next goal when a new goal is not available');
      return;
    }

    if (this.isActive()) {
      const result = this._as._createMessage('result');

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

    return this._currentGoal.getGoal();
  }

  publishFeedback(feedback) {
    if (this._currentGoal) {
      this._currentGoal.publishFeedback(feedback);
    }
  }

  setAborted(result, text) {
    if (this._currentGoal) {
      this._currentGoal.setAborted(result, text);
    }
  }

  setPreempted(result, text) {
    if (this._currentGoal) {
      this._currentGoal.setCanceled(result, text);
    }
  }

  setSucceeded(result, text) {
    if (this._currentGoal) {
      this._currentGoal.setSucceeded(result, text);
    }
  }

  _handleGoal(newGoal) {
    const hasGoal = this.isActive();
    let acceptGoal = false;
    if (!hasGoal) {
      acceptGoal = true;
    }
    else {
      let stamp = this._nextGoal ? this._nextGoal.getGoalId().stamp
                                 : this._currentGoal.getGoalId().stamp;
      let newStamp = newGoal.getGoalId().stamp;

      acceptGoal = timeUtils.timeComp(stamp, newStamp) >= 0;
    }

    if (acceptGoal) {
      if (this._nextGoal) {
        const result = this._as._createMessage('result');
        this._nextGoal.setCancelled(
          result,
          'This goal was canceled because another goal was received by the simple action server'
        );
      }

      this._nextGoal = goal;
      this._newGoalPreemptRequest = false;

      if (hasGoal) {
        this._preemptRequested = true;
        this.emit('preempt');
      }

      this.emit('goal');
    }
  }

  _handleCancel(goal) {
    if (this._currentGoal && this._currentGoal.id === goal.id) {
      this._preemptRequested = true;
      this.emit('preempt');
    }
    else if (this._nextGoal && this._nextGoal.id === goal.id) {
      this._newGoalPreemptRequest = true;
    }
  }
}

module.exports = SimpleActionServer;
