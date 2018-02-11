
const WebSocket = require('ws');
const EventEmitter = require('events');
const lockfile = require('process-lockfile');
const os = require('os');
const Introspect = require('./Introspect');
const Target = require('./Target');
const defaults = require('./defaults');


const lockfilePrefix = os.tmpdir()+'/'+defaults.MODULE_NAME+'-lock-';
const supportedBrowsers = ['chrome','firefox','edge'];

class BrowserBridgeServer extends EventEmitter
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
			path: string,
			userKeys: { username : key }
		}
		*/

		this._internalEvents = new EventEmitter();

		this._serverStarting = false;
		this._serverStartTime = null;
		this._serverListening = false;
		this._server = null;
		this._port = null;
		this._host = null;
		this._controllers = [];
		this._clients = [];

		this._attemptingLock = false;
		this._cancelListenImmediately = false;

		this._requestIdCounter = 0;
		this._pendingRequests = [
			/*
			{
				requestId: integer,
				browserSocket: WebSocket,
				completion: function
			}
			*/
		];

		this._eventSubscriptions = [
			/*
			{
				target: {
					type: string,
					name: string,
					identifier: string
				},
				eventPath: [string],
				receiverSocket: WebSocket,
				clientSockets: [WebSocket]
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

	static isServerRunning(port)
	{
		if(port == null)
		{
			port = defaults.PORT;
		}
		return lockfile.isLockedSync(lockfilePrefix+port, {});
	}

	get listening()
	{
		return this._serverListening;
	}

	listen(completion)
	{
		if(this._serverListening)
		{
			completion(null);
			return;
		}
		// add completion to be called when the listen attempt finishes, if necessary
		if(completion)
		{
			this._internalEvents.once('listenAttemptFinish', (event) => {
				completion(event.error);
			});
		}
		if(this._serverStarting)
		{
			return;
		}
		this._serverStarting = true;

		// get server config
		var port = this._options.port || defaults.PORT;
		var host = this._options.host || defaults.HOST;
		var path = this._options.path || defaults.PATH;

		// attempt to lock lockfile for server
		var lockfileName = lockfilePrefix+port;
		this._attemptingLock = true;
		lockfile.lock(lockfileName).then(() => {
			this._attemptingLock = false;
			// if server was closed while attempting lock, immediately unlock and fail listen attempt
			if(this._cancelListenImmediately)
			{
				this._cancelListenImmediately = false;
				const onUnlock = () => {
					this._serverStarting = false;
					var error = new Error("server was manually closed");
					this.log("server was closed while attempting to open");
					this.emit('failure', error);
					this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
				};

				lockfile.unlock(lockfileName).then(() => {
					onUnlock();
				}).catch(() => {
					onUnlock();
				});
				return;
			}

			// create server
			this._serverStartTime = new Date().getTime();
			this.log("initializing server");
			var server = new WebSocket.Server({ port: port, host: host, path: path });

			// handle error
			server.on('error', (error) => {
				// error
				if(!this._serverListening)
				{
					// error occurred before the server started listening, so stop trying to listen.
					this.log("server initialization failed:");
					this.log(error);
					server.close(() => {
						const onUnlock = () => {
							this._serverStartTime = null;
							this._serverStarting = false;
							this.emit('failure', error);
							this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
						};

						lockfile.unlock(lockfileName).then(() => {
							onUnlock();
						}).catch((error) => {
							onUnlock();
						})
					});
				}
				else
				{
					// normal server error
					this.log("server error:");
					this.log(error);
					this.emit('error', error);
				}
			});

			// handle success
			server.on('listening', () => {
				// if server was closed while starting up, close immediately
				if(this._cancelListenImmediately)
				{
					this._cancelListenImmediately = false;
					server.close(() => {
						var error = new Error("server was manually closed");
						this._serverStartTime = null;
						this._serverStarting = false;
						this.emit('failure', error);
						this._internalEvents('listenAttemptFinish', { listening: false, error: error });
					});
					return;
				}
				// server is listening
				this._server = server;
				this._port = port;
				this._host = host;
				this._serverListening = true;
				this._serverStarting = false;
				this.log("server is listening at "+host+":"+port);
				this.emit('listening');
				this._internalEvents.emit('listenAttemptFinish', { listening: true, error: null });
			});

			// handle new socket
			server.on('connection', (socket, request) => {
				// connection opened
				socket.browsercmd = {
					type: 'socket',
					initialRequest: request
				};

				this.log("socket connected");

				// handle socket message
				socket.on('message', (data) => {
					var message = JSON.parse(data);
					if(message == null)
					{
						this.log("received bad message from "+socket.browsercmd.type+":");
						this.log(data);
						return;
					}
					switch(socket.browsercmd.type)
					{
						case 'socket':
							this._handleSocketMessage(socket, message);
							break;

						case 'controller':
							this._handleControllerMessage(socket, message);
							break;

						case 'client':
							this._handleClientMessage(socket, message);
							break;
					}
				});

				// handle socket close
				socket.on('close', (code, reason) => {
					if(reason)
					{
						this.log(socket.browsercmd.type+" disconnected: "+reason);
					}
					else
					{
						this.log(socket.browsercmd.type+" disconnected");
					}
					switch(socket.browsercmd.type)
					{
						case 'controller':
							this._handleControllerDisconnect(socket, code, reason);
							break;

						case 'client':
							this._handleClientDisconnect(socket, code, reason);
							break;
					}
					this.emit('socketDisconnect', { socket: socket });
				});

				// handle socket error
				socket.on('error', (error) => {
					this.log(socket.browsercmd.type+" error:");
					this.log(error);

					socket.close(4002, error.message);
				});

				// send event
				this.emit('socketConnect', { socket: socket });
			});
		}).catch((error) => {
			// lockfile attempt failed
			this._attemptingLock = false;
			this._serverStarting = false;
			this.log("server lockfile error:");
			this.log(error);
			this.emit('failure', error);
			this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
		});
	}

	verifyChromeConnectionRequest(request)
	{
		if(request.headers.origin != null && request.headers.origin.startsWith("chrome-extension://")
		&& request.connection.remoteAddress == '127.0.0.1' && request.headers['x-forwarded-for'] == null
		&& request.headers.host == this._host+':'+this._port)
		{
			return true;
		}
		return false;
	}

	verifyClientCredentials(username, key)
	{
		if(this._options.userKeys == null)
		{
			// if userKeys is null, let errebody in
			return true;
		}
		var userKey = this._options.userKeys[username];
		if(userKey == null)
		{
			return false;
		}
		else if(userKey !== key)
		{
			return false;
		}
		return true;
	}

	_handleSocketMessage(socket, message)
	{
		switch(message.type)
		{
			case 'register':
				if(!message.info)
				{
					socket.close(4001, "bad registration format");
					return;
				}
				switch(message.info.type)
				{
					case 'client':
						// register the client
						try
						{
							this._handleClientRegister(socket, message.info);
						}
						catch(error)
						{
							this.log("unable to register client: "+error.message);
							socket.close(4001, error.message);
							return;
						}
						this.log("registered client with username "+message.info.username);
						// send event
						this.emit('registerClient', { socket: socket });
						break;

					case 'controller':
						// register the controller
						try
						{
							this._handleControllerRegister(socket, message.info);
						}
						catch(error)
						{
							this.log("unable to register controller: "+error.message);
							socket.close(4001, error.message);
							return;
						}
						this.log("registered controller with browser "+socket.browsercmd.browser+" and identifier "+socket.browsercmd.identifier);
						// send event
						this.emit('registerController', { socket: socket });
						break;
				}
				break;

			default:
				this.log("message is not a supported socket greeting; closing socket");
				socket.close();
				break;
		}
	}

	_handleClientRegister(socket, info)
	{
		if(!this.verifyClientCredentials(info.username, info.key))
		{
			// bad credentials
			throw new Error("invalid credentials");
		}

		// set client properties
		socket.browsercmd.type = 'client';
		socket.browsercmd.username = info.username;

		// add client
		this._clients.push(socket);
	}

	_handleClientDisconnect(socket, code, reason)
	{
		// remove socket from clients
		var index = this._clients.indexOf(socket);
		if(index != -1)
		{
			this._clients.splice(index, 1);
		}

		// unsubscribe client from all events
		this.unsubscribeClientFromEvents(socket);

		// send event
		this.emit('unregisterClient', { socket: socket, code: code, reason: reason });
	}

	_handleClientMessage(socket, message)
	{
		this.log("received message from client:");
		this.log(message);

		switch(message.type)
		{
			case 'request':
				// validate request message format
				if(typeof message.requestId != 'number')
				{
					this.log("invalid request ID");
					this.sendClientError(socket, message.requestId, new Error("invalid request ID"));
					return;
				}
				else if(typeof message.content != 'object')
				{
					this.log("bad message content format");
					this.sendClientError(socket, message.requestId, new Error("bad message content format"));
					return;
				}
				else if(!message.target)
				{
					this.log("missing request target");
					this.sendClientError(socket, message.requestId, new Error("missing request target"));
					return;
				}
				// parse target
				var target = Target.parse(message.target);
				if(target == null)
				{
					this.log("invalid target");
					this.sendClientError(socket, message.requestId, new Error("invalid target"));
					return;
				}
				// determine message target
				switch(target.type)
				{
					case 'server':
						// handle server requests
						let responded = false;
						try
						{
							this.executeRequest(message.content, (response, error) => {
								if(error)
								{
									this.sendClientError(socket, message.requestId, error);
								}
								else
								{
									this.sendClientResponse(socket, message.requestId, response);
								}
								responded = true;
							});
						}
						catch(error)
						{
							this.log("uncaught exception:");
							this.log(error);
							if(!responded)
							{
								this.sendClientError(socket, message.requestId, error);
							}
						}
						break;

					case 'controller':
						// find controller
						var controllerSocket = this.getController(target);
						if(controllerSocket == null)
						{
							this.sendClientError(socket, message.requestId, new Error("browser is not connected"));
							return;
						}
						// forward message to controller
						this.sendControllerRequest(controllerSocket, message.content, (response, error) => {
							if(error)
							{
								this.sendClientError(socket, message.requestId, error);
							}
							else
							{
								this.sendClientResponse(socket, message.requestId, response);
							}
						});
						break;

					default:
						// tell client that we didn't have a valid request
						this.log("invalid target");
						this.sendClientError(socket, message.requestId, new Error("invalid request target"));
						break;
				}
				break;

			case 'subscribe':
				if(!message.target)
				{
					this.log("missing subscribe target");
					return;
				}
				// parse target
				var target = Target.parse(message.target);
				if(target == null)
				{
					this.log("invalid target");
					return;
				}
				// subscribe client
				try
				{
					this.subscribeClientToEvent(socket, target, message.eventPath);
				}
				catch(error)
				{
					this.log("error subscribing to event: "+error.message);
				}
				break;

			case 'unsubscribe':
				if(!message.target)
				{
					this.log("missing unsubscribe target");
					return;
				}
				// parse target
				var target = Target.parse(message.target);
				if(target == null)
				{
					this.log("invalid target");
					return;
				}
				// unsubsribe client
				try
				{
					this.unsubscribeClientFromEvent(socket, target, message.eventPath);
				}
				catch(error)
				{
					this.log("error unsubscribing from event: "+error.message);
				}
				break;

			case 'unsubscribeAll':
				try
				{
					this.unsubscribeClientFromEvents(socket, message.target);
				}
				catch(error)
				{
					this.log("error unsubscribing from events: "+error.message);
				}
				break;

			case undefined:
				this.log("bad message");
				this.log(message);
				break;

			default:
				this.log("unsupported message");
				this.log(message);
				break;
		}
	}

	_handleControllerRegister(socket, info)
	{
		// validate socket's initial request
		if(!this.verifyChromeConnectionRequest(socket.browsercmd.initialRequest))
		{
			throw new Error("invalid controller");
		}
		// ensure the controller is using a supported browser
		if(!supportedBrowsers.includes(info.browser))
		{
			throw new Error("unsupported browser");
		}
		// ensure there's no controller with a duplicate identifier connected
		if(info.identifier != null)
		{
			for(const controller of this._controllers)
			{
				if(controller.browsercmd.browser === info.browser && controller.browsercmd.identifier === info.identifier)
				{
					throw new Error("duplicate controller");
				}
			}
		}

		// set controller properties
		socket.browsercmd.type = 'controller';
		socket.browsercmd.browser = info.browser;
		socket.browsercmd.identifier = info.identifier;
		socket.browsercmd.getTarget = () => {
			return Target.fromParts(socket.browsercmd.type, socket.browsercmd.browser, socket.browsercmd.identifier);
		};

		// subscribe to matching event subscriptions
		for(const subscription of this._eventSubscriptions)
		{
			if(Target.equal(subscription.target, socket.browsercmd.getTarget()))
			{
				subscription.receiverSocket = socket;
				// subscribe controller to event
				this.sendControllerSubscribe(socket, subscription.eventPath);
			}
		}

		// add controller
		this._controllers.push(socket);
	}

	_handleControllerDisconnect(socket, code, reason)
	{
		// remove socket from controllers
		var index = this._controllers.indexOf(socket);
		if(index != -1)
		{
			this._controllers.splice(index, 1);
		}

		// create error
		var error = null;
		if(reason)
		{
			error = new Error("browser disconnected: "+reason);
		}
		else
		{
			error = new Error("browser disconnected");
		}

		// cancel pending requests
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.browserSocket == socket)
			{
				this._pendingRequests.splice(i, 1);
				i--;
				request.completion(null, error);
			}
		}

		// remove controller from matching event subscriptions
		for(const subscription of this._eventSubscriptions)
		{
			if(subscription.receiverSocket == socket)
			{
				subscription.receiverSocket = null;
			}
		}

		// send event
		this.emit('unregisterController', { socket: socket, code: code, reason: reason });
	}

	_handleControllerMessage(socket, message)
	{
		this.log("received message from "+socket.browsercmd.browser+":"+socket.browsercmd.identifier);
		this.log(message);

		switch(message.type)
		{
			case 'response':
				// validate response properties
				if(message.responseId == null)
				{
					this.log("bad response");
					return;
				}
				// forward response to client
				for(var i=0; i<this._pendingRequests.length; i++)
				{
					var request = this._pendingRequests[i];
					if(request.requestId == message.responseId)
					{
						this._pendingRequests.splice(i, 1);
						if(socket != request.browserSocket)
						{
							this.log("");
							this.log("");
							this.log("browser socket sending response does not match browser socket that received request. Possible hijacking?");
							this.log("requested socket:");
							this.log(request.browserSocket.browsercmd);
							this.log("responded socket:");
							this.log(socket.browsercmd);
							this.log("possible malicious message:");
							this.log(message);
							this.log("");
							this.log("");
							request.completion(null, new Error("responder does not match request target. Possible hijacking?"));
							socket.close();
							return;
						}
						if(message.success)
						{
							request.completion(message.content, null);
						}
						else
						{
							request.completion(message.content, new Error(message.error));
						}
						return;
					}
				}
				break;

			case 'event':
				// validate event properties
				if(!message.eventPath)
				{
					this.log("missing event path");
					return;
				}
				// forward event to client sockets
				for(const subscription of this._eventSubscriptions)
				{
					if(Target.equal(subscription.target, socket.browsercmd.getTarget()) && Introspect.pathsEqual(subscription.eventPath, message.eventPath))
					{
						// send event to subscribed clients
						var sender = Target.stringify(socket.browsercmd.getTarget());
						for(const clientSocket of subscription.clientSockets)
						{
							this.sendClientEvent(clientSocket, sender, message.eventPath, message.args);
						}
						break;
					}
				}
				break;

			default:
				// do nothing
				break;
		}
	}

	getController(target)
	{
		for(const controller of this._controllers)
		{
			if(Target.match(target, controller.browsercmd.getTarget()))
			{
				return controller;
			}
		}
		return null;
	}

	sendClientError(socket, responseId, error)
	{
		var response = {
			type: 'response',
			responseId: responseId,
			success: false,
			error: error.message
		};

		if(socket.readyState != 1)
		{
			this.log("ignoring error response received for client in non-ready state "+socket.readyState+":");
			this.log(response);
			return;
		}
		
		this.log("sending error response to client:");
		this.log(response);
		socket.send(JSON.stringify(response));
	}

	sendClientResponse(socket, responseId, message)
	{
		var response = {
			type: 'response',
			responseId: responseId,
			success: true,
			content: message
		};

		if(socket.readyState != 1)
		{
			this.log("ignoring response received for client in non-ready state "+socket.readyState+":");
			this.log(response);
			return;
		}

		this.log("sending response to client:");
		this.log(response);
		socket.send(JSON.stringify(response));
	}

	sendClientEvent(socket, sender, eventPath, args)
	{
		var event = {
			type: 'event',
			sender: sender,
			eventPath: eventPath,
			args: args
		};

		if(socket.readyState != 1)
		{
			this.log("ignoring event received for client in non-ready state "+socket.readyState+":");
			this.log(event);
			return;
		}

		this.log("sending event to client:");
		this.log(event);
		socket.send(JSON.stringify(event));
	}

	subscribeClientToEvent(socket, target, eventPath)
	{
		if(!(eventPath instanceof Array))
		{
			throw new Error("invalid event path");
		}

		// find existing subscription
		var subscription = null;
		for(const cmpSubscription of this._eventSubscriptions)
		{
			if(Target.equal(cmpSubscription.target, target) && Introspect.pathsEqual(eventPath, cmpSubscription.path))
			{
				// found the subscription
				subscription = cmpSubscription;
				break;
			}
		}

		// create new subscription if one doesn't exist
		if(subscription == null)
		{
			// create new subscription
			subscription = {
				target: Object.assign({}, target),
				eventPath: eventPath.slice(0),
				receiverSocket: null,
				clientSockets: []
			};
			// handle subscription target
			switch(target.type)
			{
				default:
				case 'server':
					throw new Error("unsupported event target");

				case 'controller':
					subscription.receiverSocket = this.getController(target);
					// subscribe to controller events
					if(subscription.receiverSocket != null)
					{
						this.sendControllerSubscribe(subscription.receiverSocket, eventPath);
					}
					break;
			}
			// add new subscription
			this._eventSubscriptions.push(subscription);
		}

		// add client socket to subscription
		subscription.clientSockets.push(socket);
	}

	unsubscribeClientFromEvent(socket, target, eventPath)
	{
		if(!(eventPath instanceof Array))
		{
			throw new Error("invalid event path");
		}
		this.unsubscribeClientFromEvents(socket, target, eventPath);
	}

	unsubscribeClientFromEvents(socket, target = null, eventPath = null)
	{
		// check every subscription
		for(var i=0; i<this._eventSubscriptions.length; i++)
		{
			var subscription = this._eventSubscriptions[i];
			// check if subscription matches target and event path
			if((target == null || Target.equal(subscription.target, target)) && (eventPath == null || Introspect.pathsEqual(subscription.eventPath, eventPath)))
			{
				// look for the client socket in this subscription
				var socketIndex = subscription.clientSockets.indexOf(socket);
				if(socketIndex !== -1)
				{
					// remove client socket
					subscription.clientSockets.splice(socketIndex, 1);
					if(subscription.clientSockets.length == 0)
					{
						// there aren't any client sockets left
						switch(subscription.target.type)
						{
							default:
							case 'server':
								throw new Error("unsupported event target");

							case 'controller':
								// unsubscribe from controller events
								if(subscription.receiverSocket != null)
								{
									this.sendControllerUnsubscribe(subscription.receiverSocket, subscription.eventPath)
								}
								break;
						}
						// remove subscription
						this._eventSubscriptions.splice(i, 1);
						i--;
					}
				}
				// stop if we're removing based on both event path AND target, because that means we've found the only matching subscription
				if(target != null && eventPath != null)
				{
					return;
				}
			}
		}
	}

	sendControllerRequest(socket, data, completion)
	{
		var requestId = this._requestIdCounter;
		this._requestIdCounter++;

		var request = {
			type: 'request',
			requestId: requestId,
			content: data,
		};

		// send request to controller
		this.log("sending message to controller:");
		this.log(request);
		socket.send(JSON.stringify(request));

		// wait for response
		this._pendingRequests.push({
			requestId: requestId,
			browserSocket: socket,
			completion: (response, error) => {
				if(completion)
				{
					completion(response, error);
				}
			}
		});
	}

	sendControllerSubscribe(socket, eventPath)
	{
		if(socket.readyState !== 1)
		{
			this.log("ignoring subscribe message for controller in non-ready state "+socket.readyState);
			return;
		}
		var message = {
			type: 'subscribe',
			eventPath: eventPath
		};
		socket.send(JSON.stringify(message));
	}

	sendControllerUnsubscribe(socket, eventPath)
	{
		if(socket.readyState !== 1)
		{
			this.log("ignoring unsubscribe message for controler in non-ready state "+socket.readyState);
			return;
		}
		var message = {
			type: 'unsubscribe',
			eventPath: eventPath
		};
		socket.send(JSON.stringify(message));
	}

	executeRequest(message, completion)
	{
		switch(message.command)
		{
			default:
				completion(null, new Error("invalid command "+message.command));
				break;

			case undefined:
				completion(null, new Error("No command specified"));
				break;
		}
	}

	close(completion)
	{
		if(this._attemptingLock || this._serverStarting)
		{
			// server is attempting to start. close server immediately after opening, and fail listen attempt
			this._cancelListenImmediately = true;
			if(completion)
			{
				this._internalEvents.once('listenAttemptFinish', () => {
					completion();
				});
			}
			return;
		}
		else if(!this._serverListening)
		{
			// server isn't even open
			if(completion)
			{
				completion();
			}
			return;
		}

		const onUnlock = (error) => {
			this._serverStartTime = null;
			this._server = null;
			this._serverListening = false;
			this._serverStarting = false;
			this._port = null;
			this._host = null;
			this._controllers = [];
			this._clients = [];

			this._requestIdCounter = 0;
			this._pendingRequests = [];

			this.emit('close');
			if(completion)
			{
				completion();
			}
		};

		// close server
		this._server.close(() => {
			var port = this._port;
			// unlock lockfile
			lockfile.unlock(lockfilePrefix+port).then(() => {
				onUnlock(null);
			}).catch((error) => {
				onUnlock(error);
			});
		});
	}
}


module.exports = BrowserBridgeServer;
