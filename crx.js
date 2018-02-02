
const ChromeBridgeController = require('./lib/ChromeBridgeController');

const backgroundPage = chrome.extension.getBackgroundPage();

var controllerOptions = {
	verbose: true,
	outputFunctionsInJSON: true
};
var controller = new ChromeBridgeController(controllerOptions);
controller.start();

controller.on('retryConnect', () => {
	//console.clear();
});

backgroundPage.controller = controller;
