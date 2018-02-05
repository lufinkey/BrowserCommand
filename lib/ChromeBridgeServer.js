
const WebSocket = require('ws');
const EventEmitter = require('events');
const lockfile = require('process-lockfile');
const os = require('os');
const defaults = require('./defaults');

const lockfilePrefix = os.tmpdir()+'/chrome-cmd-lock-';

class ChromeBridgeServer extends EventEmitter
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
			path: string,
			userKeys: { username : key }
		}
		*/

		this._serverStarting = false;
		this._serverStartTime = null;
		this._serverListening = false;
		this._server = null;
		this._port = null;
		this._host = null;
		this._controllers = [];
		this._clients = [];

		this._attemptingLock = false;
		this._unlockImmediately = false;

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
			this.once('listenAttemptFinish', (event) => {
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
			if(this._unlockImmediately)
			{
				this._unlockImmediately = false;
				const onUnlock = () => {
					this._serverStarting = false;
					var error = new Error("server was manually closed");
					this.log("server was closed while attempting to open");
					this.emit('failure', error);
					this.emit('listenAttemptFinish', { listening: false, error: error });
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
							this.emit('listenAttemptFinish', { listening: false, error: error });
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
				// server is listening
				this._server = server;
				this._port = port;
				this._host = host;
				this._serverListening = true;
				this._serverStarting = false;
				this.log("server is listening at "+host+":"+port);
				this.emit('listening');
				this.emit('listenAttemptFinish', { listening: true, error: null });
			});

			// handle new client
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
			this.emit('listenAttemptFinish', { listening: false, error: error });
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
		this.log("received message from socket:");
		this.log(message);

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
					case 'controller':
						if(!this.verifyChromeConnectionRequest(socket.browsercmd.initialRequest))
						{
							// initial request doesn't match an expected chrome request
							socket.close();
							return;
						}
						// ensure there's no controller with a duplicate identifier connected
						if(message.info.identifier != null)
						{
							for(const controller of this._controllers)
							{
								if(controller.browsercmd.identifier == message.info.identifier)
								{
									// there's another controller with this identifier connected. close the new one.
									socker.close();
									return;
								}
							}
						}
						// register the controller
						socket.browsercmd.type = 'controller';
						socket.browsercmd.identifier = message.info.identifier;
						this._controllers.push(socket);
						this.log("registered controller with identifier "+message.info.identifier);
						// send event
						this.emit('registerController', { socket: socket });
						break;

					case 'client':
						if(!this.verifyClientCredentials(message.info.username, message.info.key))
						{
							// bad credentials
							this.log("bad registration credentials");
							socket.close(4001, "invalid credentials");
							return;
						}
						// register the client
						socket.browsercmd.type = 'client';
						socket.browsercmd.username = message.info.username;
						this._clients.push(socket);
						this.log("registered client with username "+message.info.username);
						// send event
						this.emit('registerClient', { socket: socket });
						break;
				}
				break;

			default:
				this.log("message is not a supported socket greeting; closing socket");
				socket.close();
				break;
		}
	}

	_handleClientDisconnect(socket, code, reason)
	{
		// remove socket from clients
		var index = this._clients.indexOf(socket);
		if(index != -1)
		{
			this._clients.splice(index, 1);
		}

		// send event
		this.emit('unregisterClient', { socket: socket, code: code, reason: reason });
	}

	_handleClientMessage(socket, message)
	{
		this.log("received message from client:");
		this.log(message);

		// determine message recipient
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

				// determine message recipient

				if(message.recipient == 'server')
				{
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
					return;
				}

				var matches = new RegExp('^chrome(?::(.*))?$');
				if(matches != null)
				{
					// handle chrome request
					var chromeId = matches[1];
					// forward message to chrome extension
					this.sendChromeMessage(chromeId, message.content, (response, error) => {
						if(error)
						{
							this.sendClientError(socket, message.requestId, error);
						}
						else
						{
							this.sendClientResponse(socket, message.requestId, response);
						}
					});
					return;
				}

				// tell client that we didn't have a valid recipient
				this.log("invalid recipient");
				this.sendClientError(socket, message.requestId, new Error("invalid request recipient"));
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
			error = new Error("chrome disconnected: "+reason);
		}
		else
		{
			error = new Error("chrome disconnected");
		}

		// cancel pending requests
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.chromeSocket == socket)
			{
				this._pendingRequests.splice(i, 1);
				i--;
				request.completion(null, error);
			}
		}

		// send event
		this.emit('unregisterController', { socket: socket, code: code, reason: reason });
	}

	_handleControllerMessage(socket, message)
	{
		switch(message.type)
		{
			case 'response':
				this.log("received response from chrome:");
				this.log(message);

				if(message.responseId === undefined)
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
						if(socket != request.chromeSocket)
						{
							this.log("");
							this.log("");
							this.log("chrome client sending response does not match chrome client that received request. Possible hijacking?");
							this.log("requested socket:");
							this.log(request.chromeSocket.browsercmd);
							this.log("responded socket:");
							this.log(socket.browsercmd);
							this.log("possible malicious message:");
							this.log(message);
							this.log("");
							this.log("");
							request.completion(null, new Error("responder does not match request recipient. Possible hijacking?"));
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

			default:
				// do nothing
				break;
		}
	}

	sendClientError(socket, responseId, error)
	{
		if(socket.readyState != 1)
		{
			this.log("ignoring error received for client in non-ready state "+socket.readyState+":");
			this.log(error);
			return;
		}
		var response = {
			type: 'response',
			responseId: responseId,
			success: false,
			error: error.message
		};
		this.log("sending error response to client:");
		this.log(response);
		socket.send(JSON.stringify(response));
	}

	sendClientResponse(socket, responseId, message)
	{
		if(socket.readyState != 1)
		{
			this.log("ignoring response received for client in non-ready state "+socket.readyState+":");
			this.log(message);
			return;
		}
		var response = {
			type: 'response',
			responseId: responseId,
			success: true,
			content: message
		};
		this.log("sending response to client:");
		this.log(response);
		socket.send(JSON.stringify(response));
	}

	broadcastServerEvent(event, message)
	{
		for(const socket of this._clients)
		{
			if(socket.readyState != 1)
			{
				this.log("ignoring server event received for non-connected client:");
				this.log(message);
				continue;
			}
			this.sendServerEvent(socket, event, message);
		}
	}

	sendServerEvent(socket, event, message)
	{
		var eventData = {
			type: 'serverEvent',
			event: event,
			content: message
		};
		socket.send(JSON.stringify(eventData));
	}

	sendChromeMessage(chromeId, message, completion)
	{
		if(this._controllers.length == 0)
		{
			completion(null, new Error("chrome extension is not connected"));
			return;
		}

		var requestId = this._requestIdCounter;
		this._requestIdCounter++;

		var request = {
			type: 'request',
			requestId: requestId,
			content: message,
		};

		this.log("sending message to chrome:");
		this.log(request);

		var chromeSocket = this._controllers[0];
		chromeSocket.send(JSON.stringify(request));

		this._pendingRequests.push({
			requestId: requestId,
			chromeSocket: chromeSocket,
			completion: (response, error) => {
				if(completion)
				{
					completion(response, error);
				}
			}
		});
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
		if(this._attemptingLock)
		{
			// server is attempting to start. close lockfile immediately after opening, and fail listen attempt
			this._unlockImmediately = true;
			if(completion)
			{
				this.once('listenAttemptFinish', () => {
					completion();
				});
			}
			return;
		}
		else if(this._serverStarting)
		{
			setTimeout(() => {
				this.close(completion);
			}, 0);
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

		this._server.close(() => {
			var port = this._port;
			lockfile.unlock(lockfilePrefix+port).then(() => {
				onUnlock(null);
			}).catch((error) => {
				onUnlock(error);
			});
		});
	}
}

module.exports = ChromeBridgeServer;
