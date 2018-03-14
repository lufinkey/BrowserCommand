
const ArgParser = require('argparce');
const JobManager = require('../lib/JobManager');
const Print = require('../lib/Print');



// define non-id window selectors
const selectorDefs = {
	idField: 'id',
	typeName: 'window',
	selectors: {
		constant: {
			'all': {
				createRequest: (selector, args) => {
					return {
						command: 'js.query',
						query: ['browser','windows','getAll'],
						params: [ args.getInfo ]
					};
				}
			},
			'current': {
				createRequest: (selector, args) => {
					return {
						command: 'js.query',
						query: ['browser','windows','getCurrent'],
						params: [ args.getInfo ]
					};
				},
				filterResponse: (response) => {
					return [ response ];
				}
			},
			'lastfocused': {
				createRequest: (selector, args) => {
					return {
						command: 'js.query',
						query: ['browser','windows','getLastFocused'],
						params: [ args.getInfo ]
					};
				},
				filterResponse: (response) => {
					return [ response ];
				}
			},
			'focused': {
				createRequest: (selector, args) => {
					return {
						command: 'js.query',
						query: ['browser','windows','getAll'],
						params: [ args.getInfo ]
					};
				},
				filterResponse: (response) => {
					for(const window of response)
					{
						if(window.focused)
						{
							return [ window ];
						}
					}
					return [];
				}
			},
			'incognito': {
				createRequest: (selector, args) => {
					return {
						command: 'js.query',
						query: ['browser','windows','getAll'],
						params: [ args.getInfo ]
					};
				},
				filterResponse: (response) => {
					var windows = [];
					for(const window of response)
					{
						if(window.incognito)
						{
							windows.push(window);
						}
					}
					return windows;
				}
			}
		},
		number: {
			createRequest: (selector, args) => {
				return {
					command: 'js.query',
					query: ['browser','windows','get'],
					params: [ selector, args.getInfo ]
				};
			},
			filterResponse: (response) => {
				return [ response ];
			}
		}
	}
};



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
			cli.connectToBrowser().then(() => {
				let request = {
					command: 'js.query',
					query: ['browser','windows','getAll'],
					params: [ null ]
				};
				// send request
				cli.performBrowserRequest(request).then((response) => {
					// output response
					for(var i=0; i<response.length; i++)
					{
						var window = response[i];
						console.log(window.id);
					}
					callback(0);
				}).catch((error) => {
					// failed request
					console.error(error.message);
					callback(3);
				})
			}).catch((error) => {
				// failed to connect
				console.error("unable to connect to browser: "+error.message);
				callback(2);
			});
			break;

		case 'get':
			// query windows from selectors
			// parse args
			var argOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
					},
					{
						name: 'populate',
						short: 'p',
						type: 'boolean',
						path: ['getInfo','populate']
					},
					{
						name: 'filter-type',
						type: 'string',
						array: true,
						path: ['getInfo','windowTypes']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.selectors.constant)
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			var selectors = argv.strays;
			if(selectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser().then(() => {
				// query selectors
				cli.querySelectors(selectors, selectorDefs, argv.args).then((windows) => {
					// output response
					Print.format(windows, argv.args['output'], 'Window');
					callback(0);
				}).catch((error) => {
					// failed query
					console.error(error.message);
					callback(1);
				});
			}).catch((error) => {
				// failed to connect
				console.error("unable to connect to browser: "+error.message);
				callback(2);
			});
			break;

		case 'create':
			// create a window
			// parse args
			var argOptions = {
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
						path: ['createData','tabId']
					},
					{
						name: 'left',
						short: 'x',
						type: 'integer',
						path: ['createData','left']
					},
					{
						name: 'top',
						short: 'y',
						type: 'integer',
						path: ['createData','top']
					},
					{
						name: 'width',
						short: 'w',
						type: 'integer',
						path: ['createData','width']
					},
					{
						name: 'height',
						short: 'h',
						type: 'integer',
						path: ['createData','height']
					},
					{
						name: 'focused',
						short: 'f',
						type: 'boolean',
						path: ['createData','focused']
					},
					{
						name: 'incognito',
						short: 'n',
						type: 'boolean',
						path: ['createData','incognito']
					},
					{
						name: 'type',
						type: 'string',
						path: ['createData','type']
					},
					{
						name: 'state',
						type: 'string',
						path: ['createData','state']
					}
				],
				maxStrays: -1,
				strayTypes: [ 'url' ],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			cli.connectToBrowser().then(() => {
				var createData = Object.assign({}, argv.args.createData);
				var urls = argv.strays;
				if(urls.length > 0)
				{
					createData.url = urls;
				}

				let request = {
					command: 'js.query',
					query: ['browser','windows','create'],
					params: [ createData ]
				};
				// send request
				cli.performBrowserRequest(request).then((response) => {
					// output response
					Print.format(response, argv.args['output'], 'Window');
					callback(0);
				}).catch((error) => {
					// failed request
					console.error(error.message);
					callback(3);
				});
			}).catch((error) => {
				// failed to connect
				console.error("unable to connect to browser: "+error.message);
				callback(2);
			});
			break;

		case 'update':
			// update window properties
			// parse args
			var argOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
					},
					{
						name: 'left',
						short: 'x',
						type: 'integer',
						path: ['updateInfo','left']
					},
					{
						name: 'top',
						short: 'y',
						type: 'integer',
						path: ['updateInfo','top']
					},
					{
						name: 'width',
						short: 'w',
						type: 'integer',
						path: ['updateInfo','width']
					},
					{
						name: 'height',
						short: 'h',
						type: 'integer',
						path: ['updateInfo','height']
					},
					{
						name: 'focused',
						short: 'f',
						type: 'boolean',
						path: ['updateInfo','focused']
					},
					{
						name: 'attention',
						type: 'boolean',
						path: ['updateInfo','drawAttention']
					},
					{
						name: 'state',
						type: 'string',
						path: ['updateInfo','state']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.selectors.constant)
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			var selectors = argv.strays;
			if(selectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser().then(() => {
				let updateInfo = Object.assign({}, argv.args.updateInfo);
				// query selectors
				cli.querySelectorIDs(selectors, selectorDefs, argv.args).then((windowIds) => {
					if(windowIds.length == 0)
					{
						callback(3);
						return;
					}
					else if(windowIds.length > 1)
					{
						if(updateInfo.focused !== undefined)
						{
							console.error("cannot change \"focused\" state for multiple windows at once");
							callback(3);
							return;
						}
						else if(updateInfo.drawAttention)
						{
							console.error("cannot draw attention to multiple windows at once");
							callback(3);
							return;
						}
					}

					// create "update" requests for each window
					var jobMgr = new JobManager();
					for(const windowId of windowIds)
					{
						// create "update" request
						let request = {
							command: 'js.query',
							query: ['browser','windows','update'],
							params: [ windowId, updateInfo ]
						};

						// add job to send "update" request for this window
						var jobKey = ''+windowId;
						jobMgr.addJob(jobKey, cli.performBrowserRequest(request, callback));
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
							console.error(jobKey+': '+errors[jobKey].message);
						}

						// display updated windows
						Print.format(updatedWindows, argv.args['output'], 'Window');

						// fail if errors are present
						if(Object.keys(errors).length > 0)
						{
							callback(2);
							return;
						}
						callback(0);
					});
				}).catch((error) => {
					// failed query
					console.error(error.message);
					callback(1);
				});
			}).catch((error) => {
				// failed to connect
				console.error("unable to connect to browser: "+error.message);
				callback(2);
			});
			break;

		case 'remove':
			// close windows
			// parse args
			var argOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'pretty'
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.selectors.constant)
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			var selectors = argv.strays;
			if(selectors.length == 0)
			{
				console.error("no window selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser().then(() => {
				// query window IDs to remove
				cli.querySelectorIDs(selectors, null, (windowIds) => {
					var jobMgr = new JobManager();
					// create "remove" requests for each window
					for(const windowId of windowIds)
					{
						// create "remove" request
						let request = {
							command: 'js.query',
							query: ['browser','windows','remove'],
							params: [ windowId ]
						};

						// add job to send "remove" request for this window
						var jobKey = ''+windowId;
						jobMgr.addJob(jobKey, cli.performBrowserRequest(request, callback));
					}

					// remove window IDs
					jobMgr.execute((responses, errors) => {
						// display errors
						for(const jobKey in errors)
						{
							console.error(jobKey+': '+errors[jobKey].message);
						}

						// fail if errors are present
						if(Object.keys(errors).length > 0)
						{
							callback(3);
							return;
						}
						callback(0);
					});
				}).catch((error) => {
					// failed query
					console.error(error.message);
					callback(1);
				});
			}).catch((error) => {
				// failed to connect
				console.error("unable to connect to browser: "+error.message);
				callback(2);
			});
			break;

		default:
			console.error("invalid command "+windowCommand);
			callback(1);
			break;
	}
}
