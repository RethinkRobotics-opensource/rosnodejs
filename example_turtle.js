/** 
    An example of using rosnodejs with turtlesim, incl. services,
    pub/sub, and actionlib. This example uses the on-demand generated
    messages.
 */

'use strict';

let rosnodejs = require('./index.js');
const ActionClient = require('./lib/ActionClient.js');

rosnodejs.initNode('/my_node', {
  messages: [
    'turtlesim/Pose',
    'turtle_actionlib/ShapeActionGoal',
    'turtle_actionlib/ShapeActionFeedback',
    'turtle_actionlib/ShapeActionResult',
    'geometry_msgs/Twist',
  ],
  services: ["turtlesim/TeleportRelative"]
}).then((rosNode) => {

  // ---------------------------------------------------------
  // Service Call

  const TeleportRelative = rosnodejs.require('turtlesim').srv.TeleportRelative;
  const teleport_request = new TeleportRelative.Request({
    linear: -1, 
    angular: 0.0
  });

  let serviceClient = rosNode.serviceClient("/turtle1/teleport_relative", 
                                             "turtlesim/TeleportRelative");

  rosNode.waitForService(serviceClient.getService(), 2000)
    .then((available) => {
      if (available) {
        serviceClient.call(teleport_request, (resp) => {
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
  let cmd_vel = rosNode.advertise('/turtle1/cmd_vel','geometry_msgs/Twist', {
    queueSize: 1,
    latching: true,
    throttleMs: 9
  });

  const Twist = rosnodejs.require('geometry_msgs').msg.Twist;
  const msgTwist = new Twist({
    linear: { x: 1, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: 1 }
  });
  cmd_vel.publish(msgTwist);


  // ---------------------------------------------------------
  // test actionlib
  // rosrun turtlesim turtlesim_node
  // rosrun turtle_actionlib shape_server

  // wait two seconds for previous example to complete
  setTimeout(function() {
    let shapeActionGoal = rosnodejs.require('turtle_actionlib').msg.ShapeActionGoal;
    let ac = new ActionClient({
      type: "turtle_actionlib/ShapeAction",
      actionServer: "/turtle_shape"
    });
    ac.sendGoal(new shapeActionGoal({
      goal: {
        edges: 3,
        radius: 1
      }
    }));
  }, 2000);

});
