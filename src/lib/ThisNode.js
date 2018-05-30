module.exports = {
  node: null,
  getNodeName() {
    if (this.node) {
      return this.node.getNodeName();
    }
    // else
    return null;
  }
};
