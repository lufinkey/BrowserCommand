
const config = require('./crx-config');

const SOCKET_URL = 'ws://'+config.HOST+':'+config.PORT;

webSocket = new WebSocket(SOCKET_URL);

webSocket.onopen = function(evt) {
	console.log("websocket connected to "+SOCKET_URL);
	webSocket.send(JSON.stringify({
		type:'req-declare-controller'
	}));
}

webSocket.onclose = function(evt) {
	console.log("websocket closed", evt);
}

webSocket.onerror = function(evt) {
	console.log("webSocket error", evt);
}

webSocket.onmessage = function(evt) {
	console.log("webSocket message", evt);
	var message = JSON.parse(evt.data);
	if(message.type=='resp-declare-controller')
	{
		console.log(message.message);
		if(!message.success)
		{
			console.log("closing websocket");
			webSocket.close(1, "couldn't declare controller");
		}
	}
}
