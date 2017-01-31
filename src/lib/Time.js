const timeUtils = require('../utils/time_utils.js');

let simTimeSub = null;
let simTime = timeUtils.dateToRosTime(0);

function handleSimTimeMessage(msg) {
  console.log('Got sim time update: %j', msg);
  simTime = msg.clock;
}

const Time = {
  useSimTime: false,

  _initializeRosTime(rosnodejs) {
    const nh = rosnodejs.nh;
    return nh.getParam('/use_sim_time')
      .then((val) => {
        this.useSimTime = val;

        console.log('USE SIM TIME ?? %s', val);

        if (val) {
          simTimeSub = nh.subscribe('/clock', 'rosgraph_msgs/Clock', handleSimTimeMessage, {throttleMs: -1});
        }
      })
      .catch((err) => {
        console.log('no param named sim time!');
        if (err.statusCode === undefined) {
          throw err;
        }
      });
  },

  now() {
    if (this.useSimTime) {
      return simTime;
    }
    // else
    return timeUtils.now();
  },

  rosTimeToDate: timeUtils.rosTimeToDate,
  dateToRosTime: timeUtils.dateToRosTime,
};

module.exports = Time;