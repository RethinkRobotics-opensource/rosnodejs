'use strict'

const chai = require('chai');
const expect = chai.expect;
const msgUtils = require('../utils/message_utils.js');

describe('genjsTests', () => {
  msgUtils.findMessageFiles();
  msgUtils.loadMessagePackage('std_msgs');
  msgUtils.loadMessagePackage('baxter_core_msgs');

  it('basic', (done) => {
    let stringMsg;
    const loadStrFunc = () => {
      stringMsg = msgUtils.getHandlerForMsgType('std_msgs/String');
    };
    expect(loadStrFunc).to.not.throw(/good function/);
    expect(stringMsg).to.be.a('function');
    expect(stringMsg).to.have.property('serialize');
    expect(stringMsg).to.have.property('deserialize');
    expect(stringMsg).to.have.property('datatype');
    expect(stringMsg).to.have.property('md5sum');
    expect(stringMsg).to.have.property('messageDefinition');

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
      // rosjs takes in raw buffer for 64bit integer msgs
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
      // rosjs takes in raw buffer for 64bit integer msgs
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
});
