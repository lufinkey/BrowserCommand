
const config = require('./lib/config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;
const RECONNECT_WAIT_TIME = 2000;


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
		responded = true;
		client.send(JSON.stringify({
			responseId: request.requestId,
			success: false,
			error: error.message
		}));
	};

	const sendResponse = function(response) {
		if(responded)
		{
			throw new Error("cannot respond to a request twice");
		}
		responded = true;
		client.send(JSON.stringify({
			responseId: request.requestId,
			success: true,
			content: response
		}));
	};

	if(message == null)
	{
		sendError(new Error("empty message"));
		return;
	}
	var funcInfo = config.EXTENSION_MAPPINGS.functions[message.function];
	if(funcInfo == null)
	{
		sendError(new Error("unrecognized request"));
		return;
	}

	try
	{
		var args = [];
		var didCallback = false;
		for(var i=0; i<funcInfo.params.length; i++)
		{
			var param = funcInfo.params[i];
			if(param == 'callback')
			{
				if(didCallback)
				{
					throw new Error("cannot specify multiple callbacks");
				}
				didCallback = true;
				args.push(function(result) {
					sendResponse(result);
				});
			}
			else if(param == null)
			{
				args.push(null);
			}
			else if(message.params == null)
			{
				args.push(null);
			}
			else
			{
				args.push(message.params[param]);
			}
		}
		if(!didCallback)
		{
			throw new Error("no callback specified");
		}
		queryProperty(chrome, message.function)(...args);
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
