
const ChromeBridgeController = require('./lib/ChromeBridgeController');

var controllerOptions = {
	verbose: true
};
var controller = new ChromeBridgeController(controllerOptions);

controller.on('retryConnect', () => {
	//console.clear();
});
