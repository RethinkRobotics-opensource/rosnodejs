import * as net from 'net';
import { expect } from 'chai';
import rosnodejs from '../src/index';
import Subscriber from '../src/lib/Subscriber';
import SubscriberImpl from '../src/lib/impl/SubscriberImpl';
import * as xmlrpc from 'xmlrpc-rosnodejs';
import * as netUtils from '../src/utils/network_utils';
import MasterStub from './utils/MasterStub';
import * as XmlrpcTypes from '../src/types/XmlrpcTypes';

const MASTER_PORT = 11234;

// helper function to throw errors outside a promise scope
// so they actually trigger failures
function throwNext(msg: string) {
  process.nextTick(() => { throw new Error(msg)});
}

type XmlrpcCallback = (err: any, resp: any)=>void;

const initArgs = {
  rosMasterUri: `http://localhost:${MASTER_PORT}`,
  logging: {skipRosLogging: true},
  notime: true
};
const nodeName = '/testNode';

describe('Protocol Test', () => {
  // NOTE: make sure a roscore is not running (or something else at this address)
  rosnodejs.require('std_msgs');
  rosnodejs.require('std_srvs');

  let masterStub: xmlrpc.Server;

  async function startMasterStub() {
    return new Promise<xmlrpc.Server>(resolve => {
      masterStub = xmlrpc.createServer({ host: 'localhost', port: MASTER_PORT }, resolve);
      masterStub.on('NotFound', (method) => {
          console.error('Method %s does not exist', method);
      });
      masterStub.on('getUri', (err: any, params: any, callback: XmlrpcCallback) => {
        callback(null, [ 1, '', `localhost:${MASTER_PORT}/` ]);
      });
    });
  }

  async function stopMasterStub() {
    if (masterStub) {
      await new Promise<void>(resolve => {
        masterStub.close(() => { resolve(); });
      });
      masterStub = null;
    }
  }

  function clearOutClients(node: any) {
    Object.keys(node._services).forEach((service) => {
      node._services[service].disconnect();
    });

    Object.keys(node._subscribers).forEach((sub) => {
      node._subscribers[sub].shutdown();
    });

    Object.keys(node._publishers).forEach((pub) => {
      node._publishers[pub].shutdown();
    });

    node._services = {};
    node._subscribers = {};
    node._publishers = {};
  }

  it('serialize/deserialize String', (done) => {
    const std_msgs = rosnodejs.require('std_msgs').msg;
    const data = 'sДvΣ τhΣ 子猫';  // Test with multi-byte UTF-8 characters.
                                   // If this test fails, you killed a kitten.
    const msg = new std_msgs.String({ data: data });

    const size = std_msgs.String.getMessageSize(msg);

    const buffer = new Buffer(size);
    std_msgs.String.serialize(msg, buffer, 0);

    const read = std_msgs.String.deserialize(buffer);
    expect(read.data).to.deep.equal(data);

    done();
  });

  describe('Xmlrpc', () => {
    before(async () => {
      await startMasterStub();
      await rosnodejs.initNode(nodeName, initArgs);
    });

    after(async () => {
      await stopMasterStub();
      await rosnodejs.shutdown();
      rosnodejs.reset();
    });

    afterEach(() => {
      const nh = rosnodejs.nh;

      // clear out any service, subs, pubs
      clearOutClients((nh as any)._node);

      (nh as any)._node._spinner.clear();

      // remove any master api handlers we set up
      masterStub.removeAllListeners();
    });

    it('registerSubscriber', (done) => {
      const topic = '/test_topic';
      const msgType = 'std_msgs/String';
      masterStub.on('registerSubscriber', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(4);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(topic);
        expect(params[2]).to.equal(msgType);
        expect(params[3].startsWith('http://')).to.be.true;

        const info = netUtils.getAddressAndPortFromUri(params[3]);
        expect(info.host).to.be.a('string');
        expect(info.host.length).to.not.equal(0);
        expect(info.port).to.be.a('number');

        callback(null, [ 1, 'registered!', [] ]);
      });

      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, msgType,
        (data: any) => {},
        { queueSize: 1, throttleMs: 1000 }
      );

      sub.on('registered', () => {
        done();
      })
    });

    it('unregisterSubscriber', (done) => {
      const topic = '/test_topic';
      const msgType = 'std_msgs/String';
      let nodeUri: string;

      masterStub.on('registerSubscriber', (err: any, params: any, callback: XmlrpcCallback) => {
        nodeUri = params[3];

        callback(null, [ 1, 'registered!', [] ]);
      });

      masterStub.on('unregisterSubscriber', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(3);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(topic);
        expect(params[2]).to.equal(nodeUri);

        callback(null, [ 1, 'unregistered!', [] ]);
        done();
      });

      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, msgType,
        (data: any) => {},
        { queueSize: 1, throttleMs: 1000 }
      );

      sub.on('registered', () => {
        nh.unsubscribe(topic);
      });
    });

    it('registerPublisher', (done) => {
      const topic = '/test_topic';
      const msgType = 'std_msgs/String';
      masterStub.on('registerPublisher', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(4);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(topic);
        expect(params[2]).to.equal(msgType);
        expect(params[3].startsWith('http://')).to.be.true;

        const info = netUtils.getAddressAndPortFromUri(params[3]);
        expect(info.host).to.be.a('string');
        expect(info.host.length).to.not.equal(0);
        expect(info.port).to.be.a('number');

        callback(null, [ 1, 'registered!', [] ]);
        done();
      });

      const nh = rosnodejs.getNodeHandle();
      const pub = nh.advertise(topic, msgType, { latching: true,
                                                 queueSize: 1,
                                                 throttleMs: 1000 });
    });

    it('unregisterPublisher', (done) => {
      const topic = '/test_topic';
      const msgType = 'std_msgs/String';
      let nodeUri: string;

      masterStub.on('registerPublisher', (err: any, params: any, callback: XmlrpcCallback) => {
        nodeUri = params[3];

        callback(null, [ 1, 'registered!', [] ]);
      });

      masterStub.on('unregisterPublisher', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(3);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(topic);
        expect(params[2]).to.equal(nodeUri);

        callback(null, [ 1, 'unregistered!', [] ]);
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
      masterStub.on('registerService', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(4);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(service);
        expect(params[2].startsWith('rosrpc://')).to.be.true;

        let info = netUtils.getAddressAndPortFromUri(params[2]);
        expect(info.host).to.be.a('string');
        expect(info.host.length).to.not.equal(0);
        expect(info.port).to.be.a('number');

        expect(params[3].startsWith('http://')).to.be.true;

        info = netUtils.getAddressAndPortFromUri(params[3]);
        expect(info.host).to.be.a('string');
        expect(info.host.length).to.not.equal(0);
        expect(info.port).to.be.a('number');

        callback(null, [ 1, 'registered!', [] ]);
      });

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => { return true; });
      serv.on('registered', done);
    });

    it('unregisterService', (done) => {
      const service = '/test_service';
      const srvType = 'std_srvs/Empty';
      let serviceUri: string = null;
      masterStub.on('registerService', (err: any, params: any, callback: XmlrpcCallback) => {
        serviceUri = params[2];

        callback(null, [1, 'registered!', '']);
      });

      masterStub.on('unregisterService', (err: any, params: any, callback: XmlrpcCallback) => {
        expect(params.length).to.equal(3);
        expect(params[0]).to.equal(nodeName);
        expect(params[1]).to.equal(service);
        expect(params[2]).to.equal(serviceUri);

        callback(null, [ 1, 'unregistered!', [] ]);
        done();
      });

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => { return true; });

      serv.on('registered', () => {
        nh.unadvertiseService(service);
      });
    });
  });

  describe('Pub-Sub', () => {
    const topic = '/test_topic';
    const msgType = 'std_msgs/Int8';

    before(async () => {
      await startMasterStub();
      await rosnodejs.initNode(nodeName, initArgs);

      masterStub.on('getUri', (err: any, params: any, callback: XmlrpcCallback) => {
        callback(null, [ 1, '', `localhost:${MASTER_PORT}/` ]);
      });
    });

    after(async () => {
      await stopMasterStub();
      await rosnodejs.shutdown();
      rosnodejs.reset();
    });

    beforeEach(() => {
      let pubInfo: any = null;
      let subInfo: any = null;

      masterStub.on('getUri', (err: any, params: any, callback: XmlrpcCallback) => {
        const resp = [ 1, '', 'localhost:11311/' ]
        callback(null, resp);
      });

      masterStub.on('registerSubscriber', (err: any, params: any, callback: XmlrpcCallback) => {
        subInfo = params[3];
        //console.log('sub reg ' + params);
        //console.log(pubInfo);

        const resp: XmlrpcTypes.RegisterSubscriber['Resp'] =  [1, 'You did it!', []];
        if (pubInfo) {
          resp[2].push(pubInfo);
        }
        callback(null, resp);
      });

      masterStub.on('unregisterSubscriber', (err: any, params: any, callback: XmlrpcCallback) => {
        const resp =  [1, 'You did it!', subInfo ? 1 : 0];
        callback(null, resp);
        subInfo = null;
      });

      masterStub.on('registerPublisher', (err: any, params: any, callback: XmlrpcCallback) => {
        //console.log('pub reg');
        pubInfo = params[3];
        const resp: XmlrpcTypes.RegisterPublisher['Resp'] =  [1, 'You did it!', []];
        if (subInfo) {
          resp[2].push(pubInfo);
          let subAddrParts = subInfo.replace('http://', '').split(':');
          let client = xmlrpc.createClient({host: subAddrParts[0], port: subAddrParts[1]});
          let data = [1, topic, [pubInfo]];
          client.methodCall('publisherUpdate', data, (err, response) => { });
        }
        callback(null, resp);
      });

      masterStub.on('unregisterPublisher', (err: any, params: any, callback: XmlrpcCallback) => {
        const resp =  [1, 'You did it!', pubInfo ? 1 : 0];
        callback(null, resp);
        pubInfo = null;
      });

      return rosnodejs.initNode(nodeName, initArgs);
    });

    afterEach(() => {
      const nh = rosnodejs.nh;

      // clear out any service, subs, pubs
      clearOutClients((nh as any)._node);

      (nh as any)._node._spinner.clear();

      // remove any master api handlers we set up
      masterStub.removeAllListeners();
    });

    it('Basic', (done) => {
      const nh = rosnodejs.nh;
      const valsToSend = [1,2,3];
      const valsReceived = new Set(valsToSend);
      const pub = nh.advertise(topic, msgType, { queueSize: 3 });

      const sub = nh.subscribe(topic, msgType, (data: any) => {
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

    it('UTF String', (done) => {
      const nh = rosnodejs.nh;
      const msg = 'Hello, 世界世界世界';
      const pub = nh.advertise(topic, 'std_msgs/String');

      const sub = nh.subscribe(topic, 'std_msgs/String', (data: any) => {
        expect(data.data).to.equal(msg);
        done();
      });

      pub.on('connection', () => {
        pub.publish({data: msg});
      });
    });

    it('Latch', (done) => {
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType, { latching: true });

      pub.publish({data: 1});

      pub.on('registered', () => {
        const sub = nh.subscribe(topic, msgType, (data: any) => {
          done();
        });
      });
    });

    it('Invalid Without Resolve Causes Error', (done) => {
      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, 'std_msgs/String');

      // NOTE: you'll see an error logged here - THAT'S OK
      // WE'RE EXPECTING AN ERROR TO LOG
      const logCapture = {
        write(rec: any) {
          if (rec.level === rosnodejs.log.levelFromName['error'] &&
              rec.msg.startsWith('Error when publishing'))
          {
            done();
          }
        }
      };

      rosnodejs.log.addStream({
        type: 'raw',
        name: 'testCapture',
        stream: logCapture,
        level: 'error'
      });

      sub.on('registered', () => {
        const pub = nh.advertise(topic, 'std_msgs/String', {latching: true});

        pub.on('connection', () => {
          pub.publish({});
        });

        pub.on('error', (err: any) => {
          (nh as any)._node._spinner._queueLocked = false;
        });
      });
    });

    it('Resolve', (done) => {
      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, 'std_msgs/String', (data: any) => {
        done();
      });

      sub.on('registered', () => {
        const pub = nh.advertise(topic, 'std_msgs/String', { latching: true, resolve: true });

        pub.on('registered', () => {
          pub.publish({});
        });
      });
    });

    it('Throttle Pub', function(done) {
      this.slow(1000);

      const nh = rosnodejs.nh;
      const valsToSend = [1,2,3,4,5,6,7,8,9,10];
      const pub = nh.advertise(topic, msgType, { queueSize: 1, throttleMs: 100});
      let numMsgsReceived = 0;

      const sub = nh.subscribe(topic, msgType, (data: any) => {
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

    it('Disconnect Pub', (done) => {
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType);
      const sub = nh.subscribe(topic, msgType, (data: any) => {
        expect(pub.getNumSubscribers()).to.equal(1);
        expect(sub.getNumPublishers()).to.equal(1);

        pub.shutdown();

        expect(pub.getNumSubscribers()).to.equal(0);
      });

      sub.on('disconnect', () => {
        expect(sub.getNumPublishers()).to.equal(0);
        done()
      });

      pub.on('connection', () => { pub.publish({data: 1}); });
    });

    it('Disconnect Sub', (done) => {
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType);
      const sub = nh.subscribe(topic, msgType, (data: any) => {
        expect(pub.getNumSubscribers()).to.equal(1);
        expect(sub.getNumPublishers()).to.equal(1);
        console.log('got data');
        sub.shutdown();

        expect(sub.getNumPublishers()).to.equal(0);
      });

      pub.on('disconnect', () => {
        expect(pub.getNumSubscribers()).to.equal(0);
        done()
      });

      pub.on('connection', () => { pub.publish({data: 1}); });
    });

    it('Shutdown Subscriber During Registration', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, msgType);

      sub.on('registered', () => {
        throwNext('Subscriber should never have registered!');
      });

      sub.shutdown();

      // if we haven't seen the 'registered' event by now we should be good
      setTimeout(done, 500);
    });

    it('Shutdown Subscriber Requesting Topic', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType);

      pub.on('registered', () => {
        const sub = nh.subscribe(topic, msgType);
        sub.on('registered', () => {
          sub.shutdown();
        });
        sub.on('connection', () => {
          throwNext('Sub should not have gotten connection');
        })
      });

      // if we haven't seen thrown by now we should be good
      setTimeout(done, 500);
    });

    it('Shutdown Subscriber Connecting to Publisher', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      // manually construct a subscriber...
      const subImpl = new SubscriberImpl({
          topic,
          type: 'std_msgs/String',
          typeClass: rosnodejs.require('std_msgs').msg.String,
          transports: ['TCPROS']
        },
        (nh as any)._node);

      const sub = new Subscriber(subImpl);

      const SOCKET_CONNECT_CACHED = net.Socket.prototype.connect;
      const SOCKET_END_CACHED = net.Socket.prototype.end;

      sub.on('registered', () => {

        (net.Socket.prototype.connect as any) = function(port: any, address: any, callback: ()=>void) {
          process.nextTick(() => {
            callback();
          });
        };

        net.Socket.prototype.end = function() {
          process.nextTick(() => {
            net.Socket.prototype.connect = SOCKET_CONNECT_CACHED;
            net.Socket.prototype.end = SOCKET_END_CACHED;

            done();
          });

          // even though we didn't actually connect, this socket seems to make
          // the suite hang unless we call the actual Socket.prototype.end()
          SOCKET_END_CACHED.call(this);
        };

        (subImpl as any)._handleTopicRequestResponse([1, 'ok', ['TCPROS', 'junk_address', 1234]], 'http://junk_address:1234');
        sub.shutdown();
      });
    });

    it('Shutdown Publisher During Registration', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      const pub = nh.advertise(topic, msgType);

      pub.on('registered', () => {
        throwNext('Publisher should never have registered!');
      });

      pub.shutdown();

      // if we haven't seen the 'registered' event by now we should be good
      setTimeout(done, 500);
    });

    it('Shutdown Publisher With Queued Message', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, msgType, () => {
        throwNext('Subscriber should never have gotten messages!');
      });
      let pub = nh.advertise(topic, msgType);

      pub.on('connection', () => {
        pub.publish({data: 1});
        pub.shutdown();
      });

      // if we haven't received a message by now we should be good
      setTimeout(done, 500);
    });

    it('Shutdown Subscriber With Pending Publisher Client', function(done) {
      this.slow(1600);
      const nh = rosnodejs.nh;
      const sub = nh.subscribe(topic, msgType, () => {
        throwNext('Subscriber should never have gotten messages!');
      });
      let pub = nh.advertise(topic, msgType);

      // when publisher emits 'connection', it has validated
      // the subscriber's connection header and sent a response back
      // the subscriber will not have validated the publisher's connection
      // header though so it should have a pending publisher entry.
      pub.on('connection', () => {
        const impl = (sub as any)._impl;

        expect(Object.keys(impl._pendingPubClients)).to.have.lengthOf(1);
        expect(impl._pubClients).to.be.empty;

        sub.shutdown();

        expect(impl._pendingPubClients).to.be.empty;
        expect(impl._pubClients).to.be.empty;

        setTimeout(() => {
          expect(impl._pendingPubClients).to.be.empty;
          expect(impl._pubClients).to.be.empty;
          done();
        }, 500);
      });
    });

    it('2 Publishers on Same Topic', function(done) {
      this.slow(2000);
      const nh = rosnodejs.nh;

      let msg1: any;
      const sub = nh.subscribe(topic, msgType, (msg: any) => {
          msg1 = msg.data;
      });

      const pub1 = nh.advertise(topic, msgType, {latching: true});
      const pub2 = nh.advertise(topic, msgType, {latching: true});

      expect(pub1).to.not.equal(pub2);
      expect((pub1 as any)._impl.listenerCount('connection')).to.equal(2);
      expect((pub2 as any)._impl.listenerCount('connection')).to.equal(2);

      pub1.publish({data: 1});

      sub.once('message', ({data}) => {
        expect(sub.getNumPublishers()).to.equal(1);
        expect(data).to.equal(1);

        pub2.publish({data: 2});
        sub.once('message', async ({data}) => {
          expect(data).to.equal(2);

          await pub1.shutdown();
          expect((pub1 as any)._impl).to.equal(null);
          expect((pub2 as any)._impl.listenerCount('connection')).to.equal(1);

          expect(sub.getNumPublishers()).to.equal(1);

          pub2.publish({data: 3});

          sub.once('message', async ({data}) => {
            expect(data).to.equal(3);

            await pub2.shutdown()
            expect(sub.getNumPublishers()).to.equal(0);
            expect((pub2 as any)._impl).to.equal(null);
            done();
          })
        });
      })
    });

    it('2 Subscribers on Same Topic', function(done) {
      this.slow(2000);
      const nh = rosnodejs.nh;

      let msg1: any;
      const sub1 = nh.subscribe(topic, msgType, (msg: any) => {
          msg1 = msg.data;
      });

      let msg2: any;
      const sub2 = nh.subscribe(topic, msgType, (msg: any) => {
        msg2 = msg.data;
      });

      expect(sub1).to.not.equal(sub2);
      expect((sub1 as any)._impl.listenerCount('connection')).to.equal(2);
      expect((sub2 as any)._impl.listenerCount('connection')).to.equal(2);

      const pub = nh.advertise(topic, msgType, {latching: true});

      pub.publish({data: 1});

      sub2.once('message', () => {
        expect(pub.getNumSubscribers()).to.equal(1);

        expect(msg1).to.equal(msg2);
        pub.publish({data: 25});

        sub2.once('message', async () => {
          expect(msg1).to.equal(msg2);
          msg1 = null;
          msg2 = null;

          await sub1.shutdown();
          expect((sub1 as any)._impl).to.equal(null);
          expect((sub2 as any)._impl.listenerCount('connection')).to.equal(1);
          pub.publish({data: 30});

          sub2.once('message', async () => {
            expect(msg1).to.equal(null);
            expect(msg2).to.equal(30);
            expect(pub.getNumSubscribers()).to.equal(1);

            await sub2.shutdown()
            expect((sub2 as any)._impl).to.equal(null);
            expect(pub.getNumSubscribers()).to.equal(0);
            done();
          });
        });
      });
    });
  });

  describe('Service', () => {
    const service = '/test_service';
    const srvType = 'std_srvs/Empty';

    before(async () => {
      await startMasterStub();
      await rosnodejs.initNode(nodeName, initArgs);

      masterStub.on('getUri', (err: any, params: any, callback: XmlrpcCallback) => {
        callback(null, [ 1, '', `localhost:${MASTER_PORT}/` ]);
      });
    });

    after(async () => {
      await stopMasterStub();
      await rosnodejs.shutdown();
      rosnodejs.reset();
    });

    beforeEach(() => {
      let serviceInfo: any = null;

      masterStub.on('getUri', (err: any, params: any, callback: XmlrpcCallback) => {
        callback(null, [1, '', 'localhost:11311/']);
      });

      masterStub.on('registerService', (err: any, params: any, callback: XmlrpcCallback) => {
        serviceInfo = params[2];
        callback(null, [1, 'Registered', []]);
      });

      masterStub.on('unregisterService', (err: any, params: any, callback: XmlrpcCallback) => {
        callback(null, [1, 'Unregistered', serviceInfo ? 1 : 0]);
        serviceInfo = null;
      });

      masterStub.on('lookupService', (err: any, params: any, callback: XmlrpcCallback) => {
        if (serviceInfo) {
          callback(null, [1, "you did it", serviceInfo]);
        }
        else {
          callback(null, [-1, "no provider", ""]);
        }
      });

      return rosnodejs.initNode(nodeName, initArgs);
    });

    afterEach(() => {
      const nh = rosnodejs.nh;

      // clear out any service, subs, pubs
      clearOutClients((nh as any)._node);

      (nh as any)._node._spinner.clear();

      // remove any master api handlers we set up
      masterStub.removeAllListeners();
    });

    it('Call and Response', (done) => {
      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        return true;
      });

      const client = nh.serviceClient(service, srvType);
      nh.waitForService(service)
      .then(() => {
        return client.call({});
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        throwNext(err);
      })
    });

    it('Asynchronous Call and Response', (done) => {
      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        return Promise.resolve(true);
      });

      const client = nh.serviceClient(service, srvType);
      nh.waitForService(service)
      .then(() => {
        return client.call({});
      })
      .then(() => {
        done();
      })
      .catch((err) => {
        throwNext(err);
      })
    });

    it('Service Failure', (done) => {
      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        return false;
      });

      const client = nh.serviceClient(service, srvType);
      nh.waitForService(service)
      .then(() => {
        return client.call({});
      })
      .then(() => {
        throwNext('Service call succeeded when it shouldn\'t have');
      })
      .catch((err) => {
        if (err.code === 'E_ROSSERVICEFAILED') {
          done();
        }
        else {
          console.error('Service call failed with unexpected error');
        }
      });
    });

    it('Service Shutdown While Registering', function (done) {
      this.slow(1600);

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        return true;
      });

      // hook into registered event - this should not fire
      serv.on('registered', () => {
        throw new Error('Service should never have registered!');
      });

      // kill the service while the asynchronous registration is happening
      serv.shutdown();

      // if we haven't seen the 'registered' event by now we should be good
      setTimeout(done, 500);
    });

    it('Service Shutdown During Call', async function() {
      this.slow(1600);

      const nh = rosnodejs.nh;
      let serviceCalled = false;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        serviceCalled = true;
        return true;
      });

      serv.on('connection', () => {
        // we've received the client header but not the request - SHUT IT DOWN
        serv.shutdown();
      });

      let errCaught = false;
      const client = nh.serviceClient(service, srvType);
      await nh.waitForService(service)
      try {
        await client.call({});
      }
      catch(err) {
        errCaught = true;
      }
      expect(serviceCalled).to.be.false;
      expect(errCaught).to.be.true;
    });

    it('Service Shutdown Handling Call', async function() {
      this.slow(1600);

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        serv.shutdown();

        return true;
      });

      const client = nh.serviceClient(service, srvType);
      await nh.waitForService(service);
      try {
        await client.call({});
      }
      catch(err) {
        expect(err.message).to.equal('Socket closed while waiting for message on service');
      }
    });

    it('Service Shutdown Handling Asynchronous Call', async function() {
      this.slow(1600);

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {

        return new Promise((resolve) => {
          setTimeout(() => {
            serv.shutdown();
            resolve(true);
          }, 0);
        });
      });

      const client = nh.serviceClient(service, srvType);
      await nh.waitForService(service)
      try {
        await client.call({});
      }
      catch(err) {
        expect(err.message).to.equal('Socket closed while waiting for message on service');
      }
    });

    it('Service Unregistered During Call', (done) => {
      // simulate a service disconnecting between the lookupService call to ROS Master
      // and the connection to the service node's TCPROS server

      // cache a reference to net.connect - we'll replace it
      const NET_CONNECT_FUNC = net.connect;

      const nh = rosnodejs.nh;
      const serv = nh.advertiseService(service, srvType, (req, resp) => {
        return true;
      });

      const client = nh.serviceClient(service, srvType);
      nh.waitForService(service)
      .then(() => {

        // we've verified that the service exists - replace the net.connect call (used to initiate the TCPROS
        // connection) with a bogus one that throws an error
        (net as any).connect = (info: any) => {
          const sock = new net.Socket();
          process.nextTick(() => {
            const error: any = new Error(`connect ECONNREFUSED ${info.host}:${info.port}`);
            error.code = 'ECONNREFUSED';
            error.errno = 'ECONNREFUSED';
            error.address = info.host;
            error.port = info.port;

            // just to make sure there isn't some other error that comes through - should be unnecessary
            error.rosnodejstesting = true;
            sock.emit('error', error);
          });
          return sock;
        };

        return client.call({});
      })
      .catch((err) => {
        if (err.code === 'ECONNREFUSED' && err.rosnodejstesting) {
          // nice! restore net.connect and close up shop
          (net as any).connect = NET_CONNECT_FUNC;
          done();
        }
      })
    });
  });
});

