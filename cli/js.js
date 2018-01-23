
const ChromeBridge = require('../lib/ChromeBridge');
const Print = require('../lib/Print');



module.exports = function(cli, ...args)
{
	if(args.length == 0)
	{
		console.error("no javascript query given");
		process.exit(1);
	}

	var request = {
		command: 'js',
		js: args[0]
	};
	// parse javascript function parameters
	var params = args.slice(1);
	for(var i=0; i<params.length; i++)
	{
		var param = params[i];
		var parsedParam = null;
		if(param == 'callback')
		{
			if(request.callbackIndex !== undefined)
			{
				console.error("cannot specify multiple callbacks");
				process.exit(1);
			}
			request.callbackIndex = i;
			parsedParam = null;
		}
		else
		{
			try
			{
				parsedParam = JSON.parse(param);
			}
			catch(e)
			{
				parsedParam = param;
			}
		}
		params[i] = parsedParam;
	}
	request.params = params;
	// send request
	ChromeBridge.performChromeRequest(request, (response, error) => {
		if(error)
		{
			console.error(error.message);
			process.exit(2);
			return;
		}
		Print.json(response);
		process.exit(0);
	});
}
