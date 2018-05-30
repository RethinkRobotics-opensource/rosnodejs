const rosnodejs = require('../index.js');
const { FibonacciGoal, FibonacciResult, FibonacciFeedback } = rosnodejs.require('actionlib_tutorials').msg;

rosnodejs.initNode('fibonacci')
.then(() => {
  function executeCallback(goal) {
    const feedback = new FibonacciFeedback();

    rosnodejs.log.info('got goal!');
    feedback.sequence.push(0, 1);
    rosnodejs.log.info('Executing fibonacci sequence %d', goal.order);

    function _exec(iter, done) {
      if (iter <= goal.order) {
        if (as.isPreemptRequested() || !rosnodejs.ok()) {
          rosnodejs.log.warn('PREEMPTED!');
          as.setPreempted();
          done();
        }
        else {
          feedback.sequence.push(feedback.sequence[iter] + feedback.sequence[iter-1]);
          rosnodejs.log.info('Update: %j', feedback.sequence);
          as.publishFeedback(feedback);
          setTimeout(_exec, 1000, iter+1, done);
        }
      }
      else {
        // done!
        const result = new FibonacciResult();
        result.sequence = feedback.sequence;
        rosnodejs.log.info('Succeeded!');
        as.setSucceeded(result);
        done();
      }
    }

    return new Promise(function(resolve) {
      _exec(1, resolve);
    });
  }

  const as = new rosnodejs.SimpleActionServer({
    nh: rosnodejs.nh,
    type: 'actionlib_tutorials/Fibonacci',
    actionServer: '/fibonacci',
    executeCallback
  });

  as.start();

  const ac = new rosnodejs.SimpleActionClient({
    nh: rosnodejs.nh,
    type: 'actionlib_tutorials/Fibonacci',
    actionServer: '/fibonacci'
  });

  ac.waitForServer()
  .then(() => {
    rosnodejs.log.info('Connected to action server!');

    ac.sendGoal({ order: 6 },
      function() { console.log('DONE'); },
      function() { console.log('ACTIVE');
        ac.sendGoal({ order: 7 },
          function() { console.log('DONE'); },
          function() { console.log('ACTIVE'); },
          function() { console.log('FEEDBACK'); }
        );
      },
      function() { console.log('FEEDBACK'); }
    );
  })
})
.catch(function(err) {
  console.error(err.stack);
});
