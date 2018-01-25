
const ArgParser = require('../lib/ArgParser');
const JobManager = require('../lib/JobManager');
const ChromeBridge = require('../lib/ChromeBridge');
const Print = require('../lib/Print');



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



// export window command handler
module.exports = function(cli, callback, ...args)
{
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
					callback(2);
					return;
				}
				for(var i=0; i<response.length; i++)
				{
					var window = response[i];
					console.log(window.id);
				}
				callback(0);
			});
			break;

		case 'get':
			// qeury windows from selectors
			// parse args
			var windowArgOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
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
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var windowArgv = ArgParser.parse(args, windowArgOptions);

			var windowSelectors = windowArgv.strays;
			if(windowSelectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			getWindows(windowSelectors, windowArgv.args.getInfo, (windows) => {
				Print.format(windows, windowArgv.args['output'], 'Window');
				callback(0);
			});
			break;

		case 'create':
			// create a window
			// parse args
			var windowArgOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
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
				parentOptions: cli.argOptions,
				parentResult: cli.argv
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
					callback(2);
					return;
				}
				// print response
				Print.format(response, windowArgv.args['output'], 'Window');
				callback(0);
			});
			break;

		case 'update':
			// update window properties
			// parse args
			var windowArgOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
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
				strayTypes: [
					'integer',
					Object.keys(selectorGetters)
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var windowArgv = ArgParser.parse(args, windowArgOptions);

			var windowSelectors = windowArgv.strays;
			if(windowSelectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			var updateInfo = windowArgv.args.updateInfo;
			if(!updateInfo)
			{
				updateInfo = {};
			}

			getWindowIDs( windowSelectors, null, (windowIds) => {
				if(windowIds.length == 0)
				{
					callback(2);
					return;
				}
				else if(windowIds.length > 1)
				{
					if(updateInfo.focused !== undefined)
					{
						console.error("cannot change \"focused\" state for multiple windows at once");
						callback(1);
						return;
					}
					else if(updateInfo.drawAttention)
					{
						console.error("cannot draw attention to multiple windows at once");
						callback(1);
						return;
					}
				}

				// create "update" requests for each window
				var jobMgr = new JobManager();
				for(const windowId of windowIds)
				{
					// create "update" request
					var request = {
						command: 'js',
						js: 'chrome.windows.update',
						params: [ windowId, updateInfo ],
						callbackIndex: 2
					};

					// add job to send "update" request for this window
					var jobKey = ''+windowId;
					jobMgr.addJob(jobKey, (callback) => {
						ChromeBridge.performChromeRequest(request, callback);
					});
				}

				// update window IDs
				jobMgr.execute((responses, errors) => {
					// get updated windows
					var updatedWindows = [];
					for(const jobKey in responses)
					{
						const window = responses[jobKey];
						if(window != null)
						{
							updatedWindows.push(window);
						}
					}

					// display errors
					for(const jobKey in errors)
					{
						console.error(errors[jobKey].message);
					}

					// display updated windows
					Print.format(updatedWindows, windowArgv.args['output'], 'Window');

					// fail if errors are present
					if(Object.keys(errors).length > 0)
					{
						callback(2);
						return;
					}
					callback(0);
				});
			});
			break;

		case 'remove':
			// close windows
			// parse args
			var windowArgOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
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
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var windowArgv = ArgParser.parse(args, windowArgOptions);

			var windowSelectors = windowArgv.strays;
			if(windowSelectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			// query window IDs to remove
			getWindowIDs(windowSelectors, null, (windowIds) => {
				var jobMgr = new JobManager();
				// create "remove" requests for each window
				for(const windowId of windowIds)
				{
					// create "remove" request
					var request = {
						command: 'js',
						js: 'chrome.windows.remove',
						params: [ windowId ],
						callbackIndex: 1
					};

					// add job to send "remove" request for this window
					var jobKey = ''+windowId;
					jobMgr.addJob(jobKey, (callback) => {
						ChromeBridge.performChromeRequest(request, callback);
					});
				}

				// remove window IDs
				jobMgr.execute((responses, errors) => {
					if(Object.keys(errors).length > 0)
					{
						for(const jobKey of errors)
						{
							console.error(errors[jobKey].message);
						}
						callback(2);
						return;
					}
					callback(0);
				});
			});
			break;

		default:
			console.error("invalid command "+windowCommand);
			callback(1);
			break;
	}
}
