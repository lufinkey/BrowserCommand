#!/usr/bin/env node

const os = require('os');
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
let userKeys = {};
let allowedUsers = argv.args.allowUsers;

// generate user keys if necessary
let keyManager = new UserKeyManager();
if(allowedUsers.length > 0)
{
	// ensure root
	if(!elevationinfo.isElevated())
	{
		console.error("server must run as root to generate user key files");
		process.exit(1);
	}

	// generate keys
	if(!argv.args.quiet)
	{
		console.error("generating user keys");
	}
	for(const username of allowedUsers)
	{
		userKeys[username] = keyManager.generateKey();
	}
}
// generate key for single current user
else if(!elevationinfo.isElevated())
{
	// generate key
	if(!argv.args.quiet)
	{
		console.error("generating user key");
	}
	userKeys[os.userInfo().username] = keyManager.generateKey();
}

// define function to destroy the user keys
function destroyUserKeys()
{
	if(Object.keys(userKeys).length > 0)
	{
		server.log("destroying user keys...");
		for(const username of allowedUsers)
		{
			try
			{
				keyManager.deleteKey(username, port);
			}
			catch(error)
			{
				console.error(error.message);
			}
		}
		server.log("finished destroying user keys");
	}
}


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

	// save user keys to the filesystem
	for(const username in userKeys)
	{
		var key = userKeys[username];
		try
		{
			keyManager.saveKey(username, port, key);
			if(!argv.args.quiet)
			{
				console.error("wrote key file for "+username);
			}
		}
		catch(error)
		{
			console.error("unable to write key file for "+username+": "+error.message);
		}
	}
}).catch((error) => {
	// server failed to start
	console.error(error.message);
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
		destroyUserKeys();
		server.close().then(() => {
			server.log("server closed");
			process.exit(0);
		}).catch((error) => {
			server.log("error occurred while closing server: "+error.message);
			process.exit(1);
		});
	});
}
