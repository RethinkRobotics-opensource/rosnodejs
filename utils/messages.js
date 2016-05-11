var fs = require('fs');
var path = require('path');
var md5 = require('md5');
var async = require('async');

var packages   = require('./packages')
  , fieldsUtil = require('./fields');

var messages = exports;

var registry = {};

messages.getMessage = function(messageType, callback) {
  this.getMessageFromPackage(messageType, "message", callback);
}

messages.getFromRegistry = function(messageType, type) {
  return getMessageFromRegistry(messageType, type);
}

messages.getServiceRequest = function(messageType, callback) {
  this.getMessageFromPackage(messageType, "request", callback);
}

messages.getServiceResponse = function(messageType, callback) {
  this.getMessageFromPackage(messageType, "response", callback);
}

/* get message or service definition class */
messages.getMessageFromPackage = function(messageType, type, callback) {
  var that = this;

  var packageName = getPackageNameFromMessageType(messageType);
  var messageName = getMessageNameFromMessageType(messageType);
  var message = getMessageFromRegistry(messageType, type);
  if (message) {
    callback(null, message);
  } else {
    packages.findPackage(packageName, function(error, directory) {
      var filePath;
      if (type == "message") {
        filePath = path.join(directory, 'msg', messageName + '.msg');
      } else {
        filePath = path.join(directory, 'srv', messageName + '.srv');
      }
      that.getMessageFromFile(messageType, filePath, type, callback);
    });
  }
};

messages.getMessageFromFile = function(messageType, filePath, type, callback) {
  var message = getMessageFromRegistry(messageType);
  if (message) {
    callback(null, message);
  }
  else {
    var packageName = getPackageNameFromMessageType(messageType)
      , messageName = getMessageNameFromMessageType(messageType);

    var details = {
      messageType : messageType
    , messageName : messageName
    , packageName : packageName
    };

    this.parseMessageFile(filePath, details, type, function(error, details) {
      if (error) {
        callback(error);
      } else {
        message = buildMessageClass(details);
        setMessageInRegistry(messageType, type, message);
        callback(null, message);
      }
    });
  }
};

messages.parseMessageFile = function(fileName, details, type, callback) {
  details = details || {};
  fs.readFile(fileName, 'utf8', function(error, content) {
    if (error) {
      return callback(error);
    }
    else {
      extractFields(content, details, type, function(error, constants, fields) {
        if (error) {
          callback(error);
        }
        else {
          details.constants = constants;
          details.fields    = fields;
          details.md5       = calculateMD5(details);
          // details.md5       = calculateMD5(content);
          callback(null, details);
        }
      });
    }
  })
};

// ---------------------------------------------------------

function calculateMD5(details) {
  var message = '';

  var constants = details.constants.map(function(field) {
    return field.type + ' ' + field.name + '=' + field.value;
  }).join('\n');

  var fields = details.fields.map(function(field) {
    if (field.messageType) {
      return field.messageType.md5 + ' ' + field.name;
    }
    else {
      return field.type + ' ' + field.name;
    }
  }).join('\n');

  message += constants;
  if (message.length > 0 && fields.length > 0) {
    message += "\n";
  }
  message += fields;

  return md5(message);
}

