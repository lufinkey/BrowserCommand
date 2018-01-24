#!/usr/bin/env node

const ArgParser = require('./lib/ArgParser');
const ChromeBridge = require('./lib/ChromeBridge');
const config = require('./lib/config');


// parse arguments
var argOptions = {
	args: [
		{
			name: 'verbose',
			short: 'v',
			type: 'boolean',
			default: false
		},
		{
			name: 'connect-timeout',
			type: 'uinteger',
			default: 10000
		},
		{
			name: 'chrome-connect-timeout',
			type: 'uinteger',
			default: 10000
		},
		{
			name: 'port',
			type: 'uinteger',
			default: config.PORT
		}
	],
	maxStrays: 0,
	stopIfTooManyStrays: true,
	stopAtError: true,
	errorExitCode: 1
};
var args = process.argv.slice(2);
var argv = ArgParser.parse(args, argOptions);

var command = args[argv.endIndex];
args = args.slice(argv.endIndex+1);


// update chrome bridge options whenever argv changes
function updateChromeBridgeOptions(argv)
{
	ChromeBridge.setOptions({
		verbose: argv.args['verbose'],
		connectTimeout: argv.args['connect-timeout'],
		chromeConnectTimeout: argv.args['chrome-connect-timeout'],
		port: argv.args['port']
	});
}
updateChromeBridgeOptions(argv);
argv.onChange = function() {
	updateChromeBridgeOptions(argv);
}


const cli = {
	argv: argv,
	argOptions: argOptions
};


const commandCompletion = (exitCode) => {
	ChromeBridge.close(() => {
		process.exit(exitCode);
	});
};


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
