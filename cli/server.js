
const ArgParser = require('../lib/ArgParser');
const ChildProcess = require('child_process');
const isElevated = require('is-elevated');
const os = require('os');



module.exports = function(cli, ...args)
{
	switch(args[0])
	{
		case 'install-service':
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
			var serviceArgv = ArgParser.parse(args.slice(1), serviceOptions);
			switch(os.platform())
			{
				case 'linux':
					// ensure root
					isElevated().then((elevated) => {
						if(!elevated)
						{
							if(serviceArgv.args['ignore-if-nonroot'])
							{
								process.exit(0);
							}
							console.error("root permissions are required to run this command");
							process.exit(1);
						}
						// run install script
						var installerProcess = ChildProcess.spawn(__dirname+'/server/linux/install.sh', [], { cwd: __dirname });
						installerProcess.on('exit', (code, signal) => {
							if(code != 0)
							{
								console.error("errors occurred while installing service");
								process.exit(code);
							}
							process.exit(0);
						});
					});
					break;

				default:
					console.error("command not supported by this platform");
					process.exit(1);
					break;
			}
			break;

		case 'uninstall-service':
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
			var serviceArgv = ArgParser.parse(args.slice(1), serviceOptions);
			// check platform
			switch(os.platform())
			{
				case 'linux':
					// ensure root
					isElevated().then((elevated) => {
						if(!elevated)
						{
							if(serviceArgv.args['ignore-if-nonroot'])
							{
								process.exit(0);
							}
							console.error("root permissions are required to run this command");
							process.exit(1);
						}
						// run uninstall script
						var installerProcess = ChildProcess.spawn(__dirname+'/server/linux/uninstall.sh', [], { cwd: __dirname });
						installerProcess.on('exit', (code, signal) => {
							if(code != 0)
							{
								console.error("errors occurred while installing service");
								process.exit(code);
							}
							process.exit(0);
						});
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
			console.error("invalid command "+args[0]);
			process.exit(1);
			break;
	}
}
