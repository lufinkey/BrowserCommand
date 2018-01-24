
const browserify = require('browserify');
const fs = require('fs');
const {
	assert,
	copyFolder
} = require('../lib/misc');



module.exports = function(cli, callback, ...args)
{
	// get target path for chrome extension
	var crxPath = args[0];
	assert(args.length <= 1, 1, "invalid argument "+args[1]);
	if(crxPath == null)
	{
		crxPath = "chrome-cmd.crx";
	}

	// copy chrome extension folder to target path
	try
	{
		copyFolder(__dirname+'/crx', crxPath);
	}
	catch(error)
	{
		console.error(error.message);
		callback(2);
		return;
	}

	// bundle chrome extension's main.js
	var crx = browserify();
	crx.add(__dirname+'/crx.js');
	crx.bundle((error, buffer) => {
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