describe('Shutdown', () => {
  let masterStub: MasterStub;

  afterEach(async () => {
    if (masterStub) {
      await masterStub.shutdown();
      masterStub = null;
    }
    await sleep(50);
  });

  after(async () => {
    if (masterStub) {
      await masterStub.shutdown();
      masterStub = null;
    }
    await rosnodejs.shutdown();
    rosnodejs.reset();
  });

  it('Shutdown after successful start with master running', function(done) {
    masterStub = new MasterStub('localhost', MASTER_PORT);
    masterStub.provideAll();

    rosnodejs.initNode(nodeName, initArgs)
    .then(() => {
      return rosnodejs.shutdown();
    })
    .then(() => {
      rosnodejs.reset();
      expect(gotEvent).to.be.true;
      done();
    });

    let gotEvent = false;
    rosnodejs.on('shutdown', () => {
      gotEvent = true;
    });
  });

  it('Shutdown after successful start with master down', async function() {
    masterStub = new MasterStub('localhost', MASTER_PORT);
    masterStub.provideAll();

    await rosnodejs.initNode(nodeName, initArgs)

    let gotEvent = false;
    rosnodejs.on('shutdown', () => {
      gotEvent = true;
    });

    await masterStub.shutdown();
    await rosnodejs.shutdown();
    rosnodejs.reset();

    expect(gotEvent).to.be.true;
  });

  it('Shutdown when unable to connect to master', async function() {
    // await masterStub.shutdown();
    const initP = rosnodejs.initNode(nodeName, initArgs)
    .then(() => {
      return false;
    })
    .catch((err) => {
      expect(err.message).to.equal('Shutdown during initialization');
      return true;
    });


    let gotEvent = false;
    rosnodejs.on('shutdown', () => {
      gotEvent = true;
    });

    await sleep(500);
    await rosnodejs.shutdown()
    rosnodejs.reset();
    expect(gotEvent).to.be.true;

    const gotError = await initP;
    expect(gotError).to.be.true;
  });

  it('Spinner is cleared out when shutdown', async function() {
    masterStub = new MasterStub('localhost', MASTER_PORT);
    masterStub.provideAll();

    let gotEvent = false;

    const nh = await rosnodejs.initNode(nodeName, initArgs)

    const pub = nh.advertise('/chatter', 'std_msgs/String');
    const sub = nh.subscribe('/chatter', 'std_msgs/String');
    pub.publish({data: 'hi'});

    rosnodejs.on('shutdown', () => {
      gotEvent = true;
    });

    await rosnodejs.shutdown()
    rosnodejs.reset();
    expect(gotEvent).to.be.true;
    expect((nh as any)._node._spinner._spinTimer.clientCallQueue).to.be.undefined;
  });
});

