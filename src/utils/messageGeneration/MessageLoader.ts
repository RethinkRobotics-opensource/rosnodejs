import * as fs from 'fs';
import * as path from 'path';

import * as packages   from './packages';
import * as fieldsUtil from './fields';
import IndentedWriter from './IndentedWriter.js';
import * as MsgSpec from './MessageSpec.js';

enum LoadStatus {
  LOADING,
  LOADED
}

type PackageMap = {
  [key: string]: {
    messages: {[key: string]: { file: string, spec: MsgSpec.MsgSpec }};
    services: {[key: string]: { file: string, spec: MsgSpec.SrvSpec }};
    actions: {[key: string]: { file: string, spec: MsgSpec.ActionSpec }};
    localDeps: Set<string>; // this is only local package dependencies
  }
};

export default class MessageManager {
  _verbose: boolean;
  _loadingPkgs: Map<string, LoadStatus> = new Map();
  _packageCache: PackageMap = null;

  constructor(verbose=false) {
    this._verbose = verbose;
  }

  log(...args: any[]): void {
    if (this._verbose) {
      console.log(...args);
    }
  }

  getCache(): PackageMap {
    return this._packageCache;
  }

  getMessageSpec(msgType: string, type: 'msg'): MsgSpec.MsgSpec|null;
  getMessageSpec(msgType: string, type: 'srv'): MsgSpec.SrvSpec|null;
  getMessageSpec(msgType: string, type: 'msg'|'srv' = MsgSpec.MSG_TYPE): MsgSpec.RosMsgSpec|null {
    const [pkg, messageName] = fieldsUtil.splitMessageType(msgType);
    if (this._packageCache.hasOwnProperty(pkg)) {
      let pkgCache;
      switch(type) {
        case MsgSpec.MSG_TYPE:
          pkgCache = this._packageCache[pkg].messages;
          break;
        case MsgSpec.SRV_TYPE:
          pkgCache = this._packageCache[pkg].services;
          break;
      }
      if (pkgCache) {
        // be case insensitive here...
        if (pkgCache.hasOwnProperty(messageName)) {
          return pkgCache[messageName].spec;
        }
        const lcName = messageName.toLowerCase();
        if (pkgCache.hasOwnProperty(lcName)) {
          return pkgCache[lcName].spec;
        }
      }
    }
    // fall through
    return null;
  }

