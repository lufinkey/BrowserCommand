
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const WebExtAPI = require('./WebExtAPI');
const defaults = require('./defaults');
const { detect } = require('detect-browser');


class BrowserBridgeController extends EventEmitter
{
	constructor(options)
	{
		super();

		this._options = Object.assign({}, options);
		/*
		{
			verbose: boolean,
			port: integer,
			host: string,
			identifier: string,
			reconnectWaitTime: integer,
			outputFunctionsInJSON: boolean
		}
		*/

		this._running = false;
		this._restarting = false;
		this._websocket = null;
		this._socketConnected = false;
		this._startTime = null;

		this._jsExports = {};
		if(typeof chrome !== 'undefined')
		{
			this._jsExports['chrome'] = chrome;
		}
		if(typeof browser !== 'undefined')
		{
			this._jsExports['browser'] = browser;
		}

		this._eventSubscriptions = [
			/*
			{
				eventPath: [string],
				callback: function
			}
			*/
		];
	}

	log(...messages)
	{
		if(this._options.verbose)
		{
			console.log(...messages);
		}
	}

	get identifier()
	{
		if(this._options.identifier == null || this._options.identifier == "")
		{
			return null;
		}
		return this._options.identifier;
	}

	get browserName()
	{
		// get browser name
		var browserInfo = detect();
		var browserName = null;
		if(browserInfo && browserInfo.name)
		{
			browserName = browserInfo.name;
		}
		return browserName;
	}

	get defaultServerAddress()
	{
		return 'ws://'+defaults.HOST+':'+defaults.PORT+defaults.PATH;
	}

	get serverAddress()
	{
		var port = this._options.port || defaults.PORT;
		var host = this._options.host || defaults.HOST;
		var path = this._options.path || defaults.PATH;
		return 'ws://'+host+':'+port+path;
	}

	get defaultPort()
	{
		return defaults.PORT;
	}

	get port()
	{
		if(this._options.port == null)
		{
			return defaults.PORT;
		}
		return this._options.port;
	}

	get status()
	{
		if(this._websocket == null)
		{
			return 'disconnected';
		}
		switch(this._websocket.readyState)
		{
			case 0:
				return 'connecting';

			case 1:
				return 'connected';
				
			case 2:
				return 'disconnecting';

			default:
			case 3:
				return 'disconnected';
		}
	}

	setOptions(options)
	{
		if(options == null)
		{
			options = {};
		}
		this._options = options;
	}

	getOptions()
	{
		return Object.assign({}, this._options);
	}

	get connected()
	{
		return this._socketConnected;
	}

	get running()
	{
		return this._running;
	}

	start()
	{
		if(this._running)
		{
			return;
		}
		this._running = true;
		this._startTime = new Date();
		if(this._websocket == null)
		{
			this._connectToServer();
		}
	}

	stop()
	{
		if(!this._running)
		{
			return;
		}
		this._running = false;
		this._restarting = false;
		this._startTime = null;
		if(this._socketConnected)
		{
			this._websocket.close();
		}
	}

	restart()
	{
		if(this._websocket == null)
		{
			this.start();
			return;
		}
		this._restarting = true;
		if(this._socketConnected)
		{
			this._websocket.close();
		}
	}

