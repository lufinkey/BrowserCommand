
const browserify = require('browserify');
const fs = require('fs');
const {
	assert,
	copyFolder
} = require('../lib/misc');
const defaults = require('../lib/defaults');



module.exports = function(cli, callback, ...args)
{
	// get target path for chrome extension
	var crxPath = args[0];
	assert(args.length <= 1, 1, "invalid argument "+args[1]);
	if(crxPath == null)
	{
		crxPath = defaults.MODULE_NAME+".crx";
	}

	// copy chrome extension folder to target path
	try
	{
		copyFolder(cli.basedir+'/extension', crxPath);
	}
	catch(error)
	{
		console.error(error.message);
		callback(2);
		return;
	}

	// copy webextension polyfill
	var browserPolyfillPath = require.resolve('webextension-polyfill');
	fs.copyFileSync(browserPolyfillPath, crxPath+'/browser-polyfill.js');

	// bundle chrome extension's main.js
	var mainjs = browserify();
	mainjs.add(cli.basedir+'/extension.js');
	mainjs.bundle((error, buffer) => {
		if(error)
		{
			console.error(error.message);
			callback(3);
			return;
		}
		fs.writeFile(crxPath+'/main.js', buffer, (error) => {
			if(error)
			{
				console.error(error.message);
				callback(2);
				return;
			}
			console.log("successfully built chrome extension");
			callback(0);
		});
	});
};
