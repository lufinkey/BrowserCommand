
const WebSocket = require('ws');
const EventEmitter = require('events');

const config = require('./config');

class ChromeBridgeClient extends EventEmitter
{
	constructor(options)
	{
		super();

		if(options == null)
		{
			options = {};
		}

		this._options = options;
		/*
		{
			verbose: boolean,
			logPrefix: string,
			port: integer,
			host: string,
			retryTimeout: integer,
		}
		*/

		this._clientStartTime = new Date().getTime();
		this._client = null;

		this._requestIdCounter = 0;
		this._pendingRequests = [];

		this._connectToServer();
	}

	_verboseLog(message)
	{
		if(this._options.verbose)
		{
			console.error(message);
		}
	}

	_connectToServer(completion)
	{
		var port = this._options.port || config.PORT;
		var host = this._options.host || config.HOST;
		var url = 'ws://'+host+':'+port;
		this._client = new WebSocket(url);

		var clientConnected = false;

		this._client.onerror = (error) => {
			// error
			if(!clientConnected)
			{
				// unknown error, so exit
				this._client.close();
				this._client = null;
				if(this._options.retryTimeout && (new Date().getTime() - this._clientStartTime) < this._options.retryTimeout) 
				{
					this.emit('retry-connect');
					this._connectToServer((error) => {
						if(completion)
						{
							completion(error);
						}
					});
				}
				else
				{
					this.emit('failure', error);
				}
			}
			else
			{
				this.emit('error', error);
			}
		};

		this._client.onopen = (event) => {
			// server is listening
			clientConnected = true;
			this.emit('connect');
			if(completion)
			{
				completion(null);
			}
		};

		this._client.onmessage = (event) => {
			// message received
			this._verboseLog("received message from server:");
			this._verboseLog(event.data);
			var message = JSON.parse(event.data);
			this._handleResponse(message);
		};

		this._client.onclose = (code, reason) => {
			// connection closed
			if(clientConnected)
			{
				clientConnected = false;
				this.client = null;
				this._errorOutRequests(new Error("client disconnected"));
				this.emit('disconnect');
			}
		};
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

	close(code, reason)
	{
		if(this._client == null)
		{
			return;
		}
		this._client.close(code, reason);
	}

	sendRequest(data, completion)
	{
		if(this._client == null)
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
		});
		this._verboseLog("sending date to server:");
		this._verboseLog(jsonData);
		this._client.send(jsonData);
		// wait for response
		this._pendingRequests.push({
			requestId: requestId,
			completion: (response, error) => {
				completion(response, error);
			}
		});
		return requestId;
	}

	cancelRequest(requestId)
	{
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.requestId == requestId)
			{
				this._pendingRequests.splice(i, 1);
				return;
			}
		}
	}

	waitForChrome(options, completion)
	{
		if(options == null)
		{
			options = {};
		}
		if(this._client == null)
		{
			completion(new Error("client is not connected"));
			return;
		}
		
		// set timeout
		var timer = null;
		var requestId = null;
		if(options.timeout)
		{
			timer = setTimeout(() => {
				cancelRequest(requestId);
				completion(new Error("operation timed out"));
			}, options.timeout);
		}

		// send request
		var message = {
			command: 'wait-for-chrome'
		};
		requestId = this.sendRequest(message, (response, error) => {
			// cancel timeout if needed
			if(timer !== null)
			{
				clearTimeout(timer);
			}

			// call completion
			if(error)
			{
				completion(error);
				return;
			}
			else if(!response.chromeConnected)
			{
				completion(new Error("chrome is not connected"));
				return;
			}
			completion(null);
		});
	}
}

module.exports = ChromeBridgeClient;
