
const BrowserBridgeController = require('./lib/BrowserBridgeController');

const backgroundPage = chrome.extension.getBackgroundPage();
var controller = new BrowserBridgeController();
backgroundPage.controller = controller;

chrome.storage.local.get(['port', 'identifier'], (items) => {
	var options = {
		verbose: true,
		outputFunctionsInJSON: true,
		port: items.port,
		identifier: items.identifier
	};
	controller.setOptions(options);

	controller.on('retryConnect', () => {
		//console.clear();
	});

	controller.start();
});
