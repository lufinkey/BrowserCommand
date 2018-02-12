#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const BrowserBridgeServer = require('./lib/BrowserBridgeServer');
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
			default: config.options.allowUsers || []
		}
	],
	stopAtError: true,
	errorExitCode: 1
};
let argv = ArgParser.parse(process.argv.slice(2), argOptions);


// get server options
let port = argv.args.port;
let userKeys = null;
let allowedUsers = argv.args.allowUsers;


// ensure server isn't already running
if(BrowserBridgeServer.isServerRunning(port))
{
	console.error("server is already running");
	process.exit(1);
}


// create functions to manage user keys
let keyManager = new UserKeyManager();

function generateUserKeys()
{
	// generate user keys if needed
	if(allowedUsers.length > 0)
	{
		if(!argv.args.quiet)
		{
			console.error("generating user keys...");
		}
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
}

function destroyUserKeys()
{
	if(allowedUsers.length > 0)
	{
		server.log("destroying user keys...");
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
}


// generate user keys
generateUserKeys();


// create the server
var serverOptions = {
	verbose: !argv.args.quiet,
	port: port,
	userKeys: userKeys
};
var server = new BrowserBridgeServer(serverOptions);

// start the server
server.listen().then(() => {
	// server started successfully
}).catch((error) => {
	// server failed to start
	console.error("server error: "+error.message);
	destroyUserKeys();
	process.exit(1);
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
		server.close().then(() => {
			server.log("server closed");
			destroyUserKeys();
			process.exit(0);
		}).catch((error) => {
			server.log("error occurred while closing server: "+error.message);
			destroyUserKeys();
			process.exit(1);
		});
	});
}
