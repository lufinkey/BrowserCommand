#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridgeClient = require('./lib/ChromeBridgeClient');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
const JobManager = require('./lib/JobManager');
const defaults = require('./lib/defaults');
const { URL } = require('url');



class ChromeCLI
{
	constructor(argv, argOptions)
	{
		this.argv = argv;
		this.argOptions = argOptions;

		this.client = null;
		this.server = null;
	}

	log(...messages)
	{
		if(this.argv.args.verbose)
		{
			console.error(...messages);
		}
	}

	get basedir()
	{
		return __dirname;
	}

	startServerIfNeeded(completion)
	{
		// make sure we're allowed to start a server instance
		if(!this.argv.args.useTemporaryServerFallback)
		{
			completion(null);
			return;
		}

		// check if this server is already running and listening
		if(this.server != null && this.server.listening)
		{
			completion(null);
			return;
		}

		// check if any server is already running
		if(ChromeBridgeServer.isServerRunning(this.argv.args.port))
		{
			completion(null);
			return;
		}

		// create server if it hasn't already been created
		if(this.server == null)
		{
			this.log("server is not running... starting temporary server");
			var serverOptions = {
				verbose: this.argv.args.verbose,
				port: this.argv.args.port
			};
			this.server = new ChromeBridgeServer(serverOptions);
		}

		// make server start listening
		this.server.listen((error) => {
			if(error)
			{
				this.server = null;
			}
			completion(error);
		});
	}

	connectToServer(completion)
	{
		this.startServerIfNeeded((error) => {
			if(error)
			{
				completion(error);
				return;
			}
			// create a client if one has not already been created
			if(this.client == null)
			{
				var clientOptions = {
					verbose: this.argv.args.verbose,
					port: this.argv.args.port,
					retryConnectTimeout: this.argv.args.connectTimeout
				};
				this.log("attempting connection to server");
				this.client = new ChromeBridgeClient(clientOptions);
			}
			
			// connect client
			this.client.connect((error) => {
				completion(error);
			});
		});
	}

	connectToChrome(completion)
	{
		this.connectToServer((error) => {
			if(error)
			{
				completion(error);
				return;
			}
			this.client.waitForChrome({ timeout: this.argv.args.chromeConnectTimeout }, (error) => {
				completion(error);
			});
		});
	}

	performChromeRequest(request, completion)
	{
		// send a request to the server to forward to chrome
		this.client.sendRequest('chrome', request, (response, error) => {
			if(completion)
			{
				completion(response, error);
			}
		});
	}

	querySelectors(selectors, definitions, args, completion)
	{
		if(args == null)
		{
			args = {};
		}

		// consolidate duplicate selectors
		let uniqueSelectors = Array.from(new Set(selectors));

		// add request(s) to send
		var jobMgr = new JobManager();
		for(var i=0; i<uniqueSelectors.length; i++)
		{
			const selector = uniqueSelectors[i];
			let jobKey = ''+i;
			if(typeof selector == 'string')
			{
				let selectorDefinition = definitions.strings[selector];
				let request = selectorDefinition.createRequest(args);
				jobMgr.addJob(jobKey, (callback) => {
					this.performChromeRequest(request, callback);
				});
			}
			else if(typeof selector == 'number')
			{
				let request = definitions.number.createRequest(selector, args);
				jobMgr.addJob(jobKey, (callback) => {
					this.performChromeRequest(request, callback);
				});
			}
			else
			{
				throw new Error("invalid selector "+selector);
			}
		}

		// send request(s)
		jobMgr.execute((responses, errors) => {
			// display errors
			if(uniqueSelectors.length == 1)
			{
				for(const jobKey in errors)
				{
					console.error(errors[jobKey].message);
				}
			}
			else
			{
				for(var i=0; i<uniqueSelectors.length; i++)
				{
					const selector = uniqueSelectors[i];
					const jobKey = ''+i;
					if(errors[jobKey])
					{
						console.error(selector+': '+errors[jobKey].message);
					}
				}
			}

			// filter and consolidate results
			var results = [];
			for(var i=0; i<uniqueSelectors.length; i++)
			{
				const selector = uniqueSelectors[i];
				var jobKey = ''+i;
				var response = null;
				if(typeof selector == 'string')
				{
					var selectorDefinition = definitions.strings[selector];
					response = responses[jobKey];
					if(response != null && selectorDefinition.filterResponse)
					{
						response = selectorDefinition.filterResponse(response);
					}
				}
				else if(typeof selector == 'number')
				{
					var selectorDefinition = definitions.number;
					response = responses[jobKey];
					if(response != null && selectorDefinition.filterResponse)
					{
						response = selectorDefinition.filterResponse(response);
					}
				}

				if(response != null && response.length > 0)
				{
					results = results.concat(response);
				}
				else if(!errors[jobKey])
				{
					console.error("no "+definitions.typeName+"s found for selector "+selector);
				}
			}

			// remove duplicate results
			if(definitions.idField)
			{
				for(var i=0; i<results.length; i++)
				{
					var obj = results[i];
					for(var j=(i+1); j<results.length; j++)
					{
						var cmpObj = results[j];
						if(obj[definitions.idField] == cmpObj[definitions.idField])
						{
							results.splice(j, 1);
							j--;
						}
					}
				}
			}

			// give the results to the completion block
			completion(results);
		});
	}

