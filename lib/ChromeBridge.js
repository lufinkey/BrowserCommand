
const ChromeBridgeClient = require('./ChromeBridgeClient');
const ChromeBridgeServer = require('./ChromeBridgeServer');
const config = require('./config');

class ChromeBridge
{
	constructor()
	{
		this._client = null;
		this._server = null;
		this._options = {};
	}

	setOptions(options)
	{
		if(!options)
		{
			options = {};
		}
		this._options = options;
	}

	_verboseLog(message)
	{
		if(this._options.verbose)
		{
			console.error(message);
		}
	}

	startServerIfNeeded(completion)
	{
		var port = this._options.port;
		if(!port)
		{
			port = config.PORT;
		}

		// check if this server is already running and listening
		if(this._server != null && this._server.listening)
		{
			completion(null);
			return;
		}

		// check if any server is already running
		if(ChromeBridgeServer.isServerRunning(port))
		{
			completion(null);
			return;
		}

		// create server if one hasn't already been created
		if(this._server == null)
		{
			this._verboseLog("server is not running... starting temporary server");
			this._server = new ChromeBridgeServer({ port: this._options.port, verbose: this._options.verbose });
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
				port: this._options.port,
				verbose: this._options.verbose,
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

	performChromeRequest(request, completion)
	{
		// start a server from this program if necessary
		this.startServerIfNeeded((error) => {
			if(error)
			{
				if(completion)
				{
					completion(null, error);
				}
				return;
			}
			// connect to a chrome client
			this.connectChrome((error) => {
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
