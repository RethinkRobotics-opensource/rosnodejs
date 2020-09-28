import * as fieldsUtil from './fields';
import * as MessageSpec from './MessageSpec';
import MessageLoader from './MessageLoader';
import { MessageRegistry, Message, MessageConstructor, ServiceConstructor } from '../../types/Message';

// ---------------------------------------------------------
// exported functions

type MsgOrSrv = 'msg' | 'srv';

/** get message handler class from registry */

export function getPackageFromRegistry(packagename: string): OnTheFlyPackageEntry {
  return registry[packagename];
}

/** get all message and service definitions, from all packages */
export async function getAll() {
  const msgLoader = new MessageLoader(false);
  await msgLoader.buildPackageTree(null, false);
  const pkgCache = msgLoader.getCache();

  function tryBuildMessage(spec: MessageSpec.RosMsgSpec): void {
    try {
      buildMessageFromSpec(spec);
    }
    catch(err) {
      console.error('Error building %s: %s\n%s', spec.getFullMessageName(), err, err.stack);
      throw err;
    }
  }

  for (const pkgName in pkgCache) {
    const pkg = pkgCache[pkgName];
    for (const msgName in pkg.messages) {
      tryBuildMessage(pkg.messages[msgName].spec);
    }

    for (const srvName in pkg.services) {
      tryBuildMessage(pkg.services[srvName].spec);
    }
  }
}


// ---------------------------------------------------------
// Registry

type MessageInfo = {
  messageType: string;
  fields: fieldsUtil.Field[];
  fieldTypeInfo: FieldTypeInfo;
  spec: MessageSpec.MsgSpec;
}

// FIXME: make this extends MessageConstructor<T>
interface OnTheFlyMessageConstructor<T extends Message> extends MessageConstructor<T> {
  _info: MessageInfo;
}

interface OnTheFlyServiceConstructor<Req, Resp> extends ServiceConstructor<Req,Resp> {
  Request: OnTheFlyMessageConstructor<Req>;
  Response: OnTheFlyMessageConstructor<Resp>;
}

type FieldTypeInfo = { [key: string]: {
  spec: MessageSpec.MsgSpec,
  constructor?: OnTheFlyMessageConstructor<any>
}};

type OnTheFlyPackageEntry = {
  msg?: { [key: string]: OnTheFlyMessageConstructor<any> },
  srv?: { [key: string]: OnTheFlyServiceConstructor<any, any> }
}

interface OnTheFlyRegistry extends MessageRegistry {
  [key: string]: OnTheFlyPackageEntry
};

const registry: OnTheFlyRegistry = {};
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
export function getMessageFromRegistry(messageType: string): MessageConstructor<any> {
  return getMessageInternal(messageType, 'msg');
}

export function getServiceFromRegistry(messageType: string): ServiceConstructor<any, any> {
  return getMessageInternal(messageType, 'srv');
}

function getMessageInternal(messageType: string, type: 'msg'): OnTheFlyMessageConstructor<any>;
function getMessageInternal(messageType: string, type: 'srv'): OnTheFlyServiceConstructor<any, any>;
function getMessageInternal(messageType: string, type: MsgOrSrv): OnTheFlyMessageConstructor<any>|OnTheFlyServiceConstructor<any, any> {
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

function setMessageInRegistry(messageType: string, message: OnTheFlyMessageConstructor<any>|OnTheFlyServiceConstructor<any, any>, type: MsgOrSrv): void {
  const [packageName, messageName] = splitMessageType(messageType);

  if (!registry[packageName]) {
    registry[packageName] = { msg: {}, srv: {}};
  }

  if (type === 'srv') {
    registry[packageName][type][messageName] = message as OnTheFlyServiceConstructor<any, any>;
  }
  else {
    registry[packageName][type][messageName] = message as OnTheFlyMessageConstructor<any>;
  }
}

// ---------------------------------------------------------
// private functions

function buildMessageFromSpec(msgSpec: MessageSpec.RosMsgSpec): void {
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
      setMessageInRegistry(fullMsg, buildMessageClass(msgSpec as MessageSpec.MsgSpec), 'msg');
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
      setMessageInRegistry(fullMsg, service, 'srv');
      break;
    }
    default:
      console.warn("Unknown msgspec type:", type);
  }
};

// -------------------------------
// functions relating to handler class