	_connectToServer()
	{
		var url = this.serverAddress;

		// get reconnect wait time
		var reconnectWaitTime = this._options.reconnectWaitTime;
		if(reconnectWaitTime == null)
		{
			reconnectWaitTime = 200;
		}

		// determine whether controller was already running
		var wasRunning = false;
		if(this._websocket != null)
		{
			wasRunning = true;
		}

		// initialize WebSocket
		this._socketConnected = false;
		this._restarting = false;
		this._websocket = new WebSocket(url);

		// handle connection
		this._websocket.onopen = (event) => {
			if(!this._running || this._restarting)
			{
				this._websocket.close();
				return;
			}
			this._socketConnected = true;
			this.sendRegistration();
			this.log("connection opened");
			this.emit('connect');
			if(this.onConnect)
			{
				this.onConnect();
			}
		};

		// handle message
		this._websocket.onmessage = (event) => {
			var message = JSON.parse(event.data);
			if(message == null)
			{
				this.log("received bad message from server:");
				this.log(event.data);
				return;
			}
			this._handleServerMessage(message);
		};

		// handle error
		this._websocket.onerror = (event) => {
			//
		};

		// handle close
		this._websocket.onclose = (event) => {
			this.unsubscribeFromAllEvents();
			// send disconnect event
			if(this._socketConnected)
			{
				this._socketConnected = false;
				this.log("connection closed");
				this.emit('disconnect');
				if(this.onDisconnect)
				{
					this.onDisconnect();
				}
			}
			// stop controller if we're no longer running
			if(!this._running)
			{
				this._websocket = null;
				this.emit('stop');
				return;
			}
			// if restarting, reconnect immediately
			if(this._restarting)
			{
				this._restarting = false;
				// retry connection
				this._connectToServer();
				this.emit('retryConnect');
				if(this.onRetryConnect)
				{
					this.onRetryConnect();
				}
				return;
			}
			// wait some time before retrying
			setTimeout(() => {
				// if stop was called during the timeout, stop the controller
				if(!this._running)
				{
					this._websocket = null;
					this.emit('stop');
					return;
				}
				// retry connection
				this._connectToServer();
				this.emit('retryConnect');
				if(this.onRetryConnect)
				{
					this.onRetryConnect();
				}
			}, reconnectWaitTime);
		};

		// send start event
		if(!wasRunning)
		{
			this.emit('start');
		}
	}

	_handleServerMessage(message)
	{
		this.log("received message fromm server:");
		this.log(message);
		
		switch(message.type)
		{
			case 'request':
				// validate request message format
				if(typeof message.requestId != 'number')
				{
					this.log("invalid request ID");
					this.sendError(message.requestId, new Error("invalid request ID"));
					return;
				}
				else if(typeof message.content != 'object')
				{
					this.log("bad request format");
					this.sendError(message.requestId, new Error("bad message content format"));
					return;
				}
				// execute request
				let responded = false;
				try
				{
					this.executeRequest(message.content, (response, error) => {
						if(error)
						{
							this.sendError(message.requestId, error);
						}
						else
						{
							this.sendResponse(message.requestId, response);
						}
						responded = true;
					});
				}
				catch(error)
				{
					this.log("unhandled exception:");
					this.log(error);
					if(!responded)
					{
						this.sendError(message.requestId, error);
					}
				}
				break;

			case 'subscribe':
				try
				{
					this.subscribeToEvent(message.eventPath);
				}
				catch(error)
				{
					this.log("unable to subscribe to event:");
					this.log(error);
				}
				break;

			case 'unsubscribe':
				try
				{
					this.unsubscribeFromEvent(message.eventPath);
				}
				catch(error)
				{
					this.log("unable to unsubscribe from event:");
					this.log(error);
				}
				break;

			case undefined:
				this.log("missing message type");
				break;

			default:
				this.log("unsupported message");
				break;
		}
	}

	subscribeToEvent(eventPath)
	{
		// get event
		var event = Introspect.query(this._jsExports, eventPath);
		if(event == null || !event.addListener || !event.removeListener)
		{
			throw new Error("invalid event");
		}
		// check for existing subscription
		for(const subscription of this._eventSubscriptions)
		{
			if(Introspect.pathsEqual(eventPath, subscription.eventPath))
			{
				// already subscribed
				return;
			}
		}
		// create subscription
		var subscription = {
			eventPath: eventPath,
			callback: (...args) => {
				if(this._websocket == null || this._websocket.readyState !== 1)
				{
					return;
				}
				this.sendEvent(eventPath, args);
			}
		};
		this._eventSubscriptions.push(subscription);
		event.addListener(subscription.callback);
	}

	unsubscribeFromEvent(eventPath)
	{
		// get event
		var event = Introspect.query(this._jsExports, eventPath);
		if(event == null || !event.addListener || !event.removeListener)
		{
			throw new Error("invalid event");
		}
		// check for existing subscription
		for(var i=0; i<this._eventSubscriptions.length; i++)
		{
			var subscription = this._eventSubscriptions[i];
			if(Introspect.pathsEqual(eventPath, subscription.eventPath))
			{
				// unsubscribe from event
				this._eventSubscriptions.splice(i, 1);
				event.removeListener(subscription.callback);
				return;
			}
		}
	}

