
const Introspect = require('./Introspect');

const WebExtAPI = {};
module.exports = WebExtAPI;


var rulesMessage = "\n\nI'm gonna be honest... I have no idea what the fuck event rules are supposed to do. The documentation is very unclear.\n"+
				"If you know what event rules are supposed to do, please open an issue with an explanation, or create a pull request with a fix (and an explanation). Thank you!\n";



function isInWebExtension()
{
	if(typeof browser !== 'undefined' && browser.runtime && browser.runtime.id)
	{
		return true;
	}
	else if(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)
	{
		return true;
	}
	return false;
}



function WebExtEvent(info)
{
	var noInfo = (info == null);
	info = Object.assign({}, info);

	const target = info.target;
	const eventPath = info.eventPath;
	const client = info.client;
	const options = Object.assign({}, info.options);

	let listeners = [];

	let shouldHandleServerEvents = false;
	if(!noInfo && client != null && client.addEventSubscriber && client.removeEventSubscriber
		&& (typeof target == 'string' || target == null) && eventPath instanceof Array)
	{
		shouldHandleServerEvents = true;
	}

	let eventReceiver = null;
	let connectHandler = null;
	let closeHandler = null;

	// auto subscribe to server events 
	if(shouldHandleServerEvents)
	{
		// create event receiver
		eventReceiver = (...args) => {
			this.dispatch(...args);
		};

		// create resubscriber if necessary
		if(options.resubscribeOnConnect)
		{
			connectHandler = () => {
				if(listeners.length > 0)
				{
					client._internalEvents.prependOnceListener('close', closeHandler);
					client.addEventSubscriber(target, eventPath, eventReceiver);
				}
			};
		}
		
		// create socket close handler
		closeHandler = () => {
			client.removeEventSubscriber(target, eventPath, eventReceiver);
		};
	}

	this.addListener = (listener) => {
		var wasEmpty = (listeners.length === 0);
		listeners.push(listener);
		if(shouldHandleServerEvents && wasEmpty)
		{
			if(connectHandler)
			{
				client._internalEvents.prependListener('connect', connectHandler);
			}
			client._internalEvents.prependOnceListener('close', closeHandler);
			client.addEventSubscriber(target, eventPath, eventReceiver);
		}
	}

	this.removeListener = (listener) => {
		var index = listeners.indexOf(listener);
		if(index !== -1)
		{
			listeners.splice(index, 1);
		}
		if(shouldHandleServerEvents && listeners.length === 0)
		{
			if(connectHandler)
			{
				client._internalEvents.removeListener('connect', connectHandler);
			}
			client._internalEvents.removeListener('close', closeHandler);
			client.removeEventSubscriber(target, eventPath, eventReceiver);
		}
	}

	this.hasListener = (listener) => {
		var index = listeners.indexOf(listener);
		if(index === -1)
		{
			return false;
		}
		return true;
	}

	this.hasListeners = () => {
		if(listeners.length > 0)
		{
			return true;
		}
		return false;
	}

	this.dispatch = (...args) => {
		// call listeners
		const tmpListeners = listeners.slice(0);
		for(const listener of tmpListeners)
		{
			this.dispatchToListener(listener, args);
		}
	}

	this.dispatchToListener = (listener, args) => {
		if(listener)
		{
			listener(...args);
		}
	}

	this.addRules = () => {
		throw new Error(rulesMessage);
	}

	this.getRules = () => {
		throw new Error(rulesMessage);
	}

	this.removeRules = () => {
		throw new Error(rulesMessage);
	}
}



// function to get class info for serialization
WebExtAPI.getIntrospectClasses = function()
{
	var classes = {};

	var browserEventClass = undefined;
	if(typeof browser !== 'undefined' && typeof browser.Event !== 'undefined')
	{
		browserEventClass = browser.Event;
	}
	classes['browser.Event'] = {
		type: browserEventClass,
		serialize: (obj) => {
			return {};
		}
	};

	var chromeEventClass = undefined
	if(typeof chrome !== 'undefined' && typeof chrome.Event !== 'undefined')
	{
		chromeEventClass = chrome.Event;
	}
	classes['chrome.Event'] = {
		type: chromeEventClass,
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
	if(!options.query)
	{
		throw new Error("options.query must be specified");
	}
	let queryPath = [ options.query ];

	// declare browser
	let browser = {};

	// functions to handle setting/unsetting browser.runtime.lastError
	let lastError = null;
	let lastFunc = null;
	let lastErrorChecked = false;
	let warnLastError = false;

	const setLastError = (error, func, warn) => {
		lastError = error;
		lastFunc = func;
		lastErrorChecked = false;
		warnLastError = warn;
	};

	const unsetLastError = () => {
		var error = lastError;
		var func = lastFunc;
		var checked = lastErrorChecked;
		var warn = warnLastError;

		lastError = null;
		lastFunc = null;
		lastErrorChecked = false;
		warnLastError = false;
		
		if(error != null && warn && !checked)
		{
			console.error("Unchecked runtime.lastError while running "+func+": "+error.message);
		}
	};

	// function to handle actual function execution
	const FunctionHandler = (path, ...args) => {
		// check for a function argument
		let functionPath = queryPath.concat(path);
		var params = [];
		var hasCallback = false;
		for(let arg of args)
		{
			if(typeof arg == 'function')
			{
				if(hasCallback)
				{
					throw new Error("cannot specify multiple callbacks");
				}
				hasCallback = true;
				params.push((response, error) => {
					if(error)
					{
						setLastError(error, functionPath.join('.'), true);
						arg();
						unsetLastError();
					}
					else
					{
						arg(response);
					}
				});
			}
			else
			{
				params.push(arg);
			}
		}

		var returnVal = client.queryJS(target, functionPath, ...params);
		if(returnVal instanceof Promise)
		{
			return new Promise((resolve, reject) => {
				returnVal.then((response) => {
					resolve(response);
				}).catch((error) => {
					setLastError(error, functionPath.join('.'), false);
					reject(error);
					unsetLastError();
				});
			});
		}
		return returnVal;
	};

	// get introspect classes
	var classes = WebExtAPI.getIntrospectClasses();
	var deserializeEvent = (contents, path) => {
		// browser.Event class
		const eventPath = queryPath.concat(path);
		var webExtInfo = {
			target: target,
			eventPath: eventPath,
			client: client,
			options: options
		};
		return new WebExtEvent(webExtInfo);
	};
	classes['browser.Event'].deserialize = deserializeEvent;
	classes['chrome.Event'].deserialize = deserializeEvent;

	// create browser object
	browser = Object.assign(browser, Introspect.create(info, { functionHandler: FunctionHandler, classes: classes }));
	if(browser.runtime)
	{
		// add browser.runtime.lastError property
		Object.defineProperty(browser.runtime, 'lastError', {
			get: () => {
				if(lastError != null)
				{
					lastErrorChecked = true;
				}
				return lastError;
			}
		});
	}
	// add browser.Event
	browser.Event = WebExtEvent;

	return browser;
}
