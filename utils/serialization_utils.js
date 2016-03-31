/*
 *    Copyright 2016 Rethink Robotics
 *
 *    Copyright 2016 Chris Smith
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

'use strict';
const util = require('util');
const Transform = require('stream').Transform;

//-----------------------------------------------------------------------

/**
 * DeserializeStream handles parsing of message chunks for TCPROS
 * encoded messages. When a full message has been received, it
 * emits 'message' with the data for that message. All socket
 * communications should be piped through this.
 */
function DeserializeStream(options) {
  if (!(this instanceof DeserializeStream)) {
    return new DeserializeStream(options);
	}

  Transform.call(this, options);
	// true once we've pulled off the message length
	// for the next message we'll need to deserialize
  this._inBody = false;

	// track how many bytes of this message we've received so far
	this._messageConsumed = 0;

	// how long this message will be
	this._messageLen = -1;

	// as bytes of this message arrive, store them in this
	// buffer until we have the whole thing
	this._messageBuffer = [];

  // FIXME: These are specific to parsing a service response...
  //   don't use them everywhere
  // the first byte in a service response is true/false service success/fail
  this._deserializeServiceResp = false;

  this._serviceRespSuccess = false;
}

DeserializeStream.prototype = {
	_transform(chunk, encoding, done) {
		//console.log('Deserialize ' + chunk.toString('hex'));
		let pos = 0;
		let chunkLen = chunk.length;
    //console.log('chunk start ' + chunk.toString('hex'));
		//console.log('Chunk length ' + chunkLen);
    //console.log('message remaining ' + (this._messageLen - this._messageConsumed));
		while (pos < chunkLen) {
			//console.log('pos ' + pos);
			if (this._inBody) {
				//console.log('consumed ' + this._messageConsumed);
				//
				let messageRemaining = this._messageLen - this._messageConsumed;
				// console.log('remaining ' + messageRemaining);

				// if the chunk is longer than the amount of the message we have left
				// just pull off what we need
				if (chunkLen >= messageRemaining + pos) {
					//console.log('finishing message');
					let slice = chunk.slice(pos, pos + messageRemaining);
					//let slice = new Buffer('hi');
					//console.log('slice ' + JSON.stringify(slice));
					this._messageBuffer.push(slice);
          let concatBuf = Buffer.concat(this._messageBuffer, this._messageLen);
          //console.log('Got entire message! at ' + Date.now());
          //console.log(chunkLen - pos + ' bytes left in chunk');
					this.emitMessage(concatBuf);
					//console.log(this._messageBuffer.toString());
					this._messageBuffer = [];
					pos += messageRemaining;
					this._inBody = false;
					this._messageConsumed = 0;
				}
				else {
          //console.log('got message part');
					this._messageBuffer.push(chunk.slice(pos));
					//console.log('Got message part! Message now: ' + this._messageBuffer.toString());
					this._messageConsumed += chunkLen;
					pos = chunkLen;
				}
			}
			else {
				// if we're deserializing a service response, first byte is 'success'
        if (this._deserializeServiceResp) {
          this._serviceRespSuccess = chunk.readUInt8(pos, true);
          ++pos;
        }

        // first 4 bytes of the message are a uint32 length field
				if (chunkLen - pos >= 4) {
          // console.log('reading msg length at ' + pos);
          //console.log(chunk.slice(pos).toString('hex'));
          //console.log('Reading length ' + chunk.slice(pos, pos+4).toString('hex'));
					this._messageLen = chunk.readUInt32LE(pos, true);
					//console.log('Message len ' + this._messageLen);
					pos += 4;
          // if its an empty message, there won't be any bytes left and message
          // will never be emitted -- handle that case here
          if (this._messageLen === 0 && pos === chunkLen) {
            //console.log('got empty message!');
            this.emitMessage(new Buffer([]));
          }
          else {
					  this._inBody = true;
          }
				}
				else {
					//console.log('Not enough chunk left to read message length - parsing is done');
					pos = chunkLen;
				}
			}
		}
    //console.log('message remaining at chunk end ' + (this._messageLen - this._messageConsumed));
		//console.log('done!');
	  done();
	},

  emitMessage(buffer) {
    if (this._deserializeServiceResp) {
      //console.log('Service message emit');
      this.emit('message', buffer, this._serviceRespSuccess);
    }
    else {
      //console.log('Reg message emit');
      this.emit('message', buffer);
    }
  },

  setServiceRespDeserialize() {
    this._deserializeServiceResp = true;
  }
};

util.inherits(DeserializeStream, Transform);

//-----------------------------------------------------------------------

function PrependLength(buffer, len) {
	let lenBuf = new Buffer(4);
	lenBuf.writeUInt32LE(len, 0);
	return Buffer.concat([lenBuf, buffer], buffer.length + 4);
}

//-----------------------------------------------------------------------

let SerializationUtils = {
	DeserializeStream: DeserializeStream,

	PrependLength: PrependLength,

	Serialize(buffer) {
    return PrependLength(buffer, buffer.length);
	},

	Deserialize(buffer) {
		let len = buffer.readUInt32LE(0, true)
		buffer = buffer.slice(4);
		return len;
	}
}

//-----------------------------------------------------------------------

module.exports = SerializationUtils;
