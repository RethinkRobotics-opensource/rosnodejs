import Serialize from '../../ros_msg_utils/lib/base_serialize';
import Deserialize from '../../ros_msg_utils/lib/base_deserialize';
import * as BN from 'bn.js';

/* map of all primitive types and their default values */
var map: { [key: string]: any } = {
  'char': 0,
  'byte': 0,
  'bool': false,
  'int8': 0,
  'uint8': 0,
  'int16': 0,
  'uint16': 0,
  'int32': 0,
  'uint32': 0,
  'int64': 0,
  'uint64': 0,
  'float32': 0,
  'float64': 0,
  'string': '',
  'time': {secs: 0, nsecs: 0},
  'duration': {secs: 0, nsecs: 0}
};

export const primitiveTypes = Object.keys(map);

export function getDefaultValue(type: string): any {
  let match = type.match(/(.*)\[(\d*)\]/);
  if (match) {
    // it's an array
    const basetype = match[1];
    const length = (match[2].length > 0 ? parseInt(match[2]) : 0);
    return new Array(length).fill(getDefaultValue(basetype));
  } else {
    return map[type];
  }
};

export function isString(type: string): boolean {
  return type === 'string';
}

export function isTime(type: string): boolean {
  return type === 'time' || type === 'duration';
}

export function isBool(type: string): boolean {
  return type === 'bool';
}

export function isFloat(type: string): boolean {
  return type === 'float32' || type === 'float64';
}

export function isInteger(type: string): boolean {
  return (['byte', 'char', 'int8', 'uint8', 'int16', 'uint16',
           'int32', 'uint32', 'int64', 'uint64'].indexOf('type') >= 0);
}

export function isPrimitive(fieldType: string): boolean {
  return (primitiveTypes.indexOf(fieldType) >= 0);
};

var isArrayRegex = /\[(\d*)\]$/;
export function isArray(fieldType: string, details?: any): boolean {
  var match = fieldType.match(isArrayRegex);
  if (match) {
    if (match[1] && details) {
      details.length = match[1];
    }
    return true;
  } else {
    return false;
  }
};

export function isMessage(fieldType: string): boolean {
  return !this.isPrimitive(fieldType) && !this.isArray(fieldType);
};

export function getTypeOfArray(arrayType: string): string {
  return this.isArray(arrayType) ? arrayType.split('[')[0] : '';
}

export function getLengthOfArray(arrayType: string): number|null {
  var match = arrayType.match(/.*\[(\d*)\]$/);
  if (match[1] === '') {
    return null;
  }
  return parseInt(match[1]);
}

function parseType(msgType: string, field: Field): void {
  if (!msgType) {
    throw new Error(`Invalid empty type ${JSON.stringify(field)}`);
  }
  // else
  if (isArray(msgType)) {
    field.isArray = true;
    const constantLength = !msgType.endsWith('[]');
    const splits = msgType.split('[');
    if (splits.length > 2) {
      throw new Error(`Only support 1-dimensional array types: ${msgType}`);
    }
    field.baseType = splits[0];
    if (constantLength) {
      field.arrayLen = getLengthOfArray(msgType);
    }
    else {
      field.arrayLen = null;
    }
  }
  else {
    field.baseType= msgType;
    field.isArray = false;
    field.arrayLen = null;
  }
}

function isHeader(type: string): boolean {
  return (['Header', 'std_msgs/Header', 'roslib/Header'].indexOf(type) >= 0);
}

export class Field{
  name: string;
  type: string;
  isHeader: boolean;
  isBuiltin: boolean;
  isArray: boolean = false;
  baseType: string = '';
  arrayLen: number|null;

  constructor(name: string, type: string) {
    this.name = name;
    this.type = type;
    parseType(type, this);
    this.isHeader = isHeader(type);
    this.isBuiltin = isPrimitive(this.baseType);
  }

  getPackage(): string|null {
    if (this.isBuiltin) {
      return null;
    }
    return this.baseType.split('/')[0];
  }

  getMessage(): string|null {
    if (this.isBuiltin) {
      return null;
    }
    return this.baseType.split('/')[1];
  }

  static isHeader(type: string): boolean {
    return isHeader(type);
  }

  static isBuiltin(type: string): boolean {
    return isPrimitive(type);
  }
}

