
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const config = require('./config');

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

		this._websocket = null;
		this._socketConnected = false;
		this._controllerStartTime = new Date().getTime();

		this._jsExports = {
			'chrome': chrome
		};

		this._connectToServer();
	}

	_verboseLog(message)
	{
		if(this._options.verbose)
		{
			console.log(message);
		}
	}

	get connected()
	{
		return this._socketConnected;
	}

	_connectToServer()
	{
		var port = this._options.port || config.PORT;
		var host = this._options.host || config.HOST;
		var url = 'ws://'+host+':'+port;
		var reconnectWaitTime = this._options.reconnectWaitTime;
		if(reconnectWaitTime === undefined)
		{
			reconnectWaitTime = 200;
		}

		this._socketConnected = false;
		var websocket = new WebSocket(url);

		websocket.onopen = (event) => {
			this._socketConnected = true;
			this._verboseLog("connection opened");
			this.emit('connect');
		};

		websocket.onmessage = (event) => {
			var message = JSON.parse(event.data);
			this._handleServerMessage(websocket, message);
		};

		websocket.onerror = (event) => {
			//
		};

		websocket.onclose = (event) => {
			if(this._socketConnected)
			{
				this._socketConnected = false;
				this._verboseLog("connection closed");
				this.emit('disconnect');
			}
			setTimeout(() => {
				this.emit('retryConnect');
				this._connectToServer();
			}, reconnectWaitTime);
		};
	}

	_handleServerMessage(socket, message)
	{
		switch(message.type)
		{
			case 'request':
				// validate request message format
				if(typeof message.requestId != 'number')
				{
					this._verboseLog("received bad request from server:");
					this._verboseLog(message);
					this.sendError(client, message.requestId, new Error("invalid request ID"));
					return;
				}
				else if(typeof message.content != 'object')
				{
					this._verboseLog("received bad request from server:");
					this._verboseLog(message);
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
				this._verboseLog("received bad message from server:");
				this._verboseLog(message);
				break;

			default:
				this._verboseLog("unsupported message:");
				this._verboseLog(message);
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
		var jsonData = JSON.stringify(response, replacer);
		socket.send(jsonData);
	}

	executeRequest(message, completion)
	{
		switch(message.command)
		{
			case 'js':
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
