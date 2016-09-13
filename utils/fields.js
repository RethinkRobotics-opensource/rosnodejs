'use strict';

var fields = exports;

// Try to require bignum package. If available use it for int64 values.
var bignum;
try {
  bignum = require('bignum');
} catch (e) {}

var BIGNUM_WARNING = `\n** (rosnodejs) WARNING: Using int64 messages without the \
bignum package is not recommended. You seem to be dealing with numbers larger \
than 1e15 so precision will be lost!\n`;


/* map of all primitive types and their default values */
var map = {
  'char': '',
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
  'time': 0,
  'duration': 0
};

fields.primitiveTypes = Object.keys(map);

fields.getDefaultValue = function(type) {
  let match = type.match(/(.*)\[(\d*)\]/);
  if (match) {
    // it's an array
    const basetype = match[1];
    const length = (match[2].length > 0 ? parseInt(match[2]) : 0);
    return new Array(length).fill(fields.getDefaultValue(basetype));
  } else {
    return map[type];
  }
};

fields.isPrimitive = function(fieldType) {
  return (fields.primitiveTypes.indexOf(fieldType) >= 0);
};

var isArrayRegex = /\[*\]$/;
fields.isArray = function(fieldType) {
  return (fieldType.match(isArrayRegex) !== null);
};

fields.isMessage = function(fieldType) {
  return !this.isPrimitive(fieldType) && !this.isArray(fieldType);
};

fields.getTypeOfArray = function(arrayType) {
  return this.isArray(arrayType) ? arrayType.split('[')[0]
                                 : false;
}

fields.parsePrimitive = function(fieldType, fieldValue) {
  var parsedValue = fieldValue;

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
    if (bignum) {
      parsedValue = bignum(fieldValue);
    } else {
      parsedValue = parseInt(fieldValue);
    }
  }
  else if (fieldType === 'uint64') {
    if (bignum) {
      parsedValue = bignum(fieldValue);
      parsedValue = parsedValue.abs();
    } else {
      parsedValue = parseInt(fieldValue);
      parsedValue = Math.abs(parsedValue);
    }
  }
  else if (fieldType === 'float32') {
    parsedValue = parseFloat(fieldValue);
  }
  else if (fieldType === 'float64') {
    parsedValue = parseFloat(fieldValue);
  }
  else if (fieldType === 'time') {
    var now;
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
      var secs = parseInt(now/1000);
      var nsecs = (now % 1000) * 1000;

      parsedValue.secs = secs;
      parsedValue.nsecs = nsecs;
    }
  }

  return parsedValue;
};

fields.serializePrimitive =
  function(fieldType, fieldValue, buffer, bufferOffset) {
    if (fieldType === 'bool') {
      buffer.writeUInt8(fieldValue, bufferOffset);
    }
    else if (fieldType === 'int8' || fieldType === 'byte') {
      buffer.writeInt8(fieldValue, bufferOffset);
    }
    else if (fieldType === 'uint8' || fieldType === 'char') {
      buffer.writeUInt8(fieldValue, bufferOffset);
    }
    else if (fieldType === 'int16') {
      buffer.writeInt16LE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'uint16') {
      buffer.writeUInt16LE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'int32') {
      buffer.writeInt32LE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'uint32') {
      buffer.writeUInt32LE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'int64') {
      if (bignum) {
        if (!bignum.isBigNum(fieldValue)) {
          fieldValue = bignum(fieldValue);
        }
        var buf = fieldValue.toBuffer({
            endian: "little",
            size: 8
          });
        buf.copy(buffer, bufferOffset);
      } else {
        var high = Math.trunc(fieldValue / 0x100000000);
        var low = fieldValue % 0x100000000;
        if (fieldValue < 0) {
          // constructing two's complement representation
          // fieldValue = 0x10000000000000000 + fieldValue;
          // ^ doesn't work, because JS precision is only 53 bits
          // we'll need to work directly on the parts:
          // both high and low are negative
          high = 0x100000000 + high;
          if (low != 0) {
            high -= 1;
          }
          low = 0x100000000 + low;
        }
        // yes, UInt, we've already constructed the two's complement
        buffer.writeUInt32LE(low, bufferOffset);
        buffer.writeUInt32LE(high, bufferOffset+4);
        if (fieldValue >= 1e15) {
          console.warn(BIGNUM_WARNING);
        }
      }
    }
    else if (fieldType === 'uint64') {
      if (bignum) {
        if (!bignum.isBigNum(fieldValue)) {
          fieldValue = bignum(fieldValue);
        }
        var high = fieldValue.div(0x100000000).toNumber();
        var low = fieldValue.mod(0x100000000).toNumber();
        buffer.writeUInt32LE(low, bufferOffset);
        buffer.writeUInt32LE(high, bufferOffset+4);
      } else {
        var high = Math.trunc(fieldValue / 0x100000000);
        var low = fieldValue % 0x100000000;
        buffer.writeUInt32LE(low, bufferOffset);
        buffer.writeUInt32LE(high, bufferOffset+4);
        if (fieldValue >= 1e15) {
          console.warn(BIGNUM_WARNING);
        }
      }
    }
    else if (fieldType === 'float32') {
      buffer.writeFloatLE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'float64') {
      buffer.writeDoubleLE(fieldValue, bufferOffset);
    }
    else if (fieldType === 'string') {
      buffer.writeUInt32LE(fieldValue.length, bufferOffset);
      bufferOffset += 4;
      buffer.write(fieldValue, bufferOffset, 'ascii');
    }
    else if (fieldType === 'time') {
      buffer.writeUInt32LE(fieldValue.secs, bufferOffset);
      buffer.writeUInt32LE(fieldValue.nsecs, bufferOffset+4);
    }

  }

