var fields = exports;

fields.primitiveTypes = [
  'char'
, 'byte'
, 'bool'
, 'int8'
, 'uint8'
, 'int16'
, 'uint16'
, 'int32'
, 'uint32'
, 'int64'
, 'uint64'
, 'float32'
, 'float64'
, 'string'
, 'time'
, 'duration'
];

fields.isPrimitive = function(fieldType) {
  return (fields.primitiveTypes.indexOf(fieldType) >= 0);
};

var isArrayRegex = /.*\[*\]$/;
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
    throwUnsupportedInt64Exception();
  }
  else if (fieldType === 'uint64') {
    throwUnsupportedInt64Exception();
  }
  else if (fieldType === 'float32') {
    parsedValue = parseFloat(fieldValue);
  }
  else if (fieldType === 'float64') {
    parsedValue = parseFloat(fieldValue);
  }

  return parsedValue;
};

fields.serializePrimitive = function(fieldType, fieldValue, buffer, bufferOffset) {
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
    throwUnsupportedInt64Exception();
  }
  else if (fieldType === 'uint64') {
    throwUnsupportedInt64Exception();
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
    throwUnsupportedInt64Exception();
  }
  else if (fieldType === 'uint64') {
    throwUnsupportedInt64Exception();
  }
  else if (fieldType === 'float32') {
    fieldValue = buffer.readFloatLE(bufferOffset);
  }
  else if (fieldType === 'float64') {
    fieldValue = buffer.readDoubleLE(bufferOffset);
  }
  else if (fieldType === 'string') {
    // console.log("fields string", bufferOffset, buffer.toString("ascii"));
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
    , fields      = message.fields
    ;

  fields.forEach(function(field) {
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

function throwUnsupportedInt64Exception() {
  var error = new Error('int64 and uint64 are currently unsupported field types. See https://github.com/baalexander/rosnodejs/issues/2');
  throw error;
}

