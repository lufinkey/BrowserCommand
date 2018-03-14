
const WebSocket = require('ws');
const EventEmitter = require('events');
const lockfile = require('process-lockfile');
const os = require('os');
const Introspect = require('./Introspect');
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
			logPrefix: string,
			port: integer,
			host: string,
			path: string,
			userKeys: { username : key },
			identifiers: [<string>]
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
			if(this._options.logPrefix)
			{
				console.error(this._options.logPrefix, ...messages);
			}
			else
			{
				console.error(...messages);
			}
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

	listen()
	{
		return new Promise((resolve, reject) => {
			if(this._serverListening)
			{
				resolve();
				return;
			}
			// resolve or reject the promise when the listening attempt finishes
			this._internalEvents.once('listenAttemptFinish', (event) => {
				if(event.listening)
				{
					resolve();
				}
				else
				{
					reject(event.error);
				}
			});
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
						this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
						this.emit('failure', error);
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
								this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
								this.emit('failure', error);
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
							this._internalEvents('listenAttemptFinish', { listening: false, error: error });
							this.emit('failure', error);
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
					this._internalEvents.emit('listenAttemptFinish', { listening: true, error: null });
					this.emit('listening');
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
				this._internalEvents.emit('listenAttemptFinish', { listening: false, error: error });
				this.emit('failure', error);
			});
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
		if(this._options.userKeys == null || Object.keys(this._options.userKeys).length == 0)
		{
			// if userKeys is empty, let errebody in
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

	verifyControllerIdentifier(identifier)
	{
		if(info.identifier != null)
		{
			// ensure there's no controller with a duplicate identifier connected
			for(const controller of this._controllers)
			{
				if(controller.browsercmd.identifier === info.identifier)
				{
					return false;
				}
			}
		}

		if(this._options.identifiers && this._options.identifiers.length > 0)
		{
			// ensure the identifier is allowed to connect
			for(const cmpId of this._options.identifiers)
			{
				if(identifier === cmpId)
				{
					return true;
				}
			}
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
		// send event
		this.emit('registerClient', { username: socket.browsercmd.username, socket: socket });
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
		this.emit('unregisterClient', { username: socket.browsercmd.username, socket: socket, code: code, reason: reason });
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
				// find controller
				var controllerSocket = this.getControllerSocket(message.target);
				if(controllerSocket == null)
				{
					this.sendClientError(socket, message.requestId, new Error("browser is not connected"));
					return;
				}
				// forward message to controller
				this.sendControllerRequest(controllerSocket, message.content).then((response) => {
					// send response
					this.sendClientResponse(socket, message.requestId, response);
				}).catch((error) => {
					// send error
					this.sendClientError(socket, message.requestId, error);
				});
				break;

			case 'subscribe':
				// subscribe client
				try
				{
					this.subscribeClientToEvent(socket, message.target, message.eventPath);
				}
				catch(error)
				{
					this.log("error subscribing to event: "+error.message);
				}
				break;

			case 'unsubscribe':
				// unsubsribe client
				try
				{
					this.unsubscribeClientFromEvent(socket, message.target, message.eventPath);
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
		/*// validate socket's initial request
		if(!this.verifyChromeConnectionRequest(socket.browsercmd.initialRequest))
		{
			throw new Error("invalid controller");
		}*/
		// ensure the controller is using a supported browser
		if(!supportedBrowsers.includes(info.browser))
		{
			throw new Error("unsupported browser");
		}
		// prevent undefined from fucking shit up
		if(!info.identifier)
		{
			info.identifier = null;
		}
		if(!this.verifyControllerIdentifier(info.identifier))
		{
			throw new Error("invalid credentials");
		}

		// set controller properties
		socket.browsercmd.type = 'controller';
		socket.browsercmd.browser = info.browser;
		socket.browsercmd.identifier = info.identifier;

		// resubscribe to controller events
		for(const subscription of this._eventSubscriptions)
		{
			if(subscription.target === socket.browsercmd.identifier)
			{
				subscription.receiverSocket = socket;
				// subscribe controller to event
				this.sendControllerSubscribe(socket, subscription.eventPath);
				break;
			}
		}

		// add controller
		this._controllers.push(socket);
		// send event
		this.emit('registerController', { identifier: socket.browsercmd.identifier, socket: socket });
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
				request.reject(error);
			}
		}

		// remove controller from subscribed events
		for(const subscription of this._eventSubscriptions)
		{
			if(subscription.receiverSocket == socket)
			{
				subscription.receiverSocket = null;
			}
		}

		// send event
		this.emit('unregisterController', { identifier: socket.browsercmd.identifier, socket: socket, code: code, reason: reason });
	}

	_handleControllerMessage(socket, message)
	{
		this.log("received message from browser with identifier "+socket.browsercmd.identifier);
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
							request.reject(new Error("responder does not match request target. Possible hijacking?"));
							socket.close();
							return;
						}
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
				// validate event properties
				if(!message.eventPath)
				{
					this.log("missing event path");
					return;
				}
				// forward event to client sockets
				for(const subscription of this._eventSubscriptions)
				{
					if(subscription.receiverSocket === socket && Introspect.pathsEqual(subscription.eventPath, message.eventPath))
					{
						// send event to subscribed clients
						for(const clientSocket of subscription.clientSockets)
						{
							this.sendClientEvent(clientSocket, subscription.target, message.eventPath, message.args);
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

	getControllerSocket(target)
	{
		for(const controller of this._controllers)
		{
			if(target === controller.browsercmd.identifier)
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
			if(target === cmpSubscription.target && Introspect.pathsEqual(eventPath, cmpSubscription.eventPath))
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
				target: target,
				eventPath: eventPath.slice(0),
				receiverSocket: null,
				clientSockets: []
			};
			// get subscription controller
			subscription.receiverSocket = this.getControllerSocket(target);
			// subscribe to controller events
			if(subscription.receiverSocket != null)
			{
				this.sendControllerSubscribe(subscription.receiverSocket, eventPath);
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

	unsubscribeClientFromEvents(socket, target, eventPath)
	{
		// check every subscription
		for(var i=0; i<this._eventSubscriptions.length; i++)
		{
			var subscription = this._eventSubscriptions[i];
			// check if subscription matches target and event path
			if((target === undefined || target === subscription.target) && (eventPath === undefined || Introspect.pathsEqual(subscription.eventPath, eventPath)))
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
						// unsubscribe from controller events
						if(subscription.receiverSocket != null)
						{
							this.sendControllerUnsubscribe(subscription.receiverSocket, subscription.eventPath)
						}
						// remove subscription
						this._eventSubscriptions.splice(i, 1);
						i--;
					}
				}
				// stop if we're removing based on both event path AND target, because that means we've found the only matching subscription
				if(target !== undefined && eventPath !== undefined)
				{
					return;
				}
			}
		}
	}

	sendControllerRequest(socket, data)
	{
		let requestId = null;

		const promise = new Promise((resolve, reject) => {
			// ensure socket is connected
			if(socket.readyState != 1)
			{
				this.log("ignoring request received for controller in non-ready state "+socket.readyState+":");
				this.log(data);
				reject(new Error("browser is not connected"));
				return;
			}

			// get request ID
			requestId = this._requestIdCounter;
			this._requestIdCounter++;

			// create request
			var request = {
				type: 'request',
				requestId: requestId,
				content: data,
			};

			// send request to controller
			this.log("sending message to controller:");
			this.log(request);
			try
			{
				socket.send(JSON.stringify(request));
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
				browserSocket: socket,
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
		this.log("sending subscribe message to controller "+socket.browsercmd.identifier+":");
		this.log(message);
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
		this.log("sending unsubscribe message to controller "+socket.browsercmd.identifier+":");
		this.log(message);
		socket.send(JSON.stringify(message));
	}

	close()
	{
		return new Promise((resolve, reject) => {
			if(this._attemptingLock || this._serverStarting)
			{
				// server is attempting to start. close server immediately after opening, and fail listen attempt
				this._cancelListenImmediately = true;
				this._internalEvents.once('listenAttemptFinish', (event) => {
					this._cancelListenImmediately = false;
					if(event.listening)
					{
						// if still listening, try to close again
						this.close().then(resolve).catch(reject);
					}
					else
					{
						resolve();
					}
				});
				return;
			}
			else if(!this._serverListening)
			{
				// server isn't even open
				resolve();
				return;
			}

			const onUnlock = (error) => {
				var server = this._server;
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

				if(server != null)
				{
					this.emit('close');
				}
				resolve();
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
		});
	}
}


module.exports = BrowserBridgeServer;