/** Construct the class definition for the given message type. The
 * resulting class holds the data and has the methods required for
 * use with ROS, incl. serialization, deserialization, and md5sum. */
function buildMessageClass(msgSpec: MessageSpec.MsgSpec): OnTheFlyMessageConstructor<any> {
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

  const messageInfo = {
    messageType,
    fields: msgSpec.fields,
    fieldTypeInfo: buildFieldTypeInfo(msgSpec),
    spec: msgSpec
  };

  class MessageClass implements Message {
    static _info = messageInfo;
    static Constants = Constants;
    [key: string]: any;

    constructor(values?: any) {
      if (msgSpec.fields) {
        for (const field of msgSpec.fields) {
          if (!field.isBuiltin) {
            const FieldConstructor = getFieldMessageConstructor(field, messageInfo);
            // sub-message class
            // is it an array?
            if (values && typeof values[field.name] != "undefined") {
              // values provided
              if (field.isArray) {
                this[field.name] = values[field.name].map(function(value: any) {
                    return new FieldConstructor(value);
                  });
              } else {
                this[field.name] =
                  new FieldConstructor(values[field.name]);
              }
            } else {
              // use defaults
              if (field.isArray) {
                // it's an array
                const length = field.arrayLen || 0;
                this[field.name] = new Array(length).fill(new FieldConstructor());
              } else {
                this[field.name] = new FieldConstructor();
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
      serializeInnerMessage(obj, messageInfo, buffer, offset);
    }

    static Resolve(msg: Partial<Message>): Message {
      return msg as Message;
    }

    static deserialize(buffer: Buffer) {
      const message = new MessageClass();
      deserializeInnerMessage(message, messageInfo, buffer, [0]);
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

  return MessageClass;
}

function getFieldMessageConstructor(field: fieldsUtil.Field, info: MessageInfo): OnTheFlyMessageConstructor<any> {
  const fieldTypeInfo = info.fieldTypeInfo[field.name];
  if (!fieldTypeInfo.constructor) {
    fieldTypeInfo.constructor = getMessageInternal(field.baseType, 'msg');
  }
  // else
  return fieldTypeInfo.constructor;
}

function getFieldMessageInfo(field: fieldsUtil.Field, info: MessageInfo) {
  const fieldTypeInfo = info.fieldTypeInfo[field.name];
  if (!fieldTypeInfo.constructor) {
    fieldTypeInfo.constructor = getMessageInternal(field.baseType, 'msg');
  }
  return fieldTypeInfo.constructor._info;
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

function buildFieldTypeInfo(spec: MessageSpec.MsgSpec): FieldTypeInfo {
  const fieldTypeSpecs: FieldTypeInfo = {};
  for (const field of spec.fields) {
    if (!field.isBuiltin) {
      fieldTypeSpecs[field.name] = {
        constructor: undefined,
        spec: spec.getMsgSpecForType(field.baseType) as MessageSpec.MsgSpec
      };
    }
  }
  return fieldTypeSpecs;
}

// ---------------------------------------------------------
// Serialize

function serializeInnerMessage(message: any, messageInfo: MessageInfo, buffer: Buffer, bufferOffset: number = 0): number {
  const spec = messageInfo.spec;
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
          bufferOffset = serializeInnerMessage(value, getFieldMessageInfo(field, messageInfo), buffer, bufferOffset);
        }
      }
    }
    else if (field.isBuiltin) {
      bufferOffset = fieldsUtil.serializePrimitive(
        field.type, fieldValue, buffer, bufferOffset);
    }
    else { // is message
      bufferOffset = serializeInnerMessage(fieldValue, getFieldMessageInfo(field, messageInfo), buffer, bufferOffset);
    }
  }

  return bufferOffset;
}

// ---------------------------------------------------------
// Deserialize

function deserializeInnerMessage(message: any, info: MessageInfo, buffer: Buffer, bufferOffset: number[]): any {
  for (const field of info.spec.fields) {
    let fieldValue = message[field.name];

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
          let arrayMessage = {}

          arrayMessage = deserializeInnerMessage(arrayMessage, getFieldMessageInfo(field, info),
            buffer, bufferOffset);

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
      fieldValue = deserializeInnerMessage(innerMessage, getFieldMessageInfo(field, info),
        buffer, bufferOffset);
    }

    message[field.name] = fieldValue;
  }

  return message;
};
