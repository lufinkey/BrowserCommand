#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
const UserKeyManager = require('./lib/UserKeyManager');
const elevationinfo = require('elevationinfo');
const config = require('./lib/config');


config.load();

// parse arguments
var argOptions = {
	args: [
		{
			name: 'quiet',
			short: 'q',
			type: 'boolean',
			default: false,
		},
		{
			name: 'port',
			short: 'p',
			type: 'uinteger',
			default: config.options.port
		},
		{
			name: 'allow-user',
			type: 'string',
			array: true,
			path: [ 'allowUsers' ],
			default: config.options.allowUsers
		}
	],
	stopAtError: true,
	errorExitCode: 1
};
var argv = ArgParser.parse(process.argv.slice(2), argOptions);


// get server options
var port = argv.args.port;
var userKeys = null;
var allowedUsers = argv.args.allowUsers;


// generate keys if needed
var keyManager = new UserKeyManager();
if(allowedUsers != null)
{
	userKeys = {};
	for(const username of allowedUsers)
	{
		try
		{
			var key = keyManager.generateKey(username, port);
			userKeys[username] = key;
		}
		catch(error)
		{
			console.error(error.message);
			process.exit(1);
		}
	}
}


// start server
var serverOptions = {
	verbose: !argv.args.quiet,
	port: port,
	userKeys: userKeys
};
var server = new ChromeBridgeServer(serverOptions);
server.listen((error) => {
	if(error)
	{
		console.error("server error: "+error.message);
		process.exit(1);
	}
});


// handle exit events
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
		if(serverOptions.verbose)
		{
			console.error("received "+eventName);
			console.error("closing server...");
		}
		server.close(() => {
			server.log("server closed");
			if(allowedUsers != null)
			{
				server.log("destroying user keys");
				for(const username of allowedUsers)
				{
					try
					{
						keyManager.destroyKey(username, port);
					}
					catch(error)
					{
						console.error(error.message);
					}
				}
				server.log("finished destroying user keys");
			}
			process.exit(0);
		});
	});
}
