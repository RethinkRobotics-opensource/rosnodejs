import Time from '../lib/Time';
import { RosTime } from '../types/RosTypes';
import { INodeHandle } from '../types/NodeHandle';

let GOAL_COUNT = 0;

export default function GoalIdGenerator(nodeHandle: INodeHandle, now: RosTime): string {
  if (!now || now.secs === undefined || now.nsecs === undefined) {
    now = Time.now();
  }

  ++GOAL_COUNT;
  if (GOAL_COUNT > Number.MAX_SAFE_INTEGER) {
    GOAL_COUNT = 0;
  }

  return `${nodeHandle.getNodeName()}-${GOAL_COUNT}-${now.secs}.${now.nsecs}`;
}
