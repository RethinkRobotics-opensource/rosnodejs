const {SlaveApiClient, AbortedError} = require('../src/lib/SlaveApiClient');
let xmlrpc = require('@sixriver/xmlrpc');

describe('SlaveApiClient', function() {
    let slaveApiClient;
    let xmlRpcServer;

    beforeEach(function(done){
        slaveApiClient = new SlaveApiClient('localhost', 8087);
        xmlRpcServer = xmlrpc.createServer({host: 'localhost', port: 8087}, ()=>{
            done();
        })
    });

    afterEach(function(done){
        xmlRpcServer.close(()=>{
            done();
        });
    });

    it('should reject promise if SlaveApiClient is shutdown before requested topic is answered', function(done){
        slaveApiClient.requestTopic('foo', 'bar', '')
        .catch((err)=>{
            assert(err instanceof AbortedError);
            done();
        });
        
        slaveApiClient.shutdown();
    });

    it('should reject promise if requested topic yields an error', function(done){
        let error = {
            faultCode: 123,
            faultString: 'someError'
        };
        xmlRpcServer.on('requestTopic', (err, params, callback)=>{
            callback(error);
        });
        slaveApiClient.requestTopic('foo', 'bar', '')
        .catch((err)=>{
            assert.equal(err.faultCode, error.faultCode);
            assert.equal(err.faultString, error.faultString);
            done();
        });  
    });

    it('should resolve promise if requested topic is answered', function(done){
        xmlRpcServer.on('requestTopic', (err, params, callback)=>{       
            // reply 1 for success
            callback(null, [1, 'foo']);
        });
        slaveApiClient.requestTopic('foo', 'bar', '')
        .then((resp)=>{
            assert.equal(resp[0], 1);
            assert.equal(resp[1], 'foo');
            done();
        });       
    });
});