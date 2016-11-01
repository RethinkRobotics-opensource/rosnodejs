'use strict';
const fs          = require('fs')
    , path        = require('path')
    , walker      = require('walker')
    , async       = require('async');

let packageCache = {};
const cache = {};

function packageWalk(directory, symlinks, findMessages) {
  var noSubDirs = new Set();
  var stopped = false;
  symlinks = symlinks || [];
  // console.log('package walk ' + directory);

  return walker(directory)
  .filterDir(function(dir, stat) {
    // Exclude any subdirectory to an excluded directory
    const ignoreFile = path.join(dir, 'CATKIN_IGNORE');
    try {
      fs.statSync(ignoreFile);
    }
    catch (err) {
      return !noSubDirs.has(dir) || !stopped;
    }
    return false;
  })
  .on('file', function(file, stat) {
    var shortname = path.basename(file);
    var dir = path.dirname(file);
    var extension = path.extname(file);

    if (shortname === 'manifest.xml' || shortname === 'package.xml') {
      // console.log('found package %s!', file);
      this.emit('package', path.basename(dir), dir, file);
      // There is no subpackages, so ignore anything under this directory
      noSubDirs.add(dir);
    }
    else if (findMessages) {
      var name = path.basename(file, extension);
      if (extension === '.msg') {
        // console.log('Found message %s: %s', name, file);
        this.emit('message', name, file);
      }
      else if (extension === '.srv') {
        // console.log('Found service %s: %s', name, file);
        this.emit('service', name, file);
      }
      else if (extension === '.action') {
        // console.log('Found action %s: %s', name, file);
        this.emit('action', name, file);
      }
    }
    else if(shortname === 'rospack_nosubdirs') {
      // Explicitly asked to not go into subdirectories
      noSubDirs.add(dir);
    }
  })
  .on('symlink', function(symlink, stat) {
    var walker = this;
    fs.readlink(symlink, function(error, link) {
    if (error) {
      return;
    }

    var destination = path.resolve(path.dirname(symlink), link);

    // Stores symlinks to avoid circular references
    if (~symlinks.indexOf(destination)) {
      return;
    }
    else {
      symlinks.concat(destination);
    }

    fs.stat(destination, function(error, stat) {
      if (error) {
        return;
      }
      else if (stat.isDirectory()) {
        walker.emit('dir', destination, stat);
        return walker.go(destination);
      }
    });
    });
  })
  .on('end', function() {
    stopped = true;
    // Quit emitting
    this.emit = function(){};
  });
}

function findPackageInDirectory(directory, packageName, callback) {
  var found = false;
  return packageWalk(directory)
    .on('package', function(name, dir) {
      if (name === packageName) {
        this.emit('stop');
        found = true;
        callback(null, dir);
      }
    })
    .on('end', function() {
      if (!found) {
        var error =
          new Error('ENOTFOUND - Package ' + packageName + ' not found');
        error.name = 'PackageNotFoundError';
        callback(error);
      }
    });
}

function findPackagesInDirectory(directory) {
  const promises = [];
  promises.push(new Promise((resolve) => {
    packageWalk(directory)
      .on('package', (packageName, dir, fileName) => {
        packageName = packageName.toLowerCase();
        if (!packageCache.hasOwnProperty(packageName)) {
          // console.log('Found package %s at %s', packageName, dir);
          const packageEntry = {
            directory: dir,
            messages: {},
            services: {},
            actions: {}
          };
          promises.push(new Promise((resolve) => {
            packageWalk(dir, null, true)
              .on('message', (name, file) => {
                packageEntry.messages[name] = {file};
              })
              .on('service', (name, file) => {
                packageEntry.services[name] = {file};
              })
              .on('action', (name, file) => {
                packageEntry.actions[name] = {file};
              })
              .on('end', () => {
                if (Object.keys(packageEntry.messages).length > 0 ||
                  Object.keys(packageEntry.services).length > 0 ||
                  Object.keys(packageEntry.actions).length > 0) {
                  packageCache[packageName] = packageEntry;
                }
                resolve();
              });
          }));
        }
      })
      .on('end', resolve);
  }));

  return Promise.all(promises);
}

function findPackageInDirectoryChain(directories, packageName, callback) {
  if (directories.length < 1) {
    var error =
      new Error('ENOTFOUND - Package ' + packageName + ' not found');
    error.name = 'PackageNotFoundError';
    callback(error);
  }
  else {
    findPackageInDirectory(
      directories.shift(), packageName, function(error, directory) {
        if (error) {
          if (error.name === 'PackageNotFoundError') {
            // Recursive call, try in next directory
            return findPackageInDirectoryChain(directories,
                                               packageName, callback);
          }
          else {
            callback(error);
          }
        }
        else {
          callback(null, directory);
        }
      });
  }
}

function findPackagesInDirectoryChain(directories) {
  const funcs = directories.map((directory) => { return findPackagesInDirectory.bind(null, directory); });
  return funcs.reduce((prev, cur, index) => {
    return prev.then(() => {console.log('search ' + directories[index]); return cur(); });
  }, Promise.resolve());
}

// ---------------------------------------------------------

// Implements the same crawling algorithm as rospack find
// See http://ros.org/doc/api/rospkg/html/rospack.html
// packages = {};
exports.findPackage = function(packageName, callback) {
  var directory = cache[packageName.toLowerCase()];
  if (directory) {
    callback(null, directory);
    return;
  }
  var rosRoot = process.env.ROS_ROOT;
  var packagePath = process.env.ROS_PACKAGE_PATH
  var rosPackagePaths = packagePath.split(':')
  var directories = [rosRoot].concat(rosPackagePaths);
  return findPackageInDirectoryChain(directories, packageName,
    function(err, directory) {
      cache[packageName.toLowerCase()] = directory;
      callback(err, directory);
    });
};

exports.findMessagePackages = function() {
  var packagePath = process.env.ROS_PACKAGE_PATH;
  var rosPackagePaths = packagePath.split(':');
  return findPackagesInDirectoryChain(rosPackagePaths).then(() => {console.log('Found all packages!')});
};

exports.getPackageCache = function() {
  return Object.assign({}, packageCache);
};

function forEachPackageInDirectory(directory, list, onEnd) {
  fs.access(directory, fs.R_OK, (err) => {
      if (!err) {
        packageWalk(directory)
          .on('package', function(name, dir) {
            list.push(dir);
          })
          .on('end', onEnd);
      } else {
        onEnd();
      }
    });
}

/** get list of package directories */
exports.getAllPackages = function(done) {
  var rosRoot = process.env.ROS_ROOT;
  var packagePath = process.env.ROS_PACKAGE_PATH
  var rosPackagePaths = packagePath.split(':')
  var directories = [rosRoot].concat(rosPackagePaths);
  async.reduce(directories, [], function(memo, directory, callback) {
      forEachPackageInDirectory(directory, memo, function() {
        callback(null, memo);
      });
  }, function(err, directories) {
    directories.forEach(function(directory) {
      var packageName = path.basename(directory);
      cache[packageName.toLowerCase()] = directory;
    });
    done(err, directories);
  });
}
