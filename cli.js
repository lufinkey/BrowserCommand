
const ChromeBridge = require('./lib/ChromeBridge');


//parse arguments
var request = null;
var callback = null;
switch(process.argv[2])
{
	case 'window':
		request = {type: 'req-get-windows'};
		callback = (response, error) => {
			console.log(response);
		};
		break;

	case '':
		console.error("missing command");
		process.exit(1);
		break;

	default:
		console.error("unknown command "+process.argv[2]);
		process.exit(1);
		break;
}


var options = {
	establishServerTimeout: 6000,
	chromeConnectTimeout: 6000
};
var bridge = new ChromeBridge(options);

bridge.on('failure', (error) => {
	console.error("failure");
	console.error(error.message);
	process.exit(2);
});

bridge.on('listening', () => {
	console.error("listening");
});

bridge.on('connect', () => {
	console.error("connect");
	bridge.send(request, (response, error) => {
		if(error)
		{
			console.error(error.message);
			process.exit(3);
		}
		else
		{
			console.log(response);
			process.exit(0);
		}
	});
});
