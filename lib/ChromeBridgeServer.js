
const WebSocket = require('ws');
const EventEmitter = require('events');
const lockfile = require('process-lockfile');
const os = require('os');
const config = require('./config');

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

		this._options = options;
		/*
		{
			verbose: boolean,
			port: integer,
			host: string
		}
		*/

		this._serverStarting = false;
		this._serverStartTime = null;
		this._serverListening = false;
		this._server = null;
		this._port = null;
		this._host = null;
		this._chromeClients = [];
		this._clients = [];

		this._attemptingLock = false;
		this._unlockImmediately = false;

		this._requestIdCounter = 0;
		this._pendingRequests = [
			/*
			{
				requestId: integer,
				chromeClient: WebSocket,
				completion: function
			}
			*/
		];
	}

	_verboseLog(message)
	{
		if(this._options.verbose)
		{
			console.error(message);
		}
	}

	static isServerRunning(port)
	{
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

		

		// create server
		var port = this._options.port || config.PORT;
		var host = this._options.host || config.HOST;

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
			this._verboseLog("initializing server");
			var server = new WebSocket.Server({ port: port, host: host });

			// handle error
			server.on('error', (error) => {
				// error
				if(!this._serverListening)
				{
					// error occurred before the server started listening, so stop trying to listen.
					this._verboseLog("server initialization failed: "+error.message);
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
					this._verboseLog("server error: "+error.message);
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
				this._verboseLog("server is listening at "+host+":"+port);
				this.emit('listening');
				this.emit('listenAttemptFinish', { listening: true, error: null });
			});

			// handle new client
			server.on('connection', (client, request) => {
				// connection opened
				if(this._isConnectionRequestFromChromeController(request))
				{
					// chrome connection
					this._verboseLog("chrome client connected");

					// handle chrome message
					client.on('message', (data) => {
						var message = JSON.parse(data);
						if(message == null)
						{
							this._verboseLog("bad message from chrome client:");
							this._verboseLog(data);
							return;
						}
						this._handleChromeMessage(client, message);
					});

					// handle chrome close
					client.on('close', (code, reason) => {
						this._verboseLog("chrome client disconnected");

						this._handleChromeDisconnect(client);
						this.emit('chromeDisconnect', { socket: client });
					});

					// perform chrome connection logic and send event
					this._handleChromeConnect(client);
					this.emit('chromeConnect', { socket: client });
					return;
				}
				else
				{
					// client connection
					this._verboseLog("client connected");

					// handle client message
					client.on('message', (data) => {
						var message = JSON.parse(data);
						if(message == null)
						{
							this._verboseLog("bad message from client:");
							this._verboseLog(data);
							return;
						}
						this._handleClientMessage(client, message);
					});

					// handle client close
					client.on('close', (code, reason) => {
						this._verboseLog("client disconnected");

						this._handleClientDisconnect(client);
						this.emit('clientDisconnect', { socket: client });
					});

					// perform client connection logic and send event
					this._handleClientConnect(client);
					this.emit('clientConnect', { socket: client });
					return;
				}
			});
		}).catch((error) => {
			// lockfile attempt failed
			this._attemptingLock = false;
			this._serverStarting = false;
			this.emit('failure', error);
			this.emit('listenAttemptFinish', { listening: false, error: error });
		});
	}

	_isConnectionRequestFromChromeController(request)
	{
		if(request.headers.origin != null && request.headers.origin.startsWith("chrome-extension://")
		&& request.connection.remoteAddress == '127.0.0.1' && request.headers['x-forwarded-for'] == null
		&& request.headers.host == this._host+':'+this._port)
		{
			return true;
		}
		return false;
	}

	_handleClientConnect(client)
	{
		// add client to clients
		this._clients.push(client);

		if(this._chromeClients.length > 0)
		{
			const event = {
				chromeCount: this._chromeClients.length
			};
			this.broadcastServerEvent('chromeConnect', event);
		}
	}

	_handleClientDisconnect(client)
	{
		// remove client from clients
		var index = this._clients.indexOf(client);
		if(index != -1)
		{
			this._clients.splice(index, 1);
		}
	}

	_handleClientMessage(client, message)
	{
		this._verboseLog("received message from client");
		this._verboseLog(message);

		switch(message.type)
		{
			case 'request':
				// validate request message format
				if(typeof message.requestId != 'number')
				{
					this._verboseLog("invalid request ID");
					this.sendError(client, message.requestId, new Error("invalid request ID"));
					return;
				}
				else if(typeof message.content != 'object')
				{
					this._verboseLog("bad message content format");
					this.sendError(client, message.requestId, new Error("bad message content format"));
					return;
				}

				// determine message recipient
				switch(message.recipient)
				{
					case 'server':
						// handle server requests
						let responded = false;
						try
						{
							this.executeRequest(message.content, (response, error) => {
								if(error)
								{
									this.sendError(client, message.requestId, error);
								}
								else
								{
									this.sendResponse(client, message.requestId, response);
								}
								responded = true;
							});
						}
						catch(error)
						{
							this._verboseLog("uncaught exception:");
							this._verboseLog(error);
							if(!responded)
							{
								this.sendError(client, message.requestId, error);
							}
						}
						break;

					case 'chrome':
						// forward message to chrome extension
						this.sendChromeMessage(message.content, (response, error) => {
							if(error)
							{
								this.sendError(client, message.requestId, error);
							}
							else
							{
								this.sendResponse(client, message.requestId, response);
							}
						});
						break;

					default:
						// tell client that we didn't have a valid recipient
						this._verboseLog("invalid recipient");
						this.sendError(client, message.requestId, new Error("invalid request recipient"));
						break;
				}
				break;

			case undefined:
				this._verboseLog("bad message");
				this._verboseLog(message);
				break;

			default:
				this._verboseLog("unsupported message");
				this._verboseLog(message);
				break;
		}
	}

	_handleChromeConnect(chromeClient)
	{
		// add client to chrome clients
		this._chromeClients.push(chromeClient);

		const event = {
			chromeCount: this._chromeClients.length
		};
		this.broadcastServerEvent('chromeConnect', event);
	}

	_handleChromeDisconnect(chromeClient)
	{
		// remove client from chrome clients
		var index = this._chromeClients.indexOf(chromeClient);
		if(index != -1)
		{
			this._chromeClients.splice(index, 1);
		}

		// cancel pending requests
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.chromeClient == chromeClient)
			{
				this._pendingRequests.splice(i, 1);
				i--;
				request.completion(null, new Error("chrome disconnected"));
			}
		}

		const event = {
			chromeCount: this._chromeClients.length
		};
		this.broadcastServerEvent('chromeDisconnect', event);
	}

	_handleChromeMessage(chromeClient, message)
	{
		this._verboseLog("received response from chrome:");
		this._verboseLog(message);

		if(message.responseId === undefined)
		{
			this._verboseLog("bad response");
			return;
		}
		// forward response to client
		for(var i=0; i<this._pendingRequests.length; i++)
		{
			var request = this._pendingRequests[i];
			if(request.requestId == message.responseId)
			{
				this._pendingRequests.splice(i, 1);
				if(chromeClient != request.chromeClient)
				{
					this._verboseLog("");
					this._verboseLog("");
					this._verboseLog("chrome client sending response does not match chrome client that received request. Possible hijacking?");
					this._verboseLog("requested client:");
					this._verboseLog(request.chromeClient);
					this._verboseLog("responded client:");
					this._verboseLog(chromeClient);
					this._verboseLog("possible malicious message:");
					this._verboseLog(message);
					this._verboseLog("");
					this._verboseLog("");
					request.completion(null, new Error("responder does not match request recipient. Possible hijacking?"));
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
	}

	sendError(client, responseId, error)
	{
		if(!this._clients.includes(client))
		{
			this._verboseLog("ignoring error received for disconnected client:");
			this._verboseLog(error);
			return;
		}
		var response = {
			type: 'response',
			responseId: responseId,
			success: false,
			error: error.message
		};
		this._verboseLog("sending error response to client:");
		this._verboseLog(response);
		client.send(JSON.stringify(response));
	}

	sendResponse(client, responseId, message)
	{
		if(!this._clients.includes(client))
		{
			this._verboseLog("ignoring response received for disconnected client:");
			this._verboseLog(message);
			return;
		}
		var response = {
			type: 'response',
			responseId: responseId,
			success: true,
			content: message
		};
		this._verboseLog("sending response to client:");
		this._verboseLog(response);
		client.send(JSON.stringify(response));
	}

	broadcastServerEvent(event, message)
	{
		for(const client of this._clients)
		{
			this.sendServerEvent(client, event, message);
		}
	}

	sendServerEvent(client, event, message)
	{
		var eventData = {
			type: 'serverEvent',
			event: event,
			content: message
		};
		client.send(JSON.stringify(eventData));
	}

	sendChromeMessage(message, completion)
	{
		if(this._chromeClients.length == 0)
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

		this._verboseLog("sending message to chrome:");
		this._verboseLog(request);

		var chromeClient = this._chromeClients[0];
		chromeClient.send(JSON.stringify(request));

		this._pendingRequests.push({
			requestId: requestId,
			chromeClient: chromeClient,
			completion: (response, error) => {
				completion(response, error);
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
			this._chromeClients = [];
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
