#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const Print = require('./lib/Print');
const JobManager = require('./lib/JobManager');
const ChromeBridge = require('./lib/ChromeBridge');
const browserify = require('browserify');
const child_process = require('child_process');
const isElevated = require('is-elevated');
const fs = require('fs');
const os = require('os');


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
		ChromeBridge.performChromeRequest(request, (response, error) => {
			if(error)
			{
				console.error(error.message);
				process.exit(2);
				return;
			}
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
			'focused': 'chrome.windows.getAll',
			'incognito': 'chrome.windows.getAll'
		};

		// function to get an array of Window objects, given an array of selectors
		function getWindows(selectors, getInfo, completion)
		{
			var windowSelectors = Array.from(new Set(selectors));

			// get all window requests to send
			var jobMgr = new JobManager();
			for(const windowSelector of windowSelectors)
			{
				if(typeof windowSelector == 'string')
				{
					var func = selectorGetters[windowSelector];
					var jobKey = func;

					if(jobMgr.hasJob(jobKey))
					{
						continue;
					}
					
					var request = {
						command: 'js',
						js: func,
						params: [ getInfo ],
						callbackIndex: 1
					};
					jobMgr.addJob(jobKey, (callback) => {
						ChromeBridge.performChromeRequest(request, callback);
					});
				}
				else //if(typeof windowSelector == 'integer')
				{
					var func = 'chrome.windows.get';
					var jobKey = func+'('+windowSelector;

					var request = {
						command: 'js',
						js: func,
						params: [ windowSelector, getInfo ],
						callbackIndex: 2
					};
					jobMgr.addJob(jobKey, (callback) => {
						ChromeBridge.performChromeRequest(request, callback);
					});
				}
			}

			// create callback to be called when all window requests finish
			jobMgr.execute((responses, errors) => {
				for(var jobKey in errors)
				{
					const error = errors[jobKey];
					if(error)
					{
						console.error(error.message);
					}
				}
				
				// find the windows to respond with
				var windows = [];
				for(const windowSelector of windowSelectors)
				{
					var foundWindow = false;
					if(windowSelector == 'all')
					{
						const allWindows = responses['chrome.windows.getAll'];
						if(allWindows)
						{
							windows.push(...allWindows);
						}
						foundWindow = true;
					}
					else if(selectorGetters[windowSelector] == 'chrome.windows.getAll')
					{
						// find selected windows
						for(const window of responses['chrome.windows.getAll'])
						{
							if(windowSelector == 'focused')
							{
								if(window.focused)
								{
									windows.push(window);
									foundWindow = true;
									break;
								}
							}
							else if(windowSelector == 'incognito')
							{
								if(window.incognito)
								{
									windows.push(window);
									foundWindow = true;
								}
							}
						}
					}
					else if(typeof windowSelector == 'string')
					{
						// find window for selector
						var window = responses[selectorGetters[windowSelector]];
						if(window)
						{
							windows.push(window);
							foundWindow = true;
						}
					}
					else
					{
						// find window matching id
						var idWindow = responses['chrome.windows.get('+windowSelector];
						if(idWindow)
						{
							windows.push(idWindow);
							foundWindow = true;
						}
						else if(responses['chrome.windows.getAll'])
						{
							for(const window of responses['chrome.windows.getAll'])
							{
								if(window.id === windowSelector)
								{
									windows.push(window);
									foundWindow = true;
									break;
								}
							}
						}
					}

					if(!foundWindow)
					{
						console.error("no windows found for selector "+windowSelector);
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

				// give the windows to the completion block
				completion(windows);
			});
		}

		// function to get an array of Window ids, given an array of selectors
		function getWindowIDs(selectors, getInfo, completion)
		{
			var hasNonIDSelector = false;
			for(var i=0; i<selectors.length; i++)
			{
				var selector = selectors[i];
				if(typeof selector == 'string')
				{
					hasNonIDSelector = true;
					break;
				}
			}

			if(!hasNonIDSelector)
			{
				var windowIDs = selectors.slice(0);
				completion(windowIDs);
				return;
			}

			getWindows(selectors, getInfo, (windows) => {
				var windowIds = [];
				for(var i=0; i<windows.length; i++)
				{
					windowIds.push(windows[i].id);
				}
				completion(windowIds);
			});
		}

		// handle window command
		var windowCommand = args[0];
		args = args.slice(1);
		switch(windowCommand)
		{
			case undefined:
				// get all the window ids
				var request = {
					command: 'js',
					js: 'chrome.windows.getAll',
					params: [ null ],
					callbackIndex: 1
				};
				ChromeBridge.performChromeRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						process.exit(2);
					}
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
						Object.keys(selectorGetters)
					],
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				var windowSelectors = windowArgv.strays;
				if(windowSelectors.length == 0)
				{
					console.error("no window selector specified");
					process.exit(1);
				}

				getWindows(windowSelectors, windowArgv.args.getInfo, (windows) => {
					if(windowArgv.args['output-json'])
					{
						Print.json(windows);
					}
					else
					{
						Print.response(windows, 'Window');
					}
					process.exit(0);
				});
				break;

			case 'create':
				// create a window
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

				var createData = windowArgv.args.createData;
				var urls = windowArgv.strays;
				if(urls.length > 0)
				{
					if(!createData)
					{
						createData = {};
					}
					createData.url = urls;
				}

				// create request
				var request = {
					command: 'js',
					js: 'chrome.windows.create',
					params: [ createData ],
					callbackIndex: 1
				};

				// send request
				ChromeBridge.performChromeRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						process.exit(2);
					}
					// print response
					if(windowArgv.args['output-json'])
					{
						Print.json(response);
					}
					else
					{
						Print.response(response, 'Window');
					}
					process.exit(0);
				});
				break;

			case 'update':
				// update window properties
				var windowSelector = args[0];
				args = args.slice(1);
				// validate window selector
				if(windowSelector === undefined)
				{
					console.error("no window selector specified");
					process.exit(1);
				}
				else if(windowSelector == 'all' || windowSelector == 'incognito')
				{
					console.error("cannot use multi-window selector "+windowSelector+" for this command");
					process.exit(1);
				}
				var windowId = ArgParser.validate('integer', windowSelector);
				if(windowId !== null)
				{
					windowSelector = windowId;
				}
				else if(!Object.keys(selectorGetters).includes(windowSelector))
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
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				var updateInfo = windowArgv.args.updateInfo;
				if(!updateInfo)
				{
					updateInfo = {};
				}

				getWindowIDs( [ windowSelector ], null, (windowIds) => {
					if(windowIds.length == 0)
					{
						process.exit(2);
					}
					var windowId = windowIds[0];

					// create request
					var request = {
						command: 'js',
						js: 'chrome.windows.update',
						params: [ windowId, updateInfo ],
						callbackIndex: 2
					};

					ChromeBridge.performChromeRequest(request, (response, error) => {
						if(error)
						{
							console.error(error.message);
							process.exit(2);
						}
						if(windowArgv.args['output-json'])
						{
							Print.json(response);
						}
						else
						{
							Print.response(response, 'Window');
						}
						process.exit(0);
					});
				});
				break;

			case 'remove':
				// close windows
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
						}
					],
					maxStrays: -1,
					strayTypes: [
						'integer',
						Object.keys(selectorGetters)
					],
					stopAtError: true,
					errorExitCode: 1,
					parentOptions: argOptions,
					parentResult: argv
				};
				var windowArgv = ArgParser.parse(args, windowArgOptions);

				var windowSelectors = windowArgv.strays;
				if(windowSelectors.length == 0)
				{
					console.error("no window selector specified");
					process.exit(1);
				}

				getWindowIDs(windowSelectors, null, (windowIds) => {
					var jobMgr = new JobManager();
					for(const windowId of windowIds)
					{
						var request = {
							command: 'js',
							js: 'chrome.windows.remove',
							params: [ windowId ],
							callbackIndex: 1
						};

						var jobKey = ''+windowId;
						jobMgr.addJob(jobKey, (callback) => {
							ChromeBridge.performChromeRequest(request, callback);
						});
					}

					jobMgr.execute((responses, errors) => {
						if(Object.keys(errors).length > 0)
						{
							for(const jobKey of errors)
							{
								console.error(errors[jobKey].message);
							}
							process.exit(2);
						}
						process.exit(0);
					});
				});
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
