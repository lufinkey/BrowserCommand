
const config = require('./crx-config');
const http = require('./chrome-websocket-server/http');

var server = new http.Server();
var wsServer = new http.WebSocketServer(server);
server.listen(config.PORT, config.HOST);

console.log("server listening on port "+PORT);

server.addEventListener('request', function(req) {
	return false;
});

var connectedSockets = [];

wsServer.addEventListener('request', function(req) {
	console.log("received request", req);

	var socket = req.accept();
	connectedSockets.push(socket);

	socket.addEventListener('message', function(evt) {
		console.log("received message", evt);
	});

	socket.addEventListener('close', function() {
		console.log("disconnected socket", socket);
		for(var i=0; i<connectedSockets.length; i++)
		{
			if(connectedSockets[i]==socket)
			{
				connectedSockets.splice(i, 1);
				break;
			}
		}
	});

	return true;
});
