import { expect } from 'chai';
import rosnodejs from '../src/index';
import Master from './utils/MasterStub';

const MASTER_PORT = 11234;

describe('OnTheFly', function () {
  let master: Master;

  before(function() {
    this.timeout(0);

    master = new Master('localhost', MASTER_PORT);
    master.provideAll();

    return rosnodejs.initNode('/testNode', {
      rosMasterUri: `http://localhost:${MASTER_PORT}`,
      onTheFly: true,
      notime: true,
      logging: {skipRosLogging: true}})
  });

  after(async () => {
    await rosnodejs.shutdown();
    rosnodejs.reset();
    return master.shutdown();
  });

  it('serialize/deserialize PoseWithCovariance', (done) => {
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

    const size = geometry_msgs.PoseWithCovariance.getMessageSize(msg);
    const buffer = Buffer.allocUnsafe(size);
    geometry_msgs.PoseWithCovariance.serialize(msg, buffer, 0);

    const read = geometry_msgs.PoseWithCovariance.deserialize(buffer);
    expect(read.covariance.length == msg.covariance.length
      && read.covariance.every((v: any, i: number)=> v === msg.covariance[i])).to.be.true;

    done();
  });

  it('serialize/deserialize String', (done) => {
    const std_msgs = rosnodejs.require('std_msgs').msg;
    const data = 'sДvΣ τhΣ 子猫';  // Test with multi-byte UTF-8 characters.
                                   // If this test fails, you killed a kitten.
    const msg = new std_msgs.String({ data: data });

    const size = std_msgs.String.getMessageSize(msg);

    const buffer = Buffer.allocUnsafe(size);
    std_msgs.String.serialize(msg, buffer, 0);

    const read = std_msgs.String.deserialize(buffer);
    expect(read.data).to.deep.equal(data);

    done();
  });

  it('UTF String', (done) => {
    const nh = rosnodejs.nh;
    const msg = 'Hello, 世界世界世界';
    const topic = '/chatter';
    const pub = nh.advertise(topic, 'std_msgs/String');

    const sub = nh.subscribe(topic, 'std_msgs/String', (data: any) => {
      expect(data.data).to.equal(msg);
      done();
    });

    pub.on('connection', () => {
      pub.publish({data: msg});
    });
  });
});
