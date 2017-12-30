
const config = require('./lib/config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;
const RECONNECT_WAIT_TIME = 200;

const JS_EXPORTS = {
	'chrome': chrome
};


//functions

function queryProperty(object, query)
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

function waitForWebSocketMessage(url, onmessage)
{
	console.clear();

	var websocket = new WebSocket(url);

	websocket.onopen = function(evt) {
		console.log("connection opened");
	};

	websocket.onmessage = function(evt) {
		onmessage(websocket, evt.data);
	};

	websocket.onerror = function(evt) {
		//
	};

	websocket.onclose = function(evt) {
		console.log("connection closed");
		setTimeout(function(alarm) {
			waitForWebSocketMessage(url, onmessage);
		}, RECONNECT_WAIT_TIME);
	};
}



// main handler

waitForWebSocketMessage(SOCKET_URL, function(client, data) {
	var request = JSON.parse(data);
	var message = request.content;

	var responded = false;

	const sendError = function(error) {
		if(responded)
		{
			throw new Error("cannot respond to a request twice");
		}
		client.send(JSON.stringify({
			responseId: request.requestId,
			success: false,
			error: error.message
		}));
		responded = true;
	};

	const sendResponse = function(response) {
		if(responded)
		{
			throw new Error("cannot respond to a request twice");
		}
		client.send(JSON.stringify({
			responseId: request.requestId,
			success: true,
			content: response
		}));
		responded = true;
	};

	if(message == null)
	{
		sendError(new Error("empty message"));
		return;
	}

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
								sendResponse(result);
							});
						}
						else
						{
							args.push(null);
						}
					}
					var result = queryProperty(JS_EXPORTS, message.js)(...args);
					if(!hasCallback)
					{
						sendResponse(result);
					}
				}
				else
				{
					var result = queryProperty(JS_EXPORTS, message.js);
					if(typeof result == 'function')
					{
						var args = [];
						if(message.params instanceof Array)
						{
							args = message.params;
						}
						result = result(...args);
					}
					sendResponse(result);
				}
				break;

			default:
				sendError(new Error("invalid command"));
				break;
		}
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
});
