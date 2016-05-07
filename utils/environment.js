// Exposes host and ROS environment variables.
var environment = exports

// Returns a hostname used for ROS communication, including XML-RPC servers and
// clients and TCPROS connections.
environment.getHostname= function() {
  return 'localhost'
}

// Returns the ROS root directory.
//
// Example: '/opt/ros/electric/ros'
environment.getRosRoot = function() {
  return process.env.ROS_ROOT
}

// Returns the ROS Master URI.
//
// Example: 'http://localhost:11311'
environment.getRosMasterUri = function() {
  return process.env.ROS_MASTER_URI
}

// Returns an array of ROS package paths.
//
// Example: ['/home/turtlebot/ros_workspace', '/opt/ros/electric/stacks']
environment.getRosPackagePaths = function() {
  var packagePath = process.env.ROS_PACKAGE_PATH
  var packagePaths = packagePath.split(':')
  return packagePaths
}

