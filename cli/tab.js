
const ArgParser = require('../lib/ArgParser');
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
					query: ['chrome','tabs','query'],
					params: [ {} ],
					callbackIndex: 1
				};
			}
		},
		'current': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','getCurrent'],
					params: [],
					callbackIndex: 0
				};
			}
		},
		'active': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {active: true} ],
					callbackIndex: 1
				};
			}
		},
		'pinned': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {pinned: true} ],
					callbackIndex: 1
				};
			}
		},
		'audible': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {audible: true} ],
					callbackIndex: 1
				};
			}
		},
		'muted': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {muted: true} ],
					callbackIndex: 1
				};
			}
		},
		'highlighted': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {highlighted: true} ],
					callbackIndex: 1
				};
			}
		},
		'discarded': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {discarded: true} ],
					callbackIndex: 1
				};
			}
		}
	},
	number: {
		createRequest: (selector, args) => {
			return {
				command: 'js.query',
				query: ['chrome','tabs','get'],
				params: [ selector ],
				callbackIndex: 2
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
			cli.connectToChrome((error) => {
				if(error)
				{
					console.error("unable to connect to chrome extension: "+error.message);
					callback(2);
					return;
				}

				var request = {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {} ],
					callbackIndex: 1
				};
				cli.performChromeRequest(request, (response, error) => {
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

			cli.connectToChrome((error) => {
				if(error)
				{
					console.error("unable to connect to chrome extension: "+error.message);
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
						type: 'string',
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

			cli.connectToChrome((error) => {
				if(error)
				{
					console.error("unable to connect to chrome extension: "+error.message);
					callback(2);
					return;
				}

				var queryInfo = argv.args.queryInfo;
				if(queryInfo == null)
				{
					queryInfo = {};
				}

				var request = {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ queryInfo ],
					callbackIndex: 1
				}
				cli.performChromeRequest(request, (response, error) => {
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

		default:
			console.error("invalid command "+tabCommand);
			callback(1);
			break;
	}
}
