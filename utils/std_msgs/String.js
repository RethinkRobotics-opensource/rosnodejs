'use strict';

/**
 * @return {Buffer} a buffer containing the tcpros representation of this string
 */
String.prototype.serialize = function() {
  let lenBuf = new Buffer(4);
  let thisBuf = new Buffer(this);
  let len = thisBuf.length;
  lenBuf.writeUInt32LE(len, 0);
  return Buffer.concat([lenBuf, thisBuf], 4 + len);
};

/**
 * @param buffer {Buffer} the buffer to pull a tcpros string from.
 *  1st 4 bytes are uint32 length strLen
 *  Take strLen bytes from buffer
 *  sets buffer to bytes remaining after pulling string out
 * @return {string} string pulled from buffer
 */
String.deserialize = function(buffer) {
  let strLen = buffer.readUInt32LE(0, true);
  let newBufStart = strLen + 4;
  let str = buffer.slice(4, newBufStart).toString();
  // just setting buffer to the sliced buffer here
  // doesn't change buffer in the calling function.
  // e.g.
  //  let buf;                             // [2] ['h'] ['i']
  //  let str = String.deserialize(buf);
  //  buf.length === 3                     // true, though expected 0
  buffer = buffer.slice(newBufStart);

  return {
    data: str,
    buffer: buffer
  };
};

module.exports = String;