	querySelectorIDs(selectors, definitions, args, completion)
	{
		// ensure idField is defined
		if(!definitions.idField)
		{
			completion([]);
			return;
		}

		// check if there are selectors that aren't IDs
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

		// if there are only ID selectors, return the unique selectors
		if(!hasNonIDSelector)
		{
			var resultIDs = Array.from(new Set(selectors));
			completion(resultIDs);
			return;
		}

		// query the selectors
		this.querySelectors(selectors, definitions, args, (results) => {
			// get result IDs
			var resultIDs = [];
			for(const result of results)
			{
				resultIDs.push(result[definitions.idField]);
			}
			completion(resultIDs);
		});
	}

	getFile(path, completion)
	{
		fs.stat(path, (error, stats) => {
			if(!error)
			{
				if(stats.isFile())
				{
					fs.readFile(path, {encoding:'utf8'}, (error, data) => {
						if(error)
						{
							completion(null, error);
							return;
						}
						completion(data, null);
					});
				}
				else
				{
					completion(null, new Error("path is not a file"));
				}
				return;
			}

			try
			{
				var url = new URL(path);
				if(url.protocol != 'file')
				{
					var url = new URL(file);
					const req = http.request(url, (res) => {
						var data = "";
						res.setEncoding('utf8');
						res.on('data', (chunk) => {
							data += chunk;
						});
						res.on('end', () => {
							completion(data, null);
						});
					});
					req.on('error', (error) => {
						completion(null, error);
					});
					return;
				}
			}
			catch(e)
			{
				completion(null, new Error("Invalid path or URL"));
			}
		});
	}

	close(completion)
	{
		// create close server function
		const closeServer = (completion) => {
			if(this.server != null)
			{
				this.server.close(() => {
					this.server = null;
					completion();
				});
				return;
			}
			completion();
		};

		// if no client, close the server
		if(this.client == null)
		{
			closeServer(() => {
				if(completion)
				{
					completion();
				}
			});
			return;
		}

		// close the client, then the server
		this.client.close(() => {
			closeServer(() => {
				if(completion)
				{
					completion();
				}
			});
		});
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
			path: ['verbose']
		},
		{
			name: 'port',
			short: 'p',
			type: 'uinteger',
			default: defaults.PORT,
			path: ['port']
		},
		{
			name: 'connect-timeout',
			type: 'uinteger',
			path: ['connectTimeout']
		},
		{
			name: 'chrome-connect-timeout',
			type: 'uinteger',
			default: 10000,
			path: ['chromeConnectTimeout']
		},
		{
			name: 'tmp-server',
			type: 'boolean',
			default: false,
			path: ['useTemporaryServerFallback']
		}
	],
	maxStrays: 0,
	stopIfTooManyStrays: true,
	stopAtError: true,
	errorExitCode: 1
};
var args = process.argv.slice(2);
var argv = ArgParser.parse(args, argOptions);

const cli = new ChromeCLI(argv, argOptions);

var command = args[argv.endIndex];
args = args.slice(argv.endIndex+1);

const commandCompletion = (exitCode) => {
	cli.close(() => {
		process.exit(exitCode);
	});
};


// catch exit signals
const exitEvents = [
	'SIGHUP',
	'SIGINT',
	'SIGQUIT',
	'SIGABRT',
	'SIGSEGV',
	'SIGTERM'
];
for(let eventName of exitEvents)
{
	process.on(eventName, (signal) => {
		if(argv.args.verbose)
		{
			console.error("received "+eventName);
			console.error("cleaning up...");
		}
		cli.close(() => {
			if(argv.args.verbose)
			{
				console.error("exiting...");
			}
			process.exit(1);
		});
	});
}


// handle command
switch(command)
{
	case 'build-crx':
		require('./cli/build-crx')(cli, commandCompletion, ...args);
		break;

	case 'server':
		require('./cli/server')(cli, commandCompletion, ...args);
		break;

	case 'js':
		require('./cli/js')(cli, commandCompletion, ...args);
		break;

	case 'window':
		require('./cli/window')(cli, commandCompletion, ...args);
		break;

	case 'tab':
		require('./cli/tab')(cli, commandCompletion, ...args);
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
