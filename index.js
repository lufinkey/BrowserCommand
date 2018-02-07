
const BrowserBridgeClient = require('./lib/BrowserBridgeClient');
const BrowserBridgeServer = require('./lib/BrowserBridgeServer');
const BrowserBridgeController = require('./lib/BrowserBridgeController');

module.exports = {
	Client: BrowserBridgeClient,
	Server: BrowserBridgeServer,
	Controller: BrowserBridgeController
};
