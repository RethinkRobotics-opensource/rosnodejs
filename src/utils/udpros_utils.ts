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

import * as ros_msg_utils from '../ros_msg_utils/index';
import { serializeString, serializeStringFields } from './serialization_utils';
const base_serializers = ros_msg_utils.Serialize;

//-----------------------------------------------------------------------

const callerIdPrefix = 'callerid=';
const md5Prefix = 'md5sum=';
const topicPrefix = 'topic=';
//const servicePrefix = 'service=';
const typePrefix = 'type=';
//const errorPrefix = 'error=';
const messageDefinitionPrefix = 'message_definition=';
//const latchingField = 'latching=1';
//const persistentField = 'persistent=1';
//const tcpNoDelayField = 'tcp_nodelay=1';

//-----------------------------------------------------------------------

export function createSubHeader(callerId: string, md5sum: string, topic: string, type: string): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    md5Prefix + md5sum,
    topicPrefix + topic,
    typePrefix + type,
  ];

  return serializeStringFields(fields);
}

export function createPubHeader(callerId: string, md5sum: string, type: string, messageDefinition: string): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    md5Prefix + md5sum,
    typePrefix + type,
    messageDefinitionPrefix + messageDefinition
  ];

  return serializeStringFields(fields);
}

export function createUdpRosError(str: string): Buffer {
  return serializeString(`{errorPrefix}${str}`);
}

export function deserializeHeader(buff: Buffer) {
  if(buff.length < 8){
    return undefined
  }
  let connectionId = buff.readUInt32LE(0)
  let opCode = buff.readUInt8(4)
  let msgId = buff.readUInt8(5)
  let blkN = buff.readUInt16LE(6)

  return {
    connectionId,
    opCode,
    msgId,
    blkN
  }
}

export function serializeUdpHeader(connectionId: number, opCode: number, msgId: number, blkN: number): Buffer {
  const buf = Buffer.allocUnsafe(8)
  base_serializers.uint32(connectionId, buf, 0)
  base_serializers.uint8(opCode, buf, 4)
  base_serializers.uint8(msgId, buf, 5)
  base_serializers.uint16(blkN, buf, 6)
  return buf
}
