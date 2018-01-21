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

let client = null;
let clientConnected = false;
function connectClient(completion)
{
	if(clientConnected)
	{
		completion();
		return;
	}

	// create client if necessary
	var hasClient = false;
	if(client === null)
	{
		var clientOptions = {
			verbose: argv.args['verbose'],
			retryTimeout: argv.args['connect-timeout']
		};
		client = new ChromeBridgeClient(clientOptions);
	}
	else
	{
		hasClient = true;
	}

	// wait for client connection
	client.on('connect', () => {
		clientConnected = true;
		completion();
	});

	// only add failure handler once
	if(!hasClient)
	{
		client.on('failure', (error) => {
			console.error("client error: "+error.message);
			process.exit(2);
		});
	}
}

let chromeConnected = false;
function connectChrome(completion)
{
	connectClient(() => {
		if(chromeConnected)
		{
			completion();
			return;
		}

		// wait for chrome connection
		client.waitForChrome({timeout:argv.args['chrome-connect-timeout']}, (error) => {
			chromeConnected = true;
			completion(client, error);
		});
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

function print_response(response, type)
{
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

function print_json(obj)
{
	console.log(JSON.stringify(obj, null, 4));
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

function performRequest(request, completion)
{
	// start server process
	connectChrome(() => {
		// send request
		client.sendRequest(null, request, (response, error) => {
			if(error)
			{
				console.error(error.message);
				process.exit(3);
			}
			else
			{
				if(completion)
				{
					completion(response);
				}
			}
		});
	});
}

function createResponseWaiter(fieldNames, completion)
{
	var responded = {};
	var responses = {};

	var collectorCallback = function(field, response) {
		responded[field] = true;
		responses[field] = response;

		for(var i=0; i<fieldNames.length; i++)
		{
			var checkField = fieldNames[i];
			if(!responded[checkField])
			{
				return;
			}
		}

		completion(responses);
	};

	var createCallback = function(field) {
		return function(response) {
			collectorCallback(field, response);
		};
	};

	return createCallback;
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

var command = args[argv.endIndex];
args = args.slice(argv.endIndex+1);
switch(command)
{
// --- BUILD CHROME EXTENSION ---
	case 'build-crx':
		// get target path for chrome extension
		var crxPath = args[0];
		assert(args.length <= 1, 1, "invalid argument "+args[1]);
		if(crxPath == undefined)
		{
			crxPath = "chrome-cmd.crx";
		}

		// copy chrome extension folder to target path
		try
		{
			copyFolder(__dirname+'/crx', crxPath);
		}
		catch(error)
		{
			console.error(error.message);
			process.exit(2);
		}

		// bundle chrome extension's main.js
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
		
// --- MANAGE SERVER ---
	case 'server':
		switch(args[0])
		{
			case 'install-service':
				// parse args
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
						// ensure root
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
							// run install script
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
				// parse args
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
				// check platform
				switch(os.platform())
				{
					case 'linux':
						// ensure root
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
							// run uninstall script
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

// --- EVALUATE JAVASCRIPT -----
	case 'js':
		var request = {
			command: 'js',
			js: args[0]
		};
		// parse javascript function parameters
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
		// send request
		performRequest(request, (response) => {
			console.log(JSON.stringify(response, null, 4));
			process.exit(0);
		});
		break;
	
// --- WINDOW ---
	case 'window':
		const selectorGetters = {
			'all': 'chrome.windows.getAll',
			'current': 'chrome.windows.getCurrent',
			'lastfocused': 'chrome.windows.getLastFocused',
			'focused': 'chrome.windows.getAll'
		};
		switch(args[0])
		{
			case undefined:
				// get all the window ids
				var request = {
					command: 'js',
					js: 'chrome.windows.getAll',
					params: []
				};
				performRequest(request, (response) => {
					for(var i=0; i<response.length; i++)
					{
						var window = response[i];
						console.log(window.id);
					}
					process.exit(0);
				});
				break;

			case 'get':
				// get windows from selectors
				args = args.slice(1);
				// parse args
				var windowArgOptions = {
					args: [
						{
							name: 'output-json',
							short: 'j',
							type: 'boolean'
						},
						{
							name: 'id',
							short: 'i',
							type: 'stray'
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
					maxStrays: -1,
					strayTypes: [
						'integer',
						[ 'current', 'focused', 'lastfocused', 'all' ]
					],
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				// figure out how many of each type of selector was passed, and which functions to call
				var windowSelectors = Array.from(new Set(windowArgv.strays));
				var selectorCounters = {
					ids: [],
					current: 0,
					focused: 0,
					lastfocused: 0,
					all: 0
				};
				var windowFunctions = [];
				for(var i=0; i<windowSelectors.length; i++)
				{
					var windowSelector = windowSelectors[i];
					if(typeof windowSelector == 'string')
					{
						var selectorCount = selectorCounters[windowSelector];
						if(selectorCount == 0 && (windowSelector == 'current' || windowSelector == 'lastfocused'))
						{
							windowFunctions.push(windowSelector);
						}
						selectorCount++;
						selectorCounters[windowSelector] = selectorCount;
					}
					else
					{
						selectorCounters.ids.push(windowSelector);
					}
				}
				var getAll = false;
				if(selectorCounters.all > 0)
				{
					getAll = true;
				}

				if(getAll)
				{
					windowFunctions = [ 'all' ];
				}
				else if(selectorCounters.ids.length > 1 || selectorCounters.lastfocused > 0)
				{
					windowFunctions.push('all');
				}
				else if(selectorCounters.ids.length > 0)
				{
					windowFunctions.push('id');
				}

				// create callback to be called when all functions finish
				const responseWaiter = createResponseWaiter(windowFunctions, (responses) => {
					// handle response
					var windows = [];
					if(getAll)
					{
						// get all windows to output
						windows = responses.all;
					}
					else
					{
						// find the windows to output
						var missedIDs = 0;
						for(var i=0; i<windowSelectors.length; i++)
						{
							var windowSelector = windowSelectors[i];
							if(windowSelector == 'focused')
							{
								// find focused window
								for(var j=0; j<responses.all.length; j++)
								{
									var window = responses.all[j];
									if(window.focused)
									{
										windows.push(window);
										break;
									}
								}
							}
							else if(typeof windowSelector == 'string')
							{
								// find window for selector
								var window = responses[windowSelector];
								windows.push(window);
							}
							else
							{
								// find window matching id
								var foundWindow = false;
								if(responses.id)
								{
									if(responses.id.id == windowSelector)
									{
										windows.push(responses.id);
										foundWindow = true;
									}
								}
								if(!foundWindow && responses.all)
								{
									for(var j=0; j<responses.all.length; j++)
									{
										var window = responses.all[j];
										if(window.id === windowSelector)
										{
											windows.push(window);
											foundWindow = true;
											break;
										}
									}
								}
								if(!foundWindow)
								{
									console.error("No window with ID "+windowSelector);
									missedIDs++;
								}
							}
						}

						// remove duplicate windows
						for(var i=0; i<windows.length; i++)
						{
							var window = windows[i];
							for(var j=(i+1); j<windows.length; j++)
							{
								var cmpWindow = windows[j];
								if(window.id == cmpWindow.id)
								{
									windows.splice(j, 1);
									j--;
								}
							}
						}
					}

					// output the windows
					if(windowArgv.args['output-json'])
					{
						print_json(windows);
					}
					else
					{
						print_response(windows, 'Window');
					}
					process.exit(0);
				});

				// run the functions
				for(var i=0; i<windowFunctions.length; i++)
				{
					var request = {
						command: 'js',
						params: {
							getInfo: windowArgv.args.getInfo
						}
					};
					var func = windowFunctions[i];
					if(func == 'id')
					{
						request.js = 'chrome.windows.get';
						request.params.windowId = selectorCounters.ids[0];
					}
					else
					{
						request.js = selectorGetters[func];
					}
					performRequest(request, responseWaiter(func));
				}
				break;

			case 'create':
				// create a window
				args = args.slice(1);
				// parse args
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
							type: 'stray'
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
					strayTypes: [ 'url' ],
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				// create request
				var request = {
					command: 'js',
					js: 'chrome.windows.create',
					params: {
						createData: windowArgv.args.createData
					}
				};

				if(!request.params.createData)
				{
					request.params.createData = {};
				}
				var urls = windowArgv.strays;
				if(urls.length > 0)
				{
					request.params.createData.url = urls;
				}

				// send request
				performRequest(request, (response) => {
					// print response
					if(windowArgv.args['output-json'])
					{
						console.log(JSON.stringify(response, null, 4));
					}
					else
					{
						print_response(response, 'Window');
					}
					process.exit(0);
				});
				break;

			case 'update':
				// update window properties
				var windowSelector = args[1];
				args = args.slice(2);
				// validate window selector
				if(windowSelector == 'all')
				{
					console.error("cannot use \"all\" selector on this command");
					process.exit(1);
				}
				var windowId = ArgParser.validate('integer', windowSelector);
				if(!Object.keys(selectorGetters).includes(windowSelector) && windowId === null)
				{
					console.error("invalid window selector "+windowSelector);
					process.exit(1);
				}
				// parse args
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

				// create request
				var request = {
					command: 'js',
					js: 'chrome.windows.update',
					params: {
						updateInfo: windowArgv.args.updateInfo
					}
				};

				if(windowId === null)
				{
					var selectorRequest = {
						command: 'js',
						js: selectorGetters[windowSelector],
						params: []
					};
					// get window from selector
					performRequest(selectorRequest, (response) => {
						var window = null;
						if(windowSelector == 'focused')
						{
							for(var i=0; i<response.length; i++)
							{
								var cmpWindow = response[i];
								if(cmpWindow.focused)
								{
									window = cmpWindow;
									break;
								}
							}
						}
						else
						{
							window = response;
						}

						if(window === null)
						{
							console.error("no window found for selector "+windowSelector);
							process.exit(1);
						}

						request.params.windowId = window.id;
						// send request
						performRequest(request, (response) => {
							if(windowArgv.args['output-json'])
							{
								print_json(response);
							}
							else
							{
								print_response(response, 'Window');
							}
							process.exit(0);
						});
					});
				}
				else
				{
					request.params.windowId = windowId;
					// send request
					performRequest(request, (response) => {
						if(windowArgv.args['output-json'])
						{
							print_json(response);
						}
						else
						{
							print_response(response, 'Window');
						}
						process.exit(0);
					});
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
		console.error("invalid command "+command);
		process.exit(1);
		break;
}
