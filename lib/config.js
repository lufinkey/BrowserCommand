
const defaults = require('defaults');
const os = require('os');
const fs = require('fs');

const config = {};
module.exports = config;

config.getPath = function()
{
	switch(os.platform())
	{
		case 'linux':
		case 'mac':
			return "/etc/chrome-cmd.json";

		case 'win32':
			return __dirname+'/../config.json';

		default:
			throw new Error("unsupported OS");
	}
}

config.reset = function()
{
	config.options = {
		port: defaults.PORT,
	};
}

config.load = function()
{
	try
	{
		content = fs.readFileSync(config.getPath(), { encoding:'utf8' });
		config.options = JSON.parse(content);
	}
	catch(error)
	{
		config.reset();
	}
}

config.save = function()
{
	fs.writeFileSync(config.getPath(), JSON.stringify(config.options, null, "\t"), { encoding:'utf8' });
}

config.reset();
