#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridgeClient = require('./lib/ChromeBridgeClient');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
const browserify = require('browserify');
const child_process = require('child_process');
const isElevated = require('is-elevated');
const fs = require('fs');
const os = require('os');
const config = require('./lib/config');


// functions

function copyFolder(source, destination)
{
	// check if destination exists and is a directory
	var dstExists = false;
	if(fs.existsSync(destination))
	{
		var dirStats = fs.statSync(destination);
		if(!dirStats.isDirectory())
		{
			throw new Error("file already exists at the destination");
		}
		dstExists = true;
	}

	// make destination if necessary
	if(!dstExists)
	{
		var srcStats = fs.statSync(source);
		fs.mkdirSync(destination, srcStats.mode);
	}

	// copy contents
	var entries = fs.readdirSync(source, null);
	for(var i=0; i<entries.length; i++)
	{
		var entry = entries[i];
		var stat = fs.statSync(source+'/'+entry);
		if(stat.isDirectory() && !stat.isSymbolicLink())
		{
			copyFolder(source+'/'+entry, destination+'/'+entry);
		}
		else
		{
			fs.copyFileSync(source+'/'+entry, destination+'/'+entry);
		}
	}
}

function startDetachedServer(options, completion)
{
	var options = {
		detached: true,
		stdio: 'ignore',
		cwd: __dirname
	};
	var args = [
		__dirname+'/server.js',
	];
	if(options.port != null)
	{
		args.push('--port='+options.port);
	}
	var serverProcess = child_process.spawn('node', args, options);
	completion(serverProcess, null);
}

function startServerIfNeeded(options, completion)
{
	if(options.port == null)
	{
		options.port = config.PORT;
	}

	if(ChromeBridgeServer.isServerRunning(options.port))
	{
		completion(null, null);
		return;
	}

	if(argv.args['verbose'])
	{
		console.error("server is not running. starting process...");
	}

	startDetachedServer(options, (serverProcess, error) => {
		completion(serverProcess, error);
	});
}

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
	if(prefix === null || prefix === undefined)
	{
		hasPrefix = false;
		prefix = '';
	}
	else if(prefix != '')
	{
		prefix += '.';
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
			print_object(value, '', prefix+key);
		}
		else if(value !== undefined)
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

var request = {
	command: ''
};
function print_response(response)
{
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
}

function assert(condition, exitCode, message)
{
	if(!condition)
	{
		if(message !== undefined && message !== null)
		{
			console.error(message);
		}
		process.exit(exitCode);
	}
}



// parse arguments
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
			name: 'connect-timeout',
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
	errorExitCode: 1
};
var argv = ArgParser.parse(process.argv.slice(2), argOptions);



