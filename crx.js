
const config = require('./crx-config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;
const RECONNECT_WAIT_TIME = 2000;


function waitForWebSocketMessage(url, onmessage)
{
	console.clear();

	var websocket = new WebSocket(url);

	websocket.onopen = function(evt) {
		console.log("connection opened");
	};

	websocket.onmessage = function(evt) {
		console.log("message received ", evt);
		onmessage(websocket, evt.data);
	};

	websocket.onerror = function(evt) {
		console.log("error", evt);
	};

	websocket.onclose = function(evt) {
		console.log("connection closed");
		setTimeout(function(alarm) {
			waitForWebSocketMessage(url, onmessage);
		}, RECONNECT_WAIT_TIME);
	};
}


waitForWebSocketMessage(SOCKET_URL, function(client, data) {
	var message = JSON.parse(data);
	switch(message.type)
	{
		case 'req-get-windows':
			chrome.windows.getAll(null, function(windows_arr) {
				var windows = [];
				for(var i=0; i<windows_arr.length; i++)
				{
					var window = windows_arr[i];
					windows.push({
						id: window.id,
						focused: window.focused,
						incognito: window.incognito,
						type: window.type,
						state: window.state,
						sessionId: window.sessionId
					});
				}
				client.send(JSON.stringify({
					type: 'resp-get-windows',
					success: true,
					message: "successfully got windows",
					result: windows
				}));
			});
			return;

		case 'req-execute-js':
			var tab = chrome.tabs.get(message.tabId, function(tab) {
				console.log("got tab", tab);
				if(message.tabId==null || message.js==null)
				{
					client.send(JSON.stringify({
						type: 'resp-execute-js',
						success: false,
						message: "missing required parameter(s)"
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
					client.send(JSON.stringify({
						type: 'resp-execute-js',
						success: true,
						message: "successfully executed script",
						result: result
					}));
				});
			});
			return;
	}
});
