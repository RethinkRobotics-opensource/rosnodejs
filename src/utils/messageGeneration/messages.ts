import * as fs from 'fs';
import * as path from 'path';
import * as md5 from 'md5';
const async = require('async');

import * as packages from './packages';
import * as fieldsUtil from './fields';
import * as MessageSpec from './MessageSpec.js';
import * as MessageLoader from './MessageLoader.js';

// ---------------------------------------------------------
// exported functions

enum RegistryMsgType {
  Msg = "msg",
  Srv = "srv"
}
type MsgOrSrv = RegistryMsgType.Msg | RegistryMsgType.Srv;

/** get message handler class from registry */
export function getFromRegistry(messageType: string, type: MsgOrSrv) {
  return getMessageFromRegistry(messageType, type);
}

export function getPackageFromRegistry(packagename: string): PackageEntry {
  return registry[packagename];
}

/** get all message and service definitions, from all packages */
export function getAll() {
  const msgLoader = new MessageLoader(false);
  return msgLoader.buildPackageTree(null, false)
  .then(() => {
    const pkgCache = msgLoader.getCache();

    return new Promise((resolve, reject) => {
      async.eachSeries(Object.keys(pkgCache), (pkgName, pkgCallback) => {
        async.eachSeries(['messages', 'services'], (type, typeCallback) => {
          const msgs = pkgCache[pkgName][type];
          async.eachSeries(Object.keys(msgs), (msgName, msgCallback) => {
            try {
              buildMessageFromSpec(msgs[msgName].msgSpec);
            }
            catch(err) {
              console.error('Error building %s: %s\n%s', msgName, err, err.stack);
              throw err;
            }
            msgCallback();
          }, typeCallback);
        }, pkgCallback);
      }, resolve);
    });
  });
};


// ---------------------------------------------------------
// Registry

type ServiceEntry = {
  Request: MessageTConstructor;
  Response: MessageTConstructor;
  md5sum(): string;
  datatype(): string;
}
type MessageCache = { [key: string]: MessageTConstructor }
type ServiceCache = { [key: string]: ServiceEntry }
type PackageEntry = {
  [RegistryMsgType.Msg]: MessageCache;
  [RegistryMsgType.Srv]: ServiceCache;
}
type Registry = {
  [key: string]: PackageEntry
}
const registry: Registry = {};
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
   ["msg", "srv"]
*/
function getMessageFromRegistry(messageType: string, type: RegistryMsgType.Msg): MessageTConstructor;
function getMessageFromRegistry(messageType: string, type: RegistryMsgType.Srv): ServiceEntry;
function getMessageFromRegistry(messageType: string, type: MsgOrSrv): MessageTConstructor | ServiceEntry {
  const [ packageName, messageName ] = splitMessageType(messageType);
  const packageSection = registry[packageName];
  if (!packageSection) {
    return undefined;
  }
  const section = packageSection[type]; // msg or srv sub-object
  if (!section) {
    return undefined;
  }
  return section[messageName];
}

function setMessageInRegistry(messageType: string, message: MessageTConstructor|ServiceEntry, type: MsgOrSrv) {
  const [packageName, messageName] = splitMessageType(messageType);

  if (!registry[packageName]) {
    registry[packageName] = { [RegistryMsgType.Msg]: {}, [RegistryMsgType.Srv]: {}};
  }

  registry[packageName][type][messageName] = message;
}


// ---------------------------------------------------------
// private functions

