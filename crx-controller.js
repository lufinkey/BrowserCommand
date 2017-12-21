
const config = require('./crx-config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;

webSocket = new WebSocket(SOCKET_URL);

webSocket.onopen = function(evt) {
	console.log("websocket connected to "+SOCKET_URL);
}

webSocket.onclose = function(evt) {
	console.log("websocket closed");
}

webSocket.onerror = function(evt) {
	console.log("webSocket error", evt);
}

webSocket.onmessage = function(evt) {
	console.log("webSocket message", evt);
}
