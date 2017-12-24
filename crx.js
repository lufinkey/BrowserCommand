
const config = require('./lib/config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;
const RECONNECT_WAIT_TIME = 2000;


//functions

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

var requestHandlers = {};
function setRequestHandler(type, handler)
{
	requestHandlers[type] = handler;
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
	var handler = requestHandlers[message.type];
	if(handler == null)
	{
		sendError(new Error("unrecognized request"));
		return;
	}
	
	handler(message, sendResponse, sendError);
});



// request handlers

setRequestHandler('get-windows', function(message, sendResponse, sendError) {
	chrome.windows.getAll(null, function(windows) {
		sendResponse(windows);
	});
});


setRequestHandler('get-window', function(message, sendResponse, sendError) {
	chrome.windows.get(message.windowId, null, function(window) {
		sendResponse(window);
	});
});


setRequestHandler('execute-js', function(message, sendResponse, sendError) {
	if(message.tabId==null || message.js==null)
	{
		sendError(new Error("missing required parameter(s)"));
		return;
	}
	var tab = chrome.tabs.get(message.tabId, function(tab) {
		var details = {
			code: message.js
		};
		chrome.tabs.executeScript(message.tabId, details, function(results){
			var result;
			if(results!=null)
			{
				result = results[0];
			}
			sendResponse(result);
		});
	});
});
