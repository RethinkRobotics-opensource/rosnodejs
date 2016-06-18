'use strict'

const chai = require('chai');
const expect = chai.expect;
const bunyan = require('bunyan');
const rosnodejs = require('../index.js');

/** setup pipe to stdout **/
class OutputCapture {
  constructor() {
    this.flush();
  }

  write(data) {
    this.lastMsg = data;
  }

  flush() {
    this.lastMsg = null;
  }

  get() {
    return this.lastMsg;
  }
};

describe('Logging', () => {
  const outputCapture = new OutputCapture();

  const reset = function() {
    outputCapture.flush();
    expect(outputCapture.get()).to.equal(null);

    rosnodejs.log.rootLogger._throttledLogs = new Set();
    rosnodejs.log.rootLogger._onceLogs = new Set();
  };

  before(() => {
    rosnodejs.log.addStream({
      type: 'raw',
      level: 'info',
      stream: outputCapture
    });

    rosnodejs.log.setLevel('trace');
  });

  after(()=> {
    rosnodejs.log.setLevel('info')
  });

  it('Levels', () => {
    const message = 'This is my message';
    reset();

    rosnodejs.log.setLevel('fatal');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get()).to.equal(null);
    reset();

    rosnodejs.log.setLevel('error');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get()).to.equal(null);
    reset();

    rosnodejs.log.setLevel('warn');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get()).to.equal(null);
    reset();

    rosnodejs.log.setLevel('info');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get()).to.equal(null);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get()).to.equal(null);
    reset();

    rosnodejs.log.setLevel('debug');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get()).to.equal(null);
    reset();

    rosnodejs.log.setLevel('trace');
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get().msg).to.have.string(message);
    reset();
  });

  it('Bound Log Methods', () => {
    const message = 'This is my message';

    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.TRACE);

    reset();
    rosnodejs.log.debug(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.DEBUG);

    reset();
    rosnodejs.log.info(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.INFO);

    reset();
    rosnodejs.log.warn(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.WARN);

    reset();
    rosnodejs.log.error(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.ERROR);

    reset();
    rosnodejs.log.fatal(message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.FATAL);

    reset();
    rosnodejs.log.traceThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.TRACE);

    reset();
    rosnodejs.log.debugThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.DEBUG);

    reset();
    rosnodejs.log.infoThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.INFO);

    reset();
    rosnodejs.log.warnThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.WARN);

    reset();
    rosnodejs.log.errorThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.ERROR);

    reset();
    rosnodejs.log.fatalThrottle(1, message);
    expect(outputCapture.get().msg).to.have.string(message);
    expect(outputCapture.get().level).to.equal(bunyan.FATAL);
  });

  it('Child Loggers', () => {
    const message = 'This is my message';

    let testLogger = rosnodejs.log.getLogger('testLogger');

    // individually set log level
    reset();
    testLogger.setLevel('info');
    testLogger.info(message);
    expect(outputCapture.get().msg).to.have.string(message);

    reset();
    testLogger.trace(message);
    expect(outputCapture.get()).to.equal(null);

    // root log should still be at trace
    reset();
    rosnodejs.log.trace(message);
    expect(outputCapture.get().msg).to.have.string(message);

    // setting through rosnodejs should set all loggers
    rosnodejs.log.setLevel('trace');
    reset();
    testLogger.trace(message);
    expect(outputCapture.get().msg).to.have.string(message);
  });

});
