
global.chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
global.assert = chai.assert;
global.expect = chai.expect;
global.should = chai.should();

require('./DeserializeStream.js');
require('./namespaceTest.js');
require('./SpinnerTest.js');
require('./xmlrpcTest.js');
require('./Log.js');
require('./onTheFly.js');
require('./SlaveApiClient.js');