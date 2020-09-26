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
import { MessageConstructor } from '../types/Message';
import { serializeStringFields, deserializeStringFields, serializeString } from './serialization_utils';
const base_serializers = ros_msg_utils.Serialize;
const base_deserializers = ros_msg_utils.Deserialize;

//-----------------------------------------------------------------------

const callerIdPrefix = 'callerid=';
const md5Prefix = 'md5sum=';
const topicPrefix = 'topic=';
const servicePrefix = 'service=';
const typePrefix = 'type=';
const errorPrefix = 'error=';
const messageDefinitionPrefix = 'message_definition=';
const latchingField = 'latching=1';
const persistentField = 'persistent=1';
const tcpNoDelayField = 'tcp_nodelay=1';

//-----------------------------------------------------------------------



/**
 * NOTE for general questions see
 * http://wiki.ros.org/ROS/TCPROS
 */

export function createSubHeader(callerId: string, md5sum: string, topic: string, type: string, messageDefinition: string, tcpNoDelay: boolean): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    md5Prefix + md5sum,
    topicPrefix + topic,
    typePrefix + type,
    messageDefinitionPrefix + messageDefinition
  ];

  if (tcpNoDelay) {
    fields.push(tcpNoDelayField);
  }

  return serializeStringFields(fields);
}

export function createPubHeader(callerId: string, md5sum: string, type: string, latching: boolean, messageDefinition: string): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    md5Prefix + md5sum,
    typePrefix + type,
    messageDefinitionPrefix + messageDefinition
  ];

  if (latching) {
    fields.push(latchingField);
  }

  return serializeStringFields(fields);
}

export function createServiceClientHeader(callerId: string, service: string, md5sum: string, type: string, persistent: boolean): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    servicePrefix + service,
    md5Prefix + md5sum,
  ];

  if (persistent) {
    fields.push(persistentField);
  }

  return serializeStringFields(fields);
}

export function createServiceServerHeader(callerId: string, md5sum: string, type: string): Buffer {
  const fields = [
    callerIdPrefix + callerId,
    md5Prefix + md5sum,
    typePrefix + type
  ];
  return serializeStringFields(fields);
}

type TcpRosHeader = {
  topic?: string;
  callerId?: string;
  service?: string;
  md5sum?: string;
  type?: string;
  latching?: string;
  persistent?: string;
  tcp_nodelay?: string;
  message_definition?: string;
  [key: string]: any;
}
type ValidationResult = Buffer|null;

export function parseTcpRosHeader(header: Buffer) {
  let info: TcpRosHeader = {};

  const fields = deserializeStringFields(header);
  for (const field of fields) {
    let matchResult = field.match(/^(\w+)=([\s\S]+)/);

    // invalid connection header
    if (!matchResult) {
      console.error('Invalid connection header while parsing field %s', field);
      return null;
    }
    // else
    info[matchResult[1]] = matchResult[2];
  }

  return info;
}

export function validateSubHeader(header: TcpRosHeader, topic: string, type: string, md5sum: string): ValidationResult {
  if (!header.hasOwnProperty('topic')) {
    return serializeString('Connection header missing expected field [topic]');
  }
  else if (!header.hasOwnProperty('type')) {
    return serializeString('Connection header missing expected field [type]');
  }
  else if (!header.hasOwnProperty('md5sum')) {
    return serializeString('Connection header missing expected field [md5sum]');
  }
  else if (header.topic !== topic) {
    return serializeString('Got incorrect topic [' + header.topic + '] expected [' + topic + ']');
  }
  // rostopic will send '*' for some commands (hz)
  else if (header.type !== type && header.type !== '*') {
    return serializeString('Got incorrect message type [' + header.type + '] expected [' + type + ']');
  }
  else if (header.md5sum !== md5sum && header.md5sum !== '*') {
    return serializeString('Got incorrect md5sum [' + header.md5sum + '] expected [' + md5sum + ']');
  }
  // else
  return null;
}

export function validatePubHeader(header: TcpRosHeader, type: string, md5sum: string): ValidationResult {
  if (!header.hasOwnProperty('type')) {
    return serializeString('Connection header missing expected field [type]');
  }
  else if (!header.hasOwnProperty('md5sum')) {
    return serializeString('Connection header missing expected field [md5sum]');
  }
  /* Note that we are not checking the type of the incoming message against the type specified during
     susbscription. If we did, then this would break subscriptions to the `/tf` topic, where messages
     can be either tf/tfMessage (gazebo) or tf2_msgs/TFMessage (everywhere else), even though their md5 and
     type definitions are actually the same. This is in-line with rospy, where the type isn't checked either:
     https://github.com/ros/ros_comm/blob/6292d54dc14395531bffb2e165f3954fb0ef2c34/clients/rospy/src/rospy/impl/tcpros_pubsub.py#L332-L336
  */
  else if (header.md5sum !== md5sum && header.md5sum !== '*') {
    return serializeString('Got incorrect md5sum [' + header.md5sum + '] expected [' + md5sum + ']');
  }
  // else
  return null;
}

export function validateServiceClientHeader(header: TcpRosHeader, service: string, md5sum: string): string|null {
  if (!header.hasOwnProperty('service')) {
    return 'Connection header missing expected field [service]';
  }
  else if (!header.hasOwnProperty('md5sum')) {
    return 'Connection header missing expected field [md5sum]';
  }
  else if (header.service !== service) {
    return 'Got incorrect service [' + header.service + '] expected [' + service + ']';
  }
  else if (header.md5sum !== md5sum && header.md5sum !== '*') {
    return 'Got incorrect md5sum [' + header.md5sum + '] expected [' + md5sum + ']';
  }
}

export function serializeMessage<T>(MessageClass: MessageConstructor<T>, message: T, prependMessageLength=true): Buffer {
  const msgSize = MessageClass.getMessageSize(message);
  let msgBuffer;
  let offset = 0;
  if (prependMessageLength) {
    msgBuffer = Buffer.allocUnsafe(msgSize + 4);
    offset = base_serializers.uint32(msgSize, msgBuffer, 0);
  }
  else {
    msgBuffer = Buffer.allocUnsafe(msgSize);
  }

  MessageClass.serialize(message, msgBuffer, offset);
  return msgBuffer;
}

export function serializeServiceResponse<T>(ResponseClass: MessageConstructor<T>, response: T, success: boolean, prependResponseInfo=true): Buffer {
  let responseBuffer;
  if (prependResponseInfo) {
    if (success) {
      const respSize = ResponseClass.getMessageSize(response);
      responseBuffer = Buffer.allocUnsafe(respSize + 5);

      // add the success byte
      base_serializers.uint8(1, responseBuffer, 0);
      // add the message length
      base_serializers.uint32(respSize, responseBuffer, 1);
      ResponseClass.serialize(response, responseBuffer, 5);
    }
    else {
      const errorMessage = 'Unable to handle service call';
      const errLen = errorMessage.length;
      // FIXME: check that we don't need the extra 4 byte message len here
      responseBuffer = Buffer.allocUnsafe(5 + errLen);
      base_serializers.uint8(0, responseBuffer, 0);
      base_serializers.string(errorMessage, responseBuffer, 1);
    }
  }
  else {
    responseBuffer = Buffer.allocUnsafe(ResponseClass.getMessageSize(response));
  }

  return responseBuffer;
}

export function deserializeMessage<T>(MessageClass: MessageConstructor<T>, messageBuffer: Buffer): T {
  return MessageClass.deserialize(messageBuffer, [0]);
}

export function createTcpRosError(str: string): Buffer {
  return serializeString(`{errorPrefix}${str}`);
}