function extractFields(content, details, type, callback) {
  var constants = []
    , fields    = []
    ;

  var parseLine = function(line, callback) {
    line = line.trim();

    var lineEqualIndex   = line.indexOf('=')
      , lineCommentIndex = line.indexOf('#')
      ;
    if (lineEqualIndex === -1
      || lineCommentIndex=== -1
      || lineEqualIndex>= lineCommentIndex)
    {
      line = line.replace(/#.*/, '');
    }

    if (line === '') {
      callback();
    }
    else {
      var firstSpace = line.indexOf(' ')
        , fieldType  = line.substring(0, firstSpace)
        , field      = line.substring(firstSpace + 1)
        , equalIndex = field.indexOf('=')
        , fieldName  = field.trim()
        ;

      if (equalIndex !== -1) {
        fieldName = field.substring(0, equalIndex).trim();
        var constant = field.substring(equalIndex + 1, field.length).trim();
        var parsedConstant = fieldsUtil.parsePrimitive(fieldType, constant);

        constants.push({
          name        : fieldName
        , type        : fieldType
        , value       : parsedConstant
        , index       : fields.length
        , messageType : null
        });
        callback();
      }
      else {
        if (fieldsUtil.isPrimitive(fieldType)) {
          fields.push({
            name        : fieldName.trim()
          , type        : fieldType
          , index       : fields.length
          , messageType : null
          });
          callback();
        }
        else if (fieldsUtil.isArray(fieldType)) {
          var arrayType = fieldsUtil.getTypeOfArray(fieldType);
          if (fieldsUtil.isMessage(arrayType)) {
            fieldType = normalizeMessageType(fieldType, details.packageName);
            arrayType = normalizeMessageType(arrayType, details.packageName);
            messages.getMessage(arrayType, function(error, messageType) {
              fields.push({
                name        : fieldName.trim()
              , type        : fieldType
              , index       : fields.length
              , messageType : messageType
              });
              callback();
            });
          }
          else {
            fields.push({
              name        : fieldName.trim()
            , type        : fieldType
            , index       : fields.length
            , messageType : null
            });
            callback();
          }
        }
        else if (fieldsUtil.isMessage(fieldType)) {
          fieldType = normalizeMessageType(fieldType, details.packageName);
          messages.getMessage(fieldType, function(error, messageType) {
            fields.push({
              name        : fieldName.trim()
            , type        : fieldType
            , index       : fields.length
            , messageType : messageType
            });
            callback();
          });
        }
      }
    }
  }

  var lines = content.split('\n');

  if (type != "message") {
    var divider = lines.indexOf("---");
    if (type == "request") {
      lines = lines.slice(0, divider);
    } else {
      // response
      lines = lines.slice(divider+1);
    }    
  }

  async.forEachSeries(lines, parseLine, function(error) {
    if (error) {
      callback(error);
    }
    else {
      callback(null, constants, fields);
    }
  });
};

function camelCase(underscoreWord, lowerCaseFirstLetter) {
  var camelCaseWord = underscoreWord.split('_').map(function(word) {
    return word[0].toUpperCase() + word.slice(1);
  }).join('');

  if (lowerCaseFirstLetter) {
    camelCaseWord = camelCaseWord[0].toLowerCase() + camelCaseWord.slice(1)
  }

  return camelCaseWord;
}

function buildValidator (details) {
  function validator (candidate, strict) {
    return Object.keys(candidate).every(function(property) {
      var valid = true;
      var exists = false;

      details.constants.forEach(function(field) {
        if (field.name === property) {
          exists = true;
        }
      });
      if (!exists) {
        details.fields.forEach(function(field) {
          if (field.name === property) {
            exists = true;
          }
        });
      }

      if (strict) {
        return exists;
      }
      else {
        return valid;
      }
    });
  }

  validator.name = 'validate' + camelCase(details.messageName);
  return validator;
}

function buildMessageClass(details) {
  function Message(values) {
    if (!(this instanceof Message)) {
      return new Message(init);
    }

    var that = this;

    if (details.constants) {
      details.constants.forEach(function(field) {
        that[field.name] = field.value || null;
      });
    }
    if (details.fields) {
      details.fields.forEach(function(field) {
        that[field.name] = field.value || null;
      });
    }

    if (values) {
      Object.keys(values).forEach(function(name) {
        that[name] = values[name];
      });
    }
  };

  Message.messageType = Message.prototype.messageType = details.messageType;
  Message.packageName = Message.prototype.packageName = details.packageName;
  Message.messageName = Message.prototype.messageName = details.messageName;
  Message.md5         = Message.prototype.md5         = details.md5;
  Message.md5sum      = Message.prototype.md5sum      = function() {
    return this.md5;
  };
  Message.constants   = Message.prototype.constants   = details.constants;
  Message.fields      = Message.prototype.fields      = details.fields;
  Message.serialize   = Message.prototype.serialize   = function(obj) {
    return serializeMessage(obj);
  }
  Message.deserialize = Message.prototype.deserialize = function(buffer) {
    var obj = deserializeMessage(buffer, Message);
    return obj;
  }
  Message.prototype.validate    = buildValidator(details);

  return Message;
}

function getMessageFromRegistry(messageType, type) {
  return registry[messageType + "-" + type];
}

function setMessageInRegistry(messageType, type, message) {
  registry[messageType + "-" + type] = message;
}

function getMessageType(packageName, messageName) {
  return packageName ? packageName + '/' + messageName
    : messageName;
}

function getPackageNameFromMessageType(messageType) {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[0]
    : '';
}

var isNormalizedMessageType = /.*\/.*$/;
function normalizeMessageType(messageType, packageName) {
  var normalizedMessageType = messageType;
  if (messageType == "Header") {
    normalizedMessageType = getMessageType("std_msgs", messageType);   
    // normalizedMessageType = getMessageType(null, messageType);
  } else if (messageType.match(isNormalizedMessageType) === null) {
    normalizedMessageType = getMessageType(packageName, messageType);
  }

  return normalizedMessageType;
}

function getMessageNameFromMessageType(messageType) {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[1]
                                         : messageType;
}

// ---------------------------------------------------------

function serializeMessage(message) {
  var bufferSize   = fieldsUtil.getMessageSize(message);
  var buffer       = new Buffer(bufferSize);

  serializeInnerMessage(message, buffer, 0);

  return {
    buffer: [buffer],
    length: bufferSize
  };
}

function serializeInnerMessage(message, buffer, bufferOffset) {
  message.fields.forEach(function(field) {
    var fieldValue = message[field.name];
    
    if (fieldsUtil.isPrimitive(field.type)) {
      fieldsUtil.serializePrimitive(
        field.type, fieldValue, buffer, bufferOffset);
      bufferOffset += fieldsUtil.getPrimitiveSize(field.type, fieldValue);
    }
    else if (fieldsUtil.isArray(field.type)) {
      buffer.writeUInt32LE(fieldValue.length, bufferOffset);
      bufferOffset += 4;

      var arrayType = fieldsUtil.getTypeOfArray(field.type);
      fieldValue.forEach(function(value) {
        if (fieldsUtil.isPrimitive(arrayType)) {
          fieldsUtil.serializePrimitive(
            arrayType, value, buffer, bufferOffset);
          bufferOffset += fieldsUtil.getPrimitiveSize(arrayType, value);
        }
        else if (fieldsUtil.isMessage(arrayType)) {
          serializeInnerMessage(value, buffer, bufferOffset);
          bufferOffset += fieldsUtil.getMessageSize(value)
        }
      });
    }
    else if (fieldsUtil.isMessage(field.type)) {
      serializeInnerMessage(fieldValue, buffer, bufferOffset)
      bufferOffset += fieldsUtil.getMessageSize(fieldValue)
    }
  });
}

function deserializeMessage(buffer, messageType) {
  var message            = new messageType();

  message = deserializeInnerMessage(message, buffer, 0);

  return {
    data: message,
    buffer: buffer
  };
}

function deserializeInnerMessage(message, buffer, bufferOffset) {
  message.fields.forEach(function(field) {
    var fieldValue = message[field.name];

    if (fieldsUtil.isPrimitive(field.type)) {
      fieldValue = fieldsUtil.deserializePrimitive(
        field.type, buffer, bufferOffset)
      bufferOffset += fieldsUtil.getPrimitiveSize(field.type, fieldValue)
    }
    else if (fieldsUtil.isArray(field.type)) {
      var array     = []
        , arraySize = buffer.readUInt32LE(bufferOffset)
        , arrayType = fieldsUtil.getTypeOfArray(field.type)
        ;
      bufferOffset += 4;

      for (var i = 0; i < arraySize; i++) {
        if (fieldsUtil.isPrimitive(arrayType)) {
          var value = fieldsUtil.deserializePrimitive(
            arrayType, buffer, bufferOffset);
          bufferOffset += fieldsUtil.getPrimitiveSize(arrayType, value);
          array.push(value);
        }
        else if (fieldsUtil.isMessageType(arrayType)) {
          var arrayMessage = new field.messageType();
          arrayMessage = deserializeInnerMessage(
            arrayMessage, buffer, bufferOffset);
          bufferOffset += fieldsUtil.getMessageSize(arrayMessage);
          array.push(arrayMessage);
        }
      }
      fieldValue = array;
    }
    else if (fieldsUtil.isMessage(field.type)) {
      var innerMessage = new field.messageType();
      fieldValue = deserializeInnerMessage(
        innerMessage, buffer, bufferOffset);
      bufferOffset += fieldsUtil.getMessageSize(fieldValue);
    }

    message[field.name] = fieldValue;
  });

  return message;
};

// ---------------------------------------------------------

module.exports = messages;
