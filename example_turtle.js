'use strict';

let rosnodejs = require('./index.js');
const ActionClient = require('./lib/ActionClient.js');

rosnodejs.initNode('/my_node', {
  messages: [
    'rosgraph_msgs/Log', // required for new logging approach
    'turtlesim/Pose',
    'turtle_actionlib/ShapeActionGoal',
    'turtle_actionlib/ShapeActionFeedback',
    'turtle_actionlib/ShapeActionResult',
    'geometry_msgs/Twist',
    'actionlib_msgs/GoalStatusArray',
    'actionlib_msgs/GoalID'
  ],
  services: ['std_srvs/SetBool', "turtlesim/TeleportRelative"]
}).then((rosNode) => {

  // console.log(new (rosnodejs.require('rosgraph_msgs').msg.Log)());
  

  // ---------------------------------------------------------
  // Service Call

  const TeleportRelative = rosnodejs.require('turtlesim').srv.TeleportRelative;
  const teleport_request = new TeleportRelative.Request({
    linear: 0.1, 
    angular: 0.0
  });

  let serviceClient2 = rosNode.serviceClient("/turtle1/teleport_relative", 
                                             "turtlesim/TeleportRelative");
  rosNode.waitForService(serviceClient2.getService(), 2000)
    .then((available) => {
      if (available) {
        serviceClient2.call(teleport_request, (resp) => {
          console.log('Service response ' + JSON.stringify(resp));
        });
      } else {
        console.log('Service not available');
      }
    });


  // ---------------------------------------------------------
  // Subscribe
  rosNode.subscribe(
    '/turtle1/pose', 
    'turtlesim/Pose',
    (data) => {
      console.log('pose', data);
    },
    {queueSize: 1,
     throttleMs: 1000});

  // ---------------------------------------------------------
  // Publish
  // equivalent to: 
  //   rostopic pub /turtle1/cmd_vel geometry_msgs/Twist '[1, 0, 0]' '[0, 0, 0]'
  // sudo tcpdump -ASs 0 -i lo | tee tmp/rostopic.dump
  let cmd_vel = rosNode.advertise('/turtle1/cmd_vel','geometry_msgs/Twist', {
    queueSize: 1,
    latching: true,
    throttleMs: 9
  });

  const Twist = rosnodejs.require('geometry_msgs').msg.Twist;
  const msgTwist = new Twist();
  msgTwist.linear = new (rosnodejs.require('geometry_msgs').msg.Vector3)();
  msgTwist.linear.x = 1;
  msgTwist.linear.y = 0;
  msgTwist.linear.z = 0;
  msgTwist.angular = new (rosnodejs.require('geometry_msgs').msg.Vector3)();
  msgTwist.angular.x = 0;
  msgTwist.angular.y = 0;
  msgTwist.angular.z = 0;
  // console.log("Twist", msgTwist);
  cmd_vel.publish(msgTwist);

  // cmd_vel.on('connection', function(s) {
  //   console.log("connected", s);
  // });


  // ---------------------------------------------------------
  // test actionlib
  // rosrun turtlesim turtlesim_node
  // rosrun turtle_actionlib shape_server

  let pub_action = 
    rosNode.advertise('/turtle_shape/goal', 'turtle_actionlib/ShapeActionGoal', {
      queueSize: 1,
      latching: true,
      throttleMs: 9
    });

  let shapeActionGoal = rosnodejs.require('turtle_actionlib').msg.ShapeActionGoal;
  // console.log("shapeMsgGoal", shapeActionGoal);
  var now = Date.now();
  var secs = parseInt(now/1000);
  var nsecs = (now % 1000) * 1000;
  let shapeMsg = new shapeActionGoal({
    header: {
      seq: 0,
      stamp: new Date(),
      frame_id: ''
    },
    goal_id: {
      stamp: new Date(),
      id: "/my_node-1-"+secs+"."+nsecs+"000"
    },
    goal: {
      edges: 5,
      radius: 1
    }
  });

  // console.log("shapeMsg", shapeMsg);
  pub_action.publish(shapeMsg);


  // ---- Same with ActionClient:
  // console.log("start");
  // let ac = new ActionClient({
  //   type: "turtle_actionlib/ShapeAction",
  //   actionServer: "turtle_shape"
  // });
  // // console.log(ac);
  // // ac.sendGoal(new shapeActionGoal({
  // //   goal: {
  // //     edges: 5,
  // //     radius: 1
  // //   }
  // // }));
  // ac.sendGoal(shapeMsg);

  console.log("\n** done\n");


});
