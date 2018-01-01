
const WebSocket = require('ws');
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
		this.emit('try-connect');

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
				this._connectToServer();
			}, reconnectWaitTime);
		};
	}

	_handleServerRequest(socket, request)
	{
		var request = JSON.parse(data);
		var message = request.content;

		var responded = false;

		const sendError = (error) => {
			if(responded)
			{
				throw new Error("cannot respond to a request twice");
			}
			var response = {
				responseId: request.requestId,
				success: false,
				error: error.message
			};
			client.send(JSON.stringify());
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

			client.send(JSON.stringify(response, replacer));
			responded = true;
		};

		if(message == null)
		{
			sendError(new Error("empty message"));
			return;
		}
		else if(message.command == null)
		{
			sendError(new Error("invalid command"));
		}

		this._executeRequest(message, (response, error) => {
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

	executeRequest(message, completion)
	{
		try
		{
			switch(message.command)
			{
				case 'js':
					var funcInfo = config.EXTENSION_MAPPINGS.functions[message.js];
					if(funcInfo != null)
					{
						var args = [];
						var hasCallback = false;
						for(var i=0; i<funcInfo.params.length; i++)
						{
							var param = funcInfo.params[i];
							if(message.params instanceof Array && i < message.params.length)
							{
								args.push(message.params[i]);
							}
							else if(typeof message.params == 'object' && message.params[param] !== undefined)
							{
								args.push(message.params[param]);
							}
							else if(param == 'callback')
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
						var result = queryProperty(this._jsExports, message.js)(...args);
						if(!hasCallback)
						{
							completion(result, null);
						}
					}
					else
					{
						var result = queryProperty(this._jsExports, message.js);
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

				default:
					completion(null, new Error("invalid command "+message.command));
					break;
			}
		}
		catch (e)
		{
			if(!responded)
			{
				completion(null, new Error("exception: "+e.message));
			}
			else
			{
				console.error("unhandled exception: ", e);
			}
		}
	}
}
