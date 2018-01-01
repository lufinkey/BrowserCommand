
const ChromeBridgeClient = require('./lib/ChromeBridgeClient');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
const ChromeBridgeController = require('./lib/ChromeBridgeController');

module.exports = {
	Client: ChromeBridgeClient,
	Server: ChromeBridgeServer,
	Controller: ChromeBridgeController
};