	unsubscribeFromAllEvents()
	{
		var eventSubscriptions = this._eventSubscriptions;
		this._eventSubscriptions = [];
		for(const subscription of eventSubscriptions)
		{
			// unsubscribe from event
			var event = Introspect.query(this._jsExports, subscription.eventPath);
			event.removeListener(subscription.callback);
		}
	}

	sendRegistration()
	{
		// ensure we can send registration
		if(this._websocket == null || this._websocket.readyState != 1)
		{
			this.log("ignoring attempt to send registration while not in a ready state");
			return;
		}
		// create registration request
		var request = {
			type: 'register',
			info: {
				type: 'controller',
				identifier: this.identifier,
				browser: this.browserName
			}
		};
		// send registration request
		this.log("sending registration to server:");
		this.log(request);
		this._websocket.send(JSON.stringify(request));
	}

	sendError(responseId, error)
	{
		// get actual error string
		var errorString = '';
		if(error.message)
		{
			errorString = error.message;
		}
		else if(error.toString)
		{
			errorString = error.toString();
		}
		else
		{
			errorString = JSON.stringify(error);
		}

		// create response
		var response = {
			type: 'response',
			responseId: responseId,
			success: false,
			error: errorString
		};

		// send response
		this.log("sending error response to server:");
		this.log(response);
		this._websocket.send(JSON.stringify(response));
	}

	sendResponse(responseId, content)
	{
		// create response
		var response = {
			type: 'response',
			responseId: responseId,
			success: true,
			content: content
		};

		// create custom json replacer if necessary
		var replacer = null;
		if(this._options.outputFunctionsInJSON)
		{
			replacer = (name, value) => {
				if(typeof value == 'function')
				{
					return 'function';
				}
				return value;
			};
		}

		// send response
		this.log("sending response to server:");
		this.log(response);
		this._websocket.send(JSON.stringify(response, replacer));
	}

	sendEvent(eventPath, args)
	{
		var event = {
			type: 'event',
			eventPath: eventPath,
			args: args
		};

		this.log("sending event to server:");
		this.log(event);
		this._websocket.send(JSON.stringify(event));
	}

	executeRequest(message, completion)
	{
		switch(message.command)
		{
			case 'js.query':
				// execute a js query
				var returnValue = Introspect.query(this._jsExports, message.query);
				var hasCallback = false;
				var hasPromise = false;
				if(typeof returnValue == 'function')
				{
					// get function args
					var args = [];
					if(message.params instanceof Array)
					{
						args = message.params;
					}
					// add callback function if defined
					if(typeof message.callbackIndex == 'number' && Number.isInteger(message.callbackIndex))
					{
						hasCallback = true;
						args[message.callbackIndex] = function(result) {
							// get chrome runtime error if there is one
							var error = null;
							if(chrome.runtime.lastError)
							{
								error = chrome.runtime.lastError;
							}
							// call completion
							completion(result, error);
						};
					}
					// call function
					returnValue = returnValue(...args);
					// check if returnValue is a Promise
					if(!hasCallback && returnValue instanceof Promise)
					{
						// wait for promise response
						returnValue.then((result) => {
							completion(result, null);
						}).catch((error) => {
							completion(null, error);
						});
						hasPromise = true;
					}
				}
				// call completion if there was no callback or promise
				if(!hasCallback && !hasPromise)
				{
					completion(returnValue, null);
				}
				break;

			case 'js.introspect':
				// introspect a js object
				var returnValue = Introspect.query(this._jsExports, message.query);
				var info = Introspect.read(returnValue, { classes: WebExtAPI.getIntrospectClasses() });
				completion(info, null);
				break;

			case undefined:
				completion(null, new Error("no command given"));
				break;

			default:
				completion(null, new Error("invalid command "+message.command));
				break;
		}
	}
}

module.exports = BrowserBridgeController;
