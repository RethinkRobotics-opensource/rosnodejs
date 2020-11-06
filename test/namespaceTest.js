'use strict';

const chai = require('chai');
const expect = chai.expect;
const xmlrpc = require('@sixriver/xmlrpc');
const namespaceUtils = require('../src/utils/namespace_utils.js');
const NodeHandle = require('../src/lib/NodeHandle.js');

describe('Namespace', function () {
  let nodeHandle;
  function _setupNodeHandle(name) {
    nodeHandle = new NodeHandle(null, name);
    nodeHandle.getNodeName = function() { return '/test_node' };
  }

  it('Validate', () => {
    expect(namespaceUtils.validate('')).to.be.false;
    expect(namespaceUtils.validate(null)).to.be.false;
    expect(namespaceUtils.validate()).to.be.false;
    expect(namespaceUtils.validate({})).to.be.false;
    expect(namespaceUtils.validate(1)).to.be.false;
    expect(namespaceUtils.validate('/my-node')).to.be.false;

    expect(namespaceUtils.validate('hi')).to.be.true;
    expect(namespaceUtils.validate('/hi')).to.be.true;
    expect(namespaceUtils.validate('~hi')).to.be.true;
    expect(namespaceUtils.validate('~a_z09asdf')).to.be.true;
  });


  describe('Resolving', () => {

    it('Utils', () => {
      expect(namespaceUtils.resolve('bar', null, '/test_node')).to.equal('/bar');
      expect(namespaceUtils.resolve('/bar', null, '/test_node')).to.equal('/bar');
      expect(namespaceUtils.resolve('~bar', null, '/test_node')).to.equal('/test_node/bar');

      expect(namespaceUtils.resolve('bar', '/scope_1', '/test_node')).to.equal('/scope_1/bar');
      expect(namespaceUtils.resolve('/bar', '/scope_1', '/test_node')).to.equal('/bar');
      expect(namespaceUtils.resolve('~bar', '/scope_1', '/test_node')).to.equal('/scope_1/test_node/bar');
    });

    it('Default Nodehandle', () => {

      _setupNodeHandle();

      expect(nodeHandle._resolve('bar')).to.equal('/bar');
      expect(nodeHandle._resolve('/bar')).to.equal('/bar');
      expect(nodeHandle._resolve('~bar')).to.equal('/test_node/bar');
    });

    it('Named Nodehandle', () => {
      _setupNodeHandle('/scope_1');

      expect(nodeHandle._resolve('bar')).to.equal('/scope_1/bar');
      expect(nodeHandle._resolve('/bar')).to.equal('/bar');
      expect(nodeHandle._resolve('~bar')).to.equal('/scope_1/test_node/bar');
    });
  });
});

