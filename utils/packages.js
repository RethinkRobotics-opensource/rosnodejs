var fs          = require('fs');
var path        = require('path');
var walker      = require('walker');
var async = require('async');

// TODO: make this sync, e.g., using:
// https://www.npmjs.com/package/fs-walker
// https://www.npmjs.com/package/walk
//
// OR: just load all packages incl. messages and services upfront. We don't want
// to hold things up in the middle of production by being sync. So maybe it's
// better to just load everything up front without asking.


function walk(directory, symlinks) {
  var noSubDirs = [];
  var stopped = false;
  symlinks = symlinks || [];

  return walker(directory)
    .filterDir(function(dir, stat) {
      // Exclude any subdirectory to an excluded directory
      return !noSubDirs.some(function(subdir) {
        return !subdir.indexOf(dir);
      }) || !stopped;
    })
    .on('file', function(file, stat) {
      var shortname = path.basename(file);
      var dir = path.dirname(file);

      if (shortname === 'manifest.xml' || shortname === 'package.xml') {
        this.emit('package', path.basename(dir), dir);
        // There is no subpackages, so ignore anything under this directory
        noSubDirs.concat(dir);
      }
      else if(shortname === 'rospack_nosubdirs') {
        // Explicitly asked to not go into subdirectories
        noSubDirs.concat(dir);
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
  return walk(directory)
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

// ---------------------------------------------------------

var cache = {};

// Implements the same crawling algorithm as rospack find. See
// http://docs.ros.org/independent/api/rospkg/html/rospack.html#crawling-algorithm
// packages = {};
exports.findPackage = function(packageName, callback) {
  var directory = cache[packageName];
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
      cache[packageName] = directory;
      callback(err, directory);
    });
}

// ---------------------------------------------------------
// Logic for iterating over *all* packages

function forEachPackageInDirectory(directory, list, onEnd) {
  fs.access(directory, fs.R_OK, (err) => {
      if (!err) {
        walk(directory)
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
      cache[packageName] = directory;
    });
    done(err, directories);
  });
}