describe('Parameters', function() {
  let masterStub: MasterStub;

  before(async () => {
    masterStub = new MasterStub('localhost', MASTER_PORT);
    masterStub.provideAll();

    await rosnodejs.initNode(nodeName, initArgs);
  });

  after(async () => {
    await masterStub.shutdown();
    await rosnodejs.shutdown()
    rosnodejs.reset();
  });

  it('Set', function(done) {
    const nh = rosnodejs.nh;

    nh.setParam('/key', 2)
    .then(() => {
      expect(masterStub._params['/key']).to.equal(2);
      done();
    });
  });

  it('Get', function(done) {
    const nh = rosnodejs.nh;

    nh.getParam('/key')
    .then((result) => {
      expect(result).to.equal(2);
      expect(masterStub._params['/key']).to.equal(2);
      done();
    });
  });

  it('Has', function(done) {
    const nh = rosnodejs.nh;

    nh.hasParam('/key')
    .then((result) => {
      expect(result).to.be.true;
      expect(masterStub._params['/key']).to.equal(2);
      done();
    });
  });

  it('Delete', function(done) {
    const nh = rosnodejs.nh;

    nh.deleteParam('/key')
    .then(() => {
      expect(masterStub._params['/key']).to.be.undefined;
      done();
    });
  });

  it('Full', function(done) {
    const nh = rosnodejs.nh;

    nh.getParam('/missing')
    .then(() => throwNext('Get should reject'))
    .catch(() => {
      return nh.hasParam('/missing')
    })
    .catch(() => throwNext('Has should resolve'))
    .then((result) => {
      expect(result).to.be.false;
      return nh.setParam('/exists', 1);
    })
    .catch(() => throwNext('Set should resolve'))
    .then(() => {
      expect(masterStub._params['/exists']).to.equal(1);
      return nh.hasParam('/exists');
    })
    .catch(() => throwNext('Has should resolve'))
    .then((result) => {
      expect(result).to.be.true;
      return nh.getParam('/exists');
    })
    .catch(() => throwNext('Get should resolve'))
    .then((result) => {
      expect(result).to.equal(1);
      return nh.deleteParam('/missing');
    })
    .then(() => throwNext('Delete should reject'))
    .catch((err: any) => {
      return nh.deleteParam('/exists');
    })
    .catch(() => throwNext('Delete should resolve'))
    .then(() => {
      return nh.hasParam('/exists');
    })
    .catch(() => throwNext('Has should resolve'))
    .then((result) => {
      expect(result).to.be.false;
      done();
    });
  });
});

