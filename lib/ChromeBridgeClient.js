
const WebSocket = require('ws');
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const { ChromeRuntime } = require('./ChromeAPI');
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
		this._cancelNextConnectAttempt = false;

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
		var path = this._options.path || defaults.PATH;
		var url = 'ws://'+host+':'+port+path;

		this._clientConnected = false;
		this._cancelNextConnectAttempt = false;
		if(this._clientStartTime == null)
		{
			this._clientStartTime = new Date().getTime();
		}
		this._chromeCount = 0;
		this._client = new WebSocket(url);

		this._client.onerror = (error) => {
			// error
			if(!this._clientConnected)
			{
				// unknown error, so exit
				this._client.close();
				this._client = null;
				if(!this._cancelNextConnectAttempt && this._options.retryConnectTimeout != null && (new Date().getTime()-this._clientStartTime) < this._options.retryConnectTimeout)
				{
					this.emit('retryConnect');
					this.connect(null);
				}
				else
				{
					this._clientStartTime = null;
					this._cancelNextConnectAttempt = false;
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
			var message = JSON.parse(event.data);
			if(message == null)
			{
				this.log("got bad message from server:");
				this.log(event.data);
				return;
			}
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
		this.log("received message fromm server:");
		this.log(message);

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
					this.log("ignored server event "+message.event);
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
			this._cancelNextConnectAttempt = true;
			this.once('connectAttemptFinish', () => {
				this._cancelNextConnectAttempt = false;
				if(this._clientConnected)
				{
					this.close(completion);
				}
				else if(completion)
				{
					completion();
				}
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

		// create request
		var request = {
			type: 'request',
			recipient: recipient,
			requestId: requestId,
			content: data
		};

		// send request
		this.log("sending data to server:");
		this.log(request);
		var jsonData = JSON.stringify(request);
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
		if(options.timeout != null)
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

	getAPI(completion)
	{
		var request = {
			command: 'js.introspect',
			query: ['chrome']
		};
		
		// send request to introspect "chrome" object
		this.sendRequest('chrome', request, (response, error) => {
			if(error)
			{
				completion(error);
				return;
			}

			let chrome = {};

			// create function to get called when chrome functions are called
			const funcExecutor = (path, ...args) => {
				let callback = null;

				var request = {
					command: 'js.query',
					query: ['chrome'].concat(path),
					params: []
				};

				// add parameters
				for(var i=0; i<args.length; i++)
				{
					var arg = args[i];
					if(typeof arg == 'function')
					{
						if(request.callbackIndex != null)
						{
							throw new Error("cannot give multiple callbacks");
						}
						request.callbackIndex = i;
						callback = arg;
					}
					else
					{
						request.params[i] = arg;
					}
				}

				// send function request
				this.sendRequest('chrome', request, (response, error) => {
					if(callback)
					{
						if(error)
						{
							chrome.runtime._setLastError(error, path.join('.'));
							callback(undefined);
							chrome.runtime._unsetLastError();
						}
						else
						{
							callback(response);
						}
					}
				});
			};

			// create chrome object
			chrome = Object.assign(chrome, Introspect.create(response, funcExecutor));
			if(!chrome.runtime)
			{
				chrome.runtime = {};
			}
			chrome.runtime = Object.assign(new ChromeRuntime(), chrome.runtime);

			// apply chrome object to this object
			Object.assign(this, chrome);
			this._introspected = true;

			// send chrome object to completion
			completion(null);
		});
	}
}

module.exports = ChromeBridgeClient;
