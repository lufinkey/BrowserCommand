
const ArgParser = require('../lib/ArgParser');
const Print = require('../lib/Print');



// define selectors
const selectorDefs = {
	idField: 'id',
	typeName: 'tab',
	strings: {
		'all': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {} ],
					callbackIndex: 1
				};
			}
		},
		'current': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','getCurrent'],
					params: [],
					callbackIndex: 0
				};
			}
		},
		'active': {
			createRequest: (args) => {
				return {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {active: true} ],
					callbackIndex: 1
				};
			}
		}
	}
};



// export tab command handler
module.exports = function(cli, callback, ...args)
{
	// handle tab command
	var tabCommand = args[0];
	args = args.slice(1);
	switch(tabCommand)
	{
		case undefined:
			// get all the tab ids
			cli.connectToChrome((error) => {
				if(error)
				{
					console.error("unable to connect to chrome extension: "+error.message);
					callback(2);
					return;
				}

				var request = {
					command: 'js.query',
					query: ['chrome','tabs','query'],
					params: [ {} ],
					callbackIndex: 1
				};
				cli.performChromeRequest(request, (response, error) => {
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
			});
			break;

		default:
			console.error("invalid command "+tabCommand);
			callback(1);
			break;
	}
}