fields.deserializePrimitive = function(fieldType, buffer, bufferOffset) {
  var fieldValue = null;

  if (fieldType === 'bool') {
    fieldValue = buffer.readUInt8(bufferOffset);
  }
  else if (fieldType === 'int8') {
    fieldValue = buffer.readInt8(bufferOffset);
  }
  else if (fieldType === 'uint8') {
    fieldValue = buffer.readUInt8(bufferOffset);
  }
  else if (fieldType === 'int16') {
    fieldValue = buffer.readInt16LE(bufferOffset);
  }
  else if (fieldType === 'uint16') {
    fieldValue = buffer.readUInt16LE(bufferOffset);
  }
  else if (fieldType === 'int32') {
    fieldValue = buffer.readInt32LE(bufferOffset);
  }
  else if (fieldType === 'uint32') {
    fieldValue = buffer.readUInt32LE(bufferOffset);
  }
  else if (fieldType === 'int64') {
    if (bignum) {
      // using bignum package
      var buf = new Buffer(8);
      buffer.copy(buf, 0, bufferOffset, bufferOffset+8);
      fieldValue = bignum.fromBuffer(buf, {
          endian: "little",
          size: 8
        });
    } else {
      // no luck, returning an inaccurate 53bit js number
      var low = buffer.readUInt32LE(bufferOffset);
      var high = buffer.readUInt32LE(bufferOffset+4);
      if (high >= 0x10000000) {
        // the value is negative
        if (low != 0) {
          high += 1;
        }
        high = high - 0x100000000;
        low = low - 0x100000000;
      }
      fieldValue = high * 0x100000000 + low;
      if (fieldValue >= 1e15) {
        console.warn(BIGNUM_WARNING);
      }
    }
  }
  else if (fieldType === 'uint64') {
    if (bignum) {
      var buf = new Buffer(8);
      buffer.copy(buf, 0, bufferOffset, bufferOffset+8);
      fieldValue = bignum.fromBuffer(buf, {
          endian: "little",
          size: 8
        });
    } else {
      var low = buffer.readUInt32LE(bufferOffset);
      var high = buffer.readUInt32LE(bufferOffset+4);
      fieldValue = high * 0x100000000 + low;
      if (fieldValue >= 1e15) {
        console.warn(BIGNUM_WARNING);
      }
    }
  }
  else if (fieldType === 'float32') {
    fieldValue = buffer.readFloatLE(bufferOffset);
  }
  else if (fieldType === 'float64') {
    fieldValue = buffer.readDoubleLE(bufferOffset);
  }
  else if (fieldType === 'string') {
    var fieldLength = buffer.readUInt32LE(bufferOffset)
      , fieldStart  = bufferOffset + 4
      , fieldEnd    = fieldStart + fieldLength
      ;

    fieldValue = buffer.toString('utf8', fieldStart, fieldEnd);
  }

  return fieldValue;
}

fields.getPrimitiveSize = function(fieldType, fieldValue) {
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
      fieldSize = fieldValue.length + 4;
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

fields.getArraySize = function(arrayType, array) {
  var that      = this
    , arraySize = 4
    , type      = fields.getTypeOfArray(arrayType)
    ;

  array.forEach(function(value) {
    if (that.isPrimitive(type)) {
      arraySize += that.getPrimitiveSize(type, value);
    }
    else if (that.isArray(type)) {
      arraySize += that.getArraySize(type, value);
    }
    else if (that.isMessage(type)) {
      arraySize += that.getMessageSize(value);
    }
  });

  return arraySize;
}

fields.getMessageSize = function(message) {
  var that        = this
    , messageSize = 0
    , innerfields      = message.fields
    ;

  innerfields.forEach(function(field) {
    var fieldValue = message[field.name];
    if (that.isPrimitive(field.type)) {
      messageSize += that.getPrimitiveSize(field.type, fieldValue);
    }
    else if (that.isArray(field.type)) {
      messageSize += that.getArraySize(field.type, fieldValue);
    }
    else if (that.isMessage(field.type)) {
      messageSize += that.getMessageSize(fieldValue);
    }
  });

  return messageSize;
}
