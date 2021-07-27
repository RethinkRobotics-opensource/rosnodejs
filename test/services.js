'use strict'

const chai = require('chai');
const expect = chai.expect;
const { spawn } = require('child_process');

const rosnodejs = require('../src/index.js');

const MASTER_PORT = 11235;

const initArgs = {
  rosMasterUri: `http://localhost:${MASTER_PORT}`,
  logging: {skipRosLogging: true},
  notime: true
};

describe('Services Tests', () => {

  let rn;
  let core;

  before((done) => {
    // start a ros master
    core = spawn('roscore', ['-p', MASTER_PORT]);
    setTimeout(() => rosnodejs.initNode('/testNode', initArgs).then((rn_) => {
        rn = rn_;
        done();
      }), 1000); // allow 1s for ros master to start
  });

  after((done) => {
    rosnodejs.shutdown().then(() => {
      rosnodejs.reset();
      core && core.kill('SIGINT');
      done();
    });
  });

  describe('get type', () => {
    it('can get the type', function(done) {
      rn.getServiceHeader('/rosout/get_loggers').then((p) => {
        expect(p.type).to.equal('roscpp/GetLoggers');
        done();
      });
    });
  });
});