export function parsePrimitive(fieldType: string, fieldValue: any): any {
  let parsedValue: any = fieldValue;

  if (fieldType === 'bool') {
    parsedValue = (fieldValue === '1')
  }
  else if (fieldType === 'int8' || fieldType === 'byte') {
    parsedValue = parseInt(fieldValue);
  }
  else if (fieldType === 'uint8' || fieldType === 'char') {
    parsedValue = parseInt(fieldValue);
    parsedValue = Math.abs(parsedValue);
  }
  else if (fieldType === 'int16') {
    parsedValue = parseInt(fieldValue);
  }
  else if (fieldType === 'uint16') {
    parsedValue = parseInt(fieldValue);
    parsedValue = Math.abs(parsedValue);
  }
  else if (fieldType === 'int32') {
    parsedValue = parseInt(fieldValue);
  }
  else if (fieldType === 'uint32') {
    parsedValue = parseInt(fieldValue);
    parsedValue = Math.abs(parsedValue);
  }
  else if (fieldType === 'int64') {
    parsedValue = new BN(fieldValue);
  }
  else if (fieldType === 'uint64') {
    parsedValue = new BN(fieldValue);
  }
  else if (fieldType === 'float32') {
    parsedValue = parseFloat(fieldValue);
  }
  else if (fieldType === 'float64') {
    parsedValue = parseFloat(fieldValue);
  }
  else if (fieldType === 'time') {
    let now: number;
    if (fieldValue.secs && fieldValue.nsecs) {
      parsedValue.secs = fieldValue.secs;
      parsedValue.nsecs = fieldValue.nsecs;
    } else {
      if (fieldValue instanceof Date) {
        now = fieldValue.getTime();
      } else if (typeof fieldValue == "number") {
        now = fieldValue;
      } else {
        now = Date.now();
      }
      let secs = now/1000;
      let nsecs = (now % 1000) * 1000;

      parsedValue.secs = secs;
      parsedValue.nsecs = nsecs;
    }
  }

  return parsedValue;
};

export function serializePrimitive<T = any>(
  fieldType: string,
  fieldValue: T,
  buffer: Buffer,
  bufferOffset: number)
{
  if (fieldType === 'Array') {
    throw new Error();
  }
  const serializer = (Serialize as any)[fieldType];
  if (!serializer) {
    throw new Error(`Unable to get primitive serializer for field type ${fieldType}`);
  }
  // else
  return serializer(fieldValue, buffer, bufferOffset);
}

export function deserializePrimitive(fieldType: string, buffer: Buffer, bufferOffset: number[]): any {
  const deserializer = (Deserialize as any)[fieldType];
  if (!deserializer) {
    throw new Error(`Unable to get primitive deserializer for field type ${fieldType}`);
  }
  // else

  return deserializer(buffer, bufferOffset);
};

export function getPrimitiveSize(fieldType: string, fieldValue?: any): number {
  var fieldSize = 0;

  if (fieldType === 'char') {
    fieldSize = 1;
  }
  else if (fieldType === 'byte') {
    fieldSize = 1;
  }
  else if (fieldType === 'bool') {
    fieldSize = 1;
  }
  else if (fieldType === 'int8') {
    fieldSize = 1;
  }
  else if (fieldType === 'uint8') {
    fieldSize = 1;
  }
  else if (fieldType === 'int16') {
    fieldSize = 2;
  }
  else if (fieldType === 'uint16') {
    fieldSize = 2;
  }
  else if (fieldType === 'int32') {
    fieldSize = 4;
  }
  else if (fieldType === 'uint32') {
    fieldSize = 4;
  }
  else if (fieldType === 'int64') {
    fieldSize = 8;
  }
  else if (fieldType === 'uint64') {
    fieldSize = 8;
  }
  else if (fieldType === 'float32') {
    fieldSize = 4;
  }
  else if (fieldType === 'float64') {
    fieldSize = 8;
  }
  else if (fieldType === 'string') {
    if (fieldValue !== undefined) {
      fieldSize = Buffer.byteLength(fieldValue, 'utf8') + 4;
    }
  }
  else if (fieldType === 'time') {
    fieldSize = 8;
  }
  else if (fieldType === 'duration') {
    fieldSize = 8;
  }

  return fieldSize;
}

export function getArraySize(field: Field, array: any[], msgSpec: any) {
  var arraySize = 0;

  //  if this is a variable length array it has a 4 byte length field at the beginning
  if (field.arrayLen === null) {
    arraySize = 4;
  }

  array.forEach(function(value) {
    if (field.isBuiltin) {
      arraySize += getPrimitiveSize(field.baseType, value);
    }
    else {
      arraySize += getMessageSize(value, msgSpec.getMsgSpecForType(field.baseType));
    }
  });

  return arraySize;
};

export function getMessageSize(message: any, msgSpec: any) {
  var messageSize = 0
    , innerfields      = msgSpec.fields
    ;

  innerfields.forEach(function(field: Field) {
    var fieldValue = message[field.name];
    if (field.isArray) {
      messageSize += getArraySize(field, fieldValue, msgSpec);
    }
    else if (field.isBuiltin) {
      messageSize += getPrimitiveSize(field.type, fieldValue);
    }
    else { // it's a message
      messageSize += getMessageSize(fieldValue, msgSpec.getMsgSpecForType(field.baseType));
    }
  });

  return messageSize;
};

export function getMessageNameFromMessageType(messageType: string): string {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[1]
    : messageType;
}

export function getPackageNameFromMessageType(messageType: string): string {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[0]
    : '';
}

export function splitMessageType(messageType: string): string[] {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')
                                         : ['', messageType];
}
