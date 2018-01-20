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
			name: 'verbose',
			short: 'v',
			type: 'boolean',
			default: false,
		},
		{
			name: 'connect-timeout',
			type: 'uinteger',
			default: 10000
		},
		{
			name: 'chrome-connect-timeout',
			type: 'uinteger',
			default: 10000
		}
	],
	maxStrays: 0,
	stopIfTooManyStrays: true,
	stopAtError: true,
	errorExitCode: 1
};
var args = process.argv.slice(2);
var argv = ArgParser.parse(args, argOptions);



var callback = (response) => {
	print_response(response);
};
var command = args[argv.endIndex];
args = args.slice(argv.endIndex+1);
switch(command)
{
// --- BUILD-CRX ---
	case 'build-crx':
		request = null;
		var crxPath = args[0];
		assert(args.length <= 1, 1, "invalid argument "+args[1]);
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
		
// --- SERVER ---
	case 'server':
		request = null;
		switch(args[0])
		{
			case 'install-service':
				var serviceOptions = {
					args: [
						{
							name: 'ignore-if-nonroot',
							type: 'boolean',
							default: false
						}
					],
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
							name: 'ignore-if-nonroot',
							type: 'boolean',
							default: false
						}
					],
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
				console.error("invalid command "+args[0]);
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
		request.command = 'js';
		request.params = {};
		switch(args[0])
		{
			case undefined:
				request.js = 'chrome.windows.getAll';
				break;

			case 'get':
				args = args.slice(1);
				var windowArgOptions = {
					args: [
						{
							name: 'output-json',
							short: 'j',
							type: 'boolean',
							default: false
						},
						{
							name: 'id',
							short: 'i',
							type: 'integer',
							path: 'windowId'
						},
						{
							name: 'populate',
							short: 'p',
							type: 'boolean',
							path: 'getInfo.populate'
						},
						{
							name: 'filter-type',
							type: 'string',
							array: true,
							path: 'getInfo.windowTypes'
						}
					],
					maxStrays: 1,
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				request.params = {};
				request.params.windowId = windowArgv.args.windowId;
				request.params.getInfo = windowArgv.args.getInfo;

				if(windowArgv.args['output-json'])
				{
					callback = (response) => {
						console.log(JSON.stringify(response, null, 4));
					};
				}

				if(request.params.windowId === undefined)
				{
					assert(windowArgv.strays.length <= 2, 1, "invalid argument "+windowArgv.strays[1]);
					var windowSelector = windowArgv.strays[0];
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
				}
				else
				{
					assert(windowArgv.strays.length <= 1, 1, "invalid argument "+windowArgv.strays[0]);
					request.js = 'chrome.windows.get';
				}
				break;

			case 'create':
				args = args.slice(1);
				var windowArgOptions = {
					args: [
						{
							name: 'output-json',
							short: 'j',
							type: 'boolean',
							default: false
						},
						{
							name: 'url',
							short: 'u',
							type: 'string',
							array: true,
							path: 'createData.url'
						},
						{
							name: 'tab-id',
							type: 'integer',
							path: 'createData.tabId'
						},
						{
							name: 'left',
							short: 'x',
							type: 'integer',
							path: 'createData.left'
						},
						{
							name: 'top',
							short: 'y',
							type: 'integer',
							path: 'createData.top'
						},
						{
							name: 'width',
							short: 'w',
							type: 'integer',
							path: 'createData.width'
						},
						{
							name: 'height',
							short: 'h',
							type: 'integer',
							path: 'createData.height'
						},
						{
							name: 'focused',
							short: 'f',
							type: 'boolean',
							path: 'createData.focused'
						},
						{
							name: 'incognito',
							short: 'n',
							type: 'boolean',
							path: 'createData.incognito'
						},
						{
							name: 'type',
							type: 'string'
						},
						{
							name: 'state',
							type: 'string'
						}
					],
					maxStrays: -1,
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				request.js = 'chrome.windows.create';
				request.params = {};
				request.params.createData = windowArgv.args.createData;

				if(windowArgv.args['output-json'])
				{
					callback = (response) => {
						console.log(JSON.stringify(response, null, 4));
					};
				}
				break;

			case 'update':
				args = args.slice(1);
				var windowArgOptions = {
					args: [
						{
							name: 'output-json',
							short: 'j',
							type: 'boolean',
							default: false
						},
						{
							name: 'id',
							type: 'integer',
							path: 'windowId'
						},
						{
							name: 'left',
							short: 'x',
							type: 'integer',
							path: 'updateInfo.left'
						},
						{
							name: 'top',
							short: 'y',
							type: 'integer',
							path: 'updateInfo.top'
						},
						{
							name: 'width',
							short: 'w',
							type: 'integer',
							path: 'updateInfo.width'
						},
						{
							name: 'height',
							short: 'h',
							type: 'integer',
							path: 'updateInfo.height'
						},
						{
							name: 'focused',
							short: 'f',
							type: 'boolean',
							path: 'updateInfo.focused'
						},
						{
							name: 'attention',
							type: 'boolean',
							path: 'updateInfo.drawAttention'
						},
						{
							name: 'state',
							type: 'string',
							path: 'updateInfo.state'
						}
					],
					maxStrays: -1,
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				request.js = 'chrome.windows.update';
				request.params = {};
				request.params.windowId = windowArgv.args.windowId;
				request.params.updateInfo = windowArgv.args.updateInfo;

				if(windowArgv.args['output-json'])
				{
					callback = (response) => {
						console.log(JSON.stringify(response, null, 4));
					};
				}
				break;

			default:
				console.error("invalid command "+args[0]);
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
		console.error("invalid command "+argv.strays[0]);
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
		if(serverProcess != null)
		{
			serverProcess.on('exit', (code, signal) => {
				console.error("server exited with code "+code);
				if(!clientConnected)
				{
					process.exit(2);
				}
			});
		}

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
				client.sendRequest(null, request, (response, error) => {
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
		});

		client.on('failure', (error) => {
			console.error("client error: "+error.message);
			process.exit(2);
		});
	});
}
