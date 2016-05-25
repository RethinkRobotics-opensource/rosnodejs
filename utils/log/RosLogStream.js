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
const timeUtils = require('../time_utils.js');

let RosgraphLogMsg;

class RosLogStream {
  constructor(options) {
    this._rosoutPub = null;

    if (options.hasOwnProperty('queueSize')) {
      this._queueSize = options.queueSize;
    }
    else {
      this._queueSize = 100;
    }

    if (options.hasOwnProperty('formatter')) {
      this._formatter = options.formatter;
    }
    else {
      this._formatter = (msg) => { return msg; };
    }
  }

  onRosConnected(nh, rosgraphLogMsg) {
    RosgraphLogMsg = rosgraphLogMsg;

    this._rosoutPub = nh.advertise('/rosout', 'rosgraph_msgs/Log',
                                   {queueSize: this._queueSize});
  }

  write(rec) {
    if (this._rosoutPub !== null) {
      const msg = new RosgraphLogMsg();
      msg.header.stamp = timeUtils.dateToRosTime(rec.time);

      msg.name = rec.scope;
      msg.level = rec.level;
      const recMsg = rec.msg;
      if (typeof recMsg === 'string' || recMsg instanceof String) {
        msg.msg = msg;
      }

      this._rosoutPub.publish(msg);
    }
  }
};

module.exports = RosLogStream;
