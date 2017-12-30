
const ParseArgs = require('./lib/ArgParser');
const ChromeBridge = require('./lib/ChromeBridge');
const config = require('./lib/config');


//functions
function print_object(object, type, prefix=null)
{
	var typeInfo = config.EXTENSION_MAPPINGS.types[type];
	var order = [];
	if(typeInfo != null && typeInfo.order != null)
	{
		order = typeInfo.order;
	}
	else
	{
		order = Object.keys(object);
	}
	var hasPrefix = true;
	if(prefix === null)
	{
		hasPrefix = false;
		prefix = '';
	}
	for(var i=0; i<order.length; i++)
	{
		var key = order[i];
		var value = object[key];
		if(value instanceof Array)
		{
			print_array(value, '', prefix+key);
		}
		else if(typeof value == 'object')
		{
			print_object(value, '', prefix+key+'.');
		}
		else
		{
			console.log(prefix+key+': '+value);
		}
	}
}

function print_array(array, type, prefix=null)
{
	var hasPrefix = true;
	if(prefix === null)
	{
		hasPrefix = false;
		prefix = '';
	}
	for(var i=0; i<array.length; i++)
	{
		var value = array[i];

		var valuePrefix = '';
		if(hasPrefix)
		{
			valuePrefix = prefix+'['+i+']';
		}
		if(value instanceof Array)
		{
			print_array(value, type, valuePrefix);
		}
		else if(typeof value == 'object')
		{
			print_object(value, type, valuePrefix);
		}
		else
		{
			console.log(valuePrefix+': '+value);
		}
		if(!hasPrefix && i != (array.length-1))
		{
			console.log("");
		}
	}
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
	stopAtStray: true,
	stopAtError: true,
	errorExitCode: 1,
	allowUnmappedArgs: false
};
var argv = ParseArgs(process.argv.slice(2), argOptions);



//build request
var request = {
	command: ''
};
var callback = (response) => {
	var type = '';
	if(request.command == 'js')
	{
		var funcInfo = config.EXTENSION_MAPPINGS.functions[request.js];
		if(funcInfo !== undefined && funcInfo !== null)
		{
			type = funcInfo.returns;
			if(type === undefined || type === null)
			{
				type = '';
			}
		}
	}
	if(response instanceof Array)
	{
		print_array(response, type);
	}
	else if(typeof response == 'object')
	{
		print_object(response, type);
	}
	else
	{
		console.log(response);
	}
};
var args = process.argv.slice(2+argv.lastIndex+1);
switch(argv.strays[0])
{
	case 'js':
		request.command = 'js';
		request.js = args[0];
		var params = args.slice(1);
		for(var i=0; i<params.length; i++)
		{
			var param = params[i];
			var parsedParam = null;
			try
			{
				parsedParam = JSON.parse(param);
			}
			catch(e)
			{
				parsedParam = param;
			}
			params[i] = parsedParam;
		}
		request.params = params;
		break;
		
	case 'window':
		var windowArgOptions = {
			args: [
				{
					type: 'integer',
					name: 'windowId'
				},
				{
					type: 'json',
					name: 'getInfo'
				},
				{
					type: 'json',
					name: 'createData'
				},
				{
					type: 'json',
					name: 'updateInfo'
				}
			],
			stopAtStray: false,
			stopAtError: true,
			errorExitCode: 1,
			parentOptions: argOptions,
			parentResult: argv
		};
		var windowArgv = ParseArgs(args, windowArgOptions);
		request.command = 'js';
		request.params = {};
		request.params.windowId = windowArgv.args.windowId;
		request.params.getInfo = windowArgv.args.getInfo;
		request.params.createData = windowArgv.args.createData;
		request.params.updateInfo = windowArgv.args.updateInfo;
		switch(windowArgv.strays[0])
		{
			case undefined:
				request.js = 'chrome.windows.getAll';
				break;

			case 'get':
				request.js = 'chrome.windows.get';
				break;

			default:
				console.error("unknown subcommand "+windowArgv.strays[0]);
				process.exit(1);
				break;
		}
		break;

	case undefined:
		//TODO show usage
		console.error("no command specified");
		process.exit(1);
		break;

	default:
		console.error("unknown command "+argv.strays[0]);
		process.exit(1);
		break;
}



var bridgeOptions = {
	verbose: argv.args['verbose'],
	establishServerTimeout: argv.args['establish-server-timeout'],
	chromeConnectTimeout: argv.args['chrome-connect-timeout']
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
	bridge.sendRequest(request, (response, error) => {
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
