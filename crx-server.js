
const config = require('./crx-config');
const http = require('./chrome-websocket-server/http');

var server = new http.Server();
var wsServer = new http.WebSocketServer(server);
server.listen(config.PORT, config.HOST);

console.log("server listening on port "+config.PORT);

server.addEventListener('request', function(req) {
	console.log("received http request", req);
	return false;
});

var controllerSocket = null;

wsServer.addEventListener('request', function(req) {
	console.log("received request", req);

	var socket = req.accept();

	socket.addEventListener('message', function(evt) {
		console.log("received message", evt);
		var message = JSON.parse(evt.data);
		if(message.type=='req-declare-controller')
		{
			if(controllerSocket!=null)
			{
				socket.send(JSON.stringify({
					type:'resp-declare-controller',
					success:false,
					message:"controller socket already declared"
				}));
				return;
			}
			controllerSocket = socket;
			socket.send(JSON.stringify({
				type:'resp-declare-controller',
				success:true,
				message:"controller declared"
			}));
		}
	});

	socket.addEventListener('close', function() {
		console.log("disconnected socket", socket);
		if(socket==controllerSocket)
		{
			controllerSocket = null;
			console.log("lost web controller socket");
		}
	});

	socket.addEventListener('error', function(evt) {
		console.log("received error", evt);
	});

	return true;
});
