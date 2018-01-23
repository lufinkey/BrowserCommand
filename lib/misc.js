
const fs = require('fs');

function assert(condition, exitCode, message)
{
	if(!condition)
	{
		if(message !== undefined && message !== null)
		{
			console.error(message);
		}
		process.exit(exitCode);
	}
}

function copyFolder(source, destination)
{
	// check if destination exists and is a directory
	var dstExists = false;
	if(fs.existsSync(destination))
	{
		var dirStats = fs.statSync(destination);
		if(!dirStats.isDirectory())
		{
			throw new Error("file already exists at the destination");
		}
		dstExists = true;
	}

	// make destination if necessary
	if(!dstExists)
	{
		var srcStats = fs.statSync(source);
		fs.mkdirSync(destination, srcStats.mode);
	}

	// copy contents
	var entries = fs.readdirSync(source, null);
	for(var i=0; i<entries.length; i++)
	{
		var entry = entries[i];
		var stat = fs.statSync(source+'/'+entry);
		if(stat.isDirectory() && !stat.isSymbolicLink())
		{
			copyFolder(source+'/'+entry, destination+'/'+entry);
		}
		else
		{
			fs.copyFileSync(source+'/'+entry, destination+'/'+entry);
		}
	}
}
