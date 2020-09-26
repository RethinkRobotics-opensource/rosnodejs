import IRosNode from "../types/RosNode";

interface ThisNodeT {
  node: IRosNode|null;
  getNodeName(): string;
  ok(): boolean;
  shutdown(): Promise<void>;
  on(evt: string, listener: (d: any)=>void): void;
  once(evt: string, listener: (d: any)=>void): void;
  removeListener(evt: string, listener: (d: any)=>void): void;
}

const ThisNode: ThisNodeT = {
  node: null,

  getNodeName(): string {
    if (this.node) {
      return this.node.getNodeName();
    }
    // else
    return null;
  },

  ok(): boolean {
    return this.node && !this.node.isShutdown();
  },

  shutdown(): Promise<void> {
    if (this.ok()) {
      return this.node.shutdown();
    }
    // else
    return Promise.resolve();
  },

  on(evt, handler) {
    if (this.ok()) {
      return this.node.on(evt, handler);
    }
  },

  once(evt, handler) {
    if (this.ok()) {
      return this.node.once(evt, handler);
    }
  },

  removeListener(evt, handler) {
    if (this.ok()) {
      return this.node.removeListener(evt, handler);
    }
  }
};

export default ThisNode;
