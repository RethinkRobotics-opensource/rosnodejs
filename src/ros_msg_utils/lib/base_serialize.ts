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

import * as BN from 'bn.js';
import { getByteLength, RosTime } from './encoding_utils.js';
import * as Buffer from 'buffer';

/*-----------------------------------------------------------------------------
 * Primitive Serialization Functions
 *
 * Each primitive type serialization function has an identical signature
 *
 * @param value {*} value to serialize as determined by function name
 * @param buffer {Buffer} buffer to serialize value into
 * @param bufferOffset {Number} offset from buffer start to store value
 * @returns {Number} new buffer offset after serializing value
 * SerializeFunc(value, buffer, bufferOffset)
 *-----------------------------------------------------------------------------*/

function StringSerializer(value: string, buffer: Buffer, bufferOffset: number): number {
  let len = getByteLength(value);
  bufferOffset = buffer.writeUInt32LE(len, bufferOffset);
  return bufferOffset + buffer.write(value, bufferOffset, len, 'utf8');
}

function UInt8Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeUInt8(value, bufferOffset);
}

function UInt16Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeUInt16LE(value, bufferOffset);
}

function UInt32Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeUInt32LE(value, bufferOffset);
}

function UInt64Serializer(value: number|BN, buffer: Buffer, bufferOffset: number): number {
  if (!BN.isBN(value)) {
    value = new BN(value);
  }

  const buf = value.toBuffer('le', 8);
  buffer.set(buf, bufferOffset);

  return bufferOffset + 8;
}

function Int8Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeInt8(value, bufferOffset);
}

function Int16Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeInt16LE(value, bufferOffset);
}

function Int32Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeInt32LE(value, bufferOffset);
}

function Int64Serializer(value: number|BN, buffer: Buffer, bufferOffset: number): number {
  if (!BN.isBN(value)) {
    value = new BN(value, 'le');
  }

  value = value.toTwos(64);

  const buf = value.toBuffer('le', 8);
  buffer.set(buf, bufferOffset);

  return bufferOffset + 8;
}

function Float32Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeFloatLE(value, bufferOffset);
}

function Float64Serializer(value: number, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeDoubleLE(value, bufferOffset);
}

function TimeSerializer(value: RosTime, buffer: Buffer, bufferOffset: number): number {
  bufferOffset = buffer.writeInt32LE(value.secs, bufferOffset);
  return buffer.writeInt32LE(value.nsecs, bufferOffset);
}

function BoolSerializer(value: boolean, buffer: Buffer, bufferOffset: number): number {
  return buffer.writeInt8(value ? 1 : 0, bufferOffset);
}

/*-----------------------------------------------------------------------------
 * Primitive Array Serialization Functions
 *
 * Each primitive type array serialization function has an identical signature
 *
 * @param value {*} value to serialize as determined by function name
 * @param buffer {Buffer} buffer to serialize value into
 * @param bufferOffset {Number} offset from buffer start to store value
 * @param [specArrayLen] {Number|null} array length desired by message specification
 *        a negative number or null means to serialize a variable length array into the buffer
 *        a positive number means to serialize a constant length array from the buffer
 * @returns {Number} new buffer offset after serializing value
 * SerializeFunc(value, buffer, bufferOffset, specArrayLen)
 *-----------------------------------------------------------------------------*/

export type SerializeT<T = any> = (data: T, buffer: Buffer, offset: number) => number;

/**
 * Template for most primitive array serializers which are bound to this function and provide
 * the serializeFunc param
 * @param serializeFunc {function} function to serialize a single instance of the type. Typically hidden
 *   from users by binding.
 * @param array {Array} array of values of the desired type
 * @param buffer {Buffer} buffer to serialize data into
 * @param bufferOffset {Array.number}
 * @param specArrayLen {null|number}
 * @returns {Number} buffer offset
 * @constructor
 */
function DefaultArraySerializer<T = any>(serializeFunc: SerializeT<T>, array: T[], buffer: Buffer, bufferOffset: number, specArrayLen: number|null=null): number {
  const arrLen = array.length;

  if (specArrayLen === null || specArrayLen < 0) {
    bufferOffset = buffer.writeUInt32LE(arrLen, bufferOffset);
  }

  for (let i = 0; i < arrLen; ++i) {
    bufferOffset = serializeFunc(array[i], buffer, bufferOffset);
  }

  return bufferOffset;
}

/**
 * Specialized array serialization for UInt8 Arrays
 */
function UInt8ArraySerializer(array: number[], buffer: Buffer, bufferOffset: number, specArrayLen:number|null=null): number {
  const arrLen = array.length;

  if (specArrayLen === null || specArrayLen < 0) {
    bufferOffset = buffer.writeUInt32LE(arrLen, bufferOffset);
  }

  buffer.set(array, bufferOffset);
  return bufferOffset + arrLen;
}

//-----------------------------------------------------------------------------

const PrimitiveSerializers = {
  string: StringSerializer,
  float32: Float32Serializer,
  float64: Float64Serializer,
  bool: BoolSerializer,
  int8: Int8Serializer,
  int16: Int16Serializer,
  int32: Int32Serializer,
  int64: Int64Serializer,
  uint8: UInt8Serializer,
  uint16: UInt16Serializer,
  uint32: UInt32Serializer,
  uint64: UInt64Serializer,
  char: UInt8Serializer,
  byte: Int8Serializer,
  time: TimeSerializer,
  duration: TimeSerializer
};

const ArraySerializers = {
  string: DefaultArraySerializer.bind(null, StringSerializer),
  float32: DefaultArraySerializer.bind(null, Float32Serializer),
  float64: DefaultArraySerializer.bind(null, Float64Serializer),
  bool: DefaultArraySerializer.bind(null, BoolSerializer),
  int8: DefaultArraySerializer.bind(null, Int8Serializer),
  int16: DefaultArraySerializer.bind(null, Int16Serializer),
  int32: DefaultArraySerializer.bind(null, Int32Serializer),
  int64: DefaultArraySerializer.bind(null, Int64Serializer),
  uint8: UInt8ArraySerializer,
  uint16: DefaultArraySerializer.bind(null, UInt16Serializer),
  uint32: DefaultArraySerializer.bind(null, UInt32Serializer),
  uint64: DefaultArraySerializer.bind(null, UInt64Serializer),
  char: UInt8ArraySerializer,
  byte: DefaultArraySerializer.bind(null, Int8Serializer),
  time: DefaultArraySerializer.bind(null, TimeSerializer),
  duration: DefaultArraySerializer.bind(null, TimeSerializer)
};

//-----------------------------------------------------------------------------
export const Serialize: typeof PrimitiveSerializers & { Array: typeof ArraySerializers } =
  Object.assign({}, PrimitiveSerializers, { Array: ArraySerializers });
