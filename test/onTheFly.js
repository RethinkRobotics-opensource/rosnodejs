'use strict'

const chai = require('chai');
const expect = chai.expect;
let rosnodejs = require('../index.js');

rosnodejs.initNode('/my_node', { onTheFly: true})
  .then((rosNode) => {

    const geometry_msgs = rosnodejs.require('geometry_msgs').msg;
    const msg = new geometry_msgs.PoseWithCovariance({
        pose: {
          position: {x:0, y:0, z:0},
          orientation: {w:1, x:0, y:0, z:0}
        },
        covariance: [
          0,0,0,0,0,0.123,
          0,2,0,0,0,0,
          0,0,4,0,0,0,
          0,0,0,6,0,0,
          0,0,0,0,8,0,
          0.123,0,0,0,0,0.654321654321
        ]
      });

    describe('OnTheFly', () => {

        it('serialize/deserialize', (done) => {
            const size = geometry_msgs.PoseWithCovariance.getMessageSize(msg);
            const buffer = new Buffer(size);
            geometry_msgs.PoseWithCovariance.serialize(msg, buffer, 0);

            const read = geometry_msgs.PoseWithCovariance.deserialize(buffer);
            expect(read.covariance.length == msg.covariance.length
              && read.covariance.every((v,i)=> v === msg.covariance[i])).to.be.true;

            done();
          });
      });
  });
