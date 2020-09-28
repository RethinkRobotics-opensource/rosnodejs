'use strict';

import { expect } from 'chai';
import names from '../src/lib/Names';
import NodeHandle from '../src/lib/NodeHandle';
import MasterStub from './utils/MasterStub';
import rosnodejs from '../src/index';
import * as remapUtils from '../src/utils/remapping_utils';
import * as netUtils from '../src/utils/network_utils';

describe('Namespace', function () {
  let nodeHandle: NodeHandle;
  names.init({}, '/namespace');

  function _setupNodeHandle(name?: string) {
    nodeHandle = new NodeHandle(null, name);
    nodeHandle.getNodeName = function() { return '/test_node' };
  }

  it('Validate', () => {
    expect(names.validate(null)).to.be.false;
    expect((names.validate as any)()).to.be.false;
    expect((names.validate as any)({})).to.be.false;
    expect((names.validate as any)(1)).to.be.false;
    expect(names.validate('/my-node')).to.be.false;

    expect(names.validate('')).to.be.true;
    expect(names.validate('hi')).to.be.true;
    expect(names.validate('/hi')).to.be.true;
    expect(names.validate('~hi')).to.be.true;
    expect(names.validate('~a_z09asdf')).to.be.true;
  });


  describe('Resolving', () => {

    it('Utils', () => {
      expect(names.resolve('bar')).to.equal('/namespace/bar');
      expect(names.resolve('/bar')).to.equal('/bar');
      expect(names.resolve('~bar')).to.equal('/namespace/bar');

      expect(names.resolve('/scope_1', 'bar')).to.equal('/scope_1/bar');
      expect(names.resolve('/scope_1', '/bar')).to.equal('/bar');
      expect(names.resolve('/scope_1', '~bar')).to.equal('/namespace/bar');

      names.init({}, '/');
      expect(names.resolve('bar')).to.equal('/bar');
      expect(names.resolve('/bar')).to.equal('/bar');
      expect(names.resolve('~bar')).to.equal('/bar');

      expect(names.resolve('/scope_1', 'bar')).to.equal('/scope_1/bar');
      expect(names.resolve('/scope_1', '/bar')).to.equal('/bar');
      expect(names.resolve('/scope_1', '~bar')).to.equal('/bar');
    });

    it('Default Nodehandle', () => {

      names.init({}, '/');
      _setupNodeHandle();

      expect(nodeHandle.resolveName('bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      names.init({}, '/scope');
      _setupNodeHandle();

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();
    });

    it('Named Nodehandle', () => {
      names.init({}, '/');
      _setupNodeHandle('/scope_1');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope_1/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      names.init({}, '/');
      _setupNodeHandle('scope_1');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope_1/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      names.init({}, '/sooop');
      _setupNodeHandle('/scope_1');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope_1/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      names.init({}, '/sooop');
      _setupNodeHandle('scope_1');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/sooop/scope_1/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();
    });

    it('Private Nodehandle', () => {
      names.init({}, '/scope');
      _setupNodeHandle('~');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      _setupNodeHandle('~/subscope');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/scope/subscope/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();

      names.init({}, '/');
      _setupNodeHandle('~');

      expect(nodeHandle.resolveName('bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName('/bar', false)).to.equal('/bar');
      expect(nodeHandle.resolveName.bind(nodeHandle, '~bar', false)).to.throw();
    });
  });

  describe('with ros', () => {
    const MASTER_PORT = 12342;
    const rosMasterUri = `http://localhost:${MASTER_PORT}`;
    let masterStub: MasterStub;

    const ARGV_LEN = process.argv.length;
    function resetArgv() {
      process.argv.splice(ARGV_LEN);
    }

    function setRemapArg(name: string, value: string) {
      process.argv.push(`${name}:=${value}`);
    }

    before(() => {
      rosnodejs.require('roscpp');
      rosnodejs.require('rosgraph_msgs');
      masterStub = new MasterStub('localhost', MASTER_PORT);
      masterStub.provideAll();
    });

    after(async () => {
      return masterStub.shutdown();
    })

    afterEach((done) => {
      resetArgv();

      rosnodejs.shutdown()
      .then(() => {
        rosnodejs.reset();
        done();
      });
    });

    // test special key remapping
    // wiki.ros.org/Remapping Arguments
    it('__name', function(done) {
      this.slow(500);

      const remappedName = 'custom_name';
      setRemapArg(remapUtils.SPECIAL_KEYS.name, remappedName);
      rosnodejs.log.info("start init node");
      rosnodejs.initNode('node_name', { rosMasterUri })
      .then(() => {
        rosnodejs.log.info("now in test");
        expect(rosnodejs.nh.getNodeName()).to.equal('/' + remappedName);

        done();
      });
    });

    it('__ip', function(done) {
      this.slow(500);

      const remappedIp = '1.2.3.4';
      setRemapArg(remapUtils.SPECIAL_KEYS.ip, remappedIp);

      rosnodejs.initNode('node_name', { rosMasterUri })
      .then(() => {
        expect(netUtils.getHost()).to.equal(remappedIp);

        done();
      });
    });

    it('__hostname', function(done) {
      this.slow(500);

      const remappedHost = 'customHost';
      setRemapArg(remapUtils.SPECIAL_KEYS.hostname, remappedHost);

      rosnodejs.initNode('node_name', { rosMasterUri })
      .then(() => {
        expect(netUtils.getHost()).to.equal(remappedHost);

        done();
      });
    });

    it('__master', function(done) {
      this.slow(500);

      const CUSTOM_MASTER_PORT = 12355;
      const rosMasterUri = `http://localhost:${CUSTOM_MASTER_PORT}`;
      let masterStub = new MasterStub('localhost', CUSTOM_MASTER_PORT);
      masterStub.provideAll();

      const remappedMaster = `http://localhost:${CUSTOM_MASTER_PORT}`;
      setRemapArg(remapUtils.SPECIAL_KEYS.master, remappedMaster);

      masterStub.once('ready', function() {
        rosnodejs.initNode('node_name', { rosMasterUri })
        .then(() => {
          expect(rosnodejs.nh['_node'].getRosMasterUri()).to.equal(remappedMaster);

          // shutdown rosnodejs here since we're also killing our custom master stub
          return rosnodejs.shutdown()
        })
        .then(() => {
          return masterStub.shutdown()
        })
        .then(() => {
          done();
        });
      });
    });

    it('__ns', function() {
      this.slow(500);

      const remappedNs = 'customNs';
      setRemapArg(remapUtils.SPECIAL_KEYS.ns, remappedNs);

      const nodeName = 'node_name';
      return rosnodejs.initNode(nodeName, { rosMasterUri })
      .then(() => {
        expect(rosnodejs.nh.getNodeName()).to.equal(`/${remappedNs}/${nodeName}`);

        // make sure re-initing the same node still works
        return rosnodejs.initNode(nodeName, { rosMasterUri })
        .then(() => {
          expect(rosnodejs.nh.getNodeName()).to.equal(`/${remappedNs}/${nodeName}`);
        });
      });
    });

    it('Re-init Without Remapping', function() {
      this.slow(500);
      const nodeName = 'node_name';
      return rosnodejs.initNode(nodeName, { rosMasterUri })
      .then(() => {
        expect(rosnodejs.nh.getNodeName()).to.equal(`/${nodeName}`);

        // make sure re-initing the same node still works
        return rosnodejs.initNode(nodeName, { rosMasterUri })
        .then(() => {
          expect(rosnodejs.nh.getNodeName()).to.equal(`/${nodeName}`);
        });
      });
    });

    it('comms', function(done) {
      this.slow(500);

      const topic = '/base/topic';
      const remappedTopic = '/newBase/topic';
      const service = '/base/service';
      const remappedService = '/newBase/service';
      const param = '/base/param';
      const remappedParam = '/newBase/param';
      setRemapArg(topic, remappedTopic);
      setRemapArg(service, remappedService);
      setRemapArg(param, remappedParam);

      rosnodejs.initNode('node_name', { rosMasterUri })
      .then((nh) => {
        const pub = nh.advertise(topic, 'std_msgs/Empty');
        expect(pub.getTopic()).to.equal(remappedTopic);

        const sub = nh.subscribe(topic, 'std_msgs/Empty');
        expect(sub.getTopic()).to.equal(remappedTopic);

        // ignore that we're not passing a callback function
        const srv = (nh.advertiseService as any)(service, 'std_srvs/Empty');
        expect(srv.getService()).to.equal(remappedService);

        const srvClient = nh.serviceClient(service, 'std_srvs/Empty');
        expect(srvClient.getService()).to.equal(remappedService);

        let outstandingParamCalls = 4;

        function paramTest(err: any, params: any[]) {
          expect(params[1]).to.equal(remappedParam);
          --outstandingParamCalls;
        }

        masterStub.once('setParam', paramTest);
        masterStub.once('getParam', paramTest);
        masterStub.once('hasParam', paramTest);
        masterStub.once('deleteParam', paramTest);

        Promise.all([
          nh.setParam(param, 2),
          nh.getParam(param),
          nh.hasParam(param),
          nh.deleteParam(param)
        ])
        .then(() => {
          if (outstandingParamCalls <= 0) {
            done();
          }
        });
      });
    });

    it('comms namespace', function(done) {
      this.slow(500);

      const nodeName = 'node_name';
      const topic = 'topic';
      const remappedTopic = `/${nodeName}/topic`;
      const service = 'service';
      const remappedService = `/${nodeName}/service`;
      const param = 'param';
      const remappedParam = `/${nodeName}/param`;
      setRemapArg(topic, remappedTopic);
      setRemapArg(service, remappedService);
      setRemapArg(param, remappedParam);

      rosnodejs.initNode(nodeName, { rosMasterUri })
        .then((nh) => {
          const pub = nh.advertise(topic, 'std_msgs/Empty');
          expect(pub.getTopic()).to.equal(remappedTopic);

          const sub = nh.subscribe(topic, 'std_msgs/Empty');
          expect(sub.getTopic()).to.equal(remappedTopic);

          // ignore that we're not passing a callback function
          const srv = (nh.advertiseService as any)(service, 'std_srvs/Empty');
          expect(srv.getService()).to.equal(remappedService);

          const srvClient = nh.serviceClient(service, 'std_srvs/Empty');
          expect(srvClient.getService()).to.equal(remappedService);

          let outstandingParamCalls = 4;

          function paramTest(err: any, params: any[]) {
            expect(params[1]).to.equal(remappedParam);
            --outstandingParamCalls;
          }

          masterStub.once('setParam', paramTest);
          masterStub.once('getParam', paramTest);
          masterStub.once('hasParam', paramTest);
          masterStub.once('deleteParam', paramTest);

          Promise.all([
            nh.setParam(param, 2),
            nh.getParam(param),
            nh.hasParam(param),
            nh.deleteParam(param)
          ])
          .then(() => {
            if (outstandingParamCalls <= 0) {
              done();
            }
          });
        });
    });
  });
});
