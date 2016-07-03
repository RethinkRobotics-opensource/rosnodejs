'use strict';

/**
 * Quick test for serialization, deserialization Performance
 */

const expect = require('chai').expect;
const rosnodejs = require('./index.js');
const TfStamped = rosnodejs.require('geometry_msgs').msg.TransformStamped;
const TfMessage = rosnodejs.require('tf2_msgs').msg.TFMessage;
const Image = rosnodejs.require('sensor_msgs').msg.Image;


const NUM_CYCLES = 100;

console.log('=== Serialization Performance Test ===');
console.log(' ==');
console.log(' == Image Test');
console.log(' == Cycles: %d', NUM_CYCLES);
console.log(' ==');


let image;
console.time('Create Image');
let width = 1280,
    height = 800,
    step = width * 3;
for (let i = 0; i < NUM_CYCLES; ++i ) {
  image = new Image({
    width: width,
    height: height,
    encoding: 'bgr8',
    step: step,
    data: new Uint8Array(new Buffer(step * height))
  });
  image.header.frame_id = 'test_cam';
}
console.timeEnd('Create Image')

console.time('Determine Message Size');
let bufsize;
for (let i = 0; i < NUM_CYCLES; ++i) {
  bufsize = Image.getMessageSize(image);
}
console.timeEnd('Determine Message Size');

console.log('Buffer size: %d', bufsize);

console.time('allocate buffer');
let buffer;
for (let i = 0; i < NUM_CYCLES; ++i) {
  buffer = new Buffer(bufsize);
}
console.timeEnd('allocate buffer');

console.time('serialize');
for (let i = 0; i < NUM_CYCLES; ++i) {
  Image.serialize(image, buffer, 0);
}
console.timeEnd('serialize');

console.time('deserialize');
let deserialized;
for (let i = 0; i < NUM_CYCLES; ++i) {
   deserialized = Image.deserialize(buffer, [0]);
}
console.timeEnd('deserialize');

const NUM_TFS = 1000;

console.log(' ==');
console.log(' == TF Test');
console.log(' == Cycles: %d', NUM_CYCLES);
console.log(' == # of Transforms: %d', NUM_TFS);
console.log(' ==');

let tfStamped = new TfStamped();
tfStamped.header.frame_id = 'test_parent_frame';
tfStamped.child_frame_id = 'test_frame';

console.time('Create TfMessage');
let tfMessage;
for (let i = 0; i < NUM_CYCLES; ++i) {
  tfMessage = new TfMessage();
  for (let j = 0; j < NUM_TFS; ++j) {
    let tf = new TfStamped(tfStamped);
    tfMessage.transforms.push(tf);
  }
}
console.timeEnd('Create TfMessage');

console.time('Determine Message Size');
for (let i = 0; i < NUM_CYCLES; ++i) {
  bufsize = TfMessage.getMessageSize(tfMessage);
}
console.timeEnd('Determine Message Size');

console.log('Buffer size: %d', bufsize);

console.time('Allocate buffer');
for (let i = 0; i < NUM_CYCLES; ++i) {
  buffer = new Buffer(bufsize);
}
console.timeEnd('Allocate buffer');

console.time('Serialize');
for (let i = 0; i < NUM_CYCLES; ++i) {
  TfMessage.serialize(tfMessage, buffer, 0);
}
console.timeEnd('Serialize');

console.time('Deserialize');
for (let i = 0; i < NUM_CYCLES; ++i) {
   deserialized = TfMessage.deserialize(buffer, [0]);
}
console.timeEnd('Deserialize');
