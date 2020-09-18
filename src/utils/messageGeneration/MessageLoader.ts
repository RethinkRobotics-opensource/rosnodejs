import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as md5 from 'md5';

import * as packages   from './packages';
import * as fieldsUtil from './fields';
import IndentedWriter from './IndentedWriter.js';
import * as MsgSpec from './MessageSpec.js';

const Field = fieldsUtil.Field;

let packageCache: any = null;

const PKG_LOADING = 'loading';
const PKG_LOADED  = 'loaded';

async function createDirectory(directory: string): Promise<void> {
  let curPath = '/';
  const paths = directory.split(path.sep);

  function createLocal(dirPath: string) {
    return new Promise((resolve, reject) => {
      fs.mkdir(dirPath, (err) => {
        if (err && err.code !== 'EEXIST' && err.code !== 'EISDIR') {
          reject(err);
        }
        resolve();
      });
    });
  }

  for (const localPath of paths) {
    curPath = path.join(curPath, localPath);
    await createLocal(curPath);
  }
}

function writeFile(filepath: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.writeFile(filepath, data, (err) => {
      if (err) {
        reject(err);
      }
      else {
        resolve();
      }
    });
  });
}

class MessageManager {
  _verbose: boolean;
  _packageChain: any[];
  _loadingPkgs: Map<any, any>;

  constructor(verbose=false) {
    this._packageChain = [];
    this._loadingPkgs = new Map();

    this._verbose = verbose;
  }

  log(...args: any[]): void {
    if (this._verbose) {
      console.log(...args);
    }
  }

  getCache(): any {
    return packageCache;
  }

  getMessageSpec(msgType: string, type=MsgSpec.MSG_TYPE) {
    const [pkg, messageName] = fieldsUtil.splitMessageType(msgType);
    if (packageCache.hasOwnProperty(pkg)) {
      let pkgCache;
      switch(type) {
        case MsgSpec.MSG_TYPE:
          pkgCache = packageCache[pkg].messages;
          break;
        case MsgSpec.SRV_TYPE:
          pkgCache = packageCache[pkg].services;
          break;
      }
      if (pkgCache) {
        // be case insensitive here...
        if (pkgCache.hasOwnProperty(messageName)) {
          return pkgCache[messageName].msgSpec;
        }
        const lcName = messageName.toLowerCase();
        if (pkgCache.hasOwnProperty(lcName)) {
          return pkgCache[lcName].msgSpec;
        }
      }
    }
    // fall through
    return null;
  }

  async buildPackageTree(outputDirectory: string, writeFiles=true): Promise<void> {
    await this.initTree();
    this._packageChain = this._buildMessageDependencyChain();

    try {
      // none of the loading here depends on message dependencies
      // so don't worry about doing it in order, just do it all...
      await Promise.all(this._packageChain.map((pkgName) => {
        return this.loadPackage(pkgName, outputDirectory, false, writeFiles);
      }));
    }
    catch(err) {
      console.error(err.stack);
      throw err;
    }
  }

  async buildPackage(packageName: string, outputDirectory: string): Promise<void> {
    const deps = new Set();
    await this.initTree();
    await this.loadPackage(packageName, outputDirectory, true, true, (depName) => {
      if (!deps.has(depName)) {
        deps.add(depName);
        return true;
      }
      return false;
    });
  }

  async initTree() {
    if (packageCache === null) {
      this.log('Traversing ROS_PACKAGE_PATH...');
      await packages.findMessagePackages();
    }
    packageCache = packages.getPackageCache();

    // load all the messages
    // TODO: only load messages we need
    this._loadMessagesInCache();
  }

  async loadPackage(packageName: string, outputDirectory: string, loadDeps: boolean=true, writeFiles: boolean=true, filterDepFunc:(d:string)=>boolean=null) {
    if (this._loadingPkgs.has(packageName)) {
      return Promise.resolve();
    }
    // else
    this.log('Loading package %s', packageName);
    this._loadingPkgs.set(packageName, PKG_LOADING);

    if (loadDeps) {
      // get an ordered list of dependencies for this message package
      const dependencies = this._buildMessageDependencyChain(this._getFullDependencyChain(packageName));

      // filter out any packages that have already been loaded or are loading
      let depsToLoad = dependencies;
      if (filterDepFunc && typeof filterDepFunc === 'function') {
        depsToLoad = dependencies.filter(filterDepFunc);
      }

      depsToLoad.forEach((depName) => {
        this.loadPackage(depName, outputDirectory, loadDeps, writeFiles, filterDepFunc);
      });
    }

    // actions get parsed and are then cached with the rest of the messages
    // which is why there isn't a loadPackageActions
    if (writeFiles) {
      await this.initPackageWrite(packageName, outputDirectory);
      await this.writePackageMessages.bind(this, packageName, outputDirectory);
      await this.writePackageServices.bind(this, packageName, outputDirectory);
      this._loadingPkgs.set(packageName, PKG_LOADED);
      console.log('Finished building package %s', packageName);
    }
  }

