var fs          = require('fs')
  , path        = require('path')
  , walker      = require('walker');


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

// Implements the same crawling algorithm as rospack find
// See http://ros.org/doc/api/rospkg/html/rospack.html
// packages = {};
exports.findPackage = function(packageName, callback) {
  var rosRoot = process.env.ROS_ROOT;
  var packagePath = process.env.ROS_PACKAGE_PATH
  var rosPackagePaths = packagePath.split(':')
  var directories = [rosRoot].concat(rosPackagePaths);
  return findPackageInDirectoryChain(directories, packageName, callback);
}

