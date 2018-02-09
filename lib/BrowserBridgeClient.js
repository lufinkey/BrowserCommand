
const WebSocket = require('ws');
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const WebExtAPI = require('./WebExtAPI');
const defaults = require('./defaults');

class BrowserBridgeClient extends EventEmitter
{
	constructor(options)
	{
		super();

		if(options == null)
		{
			options = {};
		}

		this._options = Object.assign({}, options);
		/*
		{
			verbose: boolean,
			port: integer,
			host: string,
			username: string,
			key: string,
			retryConnectTimeout: integer,
		}
		*/

		this._internalEvents = new EventEmitter();

		this._websocket = null;
		this._websocketStartTime = null;
		this._socketConnected = false;
		this._cancelConnectImmediately = false;

		this._requestIdCounter = 0;
		this._pendingRequests = [
			/*
			{
				requestId: integer,
				completion: function
			}
			*/
		];
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
		return this._socketConnected;
	}

	connect(completion)
	{
		if(this._socketConnected)
		{
			if(completion)
			{
				completion(null);
			}
			return;
		}
		if(completion)
		{
			this._internalEvents.once('connectAttemptFinish', (event) => {
				completion(event.error);
			});
		}
		if(this._websocket != null)
		{
			return;
		}

		var port = this._options.port || defaults.PORT;
		var host = this._options.host || defaults.HOST;
		var path = this._options.path || defaults.PATH;
		var url = 'ws://'+host+':'+port+path;

		this._socketConnected = false;
		this._cancelConnectImmediately = false;
		if(this._websocketStartTime == null)
		{
			this._websocketStartTime = new Date();
		}
		this._websocket = new WebSocket(url);

		this._websocket.onerror = (error) => {
			// error
			if(!this._socketConnected)
			{
				// unknown error, so exit
				this._websocket.close();
				this._websocket = null;
				if(!this._cancelConnectImmediately && this._options.retryConnectTimeout != null && (new Date().getTime()-this._websocketStartTime.getTime()) < this._options.retryConnectTimeout)
				{
					this.emit('retryConnect');
					this.connect(null);
				}
				else
				{
					this._websocketStartTime = null;
					this._cancelConnectImmediately = false;
					this._internalEvents.emit('connectAttemptFinish', { connected: false, error: error });
					this.emit('failure', error);
				}
			}
			else
			{
				this.emit('error', error);
			}
		};

		this._websocket.onopen = () => {
			// if connection was cancelled while attempting to connect, disconnect immediately
			if(this._cancelConnectImmediately)
			{
				this._cancelConnectImmediately = false;
				this._websocket.close();
				this._websocket = null;
				this._websocketStartTime = null;
				var error = new Error("connection was manually closed");
				this._internalEvents.emit('connectAttemptFinish', { connected: false, error: error });
				return;
			}
			// server is listening
			this._socketConnected = true;
			this.sendRegistration();
			this._internalEvents.emit('connectAttemptFinish', { connected: true, error: null });
			this.emit('connect');
		};

		this._websocket.onmessage = (event) => {
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

		this._websocket.onclose = (event) => {
			// connection closed
			if(this._socketConnected)
			{
				this._socketConnected = false;
				this._websocket = null;
				this._websocketStartTime = null;
				var error = null;
				if(event.reason)
				{
					error = new Error("client disconnected: "+event.reason);
				}
				else
				{
					error = new Error("client disconnected");
				}
				this._errorOutRequests(error);
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
		}
	}

	close(completion)
	{
		if(this._websocket == null)
		{
			if(completion)
			{
				completion();
			}
			return;
		}
		if(!this._socketConnected)
		{
			this._cancelConnectImmediately = true;
			this._internalEvents.once('connectAttemptFinish', () => {
				this._cancelConnectImmediately = false;
				if(this._socketConnected)
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

		this._websocket.close();
	}

	sendRegistration()
	{
		if(this._websocket == null || this._websocket.readyState != 1)
		{
			this.log("ignoring attempt to send registration while not in a ready state");
			return;
		}
		// create registration message
		var message = {
			type: 'register',
			info: {
				type: 'client',
				username: this._options.username,
				key: this._options.key
			}
		};
		// send registration message
		this.log("sending registration to server:");
		this.log(message);
		this._websocket.send(JSON.stringify(message));
	}

	sendRequest(target, data, completion)
	{
		if(this._websocket == null)
		{
			if(completion)
			{
				completion(null, new Error("client is not connected"));
			}
			return;
		}
		else if(this._websocket.readyState == 2)
		{
			if(completion)
			{
				completion(null, new Error("client is closing"));
			}
			return;
		}
		else if(this._websocket.readyState != 1)
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
			target: target,
			requestId: requestId,
			content: data
		};

		// send request
		this.log("sending data to server:");
		this.log(request);
		var jsonData = JSON.stringify(request);
		this._websocket.send(jsonData);

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

	getAPI(target, options, completion)
	{
		// create introspection request
		var request = {
			command: 'js.introspect',
			query: ['browser']
		};
		
		// send request to introspect "browser" object
		this.sendRequest(target, request, (response, error) => {
			if(error)
			{
				completion(null, error);
				return;
			}
			var browser = WebExtAPI.create(target, this, response, options);
			completion(browser, null);
		});
	}
}

module.exports = BrowserBridgeClient;