  async initPackageWrite(packageName: string, jsMsgDir: string): Promise<void> {
    const packageDir = path.join(jsMsgDir, packageName);
    packageCache[packageName].directory = packageDir;

    await createDirectory(packageDir);
    if (this.packageHasMessages(packageName) || this.packageHasActions(packageName)) {
      const msgDir = path.join(packageDir, 'msg');
      await createDirectory(msgDir)
      await this.createMessageIndex(packageName, msgDir);
    }
    if (this.packageHasServices(packageName)) {
      const srvDir = path.join(packageDir, 'srv');
      await createDirectory(srvDir);
      await this.createServiceIndex.bind(this, packageName, srvDir);
    }
    await this.createPackageIndex(packageName, packageDir);
  }

  createPackageIndex(packageName: string, directory: string): Promise<void> {
    const w = new IndentedWriter();
    w.write('module.exports = {')
      .indent();

    const hasMessages = this.packageHasMessages(packageName) || this.packageHasActions(packageName);
    const hasServices = this.packageHasServices(packageName);
    if (hasMessages) {
      w.write('msg: require(\'./msg/_index.js\'),');
    }
    if (hasServices) {
      w.write('srv: require(\'./srv/_index.js\')');
    }
    w.dedent()
      .write('};');

    return writeFile(path.join(directory, '_index.js'), w.get());
  }

  createIndex(packageName: string, directory: string, msgKey: string): Promise<void> {
    const messages = Object.keys(packageCache[packageName][msgKey]);
    const w = new IndentedWriter();
    w.write('module.exports = {')
      .indent();

    messages.forEach((message) => {
      w.write('%s: require(\'./%s.js\'),', message, message);
    });

    w.dedent()
      .write('};');

    return writeFile(path.join(directory, '_index.js'), w.get());
  }

  createMessageIndex(packageName: string, directory: string): Promise<void> {
    return this.createIndex(packageName, directory, 'messages');
  }

  createServiceIndex(packageName: string, directory: string): Promise<void> {
    return this.createIndex(packageName, directory, 'services');
  }

  packageHasMessages(packageName: string): boolean {
    return Object.keys(packageCache[packageName].messages).length > 0;
  }

  packageHasServices(packageName: string): boolean {
    return Object.keys(packageCache[packageName].services).length > 0;
  }

  packageHasActions(packageName: string): boolean {
    return Object.keys(packageCache[packageName].actions).length > 0;
  }

  async writePackageMessages(packageName: string, jsMsgDir: string): Promise<void> {
    const msgDir = path.join(jsMsgDir, packageName, 'msg');

    const packageMsgs = packageCache[packageName].messages;
    const numMsgs = Object.keys(packageMsgs).length;
    if (numMsgs > 0) {
      this.log('Building %d messages from %s', numMsgs, packageName);
      const promises: Promise<void>[] = [];
      Object.keys(packageMsgs).forEach((msgName) => {
        const spec = packageMsgs[msgName].msgSpec;
        this.log(`Building message ${spec.packageName}/${spec.messageName}`);
        promises.push(writeFile(path.join(msgDir, `${msgName}.js`), spec.generateMessageClassFile()));
      });

      await Promise.all(promises);
    }
  }

  async writePackageServices(packageName: string, jsMsgDir: string): Promise<void> {
    const msgDir = path.join(jsMsgDir, packageName, 'srv');

    const packageSrvs = packageCache[packageName].services;
    const numSrvs = Object.keys(packageSrvs).length;
    if (numSrvs > 0) {
      this.log('Building %d services from %s', numSrvs, packageName);
      const promises: Promise<void>[] = [];
      Object.keys(packageSrvs).forEach((srvName) => {
        const spec = packageSrvs[srvName].msgSpec;
        this.log(`Building service ${spec.packageName}/${spec.messageName}`);
        promises.push(writeFile(path.join(msgDir, `${srvName}.js`), spec.generateMessageClassFile()));
      });

      await Promise.all(promises);
    }
  }