function buildMessageFromSpec(msgSpec: MessageSpec.RosMsgSpec) {
  const { type } = msgSpec;
  const fullMsg = msgSpec.getFullMessageName();
  switch(type) {
    case MessageSpec.MSG_TYPE:
    case MessageSpec.ACTION_GOAL_TYPE:
    case MessageSpec.ACTION_FEEDBACK_TYPE:
    case MessageSpec.ACTION_RESULT_TYPE:
    case MessageSpec.ACTION_ACTION_GOAL_TYPE:
    case MessageSpec.ACTION_ACTION_FEEDBACK_TYPE:
    case MessageSpec.ACTION_ACTION_RESULT_TYPE:
    case MessageSpec.ACTION_ACTION_TYPE:
      setMessageInRegistry(fullMsg, buildMessageClass(msgSpec as MessageSpec.MsgSpec), RegistryMsgType.Msg);
      break;
    case MessageSpec.SRV_TYPE:
    {
      const Request = buildMessageClass((msgSpec as MessageSpec.SrvSpec).request);
      const Response = buildMessageClass((msgSpec as MessageSpec.SrvSpec).response);
      const md5Sum = msgSpec.getMd5sum();
      const service = {
        Request,
        Response,
        md5sum: () => { return md5Sum; },
        datatype: () => { return fullMsg; }
      };
      setMessageInRegistry(fullMsg, service, RegistryMsgType.Srv);
      break;
    }
    default:
      console.warn("Unknown msgspec type:", type);
  }
};

// -------------------------------
// functions relating to handler class

type ConstantsT = {[key: string]: any};
type MessageT = {
  [key: string]: any;
  constructor: MessageTConstructor;
};

type MessageTConstructor = {
  messageType: string;
  fields: fieldsUtil.Field[];
  Constants: ConstantsT;
  fieldTypeSpecs: FieldTypeSpecs;
  spec: MessageSpec.MsgSpec;

  new(values?: any): MessageT;

  md5sum(): string;
  serialize(obj: MessageT, buffer: Buffer, offset: number): void;
  deserialize(buffer: Buffer): MessageT;
  getMessageSize(msg: MessageT): number;
  messageDefinition(): string;
  datatype(): string;
}
type FieldTypeSpecs = {[key: string]: MessageSpec.MsgSpec};

/** Construct the class definition for the given message type. The
 * resulting class holds the data and has the methods required for
 * use with ROS, incl. serialization, deserialization, and md5sum. */
function buildMessageClass(msgSpec: MessageSpec.MsgSpec): MessageTConstructor {
  const md5Sum = msgSpec.getMd5sum();
  const fullMsgDefinition = msgSpec.computeFullText();
  const messageType = msgSpec.getFullMessageName();

  const Constants = (() => {
      const ret: {[key: string]: any} = {};
      msgSpec.constants.forEach((constant) => {
        ret[constant.name.toUpperCase()] = constant.value;
      });
    return ret;
  })();

  class Message {
    static messageType = messageType;
    static fields = msgSpec.fields;
    static Constants = Constants;
    static fieldTypeSpecs = getFieldTypeSpecs(msgSpec);
    static spec = msgSpec;
    [key: string]: any;

    constructor(values?: any) {
      if (msgSpec.fields) {
        for (const field of msgSpec.fields) {
          if (!field.isBuiltin) {
            // sub-message class
            // is it an array?
            if (values && typeof values[field.name] != "undefined") {
              // values provided
              if (field.isArray) {
                this[field.name] = values[field.name].map(function(value: any) {
                    return new (getMessageFromRegistry(field.baseType, RegistryMsgType.Msg))(value);
                  });
              } else {
                this[field.name] =
                  new (getMessageFromRegistry(field.baseType, RegistryMsgType.Msg))(values[field.name]);
              }
            } else {
              // use defaults
              if (field.isArray) {
                // it's an array
                const length = field.arrayLen || 0;
                this[field.name] = new Array(length).fill(new (getMessageFromRegistry(field.baseType, RegistryMsgType.Msg))());
              } else {
                this[field.name] = new (getMessageFromRegistry(field.baseType, RegistryMsgType.Msg))();
              }
            }
          } else {
            // simple type
            this[field.name] =
              (values && typeof values[field.name] != "undefined") ?
               values[field.name] : fieldsUtil.getDefaultValue(field.type);
          }
        }
      }
    }

    static md5sum() {
      return md5Sum;
    }

    static serialize(obj: Message, buffer: Buffer, offset: number): void {
      serializeInnerMessage(obj, buffer, offset);
    }

    static deserialize(buffer: Buffer) {
      const message = new Message();
      deserializeInnerMessage(msgSpec, message, buffer, [0]);
      return message;
    }

    static getMessageSize(msg: Message): number {
      return fieldsUtil.getMessageSize(msg, msgSpec);
    }

    static messageDefinition(): string {
      return fullMsgDefinition;
    }

    static datatype(): string {
      return messageType;
    }
  }

  return Message;
}

