
const WebSocket = require('ws');
const EventEmitter = require('events');
const defaults = require('./defaults');

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
			port: integer,
			host: string,
			retryConnectTimeout: integer,
		}
		*/

		this._client = null;
		this._clientStartTime = null;
		this._clientConnected = false;
		this._chromeCount = 0;

		this._requestIdCounter = 0;
		this._pendingRequests = [];
	}

	log(...messages)
	{
		if(this._options.verbose)
		{
			console.error(...messages);
		}
	}

	get connected()
	{
		return this._clientConnected;
	}

	get connectedToChrome()
	{
		if(this._chromeCount > 0)
		{
			return true;
		}
		return false;
	}

	connect(completion)
	{
		if(this._clientConnected)
		{
			if(completion)
			{
				completion(null);
			}
			return;
		}
		if(completion)
		{
			this.once('connectAttemptFinish', (event) => {
				completion(event.error);
			});
		}
		if(this._client != null)
		{
			return;
		}

		var port = this._options.port || defaults.PORT;
		var host = this._options.host || defaults.HOST;
		var url = 'ws://'+host+':'+port;

		this._clientConnected = false;
		this._clientStartTime = new Date().getTime();
		this._chromeCount = 0;
		this._client = new WebSocket(url);

		this._client.onerror = (error) => {
			// error
			if(!this._clientConnected)
			{
				// unknown error, so exit
				this._client.close();
				this._client = null;
				if(this._options.retryConnectTimeout != null && (new Date().getTime()-this._clientStartTime) < this._options.retryConnectTimeout)
				{
					this.emit('retryConnect');
					this.connect(completion);
				}
				else
				{
					this._clientStartTime = null;
					this.emit('failure', error);
					this.emit('connectAttemptFinish', { connected: false, error: error });
				}
			}
			else
			{
				this.emit('error', error);
			}
		};

		this._client.onopen = () => {
			// server is listening
			this._clientConnected = true;
			this.emit('connect');
			this.emit('connectAttemptFinish', { connected: true, error: null });
		};

		this._client.onmessage = (event) => {
			// message received
			this.log("received message from server:");
			this.log(event.data);
			var message = JSON.parse(event.data);
			this._handleMessage(message);
		};

		this._client.onclose = (code, reason) => {
			// connection closed
			if(this._clientConnected)
			{
				this._clientConnected = false;
				this._client = null;
				this._clientStartTime = null;
				this._chromeCount = 0;
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

	_handleMessage(message)
	{
		switch(message.type)
		{
			case 'response':
				var responseId = message.responseId;
				for(var i=0; i<this._pendingRequests.length; i++)
				{
					var request = this._pendingRequests[i];
					if(request.requestId == responseId)
					{
						this._pendingRequests.splice(i, 1);
						if(!message.success)
						{
							request.completion(null, new Error(message.error));
						}
						else
						{
							request.completion(message.content, null);
						}
						return;
					}
				}
				break;

			case 'serverEvent':
				if([ 'chromeConnect', 'chromeDisconnect' ].includes(message.event))
				{
					this._chromeCount = message.content.chromeCount;
					this.emit(message.event, message.content);
				}
				else
				{
					this.log("ignored server event:");
					this.log(message);
				}
				break;
		}
	}

	close(completion)
	{
		if(this._client == null)
		{
			if(completion)
			{
				completion();
			}
			return;
		}
		if(!this._clientConnected)
		{
			this.once('connectAttemptFinish', () => {
				this.close(completion);
			});
			return;
		}

		this.once('disconnect', () => {
			if(completion)
			{
				completion();
			}
		});

		this._client.close();
	}

	sendRequest(recipient, data, completion)
	{
		if(this._client == null)
		{
			if(completion)
			{
				completion(null, new Error("client is not connected"));
			}
			return;
		}
		else if(this._client.readyState == 2)
		{
			if(completion)
			{
				completion(null, new Error("client is closing"));
			}
			return;
		}
		else if(this._client.readyState != 1)
		{
			if(completion)
			{
				completion(null, new Error("client is not connected"));
			}
			return;
		}

		// get request ID
		var requestId = this._requestIdCounter;
		this._requestIdCounter++;
		// send data
		var jsonData = JSON.stringify({
			type: 'request',
			recipient: recipient,
			requestId: requestId,
			content: data
		});
		this.log("sending data to server:");
		this.log(jsonData);
		this._client.send(jsonData);
		// wait for response
		this._pendingRequests.push({
			requestId: requestId,
			completion: (response, error) => {
				if(completion)
				{
					completion(response, error);
				}
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
		if(this._chromeCount > 0)
		{
			completion(null);
			return;
		}

		// create chrome connect callback
		let timer = null;
		const onChromeConnect = () => {
			// cancel timeout if needed
			if(timer !== null)
			{
				clearTimeout(timer);
			}

			// call completion
			completion(null);
		};
		
		// set timeout
		if(options.timeout)
		{
			timer = setTimeout(() => {
				// operation timed out
				this.removeListener(onChromeConnect);
				completion(new Error("operation timed out"));
			}, options.timeout);
		}

		// add chrome connect listener
		this.once('chromeConnect', onChromeConnect);
	}
}

module.exports = ChromeBridgeClient;
