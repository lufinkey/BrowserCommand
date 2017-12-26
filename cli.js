
const ChromeBridge = require('./lib/ChromeBridge');


//functions
function print_window(window)
{
	var props = [ "id", "type", "state", "focused", "incognito", "top", "left", "width", "height" ];
	for(var i=0; i<props.length; i++)
	{
		var key = props[i];
		var value = window[key];
		console.log(key+': '+value);
	}
}

function isIntegerString(str)
{
	var numbers = [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' ];
	for(var i=0; i<str.length; i++)
	{
		if(numbers.indexOf(str.charAt(i)) < 0)
		{
			return false;
		}
	}
	return true;
}


//parse arguments
var request = null;
var callback = (response) => {
	console.log(response);
};
switch(process.argv[2])
{
	case 'window':
		switch(process.argv[3])
		{
			case 'list':
				request = {type: 'get-windows'};
				callback = (windows) => {
					for(var i=0; i<windows.length; i++)
					{
						print_window(windows[i]);
						if(i != (windows.length-1))
						{
							console.log('');
						}
					}
				};
				break;

			case 'get':
				if(isIntegerString(process.argv[4]))
				{
					process.argv[4] = Number.parseInt(process.argv[4]);
				}
				request = {type: 'get-window', windowId: process.argv[4]};
				callback = (window) => {
					print_window(window);
				};
				break;

			default:
				console.error("window: unknown command "+process.argv[3]);
				process.exit(1);
				break;
		}
		break;

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
	console.error("error: "+error.message);
	process.exit(2);
});

bridge.on('listening', () => {
	//console.error("listening");
});

bridge.on('connect', () => {
	//console.error("connected");
	//console.error("sending request", request);
	bridge.send(request, (response, error) => {
		if(error)
		{
			console.error(error.message);
			process.exit(3);
		}
		else
		{
			callback(response);
			process.exit(0);
		}
	});
});
