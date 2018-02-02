
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const defaults = require('./defaults');

class ChromeBridgeController extends EventEmitter
{
	constructor(options)
	{
		super();

		if(options == null)
		{
			options = {};
		}

		this._options = options;
		/*
		{
			verbose: boolean,
			port: integer,
			host: string,
			reconnectWaitTime: integer,
			outputFunctionsInJSON: boolean
		}
		*/

		this._running = false;
		this._restarting = false;
		this._websocket = null;
		this._socketConnected = false;
		this._controllerStartTime = new Date().getTime();

		this._jsExports = {
			'chrome': chrome
		};
	}

	log(...messages)
	{
		if(this._options.verbose)
		{
			console.log(...messages);
		}
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

	set options(options)
	{
		if(options == null)
		{
			options = {};
		}
		this._options = options;
	}

	get options()
	{
		return Object.assign({}, this._options);
	}

	get connected()
	{
		return this._socketConnected;
	}

	start()
	{
		if(this._running)
		{
			return;
		}
		this._running = true;
		this._connectToServer();
	}

	get running()
	{
		return this._running;
	}

	stop()
	{
		if(!this._running)
		{
			return;
		}
		this._running = false;
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
		this._websocket.close();
	}

	_connectToServer()
	{
		var url = this.serverAddress;
		var reconnectWaitTime = this._options.reconnectWaitTime;
		if(reconnectWaitTime === undefined)
		{
			reconnectWaitTime = 200;
		}

		var wasRunning = false;
		if(this._websocket != null)
		{
			wasRunning = true;
		}

		this._socketConnected = false;
		this._websocket = new WebSocket(url);

		this._websocket.onopen = (event) => {
			if(!this._running)
			{
				this._websocket.close();
				return;
			}
			this._socketConnected = true;
			this.log("connection opened");
			this.emit('connect');
		};

		this._websocket.onmessage = (event) => {
			var message = JSON.parse(event.data);
			if(message == null)
			{
				this.log("received bad message from server:");
				this.log(event.data);
				return;
			}
			this._handleServerMessage(this._websocket, message);
		};

		this._websocket.onerror = (event) => {
			//
		};

		this._websocket.onclose = (event) => {
			if(this._socketConnected)
			{
				this._socketConnected = false;
				this.log("connection closed");
				this.emit('disconnect');
			}
			if(!this._running)
			{
				this._websocket = null;
				this.emit('stop');
				return;
			}
			if(this._restarting)
			{
				this._restarting = false;
				this.emit('retryConnect');
				this._connectToServer();
				return;
			}
			setTimeout(() => {
				if(!this._running)
				{
					this._websocket = null;
					this.emit('stop');
					return;
				}
				this.emit('retryConnect');
				this._connectToServer();
			}, reconnectWaitTime);
		};

		if(!wasRunning)
		{
			this.emit('start');
		}
	}

	_handleServerMessage(socket, message)
	{
		this.log("received message fromm server:");
		this.log(message);
		
		switch(message.type)
		{
			case 'request':
				// validate request message format
				if(typeof message.requestId != 'number')
				{
					this.log("received bad request from server:");
					this.log(message);
					this.sendError(client, message.requestId, new Error("invalid request ID"));
					return;
				}
				else if(typeof message.content != 'object')
				{
					this.log("received bad request from server:");
					this.log(message);
					this.sendError(client, message.requestId, new Error("bad message content format"));
					return;
				}

				let responded = false;
				try
				{
					this.executeRequest(message.content, (response, error) => {
						if(error)
						{
							this.sendError(socket, message.requestId, error);
						}
						else
						{
							this.sendResponse(socket, message.requestId, response);
						}
						responded = true;
					});
				}
				catch(error)
				{
					console.error("unhandled exception:");
					console.error(error);
					if(!responded)
					{
						this.sendError(socket, message.requestId, error);
					}
				}
				break;

			case undefined:
				this.log("received bad message from server:");
				this.log(message);
				break;

			default:
				this.log("unsupported message:");
				this.log(message);
				break;
		}
	}

	sendError(socket, responseId, error)
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
			responseId: responseId,
			success: false,
			error: errorString
		};

		// send response
		this.log("sending error response to server:");
		this.log(response);
		var jsonData = JSON.stringify(response);
		socket.send(jsonData);
	}

	sendResponse(socket, responseId, content)
	{
		// create response
		var response = {
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
		var jsonData = JSON.stringify(response, replacer);
		socket.send(jsonData);
	}

	executeRequest(message, completion)
	{
		switch(message.command)
		{
			case 'js.query':
				// execute a js query
				var returnValue = Introspect.query(this._jsExports, message.query);
				var hasCallback = false;
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
				}
				// call completion if there was no callback
				if(!hasCallback)
				{
					completion(returnValue, null);
				}
				break;

			case 'js.introspect':
				// introspect a js object
				var returnValue = Introspect.query(this._jsExports, message.query);
				var info = Introspect.read(returnValue);
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

module.exports = ChromeBridgeController;
