
const BrowserBridgeController = require('./lib/BrowserBridgeController');

const backgroundPage = chrome.extension.getBackgroundPage();
var controller = new BrowserBridgeController();
backgroundPage.controller = controller;

browser.storage.local.get(['port', 'identifier']).then((items) => {
	// set controller preferences
	var options = {
		verbose: true,
		outputFunctionsInJSON: true,
		port: items.port,
		identifier: items.identifier
	};
	controller.setOptions(options);

	// listen for the controller retrying to connect
	controller.on('retryConnect', () => {
		//console.clear();
	});

	// start the controller
	controller.start();
}).catch((error) => {
	// an error occurred
	console.error("an error occurred while retrieving saved preferences: "+error.message);
	process.exit(1);
});
