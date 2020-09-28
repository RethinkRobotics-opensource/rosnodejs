'use strict';
import * as fs from 'fs';
import * as path from 'path';

type MessageType = 'message'|'service'|'action';
type MessageEntry = { type: MessageType, name: string, file: string };
type PackageEntry = {
  directory: string;
  messages: {[key: string]: MessageEntry};
  services: {[key: string]: MessageEntry};
  actions: {[key: string]: MessageEntry};
}

export type MsgPackageCache = {
  [key: string]: PackageEntry;
}

let messagePackageCache: MsgPackageCache = {};
const rosPackageCache: {[key: string]: string} = {};

// ---------------------------------------------------------

// Implements the same crawling algorithm as rospack find
// See http://ros.org/doc/api/rospkg/html/rospack.html
// packages = {};
export async function findPackage(packageName: string): Promise<string> {
  var directory = rosPackageCache[packageName.toLowerCase()];
  if (directory) {
    return directory;
  }

  const packagePath = getRosPackagePath();
  var rosPackagePaths = packagePath.split(':');
  for (const directory of rosPackagePaths) {
    for await (const pkg of getPackages(directory)) {
      rosPackageCache[pkg.name.toLowerCase()] = pkg.directory
      if (pkg.name === packageName) {
        return pkg.directory;
      }
    }
  }

  const error = new Error('ENOTFOUND - Package ' + packageName + ' not found');
  error.name = 'PackageNotFoundError';
  throw error;
}

export function findMessagePackages(): Promise<void> {
  var packagePath = getRosPackagePath();
  var rosPackagePaths = packagePath.split(':');
  return buildMessagePackageCache(rosPackagePaths);
}

export function getMessagePackageCache(): MsgPackageCache {
  return Object.assign({}, messagePackageCache);
}

async function findMessagesInPackageDirectory(dir: string): Promise<PackageEntry> {
  const packageEntry: PackageEntry = {
    directory: dir,
    messages: {},
    services: {},
    actions: {}
  };

  for await (const message of getMessages(dir)) {
    switch(message.type) {
      case 'message':
        packageEntry.messages[message.name] = message;
        break;
      case 'service':
        packageEntry.services[message.name] = message;
        break;
      case 'action':
        packageEntry.actions[message.name] = message;
        break;
    }

  }

  return packageEntry;
}

async function buildMessagePackageCache(directories: string[]): Promise<void> {
  for (const directory of directories) {
    for await (const pkg of getPackages(directory)) {
      if (!messagePackageCache.hasOwnProperty(pkg.name)) {
        const packageEntry = await findMessagesInPackageDirectory(pkg.directory);
        if (Object.keys(packageEntry.messages).length > 0 ||
          Object.keys(packageEntry.services).length > 0 ||
          Object.keys(packageEntry.actions).length > 0)
        {
          messagePackageCache[pkg.name] = packageEntry;
        }
      }
    }
  }
}

function getRosEnvVar(envVarName: string): string {
  const envVar = process.env[envVarName];

  if (!envVar) {
    throw new Error(`Unable to find required environment variable ${envVarName}`);
  }

  return envVar;
}

function getRosPackagePath(): string {
  return getRosEnvVar('ROS_PACKAGE_PATH');
}

function getRosRoot(): string {
 return getRosEnvVar('ROS_ROOT');
}

type PackageWalkReturn = { name: string, directory: string };
async function* getPackages(directory: string, symlinks: string[] = []): AsyncGenerator<PackageWalkReturn> {
  const dir = await fs.promises.opendir(directory);

  let recurse = true;
  const subdirs: fs.Dirent[] = [];
  for await (const dirent of dir) {
    if (dirent.isDirectory()) {
      subdirs.push(dirent);
    }
    else if (dirent.isFile()) {
      if (dirent.name === 'CATKIN_IGNORE' || path.basename(dirent.name) === 'rospack_nosubdirs') {
        recurse = false;
      }
      else if (dirent.name === 'package.xml' || dirent.name === 'manifest.xml') {
        yield { name: path.basename(directory), directory };
        recurse = false;
      }
    }
    else if (dirent.isSymbolicLink()) {
      const linkPath = path.join(directory, dirent.name);
      const [targetPath, stats] = await Promise.all([
        fs.promises.readlink(linkPath),
        fs.promises.stat(linkPath)
      ]);
      if (symlinks.includes(targetPath)) {
        continue;
      }
      else if (stats.isDirectory()) {
        symlinks.push(targetPath);
        subdirs.push(dirent);
      }
    }
  }

  if (recurse) {
    for (const dirent of subdirs) {
      yield* getPackages(path.join(directory, dirent.name), symlinks);
    }
  }
}

async function* getMessages(directory: string, symlinks: string[] = []): AsyncGenerator<MessageEntry> {
  const dir = await fs.promises.opendir(directory);

  let recurse = true;
  const subdirs: fs.Dirent[] = [];
  for await (const dirent of dir) {
    if (dirent.isDirectory()) {
      subdirs.push(dirent);
    }
    else if (dirent.isFile()) {
      if (dirent.name === 'CATKIN_IGNORE' || path.basename(dirent.name) === 'rospack_nosubdirs') {
        recurse = false;
      }
      else {
        const extension = path.extname(dirent.name);
        const name = path.basename(dirent.name, extension);
        const file = path.join(directory, dirent.name);
        if (extension === '.msg') {
          yield { type: 'message', name, file };
        }
        else if (extension === '.srv') {
          yield { type: 'service', name, file };
        }
        else if (extension === '.action') {
          yield { type: 'action', name, file };
        }
      }
    }
    else if (dirent.isSymbolicLink()) {
      const linkPath = path.join(directory, dirent.name);
      const [targetPath, stats] = await Promise.all([
        fs.promises.readlink(linkPath),
        fs.promises.stat(linkPath)
      ]);
      if (symlinks.includes(targetPath)) {
        continue;
      }
      else if (stats.isDirectory()) {
        symlinks.push(targetPath);
        subdirs.push(dirent);
      }
    }
  }

  if (recurse) {
    for (const dirent of subdirs) {
      yield* getMessages(path.join(directory, dirent.name), symlinks);
    }
  }
}
