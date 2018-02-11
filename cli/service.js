
const ArgParser = require('../lib/ArgParser');
const { spawnSync } = require('child_process');
const elevationinfo = require('elevationinfo');
const fs = require('fs');
const os = require('os');



module.exports = function(cli, callback, ...args)
{
	var platform = os.platform();
	var command = args[0];
	args = args.slice(1);
	switch(command)
	{
		case 'install':
		case 'uninstall':
		case 'enable':
		case 'disable':
		case 'start':
		case 'stop':
		case 'restart':
			// ensure the script exists
			if(!fs.existsSync(cli.basedir+'/service/'+platform+'/manage'))
			{
				console.error("command is not supported by this platform");
				callback(1);
				return;
			}
			// run the script
			var result = spawnSync(cli.basedir+'/service/'+platform+'/manage', [command].concat(args), { cwd: cli.basedir, stdio: 'inherit' });
			if(result.status != 0)
			{
				callback(result.status);
				return;
			}
			callback(0);
			break;

		case undefined:
			console.error("no command specified");
			callback(1);
			break;

		default:
			console.error("invalid command "+command);
			callback(1);
			break;
	}
}
