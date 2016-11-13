var fs = require('fs');
var path = require('path');
var md5 = require('md5');
var async = require('async');

var packages   = require('./packages')
  , fieldsUtil = require('./fields');

var messages = exports;

// ---------------------------------------------------------
// exported functions

/** get message handler class from registry */
messages.getFromRegistry = function(messageType, type) {
  return getMessageFromRegistry(messageType, type);
}

messages.getPackageFromRegistry = function(packagename) {
  return registry[packagename];
}

/** ensure the handler for this message type is in the registry,
 * create it if it doesn't exist */
messages.getMessage = function(messageType, callback) {
  var fromRegistry = getMessageFromRegistry(messageType, ["msg"]);
  if (fromRegistry) {
    callback(null, fromRegistry);
  } else {
    getMessageFromPackage(messageType, "msg", callback);
  }
}

/** ensure the handler for requests for this service type is in the
 * registry, create it if it doesn't exist */
messages.getService = function(messageType, callback) {
  getMessageFromPackage(messageType, "srv", callback);
}

/** get all message and service definitions, from all packages */
messages.getAll = function(callback) {
  packages.getAllPackages(function(err, packageDirectories) {
    // for each found package:
    async.eachSeries(packageDirectories, function(directory, packageCallback) {
      var packageName = path.basename(directory);
      // for both msgs and srvs:
      async.eachSeries(["msg", "srv"], function(type, typeCallback) {
        // read the package's respective sub directory
        var files = [];
        fs.readdir(path.join(directory, type), function(err, files) {
          // add each found msg/srv definition
          async.eachSeries(files, function(file, fileCallback) {
            var fileName = path.basename(file, "." + type);
            var messageType = packageName + "/" + fileName;

            // check whether we already computed it due to dependencies:
            var cachehit = false;
            if (type == "msg") {
              cachehit = (getMessageFromRegistry(messageType, [type]) != undefined);
            } else {
              cachehit = (getMessageFromRegistry(messageType, [type, "Response"]) != undefined
              && getMessageFromRegistry(messageType, [type, "Request"]) != undefined);
            }
            if (cachehit) {
              fileCallback();
            } else {
              var filePath = path.join(directory, type, file);
              getMessageFromFile(messageType, filePath, type, function(err, message) {
                fileCallback();
              });
            }
          }, typeCallback);
        });
      }, packageCallback);
    }, callback);
  });
};


// ---------------------------------------------------------
// Registry

var registry = {};
/*
   registry looks like:
  { 'packagename':
    {
      msg: {
        'String': classdef,
        'Pose': classdef,
        ...
      },
      srv: { Request:
             {
               'SetBool': classdef,
               ...
             },
             Response:
             {
               'SetBool': classdef,
               ...
             }
           }
    },
    'packagename2': {..}
  };
*/

/**
   @param messageType is the ROS message or service type, e.g.
   'std_msgs/String'
   @param type is from the set
   [["msg"], ["srv","Request"], ["srv","Response"]
*/
function getMessageFromRegistry(messageType, type) {
  var packageName = getPackageNameFromMessageType(messageType);
  var messageName = getMessageNameFromMessageType(messageType);
  var packageSection = registry[packageName];
  if (!packageSection) {
    return undefined;
  }
  var section = registry[packageName][type[0]]; // msg or srv sub-object
  if (!section) {
    return undefined;
  }
  if (type.length == 1) {
    // message
    return section[messageName];
  } else {
    // service
    if (!section[messageName]) {
      return undefined;
    }
    return section[messageName][type[1]];
  }
}

/**
    @param messageType is the ROS message or service type, e.g.
    'std_msgs/String'
    @param message is the message class definition
    @param type is from the set "msg", "srv"
    @param (optional) subtype \in { "Request", "Response" }
*/
function setMessageInRegistry(messageType, message, type, subtype) {

  var packageName = getPackageNameFromMessageType(messageType);
  var messageName = getMessageNameFromMessageType(messageType);

  if (!registry[packageName]) {
    registry[packageName] = { msg: {}, srv: {}};
  }

  if (type == "msg") {
    // message
    registry[packageName][type][messageName] = message;
  } else {
    // service
    if (!registry[packageName][type][messageName]) {
      registry[packageName][type][messageName] = {};
    }

    var serviceType = subtype; // "Request" or "Response"
    registry[packageName][type][messageName][serviceType] = message;
  }
}


