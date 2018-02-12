
const defaults = require('./defaults');
const os = require('os');
const fs = require('fs');
const { homedirSync } = require('userhomepath');


const config = {};
module.exports = config;


config.getPath = function()
{
	switch(os.platform())
	{
		case 'linux':
		case 'mac':
			return "/etc/"+defaults.MODULE_NAME+".json";

		case 'win32':
			return __dirname+'/../config.json';

		default:
			throw new Error("unsupported OS");
	}
}

config.getDefaults = function()
{
	return {
		port: defaults.PORT,
		allowUsers: []
	};
};

config.reset = function()
{
	config.options = Object.assign({}, config.defaults);
}

config.load = function()
{
	try
	{
		content = fs.readFileSync(config.getPath(), { encoding:'utf8' });
		config.options = JSON.parse(content);
		var configDefaults = config.getDefaults();
		for(const option in configDefaults)
		{
			if(config.options[option] == null)
			{
				config.options[option] = configDefaults[option];
			}
		}
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

config.getUserConfigFolderPath = function(username)
{
	var userPath = homedirSync(username);
	if(userPath == null)
	{
		return null;
	}
	return userPath+'/.'+defaults.MODULE_NAME;
}

config.reset();