var callback = (response) => {
	print_response(response);
};
var args = process.argv.slice(2+argv.lastIndex+1);
switch(argv.strays[0])
{
// --- BUILD-CRX ---
	case 'build-crx':
		request = null;
		var crxPath = args[0];
		assert(args.length <= 1, 1, "unknown argument "+args[1]);
		if(crxPath == undefined)
		{
			crxPath = "chrome-cmd.crx";
		}

		try
		{
			copyFolder(__dirname+'/crx', crxPath);
		}
		catch(error)
		{
			console.error(error.message);
			process.exit(2);
		}

		var crx = browserify();
		crx.add(__dirname+'/crx.js');
		crx.bundle((error, buffer) => {
			if(error)
			{
				console.error(error.message);
				process.exit(3);
			}
			fs.writeFile(crxPath+'/main.js', buffer, (error) => {
				if(error)
				{
					console.error(error.message);
					process.exit(2);
				}
				console.log("successfully built chrome extension");
			});
		});
		break;
		
	case 'server':
		request = null;
		switch(args[0])
		{
			case 'install-service':
				var serviceOptions = {
					args: [
						{
							type: 'boolean',
							name: 'ignore-if-nonroot',
							default: false
						}
					],
					stopAtStray: true,
					stopAtError: true,
					errorExitCode: 1
				};
				var serviceArgv = ArgParser.parse(args.slice(1), serviceOptions);
				switch(os.platform())
				{
					case 'linux':
						isElevated().then((elevated) => {
							if(!elevated)
							{
								if(serviceArgv.args['ignore-if-nonroot'])
								{
									process.exit(0);
								}
								console.error("root permissions are required to run this command");
								process.exit(1);
							}
							var installerProcess = child_process.spawn(__dirname+'/server/linux/install.sh', [], { cwd: __dirname });
							installerProcess.on('exit', (code, signal) => {
								if(code != 0)
								{
									console.error("errors occurred while installing service");
									process.exit(code);
								}
								process.exit(0);
							});
						});
						break;

					default:
						console.error("command not supported by this platform");
						process.exit(1);
						break;
				}
				break;

			case 'uninstall-service':
				var serviceOptions = {
					args: [
						{
							type: 'boolean',
							name: 'ignore-if-nonroot',
							default: false
						}
					],
					stopAtStray: true,
					stopAtError: true,
					errorExitCode: 1
				};
				var serviceArgv = ArgParser.parse(args.slice(1), serviceOptions);
				switch(os.platform())
				{
					case 'linux':
						isElevated().then((elevated) => {
							if(!elevated)
							{
								if(serviceArgv.args['ignore-if-nonroot'])
								{
									process.exit(0);
								}
								console.error("root permissions are required to run this command");
								process.exit(1);
							}
							var installerProcess = child_process.spawn(__dirname+'/server/linux/uninstall.sh', [], { cwd: __dirname });
							installerProcess.on('exit', (code, signal) => {
								if(code != 0)
								{
									console.error("errors occurred while installing service");
									process.exit(code);
								}
								process.exit(0);
							});
						});
						break;

					default:
						console.error("command not supported by this platform");
						process.exit(1);
						break;
				}
				break;

			case undefined:
				console.error("no command specified");
				process.exit(1);
				break;

			default:
				console.error("unknown command "+args[0]);
				process.exit(1);
				break;
		}
		break;

// --- JS -----
	case 'js':
		request.command = 'js';
		request.js = args[0];
		var params = args.slice(1);
		for(var i=0; i<params.length; i++)
		{
			var param = params[i];
			var parsedParam = null;
			if(param == 'callback')
			{
				if(request.callbackIndex !== undefined)
				{
					console.error("cannot specify multiple callbacks");
					process.exit(1);
				}
				request.callbackIndex = i;
				parsedParam = null;
			}
			else
			{
				try
				{
					parsedParam = JSON.parse(param);
				}
				catch(e)
				{
					parsedParam = param;
				}
			}
			params[i] = parsedParam;
		}
		request.params = params;
		callback = (response) => {
			console.log(JSON.stringify(response, null, 4));
		};
		break;
	
// --- WINDOW ---
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
		var windowArgv = ArgParser.parse(args, windowArgOptions);
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
				if(request.params.windowId === undefined)
				{
					var windowSelector = windowArgv.strays[1];
					if(windowSelector === undefined)
					{
						console.error("No window selector given");
						process.exit(1);
					}
					else if(windowSelector == 'current')
					{
						request.js = 'chrome.windows.getCurrent';
					}
					else if(windowSelector == 'focused')
					{
						request.js = 'chrome.windows.getLastFocused';
					}
					else if(windowSelector == 'all')
					{
						request.js = 'chrome.windows.getAll';
					}
					else
					{
						var windowId = ArgParser.validate('integer', windowSelector);
						if(windowId === null)
						{
							console.error("invalid window ID "+windowSelector);
							process.exit(1);
						}
						request.js = 'chrome.windows.get';
						request.params.windowId = windowId;
					}
					assert(windowArgv.strays.length <= 2, 1, "unknown argument "+windowArgv.strays[2]);
				}
				else
				{
					assert(windowArgv.strays.length <= 1, 1, "unknown argument "+windowArgv.strays[1]);
				}
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


// only start client and server if there is a request to send
if(request != null)
{
	// start server process
	startServerIfNeeded({ port: config.PORT }, (serverProcess, error) => {
		if(error)
		{
			console.error(error.message);
			process.exit(2);
		}

		var clientConnected = false;
		serverProcess.on('exit', (code, signal) => {
			console.error("server exited with code "+code);
			if(!clientConnected)
			{
				process.exit(2);
			}
		});

		// start client
		var clientOptions = {
			verbose: argv.args['verbose'],
			retryTimeout: argv.args['connect-timeout']
		};
		var client = new ChromeBridgeClient(clientOptions);

		client.on('connect', () => {
			clientConnected = true;
			if(serverProcess != null)
			{
				serverProcess.unref();
			}
			client.waitForChrome({timeout:argv.args['chrome-connect-timeout']}, (error) => {
				client.sendRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						process.exit(3);
					}
					else if(argv.args['output-json'])
					{
						console.log(JSON.stringify(response, null, 4));
						process.exit(0);
					}
					else
					{
						callback(response);
						process.exit(0);
					}
				});
			});
		});

		client.on('failure', (error) => {
			console.error("client error: "+error.message);
			process.exit(2);
		});
	});
}
