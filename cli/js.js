
const ChromeBridge = require('../lib/ChromeBridge');
const Print = require('../lib/Print');



module.exports = function(cli, callback, ...args)
{
	if(args[0] == undefined)
	{
		console.error("no javascript query given");
		callback(1);
		return;
	}

	var request = {
		command: 'js',
		query: args[0].split('.')
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
				callback(1);
				return;
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
			callback(2);
			return;
		}
		Print.json(response);
		callback(0);
	});
}
