
const WebSocket = require('ws');
const config = require('./crx-config');

//setup server
const server = new WebSocket.Server({ port: config.PORT, host: config.HOST });
console.log("server listening on port "+config.PORT);


//functions
var controllerSocket = null;

var cmds = [];
var cmdCounter = 0;

function queueCmd(socket)
{
	var cmdId = cmdSocketCounter;
	cmdSocketCounter++;
	var cmd = {
		cmdId: cmdId,
		socket: socket
	};
	cmds.push(cmd);
	return cmdId;
}

function dequeueCmd(cmdId)
{
	for(var i=0; i<cmds.length; i++)
	{
		var cmd = cmds[i];
		if(cmd.cmdId == cmdId)
		{
			cmds.splice(i, 1);
			return socket;
		}
	}
	return null;
}


//websocket server
server.on('connection', function(client, request) {
	//connection opened
	console.log("client connected");

	client.chrome_cmd = {};
	
	client.on('message', function(data) {
		//data received from client
		console.log("received message");
	});

	client.on('close', function(code, reason) {
		//connection closed
		console.log("disconnected client");
	});
});
