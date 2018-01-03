
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

		websocket.onopen = (evt) => {
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
			this._verboseLog("connection closed");
			this.emit('disconnect');
			setTimeout(() => {
				this.emit('retry-connect');
				this._connectToServer();
			}, reconnectWaitTime);
		};
	}

	_handleServerRequest(socket, request)
	{
		console.dir("got request");
		console.dir(request);

		var message = request.content;

		var responded = false;

		const sendError = (error) => {
			console.log("sending error", error);
			if(responded)
			{
				throw new Error("cannot respond to a request twice");
			}
			var response = {
				responseId: request.requestId,
				success: false,
				error: error.message
			};
			var jsonData = JSON.stringify(response);
			socket.send(jsonData);
			responded = true;
		};

		const sendResponse = (content) => {
			if(responded)
			{
				throw new Error("cannot respond to a request twice");
			}
			var response = {
				responseId: request.requestId,
				success: true,
				content: content
			};

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

			var jsonData = JSON.stringify(response, replacer);
			socket.send(jsonData);
			responded = true;
		};

		if(message == null)
		{
			sendError(new Error("empty message"));
			return;
		}
		else if(message.command == null)
		{
			sendError(new Error("no command given"));
			return;
		}

		try
		{
			this.executeRequest(message, (response, error) => {
				if(error)
				{
					sendError(error);
				}
				else
				{
					sendResponse(response);
				}
			});
		}
		catch (e)
		{
			if(!responded)
			{
				sendError(new Error("exception: "+e.message));
			}
			else
			{
				console.error("unhandled exception: ", e);
			}
		}
	}

	executeRequest(message, completion)
	{
		switch(message.command)
		{
			case 'js':
				var funcInfo = config.EXTENSION_MAPPINGS.functions[message.js];
				if(funcInfo != null)
				{
					var hasCallbackIndex = false;
					if(typeof message.callbackIndex == 'number')
					{
						hasCallbackIndex = true;
					}
					var args = [];
					var hasCallback = false;
					var callbackWasIntentional = false;
					for(var i=0; i<funcInfo.params.length || (hasCallbackIndex && i<message.callbackIndex); i++)
					{
						var param = funcInfo.params[i];
						if(message.callbackIndex === i)
						{
							if(hasCallback)
							{
								throw new Error("cannot specify multiple callbacks");
							}
							hasCallback = true;
							callbackWasIntentional = true;
							args.push(function(result) {
								completion(result, null);
							});
						}
						else if(message.params instanceof Array && i < message.params.length)
						{
							args.push(message.params[i]);
						}
						else if(typeof message.params == 'object' && message.params[param] !== undefined)
						{
							args.push(message.params[param]);
						}
						else if(param == 'callback' && !hasCallbackIndex)
						{
							if(hasCallback)
							{
								throw new Error("cannot specify multiple callbacks");
							}
							hasCallback = true;
							args.push(function(result) {
								completion(result, null);
							});
						}
						else
						{
							args.push(null);
						}
					}
					var result = this._queryProperty(this._jsExports, message.js)(...args);
					if(!hasCallback)
					{
						completion(result, null);
					}
				}
				else
				{
					var result = this._queryProperty(this._jsExports, message.js);
					if(typeof result == 'function')
					{
						var args = [];
						if(message.params instanceof Array)
						{
							args = message.params;
						}
						result = result(...args);
					}
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
