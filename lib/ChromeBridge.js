
const WebSocket = require('ws');
const EventEmitter = require('events');

const config = require('./config');

class ChromeBridge extends EventEmitter
{
	constructor(options)
	{
		super();

		this._options = options;
		this._bridgeStartTime = new Date().getTime();
		this._server = null;
		this._chromeClient = null;

		this._requestIdCounter = 0;
		this._pendingRequests = [];

		this._connectToChrome();
	}

	_verboseLog(message)
	{
		if(this._options.verboseLog)
		{
			console.error(message);
		}
	}

	_connectToChrome()
	{
		this._server = new WebSocket.Server({ port: config.PORT, host: config.HOST });
		this._chromeClient = null;

		var serverListening = false;

		this._server.on('error', (error) => {
			// error
			if(error.code == 'EADDRINUSE')
			{
				// check for timeout or try again
				if(this._options.establishServerTimeout != null && (new Date().getTime()-this.bridgeStartTime) >= this._options.establishServerTimeout)
				{
					this._server.close(() => {
						this._server = null;
						this._chromeClient = null;
						this.emit('failure', new Error("server initialization timed out"));
					});
				}
				else
				{
					setTimeout(() => {
						this._connectToChrome();
					}, 40);
				}
			}
			else if(!serverListening)
			{
				// unknown error, so exit
				this._server.close(() => {
					this._server = null;
					this._chromeClient = null;
					this.emit('failure', error);
				});
			}
			else
			{
				this.emit('error', error);
			}
		});

		var timeoutObj = null;

		this._server.on('listening', () => {
			// server is listening
			serverListening = true;
			if(this._options.chromeConnectTimeout != null)
			{
				timeoutObj = setTimeout(() => {
					// timed out waiting for connection
					this._server.close(() => {
						this._server = null;
						this._chromeClient = null;
						this.emit('failure', new Error("chrome connection timed out"));
					});
				}, this._options.chromeConnectTimeout);
			}
			this.emit('listening');
		});

		this._server.on('connection', (client, request) => {
			// connection opened
			if(this._chromeClient == null)
			{
				// validate connection
				if(request.connection.remoteAddress != '127.0.0.1' || !request.headers.origin.startsWith("chrome-extension://")
					|| request.headers['x-forwarded-for'] != null || request.headers.host != config.HOST+':'+config.PORT)
				{
					//reject invalid connection
					client.close(CLOSECODE_INVALIDCLIENT, "invalid connection");
					return;
				}
				this._chromeClient = client;

				// kill timeout
				if(timeoutObj != null)
				{
					clearTimeout(timeoutObj);
				}

				// emit event
				this.emit('connect');

				//handle message
				client.on('message', (data) => {
					this._handleResponse(JSON.parse(data));
				});
		
				// handle close
				client.on('close', (code, reason) => {
					//connection closed
					this._chromeClient = null;
					this._errorOutRequests(new Error("client disconnected"));
					this.emit('disconnect');
				});
			}
			else
			{
				client.close();
			}
		});
	}

	_errorOutRequests(error)
	{
		var requests = this._pendingRequests;
		this._pendingRequests = [];
		for(var i=0; i<requests.length; i++)
		{
			var request = requests[i];
			request.completion(null, error);
		}
	}

	_handleResponse(response)
	{
		var responseId = response.responseId;
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.requestId == responseId)
			{
				this._pendingRequests.splice(i, 1);
				if(!response.success)
				{
					request.completion(null, new Error(response.error));
				}
				else
				{
					request.completion(response.content, null);
				}
				return;
			}
		}
	}

	close(completion)
	{
		if(this._server == null)
		{
			completion();
			return;
		}
		this._server.close(() => {
			this._server = null;
			this._chromeClient = null;
			this._errorOutRequests(new Error("server closed"));
			completion();
		});
	}

	send(data, completion)
	{
		if(this._chromeClient == null)
		{
			completion(null, new Error("client is not connected"));
			return;
		}
		// get request ID
		var requestId = this._requestIdCounter;
		this._requestIdCounter++;
		// send data
		var jsonData = JSON.stringify({
			requestId: requestId,
			content: data
		})
		this._verboseLog("sending "+jsonData);
		this._chromeClient.send(jsonData);
		// wait for response
		this._pendingRequests.push({
			requestId: requestId,
			completion: (response, error) => {
				completion(response, error);
			}
		});
	}
}

module.exports = ChromeBridge;
