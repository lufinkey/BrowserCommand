
const ParseArgs = require('./lib/ArgParser');
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
var argOptions = {
	args: [
		{
			type: 'boolean',
			name: 'verbose',
			short: 'v',
			default: false,
		},
		{
			type: 'uinteger',
			name: 'establish-server-timeout',
			default: 10000
		},
		{
			type: 'uinteger',
			name: 'chrome-connect-timeout',
			default: 10000
		},
		{
			type: 'boolean',
			name: 'output-json',
			default: false
		}
	],
	options: {
		stopAtStray: false,
		stopAtError: true,
		allowUnmappedArgs: false
	}
};
var argv = ParseArgs(process.argv.slice(2), argOptions);
if(argv.errors.length > 0)
{
	for(var i=0; i<argv.errors.length; i++)
	{
		console.error(argv.errors[i]);
	}
	process.exit(1);
}


var request = null;
var callback = (response) => {
	console.log(response);
};
switch(argv.strays[0])
{
	case 'window':
		switch(argv.strays[1])
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
				if(isIntegerString(argv.strays[2]))
				{
					argv.strays[2] = Number.parseInt(argv.strays[2]);
				}
				request = {type: 'get-window', windowId: argv.strays[2]};
				callback = (window) => {
					print_window(window);
				};
				break;

			case undefined:
				console.error("missing subcommand");
				process.exit(1);
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


var bridgeOptions = {
	verbose: argOptions['verbose'],
	establishServerTimeout: argOptions['establish-server-timeout'],
	chromeConnectTimeout: argOptions['chrome-connect-timeout']
};
var bridge = new ChromeBridge(bridgeOptions);

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
		else if(argv.args['output-json'])
		{
			console.log(JSON.stringify(response));
			process.exit(0);
		}
		else
		{
			callback(response);
			process.exit(0);
		}
	});
});
