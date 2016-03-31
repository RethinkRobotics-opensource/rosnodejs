'use strict';

let rosjs = require('./index.js');

rosjs.initNode('/my_node')
.then((rosNode) => {
  console.log('GOTIT');
  // EXP 1) Service Server
  let service = rosNode.advertiseService({
    service: '/list_cameras',
    type: 'baxter_core_msgs/ListCameras'
  }, (req, resp) => {
    console.log('Handling request! ' + JSON.stringify(req));
    resp.cameras = ['hi', 'camA', 'suckITCam'];
    return true;
  });

  // EXP 2) Service Client
  let serviceClient = rosNode.serviceClient({
    service: '/list_cameras',
    type: 'baxter_core_msgs/ListCameras'
  });
  rosNode.waitForService(serviceClient.getService(), 2000)
  .then((available) => {
    if (available) {
      serviceClient.call({}, (resp) => {
        console.log('Service response ' + JSON.stringify(resp));
      });
    }
  });

  // EXP 3) Params
  rosNode.setParam('~junk', {'hi': 2}).then(() => {
    rosNode.getParam('~junk').then((val) => { console.log('Got Param!!! ' + JSON.stringify(val)); });
  });

  // EXP 4) Publisher
  let pub = rosNode.advertise({
    topic: '/my_topic',
    type: 'std_msgs/String',
    queueSize: 2,
    latching: true,
    throttleMs: 100
  });

  let msgStart = 'my message ';
  let iter = 0;
  setInterval(() => {
    pub.publish({
      data: msgStart + iter
    });
    ++iter;
    if (iter > 200) {
      iter = 0;
    }
  }, 4);

  // EXP 5) Subscriber
  let sub = rosNode.subscribe({
    topic: '/my_topic',
    type: 'std_msgs/String',
    queueSize: 1,
    throttleMs: 500},
    (data) => {
      console.log('SUB DATA ' + data.data);
    });
});
