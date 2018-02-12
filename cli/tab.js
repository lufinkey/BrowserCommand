
const ArgParser = require('../lib/ArgParser');
const JobManager = require('../lib/JobManager');
const Print = require('../lib/Print');



// define selectors
const selectorDefs = {
	idField: 'id',
	typeName: 'tab',
	strings: {
		'all': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {} ]
				};
			}
		},
		'current': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','getCurrent'],
					params: []
				};
			}
		},
		'active': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {active: true} ]
				};
			}
		},
		'pinned': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {pinned: true} ]
				};
			}
		},
		'audible': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {audible: true} ]
				};
			}
		},
		'muted': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {muted: true} ]
				};
			}
		},
		'highlighted': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {highlighted: true} ]
				};
			}
		},
		'discarded': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {discarded: true} ]
				};
			}
		}
	},
	number: {
		createRequest: (selector, args) => {
			return {
				command: 'js.query',
				query: ['browser','tabs','get'],
				params: [ selector ]
			};
		},
		filterResponse: (response) => {
			return [ response ];
		}
	}
};



// export tab command handler
module.exports = function(cli, callback, ...args)
{
	// handle tab command
	var tabCommand = args[0];
	args = args.slice(1);
	switch(tabCommand)
	{
		case undefined:
			// get all the tab ids
			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				let request = {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ {} ]
				};
				cli.performBrowserRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						callback(2);
						return;
					}
					for(var i=0; i<response.length; i++)
					{
						var tab = response[i];
						console.log(tab.id);
					}
					callback(0);
				});
			});
			break;

		case 'get':
			// query tabs from selectors
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
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectors(selectors, selectorDefs, argv.args, (tabs) => {
					Print.format(tabs, argv.args['output'], 'Tab');
					callback(0);
				});
			});
			break;

		case 'query':
			// query tabs
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
						name: 'active',
						type: 'boolean',
						path: ['queryInfo','active']
					},
					{
						name: 'pinned',
						type: 'boolean',
						path: ['queryInfo','pinned']
					},
					{
						name: 'audible',
						type: 'boolean',
						path: ['queryInfo','audible']
					},
					{
						name: 'muted',
						type: 'boolean',
						path: ['queryInfo','muted']
					},
					{
						name: 'highlighted',
						type: 'boolean',
						path: ['queryInfo','highlighted']
					},
					{
						name: 'discarded',
						type: 'boolean',
						path: ['queryInfo','discarded']
					},
					{
						name: 'auto-discardable',
						type: 'boolean',
						path: ['queryInfo','autoDiscardable']
					},
					{
						name: 'current-window',
						type: 'boolean',
						path: ['queryInfo','currentWindow']
					},
					{
						name: 'last-focused-window',
						type: 'boolean',
						path: ['queryInfo','lastFocusedWindow']
					},
					{
						name: 'status',
						type: 'string',
						path: ['queryInfo','status']
					},
					{
						name: 'title',
						type: 'string',
						path: ['queryInfo','title']
					},
					{
						name: 'url',
						type: 'urlpattern',
						path: ['queryInfo','url'],
						array: true
					},
					{
						name: 'window-id',
						type: 'integer',
						path: ['queryInfo','windowId']
					},
					{
						name: 'window-type',
						type: 'string',
						path: ['queryInfo','windowType']
					},
					{
						name: 'index',
						type: 'integer',
						path: ['queryInfo','index']
					}
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				var queryInfo = argv.args.queryInfo;
				if(queryInfo == null)
				{
					queryInfo = {};
				}

				let request = {
					command: 'js.query',
					query: ['browser','tabs','query'],
					params: [ queryInfo ]
				};
				cli.performBrowserRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						callback(3);
						return;
					}
					Print.format(response, argv.args['output'], 'Tab');
					callback(0);
				});
			});
			break;

		case 'create':
			// create a new tab
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
						name: 'window-id',
						type: 'string',
						path: ['createProperties','windowId']
					},
					{
						name: 'index',
						type: 'integer',
						path: ['createProperties','index']
					},
					{
						name: 'url',
						type: 'url',
						path: ['createProperties','url']
					},
					{
						name: 'active',
						type: 'boolean',
						path: ['createProperties','active']
					},
					{
						name: 'pinned',
						type: 'boolean',
						path: ['createProperties','pinned']
					},
					{
						name: 'opener-id',
						type: 'integer',
						path: ['createProperties','openerTabId']
					}
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				var createProperties = argv.args.createProperties;
				if(createProperties == null)
				{
					createProperties = {};
				}

				let request = {
					command: 'js.query',
					query: ['browser','tabs','create'],
					params: [ createProperties ]
				};
				cli.performBrowserRequest(request, (response, error) => {
					if(error)
					{
						console.error(error.message);
						callback(3);
						return;
					}
					Print.format(response, argv.args['output'], 'Tab');
					callback(0);
				});
			});
			break;

		case 'duplicate':
			// duplicate tabs
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
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectorIDs(selectors, selectorDefs, argv.args, (tabIds) => {
					if(tabIds.length == 0)
					{
						callback(3);
						return;
					}

					// create "duplicate" requests for each tab
					var jobMgr = new JobManager();
					for(const tabId of tabIds)
					{
						// create "update" request
						let request = {
							command: 'js.query',
							query: ['browser','tabs','duplicate'],
							params: [ tabId ]
						};

						// add job to send "duplicate" request for this tab
						var jobKey = ''+tabId;
						jobMgr.addJob(jobKey, (callback) => {
							cli.performBrowserRequest(request, callback);
						});
					}

					// duplicate tabs
					jobMgr.execute((responses, errors) => {
						// get duplicated tabs
						var duplicatedTabs = [];
						for(const jobKey in responses)
						{
							const tab = responses[jobKey];
							if(tab != null)
							{
								duplicatedTabs.push(tab);
							}
						}

						// display errors
						for(const jobKey in errors)
						{
							console.error(jobKey+': '+errors[jobKey].message);
						}

						// display duplicated tabs
						Print.format(duplicatedTabs, argv.args['output'], 'Tab');

						// fail if errors are present
						if(Object.keys(errors).length > 0)
						{
							callback(2);
							return;
						}
						callback(0);
					});
				});
			});
			break;

		case 'highlight':
			// highlight tabs
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
						name: 'window-id',
						type: 'integer',
						path: ['highlightInfo','windowId']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectorIDs(selectors, selectorDefs, argv.args, (tabIds) => {
					if(tabIds.length == 0)
					{
						callback(3);
						return;
					}

					var highlightInfo = argv.args.highlightInfo;
					if(highlightInfo == null)
					{
						highlightInfo = {};
					}
					highlightInfo.tabs = tabIds;

					let request = {
						command: 'js.query',
						query: ['browser','tabs','highlight'],
						params: [ highlightInfo ]
					};
					cli.performBrowserRequest(request, (response, error) => {
						if(error)
						{
							console.error(error.message);
							callback(3);
							return;
						}
						Print.format(response, argv.args['output'], 'Window');
						callback(0);
					});
				});
			});
			break;

		case 'update':
			// update tabs
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
						type: 'string',
						path: ['updateProperties','url']
					},
					{
						name: 'active',
						type: 'boolean',
						path: ['updateProperties','active']
					},
					{
						name: 'highlighted',
						type: 'boolean',
						path: ['updateProperties','highlighted']
					},
					{
						name: 'pinned',
						type: 'boolean',
						path: ['updateProperties','pinned']
					},
					{
						name: 'muted',
						type: 'boolean',
						path: ['updateProperties','muted']
					},
					{
						name: 'opener-id',
						type: 'integer',
						path: ['updateProperties','openerTabId']
					},
					{
						name: 'auto-discardable',
						type: 'boolean',
						path: ['updateProperties','autoDiscardable']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectors(selectors, selectorDefs, argv.args, (tabs) => {
					if(tabs.length == 0)
					{
						callback(3);
						return;
					}

					var updateProperties = argv.args.updateProperties;
					if(updateProperties == null)
					{
						updateProperties = {};
					}

					// prevent multiple tabs on the same window from setting as active
					if(updateProperties.active)
					{
						var windowTabCount = {};
						for(const tab of tabs)
						{
							var windowKey = ''+tab.windowId;
							var count = windowTabCount[windowKey];
							if(count == null)
							{
								count = 0;
							}
							count++;
							if(count > 1)
							{
								console.error("cannot set multiple tabs as active within the same window");
								callback(1);
								return;
							}
							windowTabCount[windowKey] = count;
						}
					}

					// create "update" requests for each tab
					var jobMgr = new JobManager();
					for(const tab of tabs)
					{
						// create "update" request
						let request = {
							command: 'js.query',
							query: ['browser','tabs','update'],
							params: [ tab.id, updateProperties ]
						};

						// add job to send "update" request for this tab
						var jobKey = ''+tab.id;
						jobMgr.addJob(jobKey, (callback) => {
							cli.performBrowserRequest(request, callback);
						});
					}

					// update tabs
					jobMgr.execute((responses, errors) => {
						// get updated tabs
						var updatedTabs = [];
						for(const jobKey in responses)
						{
							const tab = responses[jobKey];
							if(tab != null)
							{
								updatedTabs.push(tab);
							}
						}

						// display errors
						for(const jobKey in errors)
						{
							console.error(jobKey+': '+errors[jobKey].message);
						}

						// display updated tabs
						Print.format(updatedTabs, argv.args['output'], 'Tab');

						// fail if errors are present
						if(Object.keys(errors).length > 0)
						{
							callback(2);
							return;
						}
						callback(0);
					});
				});
			});
			break;

		case 'reload':
			// reload tabs
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
						name: 'no-cache',
						type: 'string',
						path: ['reloadProperties','bypassCache']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectorIDs(selectors, selectorDefs, argv.args, (tabIds) => {
					if(tabIds.length == 0)
					{
						callback(3);
						return;
					}

					var reloadProperties = argv.args.reloadProperties;

					// create "reload" requests for each tab
					var jobMgr = new JobManager();
					for(const tabId of tabIds)
					{
						// create "reload" request
						let request = {
							command: 'js.query',
							query: ['browser','tabs','reload'],
							params: [ tabId, reloadProperties ]
						};

						// add job to send "reload" request for this tab
						let jobKey = ''+tabId;
						jobMgr.addJob(jobKey, (callback) => {
							cli.performBrowserRequest(request, callback);
						});
					}

					// reload tabs
					jobMgr.execute((responses, errors) => {
						// get reloaded tabs
						var reloadedTabs = [];
						for(const jobKey in responses)
						{
							const tab = responses[jobKey];
							if(tab != null)
							{
								reloadedTabs.push(tab);
							}
						}

						// display errors
						for(const jobKey in errors)
						{
							console.error(jobKey+': '+errors[jobKey].message);
						}

						// display reloaded tabs
						Print.format(reloadedTabs, argv.args['output'], 'Tab');

						// fail if errors are present
						if(Object.keys(errors).length > 0)
						{
							callback(2);
							return;
						}
						callback(0);
					});
				});
			});
			break;

		case 'remove':
			// remove tabs
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
					Object.keys(selectorDefs.strings)
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
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectorIDs(selectors, selectorDefs, argv.args, (tabIds) => {
					if(tabIds.length == 0)
					{
						callback(3);
						return;
					}

					let request = {
						command: 'js.query',
						query: ['browser','tabs','remove'],
						params: [tabIds]
					};
					cli.performBrowserRequest(request, (response, error) => {
						if(error)
						{
							console.error(error.message);
							callback(3);
							return;
						}
						callback(0);
					});
				});
			});
			break;

		case 'inject':
			// inject javascript or css into the specified tabs

			// determine injection type
			var injectType = args[0];
			args = args.slice(1);
			var injectQuery = null;
			switch(injectType)
			{
				case 'js':
					injectQuery = ['browser','tabs','executeScript'];
					break;

				case 'css':
					injectQuery = ['browser','tabs','insertCSS'];
					break;

				case undefined:
					console.error("no injection type specified");
					console.error("supported types are js and css");
					callback(1);
					return;

				default:
					console.error("invalid injection type "+injectType);
					console.error("supported types are js and css");
					callback(1);
					return;
			}

			// parse args
			var argOptions = {
				args: [
					{
						name: 'output',
						type: 'string',
						values: Print.formats,
						default: 'json'
					},
					{
						name: 'code',
						short: 'c',
						type: 'string',
						path: ['details','code']
					},
					{
						name: 'file',
						short: 'f',
						type: 'string',
						path: ['details','file']
					},
					{
						name: 'all-frames',
						type: 'boolean',
						path: ['details','allFrames']
					},
					{
						name: 'frame-id',
						type: 'integer',
						path: ['details','frameId']
					},
					{
						name: 'match-about-blank',
						type: 'boolean',
						path: ['details','matchAboutBlank']
					},
					{
						name: 'run-at',
						type: 'string',
						path: ['details','runAt']
					},
					{
						name: 'origin',
						type: 'string',
						path: ['details','cssOrigin']
					}
				],
				maxStrays: -1,
				strayTypes: [
					'integer',
					Object.keys(selectorDefs.strings)
				],
				stopAtError: true,
				errorExitCode: 1,
				parentOptions: cli.argOptions,
				parentResult: cli.argv
			};
			var argv = ArgParser.parse(args, argOptions);

			// prevent "id" output format
			if(argv.args['output'] == 'id')
			{
				console.error("\"id\" output is not supported in tab.inject");
				callback(1);
				return;
			}

			var selectors = argv.strays;
			if(selectors.length == 0)
			{
				console.error("no tab selector specified");
				callback(1);
				return;
			}

			if(!argv.args.details || (!argv.args.details.code && !argv.args.details.file))
			{
				console.log(argv.args);
				console.error("must specify either --code or --file");
				callback(1);
				return;
			}
			else if(argv.args.details.code && argv.args.details.file)
			{
				console.error("cannot specify both code and file");
				callback(1);
				return;
			}

			cli.connectToBrowser((error) => {
				if(error)
				{
					console.error("unable to connect to browser: "+error.message);
					callback(2);
					return;
				}

				cli.querySelectorIDs(selectors, selectorDefs, argv.args, (tabIds) => {
					if(tabIds.length == 0)
					{
						callback(3);
						return;
					}

					// create requests for each tab
					var jobMgr = new JobManager();
					for(const tabId of tabIds)
					{
						// create request
						let request = {
							command: 'js.query',
							query: injectQuery,
							params: [ tabId, argv.args.details ]
						};

						// add job to send request for this tab
						let jobKey = ''+tabId;
						jobMgr.addJob(jobKey, (callback) => {
							cli.performBrowserRequest(request, callback);
						});
					}

					// check if output will be limited to a single result
					let singularOutput = false;
					if(selectors.length == 1 && typeof selectors[0] == 'number')
					{
						singularOutput = true;
					}

					// inject script into tabs
					jobMgr.execute((responses, errors) => {
						// unwrap arrays if the script was only sent to 1 frame
						if(!argv.args.details.allFrames)
						{
							for(const jobKey in responses)
							{
								var response = responses[jobKey];
								if(response instanceof Array)
								{
									response = response[0];
								}
								responses[jobKey] = response;
							}
						}

						// determine whether to display key associated results, or just the result
						if(singularOutput)
						{
							// single result

							// display errors
							for(const jobKey in errors)
							{
								console.error(errors[jobKey].message);
							}

							if(injectType == 'js')
							{
								// get response
								var response = null;
								for(const jobKey in responses)
								{
									response = responses[jobKey];
									break;
								}

								Print.format(response, argv.args['output']);
							}
						}
						else
						{
							// potentially multiple results

							// display errors
							for(const jobKey in errors)
							{
								console.error(jobKey+': '+errors[jobKey].message);
							}

							if(injectType == 'js')
							{
								// display results
								Print.format(responses, argv.args['output']);
							}
						}

						if(Object.keys(errors).length > 0)
						{
							callback(1);
						}
						else
						{
							callback(0);
						}
					});
				});
			});
			break;

		default:
			console.error("invalid command "+tabCommand);
			callback(1);
			break;
	}
}
