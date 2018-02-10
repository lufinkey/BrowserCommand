
const Introspect = require('./Introspect');

const WebExtAPI = {};
module.exports = WebExtAPI;


var rulesMessage = "\n\nI'm gonna be honest... I have no idea what the fuck event rules are supposed to do. The documentation is very unclear.\n"+
				"If you know what event rules are supposed to do, please open an issue with an explanation, or create a pull request with a fix. Thank you!\n";



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

	var eventClass = undefined;
	if(typeof browser !== 'undefined' && typeof browser.Event !== 'undefined')
	{
		eventClass = browser.Event;
	}

	// Event class
	classes['browser.Event'] = {
		type: eventClass,
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
				query: ['browser'].concat(path),
				params: []
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

	// get introspect classes
	var classes = WebExtAPI.getIntrospectClasses();
	classes['browser.Event'].deserialize = (contents, path) => {
		// create event
		const eventPath = ['browser'].concat(path);
		let listeners = [];
		// create event receiver callback
		const eventReceiver = (event) => {
			if(target === event.sender && Introspect.pathsEqual(eventPath, event.eventPath))
			{
				// call listeners
				var tmpListeners = listeners.slice(0);
				for(const listener of listeners)
				{
					listener(...event.args);
				}
			}
		};
		let webExtEvent = null;
		// create socket close handler
		const closeHandler = () => {
			client._removeEventSubscriber(target, eventPath, webExtEvent);
			client._internalEvents.removeListener('serverEvent', eventReceiver);
		};
		// Event class
		class WebExtEvent
		{
			constructor()
			{
				//
			}

			addListener(listener)
			{
				var wasEmpty = (listeners.length === 0);
				listeners.push(listener);
				if(wasEmpty)
				{
					client._internalEvents.prependOnceListener('close', closeHandler);
					client._internalEvents.addListener('serverEvent', eventReceiver);
					client._addEventSubscriber(target, eventPath, this);
				}
			}

			removeListener(listener)
			{
				var index = listeners.indexOf(listener);
				if(index !== -1)
				{
					listeners.splice(index, 1);
				}
				if(listeners.length === 0)
				{
					client._removeEventSubscriber(target, eventPath, this);
					client._internalEvents.removeListener('serverEvent', eventReceiver);
					client._internalEvents.removeListener('close', closeHandler);
				}
			}

			hasListener(listener)
			{
				var index = listeners.indexOf(listener);
				if(index === -1)
				{
					return false;
				}
				return true;
			}

			hasListeners()
			{
				if(listeners.length > 0)
				{
					return true;
				}
				return false;
			}

			addRules()
			{
				throw new Error(rulesMessage);
			}

			getRules()
			{
				throw new Error(rulesMessage);
			}

			removeRules()
			{
				throw new Error(rulesMessage);
			}
		}

		webExtEvent = new WebExtEvent();
		return webExtEvent;
	};

	// create browser object
	browser = Object.assign(browser, Introspect.create(info, { functionHandler: FunctionHandler, classes: classes }));
	if(!browser.runtime)
	{
		browser.runtime = {};
	}
	browser.runtime = Object.assign(new WebExtRuntime(), browser.runtime);

	return browser;
}