describe('initialization', () => {
  const MASTER_PORT = 55599;
  const rosMasterUri = `http://localhost:${MASTER_PORT}`;
  // don't provide any of the expected APIs so the node won't initialize
  let masterStub: MasterStub;

  before(() => {
    masterStub = new MasterStub('localhost', MASTER_PORT);
    // turn off warnings about methods not existing since we're purposefully
    // not providing any methods
    masterStub.verbose = false;
  })

  afterEach(async () => {
    await rosnodejs.shutdown()
    rosnodejs.reset();
  });

  after(async () => {
    await masterStub.shutdown();
  })

  it('wait forever', function(done) {
    this.slow(3000);
    this.timeout(5000);

    rosnodejs.initNode('test_node', { rosMasterUri })
    .then(() => {
      done(new Error('Node shouldnt initialize'))
    })
    .catch((err: any) => {
      expect(err.message).to.equal('Shutdown during initialization');
      done();
    });


    setTimeout(async () => {
      await rosnodejs.shutdown();
      rosnodejs.reset();
    }, 2000);
  });

  it('wait a little', function(done) {
    this.slow(3000);
    this.timeout(5000);
    let timeout: NodeJS.Timer;
    rosnodejs.initNode('test_node', { rosMasterUri, timeout: 1000 })
    .then(() => {
      done(new Error('Node shouldnt initialize'));
    })
    .catch((err: any) => {
      clearTimeout(timeout);
      done();
    });

    timeout = setTimeout(() => {
      throw new Error('Should have timed out!');
    }, 2000);
  });

  it('wait once', function(done) {
    this.slow(500);

    let timeout: NodeJS.Timer;
    rosnodejs.initNode('test_node', { rosMasterUri, timeout: 0 })
    .then(() => {
      done(new Error('Node shouldnt initialize'));
    })
    .catch((err: any) => {
      clearTimeout(timeout);
      done();
    })

    timeout = setTimeout(() => {
      throw new Error('Should have timed out!');
    }, 500);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