  async buildPackageTree(outputDirectory: string, writeFiles=true): Promise<void> {
    await this.initTree();
    // none of the loading here depends on message dependencies
    // so don't worry about doing it in order, just do it all...
    const packages = Object.keys(this._packageCache);

    try {
      await Promise.all(packages.map((pkgName) => {
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

  async initTree(): Promise<void> {
    if (this._packageCache === null) {
      this.log('Traversing ROS_PACKAGE_PATH...');
      await packages.findMessagePackages();
    }

    this._loadMessagesInCache(packages.getMessagePackageCache());
  }

  async loadPackage(packageName: string, outputDirectory: string, loadDeps: boolean=true, writeFiles: boolean=true, filterDepFunc:(d:string)=>boolean=null) {
    if (this._loadingPkgs.has(packageName)) {
      return;
    }
    // else
    this.log('Loading package %s', packageName);
    this._loadingPkgs.set(packageName, LoadStatus.LOADING);

    if (loadDeps) {
      // get an ordered list of dependencies for this message package
      let dependencies = sortPackageList([...getFullDependencySet(packageName, this._packageCache)], this._packageCache);

      // filter out any packages that have already been loaded or are loading
      if (filterDepFunc && typeof filterDepFunc === 'function') {
        dependencies = dependencies.filter(filterDepFunc);
      }

      await Promise.all(dependencies.map((depName) => {
        return this.loadPackage(depName, outputDirectory, loadDeps, writeFiles, filterDepFunc);
      }));
    }

    // actions get parsed and are then cached with the rest of the messages
    // which is why there isn't a loadPackageActions
    if (writeFiles) {
      await this.initPackageWrite(packageName, outputDirectory);
      await this.writePackageMessages(packageName, outputDirectory);
      await this.writePackageServices(packageName, outputDirectory);
      this._loadingPkgs.set(packageName, LoadStatus.LOADING);
      console.log('Finished building package %s', packageName);
    }
  }

  async initPackageWrite(packageName: string, jsMsgDir: string): Promise<void> {
    const packageDir = path.join(jsMsgDir, packageName);

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

  createIndex(packageName: string, directory: string, msgKey: 'messages'|'services'): Promise<void> {
    const messages = Object.keys(this._packageCache[packageName][msgKey]);
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
    return Object.keys(this._packageCache[packageName].messages).length > 0;
  }

  packageHasServices(packageName: string): boolean {
    return Object.keys(this._packageCache[packageName].services).length > 0;
  }

  packageHasActions(packageName: string): boolean {
    return Object.keys(this._packageCache[packageName].actions).length > 0;
  }

  async writePackageMessages(packageName: string, jsMsgDir: string): Promise<void> {
    const msgDir = path.join(jsMsgDir, packageName, 'msg');

    const packageMsgs = this._packageCache[packageName].messages;
    const pkgNames = Object.keys(packageMsgs);
    const numMsgs = pkgNames.length;
    if (numMsgs > 0) {
      this.log('Building %d messages from %s', numMsgs, packageName);
      const promises: Promise<void>[] = [];
      pkgNames.forEach((msgName) => {
        const spec = packageMsgs[msgName].spec;
        this.log(`Building message ${spec.packageName}/${spec.messageName}`);
        promises.push(writeFile(path.join(msgDir, `${msgName}.js`), spec.generateMessageClassFile()));
      });

      await Promise.all(promises);
    }
  }

  async writePackageServices(packageName: string, jsMsgDir: string): Promise<void> {
    const msgDir = path.join(jsMsgDir, packageName, 'srv');

    const packageSrvs = this._packageCache[packageName].services;
    const srvNames = Object.keys(packageSrvs);
    const numSrvs = srvNames.length;
    if (numSrvs > 0) {
      this.log('Building %d services from %s', numSrvs, packageName);
      const promises: Promise<void>[] = [];
      srvNames.forEach((srvName) => {
        const spec = packageSrvs[srvName].spec;
        this.log(`Building service ${spec.packageName}/${spec.messageName}`);
        promises.push(writeFile(path.join(msgDir, `${srvName}.js`), spec.generateMessageClassFile()));
      });

      await Promise.all(promises);
    }
  }

  private _loadMessagesInCache(packageCache: packages.MsgPackageCache): void {
    this.log('Loading messages...');

    for (const packageName in packageCache) {
      const packageInfo = packageCache[packageName];
      const packageDeps = new Set<string>();

      const messages: any = {};
      for (const message in packageInfo.messages) {
        const { file } = packageInfo.messages[message];
        this.log('Loading message %s from %s', message, file);
        const msgSpec = MsgSpec.create(this, packageName, message, MsgSpec.MSG_TYPE, file);

        msgSpec.getMessageDependencies(packageDeps);

        messages[message] = { msgSpec, file }
      }

      const services: any = {};
      for (const message in packageInfo.services) {
        const { file } = packageInfo.services[message];
        this.log('Loading service %s from %s', message, file);
        const msgSpec = MsgSpec.create(this, packageName, message, MsgSpec.SRV_TYPE, file);

        msgSpec.getMessageDependencies(packageDeps);

        services[message] = { msgSpec, file };
      }

      const actions: any = {};
      for (const message in packageInfo.actions) {
        const { file } = packageInfo.actions[message];
        this.log('Loading action %s from %s', message, file);
        const msgSpec = MsgSpec.create(this, packageName, message, MsgSpec.ACTION_TYPE, file);

        // cache the individual messages for later lookup (needed when writing files)
        const packageMsgs = packageInfo.messages;
        msgSpec.getMessages().forEach((spec) => {
          // only write this action if it doesn't exist yet - this should be expected if people
          // have already run catkin_make, as it will generate action message definitions that
          // will just get loaded as regular messages
          if (!packageMsgs.hasOwnProperty(spec.messageName)) {
            messages[spec.messageName] = { file: null, msgSpec: spec };
          }
        });

        msgSpec.getMessageDependencies(packageDeps);

        actions[message] = { msgSpec, file };
      }

      this._packageCache[packageName] = {
        messages,
        services,
        actions,
        localDeps: packageDeps
      };
    }
  }
}

//----------------------------------------------------------------------
// Helper functions

function sortPackageList(packageList: string[], cache: PackageMap): string[] {
  // we'll cache full list of dependencies for each package here so we don't need to rebuild it
  const fullPkgDeps: {[key: string]: string[]} = {};

  function getDeps(pkg: string): string[] {
    const deps = fullPkgDeps[pkg];
    if (!deps) {
      return fullPkgDeps[pkg] = [...getFullDependencySet(pkg, cache)];
    }
    return deps;
  }

  packageList.sort((pkgA: string, pkgB: string): number => {
    let aDeps = getDeps(pkgA);
    let bDeps = getDeps(pkgB);

    const aDependsOnB = aDeps.includes(pkgB);
    const bDependsOnA = bDeps.includes(pkgA);

    if (aDependsOnB && bDependsOnA) {
      throw new Error(`Found circular dependency while sorting chain between [${pkgA}] and [${pkgB}]`);
    }

    if (aDependsOnB) {
      return 1;
    }
    else if (bDependsOnA) {
      return -1;
    }
    return 0;
  });
  return packageList;
}

function getFullDependencySet(originalPackage: string, cache: PackageMap): Set<string> {
  const dependencyList: Set<string> = new Set();

  function getDependencies(msgPackage: string): void {
    const localDeps = cache[msgPackage].localDeps;
    localDeps.forEach((dep: string) => {
      if (dep === originalPackage) {
        throw new Error('Found circular dependency while building chain');
      }
      dependencyList.add(dep);
      getDependencies(dep);
    });
  }

  getDependencies(originalPackage);
  return dependencyList;
}

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
