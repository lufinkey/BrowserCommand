
const BrowserBridgeClient = require('./lib/BrowserBridgeClient');
const BrowserBridgeServer = require('./lib/BrowserBridgeServer');
const BrowserBridgeController = require('./lib/BrowserBridgeController');
const JobManager = require('./lib/JobManager');
const UserKeyManager = require('./lib/UserKeyManager');

module.exports = {
	Client: BrowserBridgeClient,
	Server: BrowserBridgeServer,
	Controller: BrowserBridgeController,
	JobManager: JobManager,
	UserKeyManager: UserKeyManager
};