// ---------------------------------------------------------
// private functions

/* get message or service definition class */
function getMessageFromPackage(messageType, type, callback) {
  var packageName = getPackageNameFromMessageType(messageType);
  var messageName = getMessageNameFromMessageType(messageType);
  packages.findPackage(packageName, function(error, directory) {
    var filePath;
    filePath = path.join(directory, type, messageName + '.' + type);
    getMessageFromFile(messageType, filePath, type, callback);
  });
};

function getMessageFromFile(messageType, filePath, type, callback) {
  var packageName = getPackageNameFromMessageType(messageType)
  , messageName = getMessageNameFromMessageType(messageType);

  var details = {
    messageType : messageType
    , messageName : messageName
    , packageName : packageName
  };

  parseMessageFile(
    filePath, details, type, function(error, details) {
      if (error) {
        callback(error);
      } else {
        if (type == "msg") {
          var message = buildMessageClass(details);
          setMessageInRegistry(messageType, message, type);
          callback(null, message);
        } else if (type == "srv") {
          var request = buildMessageClass(details.request);
          var response = buildMessageClass(details.response);
          setMessageInRegistry(messageType, request, type, "Request");
          setMessageInRegistry(messageType, response, type, "Response");
          setMessageInRegistry(messageType, () => {return request.md5sum(); }, type, 'md5sum');
          setMessageInRegistry(messageType, () => { return messageType; }, type, 'datatype');
          callback();
          // ^ no value needed for services, since they cannot appear nested
          // still pretty hacky
        } else {
          console.log("unknown service", type);
        }
      }
    });
};

function parseMessageFile(fileName, details, type, callback) {
  details = details || {};
  fs.readFile(fileName, 'utf8', function(error, content) {
    if (error) {
      return callback(error);
    }
    else {
      extractFields(
        content, details, function(error, aggregate) {
          if (error) {
            callback(error);
          } else {
            if (type == "msg") {
              details.constants = aggregate[0].constants;
              details.fields    = aggregate[0].fields;
              details.md5       = calculateMD5(details, "msg");
              callback(null, details);
            } else if (type == "srv") {
              // services combine the two message types to compute the
              // md5sum
              var rtv = {
                // we need to clone what's already there in details
                // into the sub-objects
                request: JSON.parse(JSON.stringify(details)),
                response: JSON.parse(JSON.stringify(details))
              };
              rtv.request.constants = aggregate[0].constants;
              rtv.request.fields = aggregate[0].fields;
              if (aggregate.length > 1) {
                // if there is a response:
                rtv.response.constants = aggregate[1].constants;
                rtv.response.fields = aggregate[1].fields;
              } else {
                rtv.response.constants = [];
                rtv.response.fields = [];
              }
              rtv.request.md5 = rtv.response.md5 = calculateMD5(rtv, "srv");
              callback(null, rtv);
            } else {
              console.log("parseMessageFile:", "Unknown type: ", type);
              callback("unknown type", null);
            }
          }
        });
    }
  })
};

// -------------------------------
// functions relating to handler class

