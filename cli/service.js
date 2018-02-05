
const ArgParser = require('../lib/ArgParser');
const ChildProcess = require('child_process');
const elevationinfo = require('elevationinfo');
const os = require('os');



module.exports = function(cli, callback, ...args)
{
	var serviceCommand = args[0];
	args = args.slice(1);
	switch(serviceCommand)
	{
		case 'install':
			// parse args
			var serviceOptions = {
				args: [
					{
						name: 'ignore-if-nonroot',
						type: 'boolean',
						default: false
					}
				],
				stopAtError: true,
				errorExitCode: 1
			};
			var serviceArgv = ArgParser.parse(args, serviceOptions);
			switch(os.platform())
			{
				case 'linux':
					// ensure root
					if(!elevationinfo.isElevated())
					{
						if(serviceArgv.args['ignore-if-nonroot'])
						{
							callback(0);
							return;
						}
						console.error("root permissions are required to run this command");
						callback(1);
						return;
					}
					// run install script
					var installerProcess = ChildProcess.spawn(cli.basedir+'/service/linux/install.sh', [], { cwd: __dirname, stdio: 'inherit' });
					installerProcess.on('exit', (code, signal) => {
						if(code != 0)
						{
							console.error("errors occurred while installing service");
							callback(code);
							return;
						}
						callback(0);
					});
					break;

				default:
					console.error("command not supported by this platform");
					callback(1);
					break;
			}
			break;

		case 'uninstall':
			// parse args
			var serviceOptions = {
				args: [
					{
						name: 'ignore-if-nonroot',
						type: 'boolean',
						default: false
					}
				],
				stopAtError: true,
				errorExitCode: 1
			};
			var serviceArgv = ArgParser.parse(args, serviceOptions);
			// check platform
			switch(os.platform())
			{
				case 'linux':
					// ensure root
					if(!elevationinfo.isElevated())
					{
						if(serviceArgv.args['ignore-if-nonroot'])
						{
							callback(0);
							return;
						}
						console.error("root permissions are required to run this command");
						callback(1);
						return;
					}
					// run uninstall script
					var installerProcess = ChildProcess.spawn(cli.basedir+'/service/linux/uninstall.sh', [], { cwd: __dirname, stdio: 'inherit' });
					installerProcess.on('exit', (code, signal) => {
						if(code != 0)
						{
							console.error("errors occurred while installing service");
							callback(code);
							return;
						}
						callback(0);
					});
					break;

				default:
					console.error("command not supported by this platform");
					process.exit(1);
					break;
			}
			break;

		case undefined:
			console.error("no command specified");
			process.exit(1);
			break;

		default:
			console.error("invalid command "+serviceCommand);
			process.exit(1);
			break;
	}
}
