
const ChromeBridgeController = require('./lib/ChromeBridgeController');

var controller = new ChromeBridgeController();

controller.on('retry-connect', () => {
	//console.clear();
});
