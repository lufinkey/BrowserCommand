
const ArgParser = require('../lib/ArgParser');
const ChromeBridge = require('../lib/ChromeBridge');
const Print = require('../lib/Print');



module.exports = function(cli, callback, ...args)
{
	// handle tab command
	var tabCommand = args[0];
	args = args.slice(1);
	switch(tabCommand)
	{
		case undefined:
			// get all the tab ids
			var request = {
				command: 'js',
				js: 'chrome.tabs.query',
				params: [ {} ],
				callbackIndex: 1
			};
			ChromeBridge.performChromeRequest(request, (response, error) => {
				if(error)
				{
					console.error(error.message);
					callback(2);
					return;
				}
				for(var i=0; i<response.length; i++)
				{
					var tab = response[i];
					console.log(tab.id);
				}
				callback(0);
			});
	}
}
