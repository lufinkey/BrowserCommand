
const ChromeBridge = require('./lib/ChromeBridge');


//parse arguments
var request = null;
var callback = (response, error) => {
	if(error)
	{
		console.error(error);
	}
	else
	{
		console.log(response);
	}
};
switch(process.argv[2])
{
	case 'window':
		switch(process.argv[3])
		{
			case '':
			case undefined:
			case 'list':
				request = {type: 'get-windows'};
				break;

			case 'get':
				request = {type: 'get-window', windowId: process.argv[4]};
				break;

			default:
				console.error("window: unknown command "+process.argv[3]);
				process.exit(1);
				break;
		}
		break;

	case '':
	case undefined:
		console.error("missing command");
		process.exit(1);
		break;

	default:
		console.error("unknown command "+process.argv[2]);
		process.exit(1);
		break;
}


var options = {
	establishServerTimeout: 10000,
	chromeConnectTimeout: 10000
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
	console.error("sending request", request);
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
