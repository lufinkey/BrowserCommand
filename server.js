#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');
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
