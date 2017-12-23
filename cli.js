
const WebSocket = require('ws');
const config = require('./crx-config');


//global constants
const EXITCODE_BADPARAMS = 1;
const EXITCODE_TIMEOUT = 2;
const EXITCODE_SERVERERROR = 3;
const EXITCODE_CLIENTERROR = 4;

const CLOSECODE_INVALIDCLIENT = 4069;

const progStartTime = new Date().getTime();


//global config variables
var verbose = true;
var chromeConnectTimeout = 6000;
var establishServerTimeout = 6000;


//functions
function verboseLog(message)
{
	if(verbose)
	{
		console.error(message);
	}
}

var server = null;
function sendToChromeExtension(message, onresponse)
{
	verboseLog("initializing server at "+config.HOST+":"+config.PORT);
	server = new WebSocket.Server({ port: config.PORT, host: config.HOST });

	var serverListening = false;
	var clientConnected = false;

	server.on('error', function(error) {
		//error
		if(error.code == 'EADDRINUSE')
		{
			//check for timeout or try again
			if((new Date().getTime()-progStartTime) >= establishServerTimeout)
			{
				console.error("Could not establish server. Operation timed out.");
				process.exit(EXITCODE_TIMEOUT);
			}
			else
			{
				setTimeout(function() {
					sendToChromeExtension(message, onresponse);
				}, 40);
			}
		}
		else if(!serverListening)
		{
			//unknown error, so exit
			console.error("Got error while trying to start server:");
			console.error(error);
			process.exit(EXITCODE_SERVERERROR);
		}
	});

	server.on('listening', function() {
		//server is listening
		serverListening = true;
		verboseLog("server is listening on port "+config.PORT);

		const timeoutObj = setTimeout(function() {
			//timed out waiting for connection
			server.close(function() {
				console.error("Server did not receive connection from chrome extension. Operation timed out.");
				process.exit(EXITCODE_TIMEOUT);
			});
		}, chromeConnectTimeout);

		server.on('connection', function(client, request) {
			//connection opened
			verboseLog("client connected");

			if(!clientConnected)
			{
				//validate connection
				if(request.connection.remoteAddress != '127.0.0.1' || !request.headers.origin.startsWith("chrome-extension://")
					|| request.headers['x-forwarded-for'] != null || request.headers.host != config.HOST+':'+config.PORT)
				{
					//reject invalid connection
					verboseLog("rejecting invalid connection");
					client.close(CLOSECODE_INVALIDCLIENT, "invalid connection");
					return;
				}
				clientConnected = true;

				clearTimeout(timeoutObj);

				var gotResponse = false;
				client.send(JSON.stringify(message));

				client.on('message', function(data) {
					//data received from client
					verboseLog("received message");

					if(!gotResponse)
					{
						gotResponse = true;
						server.close(function(){
							onresponse(JSON.parse(data));
						});
					}
				});
		
				client.on('close', function(code, reason) {
					//connection closed
					verboseLog("disconnected client");
					if(!gotResponse && code!=CLOSECODE_INVALIDCLIENT)
					{
						console.error("client disconnected unexpectedly");
						process.exit(EXITCODE_CLIENTERROR);
					}
				});
			}
		});
	});
}


//parse arguments
var command = process.argv[2];
switch(command)
{
	case 'window':
		sendToChromeExtension({type: 'req-get-windows'}, function(response) {
			console.log(response);
			process.exit(0);
		});
		break;

	case '':
		console.error("missing command argument");
		process.exit(1);
		break;

	default:
		console.error("unknown command "+command);
		process.exit(1);
		break;
}