// ---------------------------------------------------------

function getMessageType(packageName: string, messageName: string): string {
  return packageName ? packageName + '/' + messageName
    : messageName;
}

function splitMessageType(messageType: string): string[] {
  return messageType.indexOf('/') !== -1 ? messageType.split('/')
                                         : ['', messageType];
}

function getFieldTypeSpecs(spec: MessageSpec.MsgSpec): FieldTypeSpecs {
  const fieldTypeSpecs: FieldTypeSpecs = {};
  for (const field of spec.fields) {
    if (!field.isBuiltin) {
      fieldTypeSpecs[field.name] = spec.getMsgSpecForType(field.baseType) as MessageSpec.MsgSpec;
    }
  }
  return fieldTypeSpecs;
}

// ---------------------------------------------------------
// Serialize

function serializeInnerMessage(message: MessageT, buffer: Buffer, bufferOffset: number = 0): number {
  const spec = message.constructor.spec;
  for (const field of spec.fields) {
    const fieldValue: any = message[field.name];

    if (field.isArray) {
      if (field.arrayLen === null) {
        buffer.writeUInt32LE(fieldValue.length, bufferOffset);
        bufferOffset += 4; // only for variable length arrays
      }

      const arrayType = field.baseType;
      for (const value of fieldValue) {
        if (field.isBuiltin) {
          bufferOffset = fieldsUtil.serializePrimitive(
            arrayType, value, buffer, bufferOffset);
        }
        else if (fieldsUtil.isMessage(arrayType)) {
          bufferOffset = serializeInnerMessage(value, buffer, bufferOffset);
        }
      }
    }
    else if (field.isBuiltin) {
      bufferOffset = fieldsUtil.serializePrimitive(
        field.type, fieldValue, buffer, bufferOffset);
    }
    else { // is message
      bufferOffset = serializeInnerMessage(fieldValue, buffer, bufferOffset);
    }
  }

  return bufferOffset;
}

// ---------------------------------------------------------
// Deserialize

function deserializeInnerMessage(message: MessageT, buffer: Buffer, bufferOffset: number[]) {
  const spec = message.constructor.spec;
  for (const field of spec.fields) {
    var fieldValue = message[field.name];

    if (field.isArray) {
      const array     = [];
      const arrayType = field.baseType;

      let arraySize;
      if (field.arrayLen !== null) {
        arraySize = field.arrayLen;
      } else {
        arraySize = buffer.readUInt32LE(bufferOffset[0]);
        bufferOffset[0] += 4; // only for variable length arrays
      }

      const isPrimitive = field.isBuiltin;

      for (var i = 0; i < arraySize; i++) {
        if (isPrimitive) {
          var value = fieldsUtil.deserializePrimitive(
            arrayType, buffer, bufferOffset);
          array.push(value);
        }
        else { // is message
          const arrayMessage = {}

          arrayMessage = deserializeInnerMessage(spec.getMsgSpecForType(arrayType),
            arrayMessage, buffer, bufferOffset);

          array.push(arrayMessage);
        }
      }
      fieldValue = array;
    }
    else if (field.isBuiltin) {
      fieldValue = fieldsUtil.deserializePrimitive(
        field.type, buffer, bufferOffset)
    }
    else { // is message
      var innerMessage = {}
      fieldValue = deserializeInnerMessage(spec.getMsgSpecForType(field.baseType),
        innerMessage, buffer, bufferOffset);
    }

    message[field.name] = fieldValue;
  }

  return message;
};
