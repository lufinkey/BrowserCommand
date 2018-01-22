
const EventEmitter = require('events');

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

	_queryProperty(object, query)
	{
		var props = query.split('.');
		var currentObj = object;
		for(var i=0; i<props.length; i++)
		{
			currentObj = currentObj[props[i]];
			if(currentObj === undefined)
			{
				return undefined;
			}
			else if(currentObj === null)
			{
				return null;
			}
		}
		return currentObj;
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

		var websocket = new WebSocket(url);
		var socketOpened = false;

		websocket.onopen = (evt) => {
			socketOpened = true;
			this._verboseLog("connection opened");
			this.emit('connect');
		};

		websocket.onmessage = (evt) => {
			var request = JSON.parse(evt.data);
			this._handleServerRequest(websocket, request);
		};

		websocket.onerror = (evt) => {
			//
		};

		websocket.onclose = (evt) => {
			if(socketOpened)
			{
				this._verboseLog("connection closed");
				this.emit('disconnect');
			}
			setTimeout(() => {
				this.emit('retry-connect');
				this._connectToServer();
			}, reconnectWaitTime);
		};
	}

	_handleServerRequest(socket, request)
	{
		var message = request.content;

		if(message == null)
		{
			this.sendError(socket, request.requestId, new Error("empty message"));
			return;
		}
		else if(message.command == null)
		{
			this.sendError(socket, request.requestId, new Error("no command given"));
			return;
		}

		let responded = false;
		try
		{
			this.executeRequest(message, (response, error) => {
				if(error)
				{
					this.sendError(socket, request.requestId, error);
				}
				else
				{
					this.sendResponse(socket, request.requestId, response);
				}
				responded = true;
			});
		}
		catch(error)
		{
			console.error("unhandled exception: ", error);
			if(!responded)
			{
				this.sendError(socket, request.requestId, error);
			}
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
				var returnValue = this._queryProperty(this._jsExports, message.js);
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
					completion(result);
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