function calculateMD5(details, type) {

  /* get the text for one part of the type definition to compute the
     md5sum over */
  function getMD5text(part) {
    var message = '';
    var constants = part.constants.map(function(field) {
      return field.type + ' ' + field.name + '=' + field.raw;
    }).join('\n');

    var fields = part.fields.map(function(field) {
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
    return message;
  }

  // depending on type, compose the right md5text to compute md5sum
  // over: Services just concatenate the individual message text (with
  // *no* new line in between)
  var text;
  if (type == "msg") {
    text = getMD5text(details);
  } else if (type == "srv") {
    text = getMD5text(details.request);
    text += getMD5text(details.response);
  } else {
    console.log("calculateMD5: Unknown type", type);
    return null;
  }

  return md5(text);
}

function extractFields(content, details, callback) {
  function parsePart(lines, callback) {
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
          // truncate comments and whitespace
          var constant = field.substring(equalIndex + 1, field.length).trim();
          var constantEnd = constant.length;
          var constantComment = constant.indexOf("#");
          if (constantComment >= 0) {
            if (fieldType != "string") {
              var firstWhitespace = constant.match(/\s/);
              if (firstWhitespace) {
                constantEnd = firstWhitespace.index;
              }
            } else {
              constantEnd = constantComment;
            }
          }
          var parsedConstant = fieldsUtil.parsePrimitive(fieldType, constant);

          constants.push({
            name        : fieldName
            , type        : fieldType
            , value       : parsedConstant
            , raw         : constant.slice(0, constantEnd)
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
          else {
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

    async.eachSeries(lines, parseLine, function(error) {
      if (error) {
        callback(error);
      }
      else {
        callback(null, {constants: constants, fields: fields});
      }
    });
  }

  var lines = content.split('\n');

  // break into parts:
  var parts = lines.reduce(function(memo, line) {
    if (line == "---") {
      // new part starts
      memo.push([]);
    } else if (line != "") {
      memo[memo.length - 1].push(line);
    }
    return memo;
  }, [[]]);

  async.map(parts, parsePart, function(err, aggregate) {
    callback(err, aggregate);
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


/** Construct the class definition for the given message type. The
 * resulting class holds the data and has the methods required for
 * use with ROS, incl. serialization, deserialization, and md5sum. */
function buildMessageClass(details) {
  function Message(values) {
    if (!(this instanceof Message)) {
      return new Message(values);
    }

    var that = this;

    if (details.constants) {
      details.constants.forEach(function(field) {
        that[field.name] = field.value || null;
      });
    }

    if (details.fields) {
      details.fields.forEach(function(field) {
        if (field.messageType) {
          // sub-message class
          // is it an array?
          var match = field.type.match(/(.*)\[(\d*)\]/);
          if (values && typeof values[field.name] != "undefined") {
            // values provided
            if (match) {
              // it's an array
              that[field.name] = values[field.name].map(function(value) {
                  return new (field.messageType)(value);
                });
            } else {
              that[field.name] =
                new (field.messageType)(values[field.name]);
            }
          } else {
            // use defaults
            if (match) {
              // it's an array
              const basetype = match[1];
              const length = (match[2].length > 0 ? parseInt(match[2]) : 0);
              that[field.name] = new Array(length).fill(new (field.messageType)());
            } else {
              that[field.name] = new (field.messageType)();
            }
          }
        } else {
          // simple type
          that[field.name] =
            (values && typeof values[field.name] != "undefined") ?
             values[field.name] :
             (field.value || fieldsUtil.getDefaultValue(field.type));
        }
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
  Message.Constants = Message.constants
    = Message.prototype.constants   = (() => {
      const ret = {};
      details.constants.forEach((constant) => {
        ret[constant.name] = constant.value;
      });
    return ret;
  })();
  Message.fields      = Message.prototype.fields      = details.fields;
  Message.serialize   = Message.prototype.serialize   =
    function(obj, buffer, offset) {
      serializeInnerMessage(obj, buffer, offset);
    };
  Message.deserialize = Message.prototype.deserialize = function(buffer) {
    var message = new Message();

    message = deserializeInnerMessage(message, buffer, 0);

    return message;
  };
  Message.getMessageSize = function(msg) { return fieldsUtil.getMessageSize(msg); };

  return Message;
}

// ---------------------------------------------------------

function getMessageType(packageName, messageName) {
  return packageName ? packageName + '/' + messageName
    : messageName;
}

function getPackageNameFromMessageType(messageType) {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[0]
    : '';
}

function normalizeMessageType(messageType, packageName) {
  var normalizedMessageType = messageType;
  if (messageType == "Header") {
    normalizedMessageType = getMessageType("std_msgs", messageType);
  } else if (messageType.indexOf("/") < 0) {
    normalizedMessageType = getMessageType(packageName, messageType);
  }
  return normalizedMessageType;
}

function getMessageNameFromMessageType(messageType) {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')[1]
                                         : messageType;
}

// ---------------------------------------------------------
// Serialize

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

// ---------------------------------------------------------
// Deserialize

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
        else if (fieldsUtil.isMessage(arrayType)) {
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
