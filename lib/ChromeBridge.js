
const ChromeBridgeClient = require('./ChromeBridgeClient');
const ChromeBridgeServer = require('./ChromeBridgeServer');
const defaults = require('./defaults');

class ChromeBridge
{
	constructor()
	{
		this._client = null;
		this._server = null;

		this._options = {};
		/*
		{
			verbose: boolean,
			port: integer,
			connectTimeout: integer,
			chromeConnectTimeout: integer
		}
		*/
	}

	get client()
	{
		return this._client;
	}

	get server()
	{
		return this._server;
	}

	get port()
	{
		var port = this._options.port;
		if(!port)
		{
			port = defaults.PORT;
		}
		return;
	}

	set options(options)
	{
		if(!options)
		{
			options = {};
		}
		this._options = Object.assign({}, options);
	}

	get options()
	{
		return Object.assign({}, this._options);
	}

	log(...messages)
	{
		if(this._options.verbose)
		{
			console.error(...messages);
		}
	}

	startServerIfNeeded(completion)
	{
		// check if this server is already running and listening
		if(this._server != null && this._server.listening)
		{
			completion(null);
			return;
		}

		// check if any server is already running
		if(ChromeBridgeServer.isServerRunning(this.port))
		{
			completion(null);
			return;
		}

		// create server if one hasn't already been created
		if(this._server == null)
		{
			this.log("server is not running... starting temporary server");
			var serverOptions = {
				verbose: this._options.verbose,
				port: this.port
			};
			this._server = new ChromeBridgeServer(serverOptions);
		}

		// make server start listening
		this._server.listen((error) => {
			if(error)
			{
				this._server = null;
			}
			completion(error);
		});
	}

	connectServer(completion)
	{
		// create a client if one has not already been created
		if(this._client == null)
		{
			var clientOptions = {
				verbose: this._options.verbose,
				port: this.port,
				retryConnectTimeout: this._options.connectTimeout
			};
			this._client = new ChromeBridgeClient(clientOptions);
		}
		
		// connect client
		this._client.connect((error) => {
			if(error)
			{
				this._client = null;
			}
			completion(error);
		});
	}

	connectChrome(completion)
	{
		// connect to server
		this.connectServer((error) => {
			if(error)
			{
				completion(error);
				return;
			}

			// make sure a chrome client isn't already connected to the server
			if(this._client.connectedToChrome)
			{
				completion(null);
				return;
			}
			
			// wait for a chrome client to connect to the server
			this._client.waitForChrome({ timeout: this._options.chromeConnectTimeout }, (error) => {
				completion(error);
			});
		});
	}

	connect(completion)
	{
		// start a temporary server if necessary
		this.startServerIfNeeded((error) => {
			if(error)
			{
				if(completion)
				{
					completion(error);
				}
				return;
			}
			// connect to chrome
			this.connectChrome((error) => {
				if(completion)
				{
					completion(error);
				}
			});
		});
	}

	performChromeRequest(request, completion)
	{
		// connect to server / chrome
		this.connect((error) => {
			if(error)
			{
				if(completion)
				{
					completion(null, error);
				}
				return;
			}
			// send a request to the server to forward to chrome
			this._client.sendRequest('chrome', request, (response, error) => {
				if(completion)
				{
					completion(response, error);
				}
			});
		});
	}

	attemptChromeRequest(request, completion)
	{
		// ensure client is connected to the server
		if(this._client == null || !this._client.connected)
		{
			if(completion)
			{
				completion(null, new Error("client is not connected"));
			}
			return;
		}
		// ensure client is connected to chrome
		if(!this._client.connectedToChrome)
		{
			if(completion)
			{
				completion(null, new Error("chrome is not connected"));
			}
			return;
		}
		// send a request to the server to forward to chrome
		this._client.sendRequest('chrome', request, (response, error) => {
			if(completion)
			{
				completion(response, error);
			}
		});
	}

	getChromeAPI(completion)
	{
		this.connect((error) => {
			if(error)
			{
				completion(null, error);
				return;
			}
			this._client.getChromeAPI((chrome, error) => {
				completion(chrome, error);
			});
		});
	}

	close(completion)
	{
		// create close server function
		const closeServer = () => {
			// close server if necessary
			if(this._server != null)
			{
				this._server.close(() => {
					this._server = null;
					// call completion
					if(completion)
					{
						completion();
					}
				});
				return;
			}
			
			// call completion
			if(completion)
			{
				completion();
			}
		};

		// if no client, close the server
		if(this._client == null)
		{
			closeServer();
			return;
		}

		// close the client, then the server
		this._client.close(() => {
			closeServer();
		});
	}
}

module.exports = new ChromeBridge();
