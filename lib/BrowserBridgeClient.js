
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

		this._options = Object.assign({}, options);
		/*
		{
			verbose: boolean,
			port: integer,
			host: string,
			eventSubsciptions: [
				{
					target: string,
					eventPath: [string]
				}
			],
			username: string,
			key: string,
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
				resolve: function,
				reject: function
			}
			*/
		];

		this._eventSubscriptions = [
			/*
			{
				target: string,
				eventPath: [string],
				subscribers: [Object]
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

	connect()
	{
		return new Promise((resolve, reject) => {
			if(this._socketConnected)
			{
				// websocket is already connected
				resolve();
				return;
			}
			this._internalEvents.once('connectAttemptFinish', (event) => {
				if(event.connected)
				{
					resolve();
				}
				else
				{
					reject(event.error);
				}
			});
			if(this._websocket != null)
			{
				// websocket is already starting
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
			
			// attempt to create web socket
			try
			{
				this._websocket = new WebSocket(url);
			}
			catch(error)
			{
				this._websocket = null;
				this._websocketStartTime = null;
				reject(error);
				return;
			}

			this._websocket.onerror = (error) => {
				// error
				this.emit('error', error);
				if(!this._socketConnected)
				{
					// unknown error, so exit
					this._websocket.close();
					this._websocket = null;
					this._websocketStartTime = null;
					this._cancelConnectImmediately = false;
					this._internalEvents.emit('connectAttemptFinish', { connected: false, error: error });
					this.emit('failure', error);
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
					this.emit('failure');
					return;
				}
				// server is listening
				this._socketConnected = true;
				this._handleConnect();
				this._internalEvents.emit('connect');
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
				var error = null;
				var wasConnected = this._socketConnected;
				if(wasConnected)
				{
					this._socketConnected = false;
					this._websocket = null;
					this._websocketStartTime = null;
					if(event.reason)
					{
						error = new Error("client disconnected: "+event.reason);
					}
					else
					{
						error = new Error("client disconnected");
					}
					this._errorOutRequests(error);
				}

				this._internalEvents.emit('close', { error: error });
				if(wasConnected)
				{
					this.emit('disconnect');
				}
			};
		});
	}

	_errorOutRequests(error)
	{
		var requests = this._pendingRequests;
		this._pendingRequests = [];
		for(var i=0; i<requests.length; i++)
		{
			var request = requests[i];
			request.reject(error);
		}
	}

	_handleConnect()
	{
		// register as client
		this.sendRegistration();
		// subscribe to default subscriptions
		if(this._options.eventSubsciptions)
		{
			for(const subscription of this._options.eventSubsciptions)
			{
				this.subscribeToEvent(subscription.target, subscription.eventPath);
			}
		}
		// resubscribe to events
		for(const subscription of this._eventSubscriptions)
		{
			this.subscribeToEvent(subscription.target, subscription.eventPath);
		}
	}

	_handleMessage(message)
	{
		this.log("received message from server:");
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
						if(message.success)
						{
							request.resolve(message.content);
						}
						else
						{
							request.reject(new Error(message.error));
						}
						return;
					}
				}
				break;

			case 'event':
				// create event
				var event = {
					sender: message.sender,
					eventPath: message.eventPath || [],
					args: message.args || []
				};
				// send internal event
				this._internalEvents.emit('serverEvent', event);
				// fire event subscribers
				for(const subscription of this._eventSubscriptions)
				{
					if(subscription.target === event.sender && Introspect.pathsEqual(subscription.eventPath, event.eventPath))
					{
						var subscribers = subscription.subscribers.slice(0);
						for(const subscriber of subscribers)
						{
							subscriber(...event.args);
						}
						break;
					}
				}
				// send serverEvent
				this.emit('serverEvent', event);
				break;
		}
	}

	close()
	{
		return new Promise((resolve, reject) => {
			if(this._websocket == null)
			{
				resolve();
				return;
			}
			if(!this._socketConnected)
			{
				this._cancelConnectImmediately = true;
				this._internalEvents.once('connectAttemptFinish', (event) => {
					this._cancelConnectImmediately = false;
					if(event.connected)
					{
						// if still connected, try to close again
						this.close().then(resolve).catch(reject);
					}
					else
					{
						resolve();
					}
				});
				return;
			}

			this._internalEvents.once('close', () => {
				resolve();
			});

			if(this._websocket.readyState != 2)
			{
				this._websocket.close();
			}
		});
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

	sendRequest(target, data)
	{
		let requestId = null;
		
		const promise = new Promise((resolve, reject) => {
			// ensure web socket is connected
			if(this._websocket == null)
			{
				reject(new Error("client is not connected"));
				return;
			}
			else if(this._websocket.readyState == 2)
			{
				reject(new Error("client is closing"));
				return;
			}
			else if(this._websocket.readyState != 1)
			{
				reject(new Error("client is not connected"));
				return;
			}

			// get request ID
			requestId = this._requestIdCounter;
			this._requestIdCounter++;

			// create request
			var request = {
				type: 'request',
				target: target,
				requestId: requestId,
				content: data
			};

			// send request to server
			this.log("sending data to server:");
			this.log(request);
			try
			{
				this._websocket.send(JSON.stringify(request));
			}
			catch(error)
			{
				requestId = null;
				reject(error);
				return;
			}

			// wait for response
			this._pendingRequests.push({
				requestId: requestId,
				resolve: resolve,
				reject: reject
			});
		});

		// attach request ID to promise if not null
		if(requestId != null)
		{
			promise.requestId = requestId;
		}
		return promise;
	}

	cancelRequest(requestId)
	{
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.requestId == requestId)
			{
				this._pendingRequests.splice(i, 1);
				request.reject(new Error("request was cancelled"));
				return;
			}
		}
	}

	addEventSubscriber(target, eventPath, subscriber)
	{
		// ensure function
		if(!(typeof subscriber == 'function'))
		{
			throw new Error("subscriber must be a function");
		}
		
		// get existing subscription
		var subscription = null;
		for(const cmpSubscription of this._eventSubscriptions)
		{
			if(target === cmpSubscription.target && Introspect.pathsEqual(eventPath, cmpSubscription.eventPath))
			{
				subscription = cmpSubscription;
				break;
			}
		}
		// create subscription if it doesn't exist
		if(subscription == null)
		{
			subscription = {
				target: target,
				eventPath: eventPath,
				subscribers: []
			};
			this._eventSubscriptions.push(subscription);
			// check if the event is subscribed by default. If not, subscribe
			var shouldSubscribe = true;
			if(this._options.eventSubsciptions)
			{
				for(const cmpSubscription of this._options.eventSubsciptions)
				{
					if(cmpSubscription.target === target && Introspect.pathsEqual(cmpSubscription.eventPath, eventPath))
					{
						shouldSubscribe = false;
						break;
					}
				}
			}
			if(shouldSubscribe)
			{
				// subscribe
				this.subscribeToEvent(target, eventPath);
			}
		};
		// stop if subscriber is already added
		if(subscription.subscribers.indexOf(subscriber) !== -1)
		{
			return;
		}
		// add subscriber
		subscription.subscribers.push(subscriber);
	}

	removeEventSubscriber(target, eventPath, subscriber)
	{
		// ensure function
		if(!(typeof subscriber == 'function'))
		{
			throw new Error("subscriber must be a function");
		}

		// find existing subscription
		for(var i=0; i<this._eventSubscriptions.length; i++)
		{
			var subscription = this._eventSubscriptions[i];
			if(target === subscription.target && Introspect.pathsEqual(eventPath, subscription.eventPath))
			{
				// remove subscriber
				var index = subscription.subscribers.indexOf(subscriber);
				if(index !== -1)
				{
					subscription.subscribers.splice(index, 1);
				}
				if(subscription.subscribers.length === 0)
				{
					this._eventSubscriptions.splice(i, 1);
					var shouldUnsubscribe = true;
					// check if the event is subscribed by default. If not, unsubscribe
					if(this._options.eventSubsciptions)
					{
						for(const cmpSubscription of this._options.eventSubsciptions)
						{
							if(cmpSubscription.target === target && Introspect.pathsEqual(cmpSubscription.eventPath, eventPath))
							{
								shouldUnsubscribe = false;
								break;
							}
						}
					}
					if(shouldUnsubscribe)
					{
						// unsubscribe
						this.unsubscribeFromEvent(target, eventPath);
					}
				}
				break;
			}
		}
	}

	subscribeToEvent(target, eventPath)
	{
		// ensure ready state
		if(this._websocket == null || this._websocket.readyState !== 1)
		{
			this.log("ignoring attempt to subscribe to event while disconnected");
			return;
		}

		// create message
		var message = {
			type: 'subscribe',
			target: target,
			eventPath: eventPath
		};

		// send message
		this.log("sending subscribe message to server:");
		this.log(message);
		this._websocket.send(JSON.stringify(message));
	}

	unsubscribeFromEvent(target, eventPath)
	{
		// ensure ready state
		if(this._websocket == null || this._websocket.readyState !== 1)
		{
			this.log("ignoring attempt to unsubscribe from event while disconnected");
			return;
		}

		// remove existing subscription
		for(var i=0; i<this._eventSubscriptions.length; i++)
		{
			var subscription = this._eventSubscriptions[i];
			if(target === subscription.target && Introspect.pathsEqual(eventPath, subscription.eventPath))
			{
				this._eventSubscriptions.splice(i, 1);
				break;
			}
		}

		// create message
		var message = {
			type: 'unsubscribe',
			target: target,
			eventPath: eventPath
		}

		// send message
		this.log("sending unsubscribe message to server:");
		this.log(message);
		this._websocket.send(JSON.stringify(message));
	}

	unsubscribeFromAllEvents(target)
	{
		// ensure ready state
		if(this._websocket == null || this._websocket.readyState !== 1)
		{
			this.log("ignoring attempt to unsubscribe from all events while disconnected");
			return;
		}

		// create message
		var message = {
			type: 'unsubscribeAll',
			target: target
		}

		// send message
		this.log("sending unsubscribeAll message to server:");
		this.log(message);
		this._websocket.send(JSON.stringify(message));
	}

	queryJS(target, query, ...args)
	{
		// create request
		var request = {
			command: 'js.query',
			query: query,
			params: []
		};

		// add parameters to request
		let callback = null;
		for(var i=0; i<args.length; i++)
		{
			var arg = args[i];
			if(typeof arg == 'function')
			{
				if(request.callbackIndex != null)
				{
					throw new Error("cannot specify multiple callbacks");
				}
				request.callbackIndex = i;
				callback = arg;
			}
			else
			{
				request.params[i] = arg;
			}
		}

		// create promise function
		const promiseFunc = (resolve, reject) => {
			// send request
			this.sendRequest(target, request).then((response) => {
				// success
				if(callback)
				{
					callback(response, null);
				}
				else
				{
					resolve(response);
				}
			}).catch((error) => {
				// error
				if(callback)
				{
					callback(undefined, error);
				}
				else
				{
					reject(error);
				}
			});
		};

		if(callback != null)
		{
			// use callback instead of promise
			promiseFunc(null, null);
			return;
		}
		else
		{
			// use promise since no callback was given
			return new Promise(promiseFunc);
		}
	}

	getBrowserAPI(options)
	{
		return new Promise((resolve, reject) => {
			options = Object.assign({}, options);
			if(!options.target)
			{
				options.target = null;
			}
			if(!options.query)
			{
				options.query = 'browser';
			}

			// create introspection request
			var request = {
				command: 'js.introspect',
				query: [ options.query ]
			};
			
			// send request to introspect "browser" object
			this.sendRequest(options.target, request).then((response) => {
				var browser = null;
				try
				{
					browser = WebExtAPI.create(options.target, this, response, options);
				}
				catch(error)
				{
					reject(error);
					return;
				}
				resolve(browser);
			}).catch(reject);
		});
	}
}

module.exports = BrowserBridgeClient;
