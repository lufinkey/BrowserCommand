
const WebSocket = require('ws');
const EventEmitter = require('events');
const Introspect = require('./Introspect');
const Target = require('./Target');
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
				completion: function
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
				this._websocketStartTime = null;
				this._cancelConnectImmediately = false;
				this.emit('failure', error);
				this._internalEvents.emit('connectAttemptFinish', { connected: false, error: error });
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
				this.emit('failure');
				this._internalEvents.emit('connectAttemptFinish', { connected: false, error: error });
				return;
			}
			// server is listening
			this._socketConnected = true;
			this._handleConnect();
			this._internalEvents.emit('connect');
			this.emit('connect');
			this._internalEvents.emit('connectAttemptFinish', { connected: true, error: null });
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

			if(wasConnected)
			{
				this.emit('disconnect', { error: error });
			}
			this._internalEvents.emit('close', { error: error });
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

	_handleConnect()
	{
		// register as client
		this.sendRegistration();
		// resubscribe to events
		for(const subscription of this._eventSubscriptions)
		{
			this.subscribeToEvent(subscription.target, subscription.eventPath);
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

			case 'event':
				// create event
				var event = {
					sender: message.sender,
					eventPath: [].concat(message.eventPath),
					args: [].concat(message.args)
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

		if(completion)
		{
			this._internalEvents.once('close', () => {
				completion();
			});
		}

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
		this._websocket.send(JSON.stringify(request));

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
			this.subscribeToEvent(target, eventPath);
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
					this.unsubscribeFromEvent(target, eventPath);
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

	getBrowserAPI(options, completion)
	{
		options = Object.assign({}, options);
		if(!options.browser)
		{
			options.browser = 'chrome';
		}
		if(!options.identifier)
		{
			options.identifier = null;
		}
		if(!options.query)
		{
			options.query = 'browser';
		}

		// create target
		var target = Target.fromParts('controller', options.browser, options.identifier);
		if(target == null)
		{
			completion(null, new Error("invalid target"));
			return;
		}

		// create introspection request
		var request = {
			command: 'js.introspect',
			query: [ options.query ]
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
