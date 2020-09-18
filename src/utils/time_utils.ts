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

const NSEC_TO_SEC = 1e-9;
const USEC_TO_SEC = 1e-6;
const MSEC_TO_SEC = 1e-3;

export type RosTime = {
  secs: number;
  nsecs: number;
}

export function rosTimeToDate(rosTime: RosTime): Date {
  var date = new Date();
  // setTime takes in ms since epoch
  date.setTime(rosTime.secs * 1000 + Math.floor(rosTime.nsecs * USEC_TO_SEC));
  return date;
}

export function dateToRosTime(date: number): RosTime {
  var secs = Math.floor(date * MSEC_TO_SEC);
  var nsecs = date % 1000 * 1000000;
  return {'secs': secs, 'nsecs': nsecs};
}

export function now(): RosTime {
  return dateToRosTime(Date.now());
}

export function epoch(): RosTime {
  return {
    secs: 0,
    nsecs: 0
  };
}

export function isZeroTime(t: RosTime): boolean {
  return t.secs === 0 && t.nsecs === 0;
}

export function toNumber(t: RosTime): number {
  return this.toSeconds(t);
}

export function add(a: RosTime, b: RosTime): RosTime {
  let nsecs = a.nsecs + b.nsecs;
  let secs = a.secs + b.secs;

  // FIXME: we're ignoring negative time here
  if (nsecs > 1e9) {
    secs += Math.floor(nsecs / 1e9);
    nsecs = nsecs % 1e9;
  }

  return {
    secs,
    nsecs
  }
}

export function lt(a: RosTime, b: RosTime): boolean {
  return this.timeComp(a, b) < 0;
}

export function toSeconds(t: RosTime): number {
  return t.secs + t.nsecs * NSEC_TO_SEC;
}

export function timeComp(a: RosTime, b: RosTime): number {
  const secDif = a.secs - b.secs;
  if (secDif !== 0) {
    return Math.sign(secDif);
  }
  else {
    return Math.sign(a.nsecs - b.nsecs);
  }
}
