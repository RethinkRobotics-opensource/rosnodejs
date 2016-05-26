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

let SerializationUtils = require('./serialization_utils.js');
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
let persistentPrefix = 'persistent=';

//-----------------------------------------------------------------------

let TcprosUtils = {

  createSubHeader(callerId, md5sum, topic, type) {
    let caller = String(callerIdPrefix + callerId);
    let md5 = String(md5Prefix + md5sum);
    let topi = String(topicPrefix + topic);
    let typ = String(typePrefix + type);
    let buffer = Buffer.concat([caller.serialize(), md5.serialize(), topi.serialize(), typ.serialize()]);
    return Serialize(buffer);
  },

  createPubHeader(callerId, md5sum, type, latching) {
    let caller = String(callerIdPrefix + callerId);
    let md5 = String(md5Prefix + md5sum);
    let typ = String(typePrefix + type);
    let latch = String(latchingPrefix + latching);
    let buffer = Buffer.concat([caller.serialize(), md5.serialize(), typ.serialize(), latch.serialize()]);
    return Serialize(buffer);
  },

  createServiceClientHeader(callerId, service, md5sum, type, persistent) {
    let caller = String(callerIdPrefix + callerId);
    let servic = String(servicePrefix + service);
    let md5 = String(md5Prefix + md5sum);
    let buffers = [caller.serialize(), md5.serialize(), servic.serialize()];
    if (persistent) {
      buffers.push(String(persistentPrefix + '1').serialize());
    }
    let buffer = Buffer.concat(buffers);
    return Serialize(buffer);
  },

  createServiceServerHeader(callerId, md5sum, type) {
    let caller = String(callerIdPrefix + callerId);
    let md5 = String(md5Prefix + md5sum);
    let typ = String(typePrefix + type);
    let buffer = Buffer.concat([caller.serialize(), md5.serialize(), typ.serialize()]);
    return Serialize(buffer);
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
        console.error('Invalid connection header while parsing field %s', field);
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
  }
};

//-----------------------------------------------------------------------

module.exports = TcprosUtils;
