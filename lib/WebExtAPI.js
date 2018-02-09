
const Introspect = require('./Introspect');

const WebExtAPI = {};
module.exports = WebExtAPI;

function isInWebExtension()
{
	if(typeof browser !== 'undefined' && browser.runtime && browser.runtime.id)
	{
		return true;
	}
	return false;
}


// function to get class info for serialization
WebExtAPI.getIntrospectClasses = function()
{
	var classes = {};

	// Event class
	classes['event'] = {
		type: browser.Event,
		serialize: (obj) => {
			return {};
		}
	};

	return classes;
}


// function create the "browser" object
WebExtAPI.create = function(target, client, info, options)
{
	// ensure options
	options = Object.assign({}, options);

	// declare browser
	let browser = {};

	// functions to handle setting/unsetting runtime.lastError
	let lastError = null;
	let lastFunc = null;
	let lastErrorChecked = false;

	const setLastError = (error, func) => {
		lastError = error;
		lastFunc = func;
		lastErrorChecked = false;
	};

	const unsetLastError = () => {
		var error = lastError;
		var func = lastFunc;
		var checked = lastErrorChecked;

		lastError = null;
		lastFunc = null;
		lastErrorChecked = false;
		
		if(options.useCallbacks && error != null && !checked)
		{
			console.error("Unchecked runtime.lastError while running "+func+": "+error.message);
		}
	};

	// represents browser.runtime, and handles browser.runtime.lastError
	class WebExtRuntime
	{
		constructor()
		{
			//
		}

		get lastError()
		{
			if(lastError != null)
			{
				lastErrorChecked = true;
			}
			return lastError;
		}
	}

	// function to handle actual function execution
	const FunctionHandler = (path, ...args) => {
		// create promise executor
		const promiseExecutor = (resolve, reject) => {
			// create request
			var request = {
				command: 'js.query',
				query: ['browser'].concat(path)
			}

			// add parameters to request
			let callback = null;
			for(var i=0; i<args.length; i++)
			{
				var arg = args[i];
				if(typeof arg == 'function')
				{
					if(!options.useCallbacks)
					{
						throw new Error("callbacks are not available; use promises");
					}
					else if(request.callbackIndex != null)
					{
						throw new Error("cannot give multiple callbacks");
					}
					request.callbackIndex = i;
					callback = arg;
				}
				else
				{
					request.params[i] = arg;
				}
			}

			// send request
			client.sendRequest(target, request, (response, error) => {
				if(error)
				{
					// error
					setLastError(error, path.join('.'));
					if(options.useCallbacks)
					{
						if(callback)
						{
							callback(undefined);
						}
					}
					else
					{
						reject(error);
					}
					unsetLastError();
				}
				else
				{
					// success
					if(options.useCallbacks)
					{
						if(callback)
						{
							callback(response);
						}
					}
					else
					{
						resolve(response);
					}
				}
			});
		};
		// return promise if using promises
		if(!options.useCallbacks)
		{
			return new Promise(promiseExecutor);
		}
		else
		{
			promiseExecutor(null, null);
		}
	};

	// create browser object
	browser = Object.assign(browser, Introspect.create(info, {functionHandler: FunctionHandler}));
	if(!browser.runtime)
	{
		browser.runtime = {};
	}
	browser.runtime = Object.assign(new WebExtRuntime(), browser.runtime);

	return browser;
}
