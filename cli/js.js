
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
		command: 'js.query',
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
	cli.connectToBrowser().then(() => {
		cli.performBrowserRequest(request).then((response) => {
			// got response
			Print.json(response);
			callback(0);
		}).catch((error) => {
			// failed request
			console.error(error.message);
			callback(3);
		});
	}).catch((error) => {
		// failed to connect
		console.error("unable to connect to browser: "+error.message);
		callback(2);
	});
}
