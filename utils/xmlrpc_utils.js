'use strict';


module.exports = {
  call(client, method, data, resolve, reject, log, timeout) {
		log.debug('Calling method ' + method +': ' + data);
		if (timeout === undefined) {
			timeout = 0;
		}

		setTimeout(() => {
			client.methodCall(method, data, (err, resp) => {
				if (err && err.code === 'ECONNREFUSED') {
					if (timeout === 0) {
						timeout = 1;
					}
					else {
						timeout *= 2;
					}
					log.debug('Trying again in ' + timeout +  'ms');
          log.debug('Connection refused during method %s: %j', method, data);
					this.call(method, data, resolve, reject, timeout);
				}
				else if (err || resp[0] !== 1) {
					log.warn('Some other error during %s: %s, %j', method, err, resp);
					reject(err, resp);
				}
				else {
					resolve(resp);
				}
			});
		}, timeout);
	}
};
