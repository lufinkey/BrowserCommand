
const ArgParser = require('./lib/ArgParser');
const ChromeBridgeServer = require('./lib/ChromeBridgeServer');

// parse arguments
var argOptions = {
	args: [
		{
			type: 'boolean',
			name: 'verbose',
			short: 'v',
			default: false,
		}
	],
	stopAtError: true,
	errorExitCode: 1
};
var argv = ArgParser.parse(process.argv.slice(2), argOptions);


// start server
var serverOptions = {
	verbose: argv.args['verbose']
};
var server = new ChromeBridgeServer(serverOptions);
server.listen((error) => {
	if(error)
	{
		console.error("server error: "+error.message);
		process.exit(1);
	}
});
