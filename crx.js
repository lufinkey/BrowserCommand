
const config = require('./crx-config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;


function waitForWebSocketMessage(url, onmessage)
{
	var websocket = new WebSocket(url);

	websocket.onopen = function(evt) {
		console.log("connection opened");
	};

	websocket.onmessage = function(evt) {
		console.log("message received ", evt);
		onmessage(evt);
	};

	websocket.onclose = function(evt) {
		console.log("connection closed");
		setTimeout(function(alarm) {
			waitForWebSocketMessage(url, onmessage);
		}, 5000);
	};
}


waitForWebSocketMessage(SOCKET_URL, function(evt) {
	var message = JSON.parse(evt.data);
	switch(message.type)
	{
		case 'req-execute-js':
			var tab = chrome.tabs.get(message.tabId, function(tab) {
				console.log("got tab", tab);
				if(message.cmdId==null || message.tabId==null || message.js==null)
				{
					webSocket.send(JSON.stringify({
						type: 'resp-execute-js',
						success: false,
						message: "missing required parameter(s)",
						cmdId: message.cmdId
					}));
					return;
				}
				var details = {
					code: message.js
				};
				chrome.tabs.executeScript(message.tabId, details, function(results){
					var result;
					if(results!=null)
					{
						result = results[0];
					}
					webSocket.send(JSON.stringify({
						type: 'resp-execute-js',
						success: true,
						message: "successfully executed script",
						cmdId: message.cmdId
					}));
				});
			});
			return;
	}
});
