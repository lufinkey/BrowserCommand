
const ChromeBridgeClient = require('./ChromeBridgeClient');
const ChromeBridgeServer = require('./ChromeBridgeServer');
const config = require('./config');

class ChromeBridge
{
	constructor()
	{
		this._client = null;
		this._chromeConnected = false;
		this._server = null;
		this._serverListening = false;
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

	startServerIfNeeded(completion)
	{
		var port = this._options.port;
		if(!port)
		{
			port = config.PORT;
		}

		if(this._server != null && this._server.listening)
		{
			completion(null);
			return;
		}

		if(ChromeBridgeServer.isServerRunning(port))
		{
			completion(null);
			return;
		}

		if(this._server != null)
		{
			this._server.once('listenAttemptFinish', (event) => {
				completion(event.error);
			});
			return;
		}

		this._server = new ChromeBridgeServer({ port: port });
		this._server.listen((error) => {
			completion(error);
		});
	}

	connectServer(completion)
	{
		if(this._client === null)
		{
			var clientOptions = {
				verbose: this._options.verbose,
				retryConnectTimeout: this._options.connectTimeout
			};
			this._client = new ChromeBridgeClient(clientOptions);
		}
		this._client.connect((error) => {
			completion(error);
		});
	}

	connectChrome(completion)
	{
		if(this._chromeConnected)
		{
			completion(null);
			return;
		}
		this.connectServer((error) => {
			if(error)
			{
				completion(error);
				return;
			}
			this._client.waitForChrome({ timeout: this._options.chromeConnectTimeout }, (error) => {
				if(!error)
				{
					this._chromeConnected = true;
				}
				completion(error);
			});
		});
	}

	performChromeRequest(request, completion)
	{
		this.startServerIfNeeded((error) => {
			if(error)
			{
				if(completion)
				{
					completion(null, error);
				}
				return;
			}
			this.connectChrome((error) => {
				if(error)
				{
					if(completion)
					{
						completion(null, error);
					}
					return;
				}
				this._client.sendRequest(null, request, (response, error) => {
					if(completion)
					{
						completion(response, error);
					}
				});
			});
		});
	}
}

module.exports = new ChromeBridge();
