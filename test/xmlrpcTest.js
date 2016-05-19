'use strict'

const chai = require('chai');
const expect = chai.expect;
const rosnodejs = require('../index.js');
const xmlrpc = require('xmlrpc');
const netUtils = require('../utils/network_utils.js');

describe('Protocol Test', () => {
  // NOTE: make sure a roscore is not running (or something else at this address)
  rosnodejs.require('std_msgs');
  rosnodejs.require('std_srvs');
  let masterStub;
  const nodeName = '/testNode';

  before((done) => {
    masterStub = xmlrpc.createServer({host: 'localhost', port: 11311}, () => { done(); });
  });

  after((done) => {
    if (masterStub.httpServer.listening) {
      masterStub.close(() => { done(); });
    }
    else {
      done();
    }
  });

  describe('Xmlrpc', () => {

    beforeEach(() => {
      masterStub.on('getUri', (err, params, callback) => {
        const resp = [ 1, '', 'localhost:11311/' ]
        callback(null, resp);
      });

      return rosnodejs.initNode(nodeName);
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
      const sub = nh.subscribe(topic, msgType,
        (data) => {},
        { queueSize: 1, throttleMs: 1000 }
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
      const sub = nh.subscribe(topic, msgType,
        (data) => {},
        { queueSize: 1, throttleMs: 1000 }
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
      const pub = nh.advertise(topic, msgType, { latching: true,
                                                 queueSize: 1,
                                                 throttleMs: 1000 }
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
      const pub = nh.advertise(topic, msgType, { latching: true,
                                                 queueSize: 1,
                                                 throttleMs: 1000 }
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
      const serv = nh.advertiseService(service, srvType, (req, resp) => {});
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
      const serv = nh.advertiseService(service, srvType, (req, resp) => {});

      serv.on('registered', () => {
        nh.unadvertiseService(service);
      });
    });
  });

  describe('Pub-Sub', () => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/Int8';

    beforeEach(() => {
      let pubInfo = null;
      let subInfo = null;

      masterStub.on('getUri', (err, params, callback) => {
        const resp = [ 1, '', 'localhost:11311/' ]
        callback(null, resp);
      });

      masterStub.on('registerSubscriber', (err, params, callback) => {
        subInfo = params[3];
        //console.log('sub reg ' + params);
        //console.log(pubInfo);

        const resp =  [1, 'You did it!', []];
        if (pubInfo) {
          resp[2].push(pubInfo);
        }
        callback(null, resp);
      });

      masterStub.on('unregisterSubscriber', (err, params, callback) => {
        const resp =  [1, 'You did it!', subInfo ? 1 : 0];
        callback(null, resp);
        subInfo = null;
      });

      masterStub.on('registerPublisher', (err, params, callback) => {
        //console.log('pub reg');
        pubInfo = params[3];
        const resp =  [1, 'You did it!', []];
        if (subInfo) {
          resp[2].push(pubInfo);
          let subAddrParts = subInfo.replace('http://', '').split(':');
          let client = xmlrpc.createClient({host: subAddrParts[0], port: subAddrParts[1]});
          let data = [1, topic, [pubInfo]];
          client.methodCall('publisherUpdate', data, (err, response) => { });
        }
        callback(null, resp);
      });

      masterStub.on('unregisterPublisher', (err, params, callback) => {
        const resp =  [1, 'You did it!', pubInfo ? 1 : 0];
        callback(null, resp);
        pubInfo = null;
      });

      return rosnodejs.initNode(nodeName);
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

    it('Basic', (done) => {
      const nh = rosnodejs.nh;
      const valsToSend = [1,2,3];
      const valsReceived = new Set(valsToSend);
      const pub = nh.advertise(topic, msgType, { queueSize: 3 });

      const sub = nh.subscribe(topic, msgType, (data) => {
        valsReceived.delete(data.data);
        if (valsReceived.size === 0) {
          done();
        }
      }, {queueSize: 3});

      pub.on('connection', () => {
        valsToSend.forEach((val) => {
          pub.publish({data: val});
        });
      });
    });

    it('Latch', (done) => {
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType, { latching: true });

      pub.publish({data: 1});

      pub.on('registered', () => {
        const sub = nh.subscribe(topic, msgType, (data) => {
          done();
        });
      });
    });

    it('Throttle Pub', (done) => {
      const nh = rosnodejs.nh;
      const valsToSend = [1,2,3,4,5,6,7,8,9,10];
      const pub = nh.advertise(topic, msgType, { queueSize: 1, throttleMs: 100});
      let numMsgsReceived = 0;

      const sub = nh.subscribe(topic, msgType, (data) => {
        ++numMsgsReceived;
        if (data.data === valsToSend[valsToSend.length -1]) {
          expect(numMsgsReceived).to.equal(valsToSend.length/2 + 1);
          done();
        }
      }, {queueSize: 1});

      pub.on('connection', () => {
        valsToSend.forEach((val, index) => {
          setTimeout(() => {
            pub.publish({data: val});
          }, 50*index);
        });
      });
    });
  });
});
