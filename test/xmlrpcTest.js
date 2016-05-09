'use strict'

const chai = require('chai');
const expect = chai.expect;
const rosnodejs = require('../index.js');
const xmlrpc = require('xmlrpc');
const netUtils = require('../utils/network_utils.js');

describe('XmlrpcTests', () => {
  // NOTE: make sure a roscore is not running (or something else at this address)
  rosnodejs.require('std_msgs');
  rosnodejs.require('std_srvs');
  let masterStub = xmlrpc.createServer({host: 'localhost', port: 11311});
  const nodeName = '/testNode';

  beforeEach(() => {
    masterStub.on('getUri', (err, params, callback) => {
      const resp = [ 1, '', 'localhost:11311/' ]
      callback(null, resp);
    });

    return rosnodejs.initNode(nodeName);
  });

  it('registerSubscriber', (done) => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/String';
    masterStub.on('registerSubscriber', (err, params, callback) => {
      expect(params.length).to.equal(4);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(topic);
      expect(params[2]).to.equal(msgType);
      expect(params[3].startsWith('http://')).to.be.true;

      const info = netUtils.getAddressAndPortFromUri(params[3]);
      expect(info.host).to.be.a('string');
      expect(info.host.length).to.not.equal(0);
      expect(info.port).to.be.a('string');
      expect(info.port.length).to.not.equal(0);

      done();
    });

    const nh = rosnodejs.nh;
    const sub = nh.subscribe({
      topic: topic,
      type: msgType,
      queueSize: 1,
      throttleMs: 1000},
      (data) => {}
    );
  });

  it('unregisterSubscriber', (done) => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/String';
    let nodeUri;

    masterStub.on('registerSubscriber', (err, params, callback) => {
      nodeUri = params[3];

      const resp = [ 1, 'registered!', [] ];
      callback(null, resp);
    });

    masterStub.on('unregisterSubscriber', (err, params, callback) => {
      expect(params.length).to.equal(3);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(topic);
      expect(params[2]).to.equal(nodeUri);

      done();
    });

    const nh = rosnodejs.nh;
    const sub = nh.subscribe({
      topic: topic,
      type: msgType,
      queueSize: 1,
      throttleMs: 1000},
      (data) => {}
    );

    sub.on('registered', () => {
      nh.unsubscribe(topic);
    });
  });

  it('registerPublisher', (done) => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/String';
    masterStub.on('registerPublisher', (err, params, callback) => {
      expect(params.length).to.equal(4);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(topic);
      expect(params[2]).to.equal(msgType);
      expect(params[3].startsWith('http://')).to.be.true;

      const info = netUtils.getAddressAndPortFromUri(params[3]);
      expect(info.host).to.be.a('string');
      expect(info.host.length).to.not.equal(0);
      expect(info.port).to.be.a('string');
      expect(info.port.length).to.not.equal(0);

      done();
    });

    const nh = rosnodejs.getNodeHandle();
    const sub = nh.advertise({
      topic: topic,
      type: msgType,
      latching: true,
      queueSize: 1,
      throttleMs: 1000}
    );
  });

  it('unregisterPublisher', (done) => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/String';
    let nodeUri;

    masterStub.on('registerPublisher', (err, params, callback) => {
      nodeUri = params[3];

      const resp = [ 1, 'registered!', [] ];
      callback(null, resp);
    });

    masterStub.on('unregisterPublisher', (err, params, callback) => {
      expect(params.length).to.equal(3);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(topic);
      expect(params[2]).to.equal(nodeUri);

      done();
    });

    const nh = rosnodejs.nh;
    const pub = nh.advertise({
      topic: topic,
      type: msgType,
      latching: true,
      queueSize: 1,
      throttleMs: 1000}
    );

    pub.on('registered', () => {
      nh.unadvertise(topic);
    });
  });

  it('registerService', (done) => {
    const service = '/test_service';
    const srvType = 'std_srvs/Empty';
    masterStub.on('registerService', (err, params, callback) => {
      expect(params.length).to.equal(4);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(service);
      expect(params[2].startsWith('rosrpc://')).to.be.true;

      let info = netUtils.getAddressAndPortFromUri(params[2]);
      expect(info.host).to.be.a('string');
      expect(info.host.length).to.not.equal(0);
      expect(info.port).to.be.a('string');
      expect(info.port.length).to.not.equal(0);

      expect(params[3].startsWith('http://')).to.be.true;

      info = netUtils.getAddressAndPortFromUri(params[3]);
      expect(info.host).to.be.a('string');
      expect(info.host.length).to.not.equal(0);
      expect(info.port).to.be.a('string');
      expect(info.port.length).to.not.equal(0);

      done();
    });

    const nh = rosnodejs.nh;
    const serv = nh.advertiseService({
      service: service,
      type: srvType
    }, (req, resp) => {});
  });

  it('unregisterService', (done) => {
    const service = '/test_service';
    const srvType = 'std_srvs/Empty';
    let serviceUri = null;
    masterStub.on('registerService', (err, params, callback) => {
      serviceUri = params[2];

      const resp = [1, 'registered!', ''];
      callback(null, resp);
    });

    masterStub.on('unregisterService', (err, params, callback) => {
      expect(params.length).to.equal(3);
      expect(params[0]).to.equal(nodeName);
      expect(params[1]).to.equal(service);
      expect(params[2]).to.equal(serviceUri);

      done();
    });

    const nh = rosnodejs.nh;
    const serv = nh.advertiseService({
      service: service,
      type: srvType
    }, (req, resp) => {});

    serv.on('registered', () => {
      nh.unadvertiseService(service);
    });
  });

  afterEach(() => {
    const nh = rosnodejs.nh;

    // clear out any service, subs, pubs
    nh._node._services = {};
    nh._node._subscribers = {};
    nh._node._publishers = {};

    // remove any master api handlers we set up
    masterStub.removeAllListeners();
  });
});
