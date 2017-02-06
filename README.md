# rosnodejs [![Build Status](https://travis-ci.org/RethinkRobotics-opensource/rosnodejs.svg)](https://travis-ci.org/RethinkRobotics-opensource/rosnodejs)


## Run the turtlesim example

Start:

```
roscore
rosrun turtlesim turtlesim_node
rosrun turtle_actionlib shape_server
```

Then run
```
node src/examples/turtle.js
```

or, if you are running an older version of node:

```
npm run compile
node dist/examples/turtle.js
```
