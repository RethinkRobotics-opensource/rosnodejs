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

const ros_msg_utils = require('ros_msg_utils');
const base_serializers = ros_msg_utils.Serialize;
const SerializationUtils = require('./serialization_utils.js');
let PrependLength = SerializationUtils.PrependLength;
let Serialize = SerializationUtils.Serialize;
let Deserialize = SerializationUtils.Deserialize;
String = require('./std_msgs/String.js');

//-----------------------------------------------------------------------

let callerIdPrefix = 'callerid=';
let md5Prefix = 'md5sum=';
let topicPrefix = 'topic=';
let servicePrefix = 'service=';
let typePrefix = 'type=';
let latchingPrefix = 'latching=';

//-----------------------------------------------------------------------

function serializeStringFields(fields) {
  let length = 0;
  fields.forEach((field) => {
    length += (field.length + 4);
  });
  let buffer = new Buffer(4 + length);
  let offset = base_serializers.uint32(length, buffer, 0);

  fields.forEach((field) => {
    offset = base_serializers.string(field, buffer, offset);
  });
  return buffer;
}

//-----------------------------------------------------------------------

let TcprosUtils = {

  createSubHeader(callerId, md5sum, topic, type) {
    let fields = [
      callerIdPrefix + callerId,
      md5Prefix + md5sum,
      topicPrefix + topic,
      typePrefix + type
    ];
    return serializeStringFields(fields);
  },

  createPubHeader(callerId, md5sum, type, latching) {
    let fields = [
      callerIdPrefix + callerId,
      md5Prefix + md5sum,
      typePrefix + type,
      latchingPrefix + latching
    ];
    return serializeStringFields(fields);
  },

  createServiceClientHeader(callerId, service, md5sum, type) {
    let fields = [
      callerIdPrefix + callerId,
      servicePrefix + service,
      md5Prefix + md5sum
    ];
    return serializeStringFields(fields);
  },

  createServiceServerHeader(callerId, md5sum, type) {
    let fields = [
      callerIdPrefix + callerId,
      md5Prefix + md5sum,
      typePrefix + type
    ];
    return serializeStringFields(fields);
  },

  parseTcpRosHeader(header) {
    let info = {};
    while (header.length !== 0) {
      let item = String.deserialize(header);
      let field = item.data;
      header = item.buffer;
      let matchResult = field.match(/^(\w+)=(.+)/m);
      // invalid connection header
      if (!matchResult) {
        console.error('Invalid connection header!');
        return null;
      }
      // else
      info[matchResult[1]] = matchResult[2];
    }
    return info;
  },

  parseSubHeader(header) {
    let i = 0;
    let info = {};
    while ( header.length !== 0 ) {
      let item = String.deserialize(header);
      let field = item.data;
      header = item.buffer;
      if (field.startsWith(md5Prefix)) {
        info.md5sum = field.substr(md5Prefix.length);
      }
      else if (field.startsWith(topicPrefix)) {
        info.topic = field.substr(topicPrefix.length);
      }
      else if (field.startsWith(callerIdPrefix)) {
        info.callerId = field.substr(callerIdPrefix.length);
      }
      else if (field.startsWith(typePrefix)) {
        info.type = field.substr(typePrefix.length);
      }
      ++i;
    }
    return info;
  },

  parsePubHeader(header) {
    let i = 0;
    let info = {};
    while ( header.length !== 0 ) {
      let item = String.deserialize(header);
      let field = item.data;
      header = item.buffer;
      if (field.startsWith(md5Prefix)) {
        info.md5sum = field.substr(md5Prefix.length);
      }
      else if (field.startsWith(latchingPrefix)) {
        info.latching = field.substr(latchingPrefix.length);
      }
      else if (field.startsWith(callerIdPrefix)) {
        info.callerId = field.substr(callerIdPrefix.length);
      }
      else if (field.startsWith(typePrefix)) {
        info.type = field.substr(typePrefix.length);
      }
      ++i;
    }
    return info;
  },

  parseServiceClientHeader(header) {
    let i = 0;
    let info = {};
    while ( header.length !== 0 ) {
      let item = String.deserialize(header);
      let field = item.data;
      header = item.buffer;
      if (field.startsWith(md5Prefix)) {
        info.md5sum = field.substr(md5Prefix.length);
      }
      else if (field.startsWith(servicePrefix)) {
        info.service = field.substr(servicePrefix.length);
      }
      else if (field.startsWith(callerIdPrefix)) {
        info.callerId = field.substr(callerIdPrefix.length);
      }
      else if (field.startsWith(typePrefix)) {
        info.type = field.substr(typePrefix.length);
      }
      ++i;
    }
    return info;
  },

  parseServiceServerHeader(header) {
    let i = 0;
    let info = {};
    while ( header.length !== 0 ) {
      let item = String.deserialize(header);
      let field = item.data;
      header = item.buffer;
      if (field.startsWith(md5Prefix)) {
        info.md5sum = field.substr(md5Prefix.length);
      }
      else if (field.startsWith(callerIdPrefix)) {
        info.callerId = field.substr(callerIdPrefix.length);
      }
      else if (field.startsWith(typePrefix)) {
        info.type = field.substr(typePrefix.length);
      }
      ++i;
    }
    return info;
  },

  validateSubHeader(header, topic, type, md5sum) {
    if (!header.hasOwnProperty('topic')) {
      return String('Connection header missing expected field [topic]').serialize();
    }
    else if (!header.hasOwnProperty('type')) {
      return String('Connection header missing expected field [type]').serialize();
    }
    else if (!header.hasOwnProperty('md5sum')) {
      return String('Connection header missing expected field [md5sum]').serialize();
    }
    else if (header.topic !== topic) {
      return String('Got incorrect topic [' + header.topic + '] expected [' + topic + ']').serialize();
    }
    // rostopic will send '*' for some commands (hz)
    else if (header.type !== type && header.type !== '*') {
      return String('Got incorrect message type [' + header.type + '] expected [' + type + ']').serialize();
    }
    else if (header.md5sum !== md5sum && header.md5sum !== '*') {
      return String('Got incorrect md5sum [' + header.md5sum + '] expected [' + md5sum + ']').serialize();
    }
    // else
    return null;
  },

  serializeMessage(MessageClass, message, prependMessageLength) {
    if (prependMessageLength === undefined) {
      prependMessageLength = true;
    }

    const msgSize = MessageClass.getMessageSize(message);
    let msgBuffer;
    let offset = 0;
    if (prependMessageLength) {
      msgBuffer = new Buffer(msgSize + 4);
      base_serializers.uint32(msgSize, msgBuffer, 0);
      offset = 4;
    }
    else {
      msgBuffer = new Buffer(msgSize);
    }

    MessageClass.serialize(message, msgBuffer, offset);

    return msgBuffer;
  },

  serializeServiceResponse(ResponseClass, response, success, prependResponseInfo) {
    let responseBuffer;
    if (prependResponseInfo || prependResponseInfo === undefined) {

      if (success) {
        const respSize = ResponseClass.getMessageSize(response);
        responseBuffer = new Buffer(respSize + 5);

        base_serializers.uint8(1, responseBuffer, 0)
        base_serializers.uint32(respSize, responseBuffer, 1);
        ResponseClass.serialize(response, responseBuffer, 5);
      }
      else {
        const errorMessage = 'Unable to handle service call';
        const errLen = errorMessage.length;
        // FIXME: check that we don't need the extra 4 byte str len here
        responseBuffer = new Buffer(5 + errLen);
        base_serializers.uint8(0, responseBuffer, 0);
        base_serializers.string(errorMessage, responseBuffer, 1);
      }
    }
    else {
      responseBuffer = new Buffer(ResponseClass.getMessageSize(response));
    }

    return responseBuffer;
  },

  deserializeMessage(MessageClass, messageBuffer) {
    return MessageClass.deserialize(messageBuffer, [0]);
  }
};

//-----------------------------------------------------------------------

module.exports = TcprosUtils;
