
const ChromeBridgeController = require('./lib/ChromeBridgeController');

var controller = new ChromeBridgeController();

controller.on('try-connect', () => {
	//console.clear();
});
