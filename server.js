#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
const lockfile = require('process-lockfile');


// parse arguments
var argOptions = {
	args: [
		{
			type: 'boolean',
			name: 'quiet',
			short: 'q',
			default: false,
		},
		{
			type: 'uinteger',
			name: 'port',
			short: 'p'
		}
	],
	stopAtError: true,
	errorExitCode: 1
};
var argv = ArgParser.parse(process.argv.slice(2), argOptions);


// start server
var serverOptions = {
	verbose: !argv.args['quiet'],
	port: argv.args['port']
};
var server = new ChromeBridgeServer(serverOptions);
server.listen((error) => {
	if(error)
	{
		console.error("server error: "+error.message);
		process.exit(1);
	}
});

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
			if(serverOptions.verbose)
			{
				console.error("server closed");
			}
			process.exit(0);
		});
	});
}
