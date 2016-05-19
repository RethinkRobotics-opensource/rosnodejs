'use strict'

const chai = require('chai');
const expect = chai.expect;
const msgUtils = require('../utils/message_utils.js');

describe('gennodejsTests', () => {
  msgUtils.findMessageFiles();
  msgUtils.loadMessagePackage('std_msgs');
  msgUtils.loadMessagePackage('test_msgs');

  it('basic', (done) => {
    let stringMsg;
    const loadStrFunc = () => {
      stringMsg = msgUtils.getHandlerForMsgType('std_msgs/String');
    };
    expect(loadStrFunc).to.not.throw(/good function/);
    expect(stringMsg).to.be.a('function');
    expect(stringMsg).to.have.property('serialize');
    expect(stringMsg.serialize).to.be.a('function');
    expect(stringMsg).to.have.property('deserialize');
    expect(stringMsg.deserialize).to.be.a('function');
    expect(stringMsg).to.have.property('datatype');
    expect(stringMsg.datatype).to.be.a('function');
    expect(stringMsg).to.have.property('md5sum');
    expect(stringMsg.md5sum).to.be.a('function');
    expect(stringMsg).to.have.property('messageDefinition');
    expect(stringMsg.messageDefinition).to.be.a('function');

    done();
  });

  it('json or instance', (done) => {
    const msgData = 'chatter';
    const stdMsgString = msgUtils.getHandlerForMsgType('std_msgs/String');
    const msgInstance = new stdMsgString();
    msgInstance.data = msgData;

    let bufferInfo = {buffer: [], length: 0};
    const buf1 = Buffer.concat(stdMsgString.serialize(msgInstance, bufferInfo).buffer);

    bufferInfo = {buffer: [], length: 0};
    const buf2 = Buffer.concat(stdMsgString.serialize({data: msgData}, bufferInfo).buffer);

    expect(buf1.equals(buf2)).to.be.true;

    done();
  });

  describe('parse builtins', () => {
    it('string', (done) => {
      const stdMsgString = msgUtils.getHandlerForMsgType('std_msgs/String');
      const msgData = 'chatter';

      // manually serialize string msg
      const msgDataBuffer = new Buffer(msgData);
      const msgLen = msgDataBuffer.length;
      const msgLenBuffer = new Buffer(4);
      msgLenBuffer.writeUInt32LE(msgLen);
      const fullMsg = Buffer.concat([msgLenBuffer, msgDataBuffer]);

      // auto serialize
      const msg = new stdMsgString();
      msg.data = msgData;

      let bufferInfo = {buffer: [], length: 0};
      bufferInfo = stdMsgString.serialize(msg, bufferInfo);
      const fullMsg2 = Buffer.concat(bufferInfo.buffer);

      // expect equality
      expect(fullMsg.equals(fullMsg2)).to.be.true;

      // deserialize msg buffer - should equal original msgData
      expect(stdMsgString.deserialize(fullMsg2).data.data).to.equal(msgData);

      done();
    });

    it('int8', (done) => {
      const intData = -33;

      const msgBuffer = new Buffer(1);
      msgBuffer.writeInt8(intData);

      let bufferInfo = {buffer: [], length: 0};
      const Int8 = msgUtils.getHandlerForMsgType('std_msgs/Int8');
      Int8.serialize({data: intData}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Int8.deserialize(msgBuffer2).data.data).to.equal(intData);

      done();
    });

    it('uint8', (done) => {
      const data = 32;

      const msgBuffer = new Buffer(1);
      msgBuffer.writeInt8(data);

      let bufferInfo = {buffer: [], length: 0};
      const UInt8 = msgUtils.getHandlerForMsgType('std_msgs/UInt8');
      UInt8.serialize({data: data}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(UInt8.deserialize(msgBuffer2).data.data).to.equal(data);

      done();
    });

    it('int16', (done) => {
      const intData = -3345;

      const msgBuffer = new Buffer(2);
      msgBuffer.writeInt16LE(intData);

      let bufferInfo = {buffer: [], length: 0};
      const Int16 = msgUtils.getHandlerForMsgType('std_msgs/Int16');
      Int16.serialize({data: intData}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Int16.deserialize(msgBuffer2).data.data).to.equal(intData);

      done();
    });

    it('uint16', (done) => {
      const data = 65530;

      const msgBuffer = new Buffer(2);
      msgBuffer.writeUInt16LE(data);

      let bufferInfo = {buffer: [], length: 0};
      const UInt16 = msgUtils.getHandlerForMsgType('std_msgs/UInt16');
      UInt16.serialize({data: data}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(UInt16.deserialize(msgBuffer2).data.data).to.equal(data);

      done();
    });

    it('int32', (done) => {
      const intData = -3345;

      const msgBuffer = new Buffer(4);
      msgBuffer.writeInt32LE(intData);

      let bufferInfo = {buffer: [], length: 0};
      const Int32 = msgUtils.getHandlerForMsgType('std_msgs/Int32');
      Int32.serialize({data: intData}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Int32.deserialize(msgBuffer2).data.data).to.equal(intData);

      done();
    });

    it('uint32', (done) => {
      const data = 65530;

      const msgBuffer = new Buffer(4);
      msgBuffer.writeUInt32LE(data);

      let bufferInfo = {buffer: [], length: 0};
      const UInt32 = msgUtils.getHandlerForMsgType('std_msgs/UInt32');
      UInt32.serialize({data: data}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(UInt32.deserialize(msgBuffer2).data.data).to.equal(data);

      done();
    });

    it('int64', (done) => {
      // rosnodejs takes in raw buffer for 64bit integer msgs
      const intData = new Buffer([1, 2, 3, 0, 0, 0, 1, 6]);

      const msgBuffer = new Buffer(intData);

      let bufferInfo = {buffer: [], length: 0};
      const Int64 = msgUtils.getHandlerForMsgType('std_msgs/Int64');
      Int64.serialize({data: intData}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Int64.deserialize(msgBuffer2).data.data.equals(intData)).to.be.true;

      done();
    });

    it('uint64', (done) => {
      // rosnodejs takes in raw buffer for 64bit integer msgs
      const intData = new Buffer([1, 2, 3, 0, 0, 0, 1, 6]);

      const msgBuffer = new Buffer(intData);

      let bufferInfo = {buffer: [], length: 0};
      const UInt64 = msgUtils.getHandlerForMsgType('std_msgs/UInt64');
      UInt64.serialize({data: intData}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(UInt64.deserialize(msgBuffer2).data.data.equals(intData)).to.be.true;

      done();
    });

    it('float32', (done) => {
      const data = -3345.123;

      const msgBuffer = new Buffer(4);
      msgBuffer.writeFloatLE(data);

      let bufferInfo = {buffer: [], length: 0};
      const Float32 = msgUtils.getHandlerForMsgType('std_msgs/Float32');
      Float32.serialize({data: data}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Float32.deserialize(msgBuffer2).data.data).to.be.closeTo(data, 0.0005);

      done();
    });

    it('float64', (done) => {
      const data = -3345.123576;

      const msgBuffer = new Buffer(8);
      msgBuffer.writeDoubleLE(data);

      let bufferInfo = {buffer: [], length: 0};
      const Float32 = msgUtils.getHandlerForMsgType('std_msgs/Float64');
      Float32.serialize({data: data}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      expect(Float32.deserialize(msgBuffer2).data.data).to.be.closeTo(data, 0.0000005);

      done();
    });

    it('time', (done) => {
      const time = {secs: 0, nsecs: 0};

      const msgBuffer = new Buffer(8);
      msgBuffer.writeInt32LE(time.secs)
      msgBuffer.writeInt32LE(time.nsecs, 4);

      let bufferInfo = {buffer: [], length: 0};
      const Time = msgUtils.getHandlerForMsgType('std_msgs/Time');
      Time.serialize({data: time}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      const deserializedTime = Time.deserialize(msgBuffer2).data.data;
      expect(deserializedTime.secs).to.equal(time.secs);
      expect(deserializedTime.nsecs).to.equal(time.nsecs);

      done();
    });

    it('duration', (done) => {
      const duration = {secs: 0, nsecs: 0};

      const msgBuffer = new Buffer(8);
      msgBuffer.writeInt32LE(duration.secs)
      msgBuffer.writeInt32LE(duration.nsecs, 4);

      let bufferInfo = {buffer: [], length: 0};
      const Duration = msgUtils.getHandlerForMsgType('std_msgs/Duration');
      Duration.serialize({data: duration}, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);

      expect(msgBuffer.equals(msgBuffer2)).to.be.true;
      const deserializedDuration = Duration.deserialize(msgBuffer2).data.data;
      expect(deserializedDuration.secs).to.equal(duration.secs);
      expect(deserializedDuration.nsecs).to.equal(duration.nsecs);

      done();
    });
  });

  describe('complex_msgs', () => {
    it('messages and constants', (done) => {
      const BaseType = msgUtils.getHandlerForMsgType('test_msgs/BaseType');

      expect(BaseType).to.be.a('function');
      expect(BaseType).to.have.property('Constants');

      expect(BaseType.Constants.NUMERIC_CONSTANT_A).to.be.a('number');
      expect(BaseType.Constants.NUMERIC_CONSTANT_B).to.be.a('number');
      expect(BaseType.Constants.STRING_CONSTANT).to.be.a('string');

      expect(BaseType.Constants.NUMERIC_CONSTANT_A).to.equal(1);
      expect(BaseType.Constants.NUMERIC_CONSTANT_B).to.equal(2);
      expect(BaseType.Constants.STRING_CONSTANT).to.equal('hello');

      const baseType = new BaseType();
      baseType.string_field = BaseType.Constants.STRING_CONSTANT;
      baseType.num_field = BaseType.Constants.NUMERIC_CONSTANT_A;

      let bufferInfo = {buffer: [], length: 0};
      BaseType.serialize(baseType, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);

      const deserializedMsg = BaseType.deserialize(msgBuffer).data;

      expect(deserializedMsg.string_field).to.equal(baseType.string_field);
      expect(deserializedMsg.num_field).to.equal(baseType.num_field);

      done();
    });

    it('constant length arrays', (done) => {
      const CLA = msgUtils.getHandlerForMsgType('test_msgs/ConstantLengthArray');

      const cla = new CLA();
      const claArrLen = 10;
      expect(cla.array_field).to.be.a('Array');
      expect(cla.array_field.length).to.equal(claArrLen);

      cla.array_field.forEach((item) => {
        expect(item).to.be.a('number');
        expect(item).to.equal(0);
      });

      let bufferInfo = {buffer: [], length: 0};
      CLA.serialize(cla, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer.length).to.equal(claArrLen);

      const deserializedMsg = CLA.deserialize(msgBuffer).data;
      expect(deserializedMsg.array_field.length).to.equal(claArrLen);

      const BTCLA = msgUtils.getHandlerForMsgType('test_msgs/BaseTypeConstantLengthArray');
      const BaseType = msgUtils.getHandlerForMsgType('test_msgs/BaseType');

      const btcla = new BTCLA();
      const btclaArrLen = 5;
      expect(btcla.array_field).to.be.a('Array');
      expect(btcla.array_field.length).to.equal(btclaArrLen);

      btcla.array_field.forEach((item) => {
        expect(item).to.be.an.instanceof(BaseType);
      });

      bufferInfo = {buffer: [], length: 0};
      BTCLA.serialize(btcla, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer2.length).to.equal(25);

      const deserializedMsg2 = BTCLA.deserialize(msgBuffer2).data;
      expect(deserializedMsg2.array_field.length).to.equal(btclaArrLen);
      deserializedMsg2.array_field.forEach((item) => {
        expect(item).to.be.an.instanceof(BaseType);
      });

      done();
    });

    it('variable length arrays', (done) => {
      const VLA = msgUtils.getHandlerForMsgType('test_msgs/VariableLengthArray');

      const vla = new VLA();
      expect(vla.array_field).to.be.a('Array');
      expect(vla.array_field.length).to.equal(0);

      let bufferInfo = {buffer: [], length: 0};
      VLA.serialize(vla, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer.length).to.equal(4);

      const val = 12;
      const arrLen = 7;
      vla.array_field = new Array(arrLen).fill(val);
      vla.array_field.forEach((item) => {
        expect(item).to.be.a('number');
        expect(item).to.equal(val);
      });

      bufferInfo = {buffer: [], length: 0};
      VLA.serialize(vla, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer2.length).to.equal(arrLen + 4);

      const deserializedMsg = VLA.deserialize(msgBuffer2).data;
      expect(deserializedMsg.array_field.length).to.equal(arrLen);
      deserializedMsg.array_field.forEach((item) => {
        expect(item).to.be.a('number');
        expect(item).to.equal(val);
      });

      const BTVLA = msgUtils.getHandlerForMsgType('test_msgs/BaseTypeVariableLengthArray');
      const BaseType = msgUtils.getHandlerForMsgType('test_msgs/BaseType');

      const btvla = new BTVLA();
      expect(btvla.array_field).to.be.a('Array');
      expect(btvla.array_field.length).to.equal(0);

      bufferInfo = {buffer: [], length: 0};
      VLA.serialize(btvla, bufferInfo);
      const msgBuffer3 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer3.length).to.equal(4);

      const arrLen2 = 4;
      btvla.array_field = new Array(arrLen2).fill(new BaseType());

      bufferInfo = {buffer: [], length: 0};
      BTVLA.serialize(btvla, bufferInfo);
      const msgBuffer4 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer4.length).to.equal(24);

      const deserializedMsg2 = BTVLA.deserialize(msgBuffer4).data;
      expect(deserializedMsg2.array_field.length).to.equal(arrLen2);
      deserializedMsg2.array_field.forEach((item) => {
        expect(item).to.be.an.instanceof(BaseType);
      });

      done();
    });

    it('services and constants', (done) => {
      const BasicService = msgUtils.getHandlerForSrvType('test_msgs/BasicService');

      expect(BasicService).to.have.property('Request');
      expect(BasicService).to.have.property('Response');

      const BSRequest = BasicService.Request;
      expect(BSRequest.Constants.OP_REVERSE).to.equal('reverse');
      expect(BSRequest.Constants.OP_LEFT_PAD).to.equal('left_pad');
      const bsRequest = new BSRequest();
      expect(bsRequest.data).to.be.a('string');
      expect(bsRequest.op).to.be.a('string');

      const dataField = 'JUNK';
      bsRequest.data = dataField;
      bsRequest.op = BSRequest.Constants.OP_LEFT_PAD;
      let bufferInfo = {buffer: [], length: 0};
      BSRequest.serialize(bsRequest, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer.length).to.equal(20);

      const deserializedRequest = BSRequest.deserialize(msgBuffer).data;
      expect(deserializedRequest).to.be.an.instanceof(BSRequest);
      expect(deserializedRequest.data).to.equal(dataField);
      expect(deserializedRequest.op).to.equal(BSRequest.Constants.OP_LEFT_PAD);

      const BSResponse = BasicService.Response;
      expect(BSResponse.Constants.RES_NULL).to.equal('null');
      const bsResponse = new BSResponse();
      expect(bsResponse.result).to.be.a('string');

      bsResponse.result = BSResponse.Constants.RES_NULL;
      bufferInfo = {buffer: [], length: 0};
      BSResponse.serialize(bsResponse, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer2.length).to.equal(8);

      const deserializedResponse = BSResponse.deserialize(msgBuffer2).data;
      expect(deserializedResponse).to.be.an.instanceof(BSResponse);
      expect(deserializedResponse.result).to.equal(BSResponse.Constants.RES_NULL);

      done();
    });

    it('service depending on this package', (done) => {
      const TestService = msgUtils.getHandlerForSrvType('test_msgs/TestService');
      const BaseType = msgUtils.getHandlerForMsgType('test_msgs/BaseType');

      const TSRequest = TestService.Request;
      const TSResponse = TestService.Response;
      expect(TSRequest).to.be.a('function');
      expect(TSResponse).to.be.a('function');

      const tsRequest = new TSRequest();
      expect(tsRequest.input).to.be.an.instanceof(BaseType);
      tsRequest.input.string_field = BaseType.Constants.STRING_CONSTANT;

      let bufferInfo = {buffer: [], length: 0};
      TSRequest.serialize(tsRequest, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer.length).to.equal(10);

      const deserializedRequest = TSRequest.deserialize(msgBuffer).data;
      expect(deserializedRequest).to.be.an.instanceof(TSRequest);
      expect(deserializedRequest.input).to.be.an.instanceof(BaseType);


      const tsResponse =  new TSResponse();
      expect(tsResponse).to.be.empty;

      bufferInfo = {buffer: [], length: 0};
      TSResponse.serialize(tsResponse, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer2.length).to.equal(0);

      const deserializedRequest2 = TSResponse.deserialize(msgBuffer2).data;
      expect(deserializedRequest2).to.be.an.instanceof(TSResponse);
      expect(deserializedRequest2).to.be.empty;

      done();
    });

    it('message depending on another package', (done) => {
      const StdMsg = msgUtils.getHandlerForMsgType('test_msgs/StdMsg');
      const Header = msgUtils.getHandlerForMsgType('std_msgs/Header');

      const frameId = 'base';
      const time = {secs: 100, nsecs: 1000};
      const seq = 123;

      const header = new Header();
      expect(header.frame_id).to.be.a('string');
      header.seq = seq;
      header.stamp = time;
      header.frame_id = frameId;

      const stdMsg = new StdMsg();
      expect(stdMsg.header).to.be.an.instanceof(Header);
      stdMsg.header = header;
      stdMsg.time_field = time;

      let bufferInfo = {buffer: [], length: 0};
      StdMsg.serialize(stdMsg, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);

      const deserializedMsg = StdMsg.deserialize(msgBuffer).data;
      expect(deserializedMsg.header.seq).to.equal(seq);
      expect(deserializedMsg.header.stamp.secs).to.equal(time.secs);
      expect(deserializedMsg.header.stamp.nsecs).to.equal(time.nsecs);
      expect(deserializedMsg.header.frame_id).to.equal(frameId);
      expect(deserializedMsg.time_field.secs).to.equal(time.secs);
      expect(deserializedMsg.time_field.nsecs).to.equal(time.nsecs);

      done();
    });

    it('service depending on another package', (done) => {
      const HeaderService = msgUtils.getHandlerForSrvType('test_msgs/HeaderService');
      const Header = msgUtils.getHandlerForMsgType('std_msgs/Header');

      const HRequest = HeaderService.Request;
      const HResponse = HeaderService.Response;
      expect(HRequest).to.be.a('function');
      expect(HResponse).to.be.a('function');

      const hRequest = new HRequest();
      expect(hRequest).to.be.empty;

      let bufferInfo = {buffer: [], length: 0};
      HRequest.serialize(hRequest, bufferInfo);
      const msgBuffer = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer.length).to.equal(0);

      const deserializedRequest = HRequest.deserialize(msgBuffer).data;
      expect(deserializedRequest).to.be.an.instanceof(HRequest);
      expect(hRequest).to.be.empty;

      const hResponse =  new HResponse();
      expect(hResponse.header_response).to.be.an.instanceof(Header);
      const seq = 123;
      const frameId = 'base';
      hResponse.header_response.seq = seq;
      hResponse.header_response.frame_id = frameId;

      bufferInfo = {buffer: [], length: 0};
      HResponse.serialize(hResponse, bufferInfo);
      const msgBuffer2 = Buffer.concat(bufferInfo.buffer);
      expect(msgBuffer2.length).to.equal(20);

      const deserializedRequest2 = HResponse.deserialize(msgBuffer2).data;
      expect(deserializedRequest2).to.be.an.instanceof(HResponse);
      expect(deserializedRequest2.header_response).to.be.an.instanceof(Header);
      expect(deserializedRequest2.header_response.seq).to.equal(seq);
      expect(deserializedRequest2.header_response.frame_id).to.equal(frameId);
      expect(deserializedRequest2.header_response.stamp.secs).to.equal(0);
      expect(deserializedRequest2.header_response.stamp.nsecs).to.equal(0);

      done();
    });
  });

  describe('actions', () => {
    // TODO: TEST actions
  });
});