  _loadMessagesInCache(): void {
    this.log('Loading messages...');
    Object.keys(packageCache).forEach((packageName) => {

      const packageInfo = packageCache[packageName];
      const packageDeps = new Set<string>();

      type Pkg = { file: string };
      type Ret = {key: string, val: any};
      function packageForEach(item: string, func: (m: string, p: Pkg)=>Ret) {
        let itemInfo = packageInfo[item];
        Object.keys(itemInfo).forEach((item) => {
          const ret = func(item, itemInfo[item]);
          if (ret) {
            itemInfo[item][ret.key] = ret.val;
          }
        });
      };

      packageForEach('messages', (message, {file}) => {
        this.log('Loading message %s from %s', message, file);
        const msgSpec = MsgSpec.RosMsgSpec.create(this, packageName, message, MsgSpec.MSG_TYPE, file);

        msgSpec.getMessageDependencies(packageDeps);

        return {
          key: 'msgSpec',
          val: msgSpec
        };
      });

      packageForEach('services', (message, {file}) => {
        this.log('Loading service %s from %s', message, file);
        const msgSpec = MsgSpec.create(this, packageName, message, MsgSpec.SRV_TYPE, file);

        msgSpec.getMessageDependencies(packageDeps);

        return {
          key: 'msgSpec',
          val: msgSpec
        };
      });

      packageForEach('actions', (message, {file}) => {
        this.log('Loading action %s from %s', message, file);
        const msgSpec = MsgSpec.create(this, packageName, message, MsgSpec.ACTION_TYPE, file);

        // cache the individual messages for later lookup (needed when writing files)
        const packageMsgs = packageInfo.messages;
        msgSpec.getMessages().forEach((spec) => {
          // only write this action if it doesn't exist yet - this should be expected if people
          // have already run catkin_make, as it will generate action message definitions that
          // will just get loaded as regular messages
          if (!packageMsgs.hasOwnProperty(spec.messageName)) {
            packageMsgs[spec.messageName] = {file: null, msgSpec: spec};
          }
        });

        msgSpec.getMessageDependencies(packageDeps);

        return {
          key: 'msgSpec',
          val: msgSpec
        };
      });

      packageInfo.dependencies = packageDeps;
    });
  }

  _getFullDependencyChain(msgPackage, originalPackage=null, dependencyList=null) {
    if (dependencyList === null) {
      dependencyList = packageCache[msgPackage].dependencies;
    }
    if (originalPackage === null) {
      originalPackage = msgPackage;
    }
    const localDeps = packageCache[msgPackage].dependencies;
    localDeps.forEach((dep) => {
      if (dep === originalPackage) {
        throw new Error('Found circular dependency while building chain');
      }
      dependencyList.add(dep);
      this._getFullDependencyChain(dep, originalPackage, dependencyList);
    });

    return dependencyList;
  }

  _recurseDependencyChain(dependencyChain, packageName) {
    const packageDeps = packageCache[packageName].dependencies;
    let maxInsertionIndex = -1;
    packageDeps.forEach((depName) => {
      const depIndex = dependencyChain.indexOf(depName);
      if (depIndex === -1) {
        // this dependency is not yet in the list anywhere
        const insertionIndex = this._recurseDependencyChain(dependencyChain, depName);
        if (insertionIndex > maxInsertionIndex) {
          maxInsertionIndex = insertionIndex;
        }
      }
      else {
        maxInsertionIndex = depIndex;
      }
    });

    if (maxInsertionIndex < 0) {
      dependencyChain.unshift(packageName);
      return 0;
    }
    else {
      dependencyChain.splice(maxInsertionIndex+1, 0, packageName);
      return maxInsertionIndex+1;
    }
  }

  _buildMessageDependencyChain(packageList=null) {
    if (packageList === null) {
      packageList = Object.keys(packageCache);
    }
    const dependencyChain = [];
    packageList.forEach(this._recurseDependencyChain.bind(this, dependencyChain));
    return dependencyChain;
  }
}

module.exports = MessageManager;
