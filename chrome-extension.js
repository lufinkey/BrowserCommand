
const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 41904 });

server.on("connection", function(client, request) {
	//connection opened

	client.on("message", function(data) {
		//TODO handle message
	});
});
