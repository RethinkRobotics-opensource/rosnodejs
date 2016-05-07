'use strict';

let rosnodejs = require('./index.js');
// const std_msgs = rosnodejs.require('std_msgs').msg;
// const SetBool = rosnodejs.require('std_srvs').srv.SetBool;

// aspirational:
rosnodejs.use(['std_msgs/String'], function() {

  const msg = new (rosnodejs.message('std_msgs/String'))(
    { data: "howdy" });
  // console.log(msg, 
  //             Object.getOwnPropertyNames(msg),
  //             msg.md5,
  //             msg.__proto__);


  rosnodejs.initNode('/my_node')
    .then((rosNode) => {
      // EXP 1) Service Server
      // let service = rosNode.advertiseService({
      //   service: '/set_bool',
      //   type: 'std_srvs/SetBool'
      // }, (req, resp) => {
      //   console.log('Handling request! ' + JSON.stringify(req));
      //   resp.success = !req.data;
      //   resp.message = 'Inverted!';
      //   return true;
      // });

      // // EXP 2) Service Client
      // let serviceClient = rosNode.serviceClient({
      //   service: '/set_bool',
      //   type: 'std_srvs/SetBool'
      // });
      // rosNode.waitForService(serviceClient.getService(), 2000)
      // .then((available) => {
      //   if (available) {
      //     const request = new SetBool.Request();
      //     request.data = true;
      //     serviceClient.call(request, (resp) => {
      //       console.log('Service response ' + JSON.stringify(resp));
      //     });
      //   }
      // });

      // // EXP 3) Params
      // rosNode.setParam('~junk', {'hi': 2}).then(() => {
      //   rosNode.getParam('~junk').then((val) => { console.log('Got Param!!! ' + JSON.stringify(val)); });
      // });

      // // EXP 4) Publisher
      let pub = rosNode.advertise({
        topic: '/my_topic',
        type: 'std_msgs/String',
        queueSize: 1,
        latching: true,
        throttleMs: 9
      });

      let msgStart = 'my message ';
      let iter = 0;
      // const msg = new std_msgs.String(); // already created above
      setInterval(() => {
        // console.log(".");
        msg.data = msgStart + iter
        pub.publish(msg);
        ++iter;
        if (iter > 200) {
          iter = 0;
        }
      }, 5);

      // EXP 5) Subscriber
      let sub = rosNode.subscribe({
        topic: '/my_topic',
        type: 'std_msgs/String',
        queueSize: 1,
        throttleMs: 1000},
        (data) => {
          console.log('SUB DATA ', data, data.data);
        });
    });
  
});

