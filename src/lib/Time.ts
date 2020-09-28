import * as timeUtils from '../utils/time_utils';
import { RosTime } from '../types/RosTypes';

let simTimeSub = null;
let simTime = timeUtils.dateToRosTime(0);

type RosgraphMsgClock = {
  clock: RosTime;
}

function handleSimTimeMessage(msg: RosgraphMsgClock): void {
  simTime = msg.clock;
}

const Time = {
  useSimTime: false,

  async _initializeRosTime(rosnodejs: any, notime: boolean): Promise<void> {
    //Only for testing purposes!
    if (notime) {
      return;
    }
    const nh = rosnodejs.nh;
    try {
      this.useSimTime = await nh.getParam('/use_sim_time')

      if (this.useSimTime) {
        simTimeSub = nh.subscribe('/clock', 'rosgraph_msgs/Clock', handleSimTimeMessage, {throttleMs: -1});
      }
    }
    catch(err) {
      if (err.statusCode === undefined) {
        throw err;
      }
    }
  },

  now(): RosTime {
    if (this.useSimTime) {
      return simTime;
    }
    // else
    return timeUtils.now();
  },

  rosTimeToDate: timeUtils.rosTimeToDate,
  dateToRosTime: timeUtils.dateToRosTime,
  epoch:         timeUtils.epoch,
  isZeroTime:    timeUtils.isZeroTime,
  toNumber:      timeUtils.toNumber,
  toSeconds:     timeUtils.toSeconds,
  timeComp:      timeUtils.timeComp,
  add:           timeUtils.add,
  lt:            timeUtils.lt,
};

export default Time;
