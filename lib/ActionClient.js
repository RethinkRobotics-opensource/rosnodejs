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

'use strict';

const rosjs = require('../index.js');
const timeUtils = require('../utils/time_utils.js');
let EventEmitter = require('events');

class ActionClient extends EventEmitter {
  constructor(options) {
    this._actionType = options.type;

    this._actionServer = options.actionServer;

    const nh = rosjs.nh;

    // FIXME: support user options for these parameters
    this._goalPub = nh.advertise({
      topic: this._actionServer + '/goal',
      type: this._actionType + 'Goal',
      queueSize: 1
    });

    this._cancelPub = nh.advertise({
      topic: this._actionServer + '/goal',
      type: 'actionlib_msgs/GoalID',
      queueSize: 1
    });

    this._statusSub = nh.subscribe({
      topic: this._actionServer + '/status',
      type: 'actionlib_msgs/GoalStatusArray',
      queueSize: 1},
      (msg) => { this._handleStatus(msg); }
    );

    this._feedbackSub = nh.subscribe({
      topic: this._actionServer + '/feedback',
      type: this._actionType + 'Feedback',
      queueSize: 1},
      (msg) => { this._handleFeedback(msg); }
    );

    this._statusSub = nh.subscribe({
      topic: this._actionServer + '/result',
      type: this._actionType + 'Result',
      queueSize: 1},
      (msg) => { this._handleResult(msg); }
    );

    this._goals = {};
    this._goalCallbacks = {};

    this._goalSeqNum = 0;
  }

  _handleStatus(msg) {
    this.emit('status', msg);
  }

  _handleFeedback(msg) {
    const goalId = msg.status.goal_id.id;
    if  (this._goals.hasOwnProperty(goalId)) {
      this.emit('feedback', msg);
    }
  }

  _handleResult(msg) {
    const goalId = msg.status.goal_id.id;
    if (this._goals.hasOwnProperty(goalId)) {
      delete this._goals[goalId];
      this.emit('result', msg);
    }
  }

  sendGoal(goal) {
    if (!goal.hasOwnProperty('goal_id')) {
      goal.goal_id = {
        stamp: timeUtils.now(),
        id: this._generateGoalId()
      };
    }
    if (!goal.hasOwnProperty(header)) {
      goal.header = {
        seq: this._goalSeqNum++,
        stamp: goal.goal_id.stamp,
        frame_id: 'auto-generated'
      };
    }
    const goalId = goal.goal_id.id;
    this._goals[goalId] = goal;

    this._goalPub.publish(goal);
  }

  _generateGoalId() {
    let id = this._actionType + '.';
    id += 'xxxxxxxx'.replace(/[x]/g, function(c) {
      return = (Math.random()*16).toString(16);
    });
    return id;
  }
};
