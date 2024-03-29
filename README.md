# Browser Command

Control any [webextension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions)-supported browser from nodejs or the terminal, using web sockets.

![Icon](extension/icon256.png)

<sub>*Icon by [Patrick Zopff](https://www.instagram.com/pity_xerox/)*</sub>

This toolset gives you access to [Google Chrome](https://developer.chrome.com/extensions/api_index), [Firefox](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API), and [Microsoft Edge](https://docs.microsoft.com/en-us/microsoft-edge/extensions/api-support/supported-apis)'s internal javascript APIs. They can be used from the command line, or from any node app.

For example, the following command creates a new tab with a url of [http://www.staggeringbeauty.com](http://www.staggeringbeauty.com):

```bash
browser-cmd tab create staggeringbeauty.com
```

This project is a fork/rewrite of [chromix-too](https://github.com/smblott-github/chromix-too), with a focus on added security, a wider command line interface, and a better javascript API.



## Setup

Browser Command has 3 components: a server, a client (eg. the [CLI](#command-line-api-reference)), and a browser extension.

**server** - listens for connections from either the client or the browser extension, and routes messages between them.

**client** - connects to the server and sends commands to be routed to the browser extension.

**browser extension** - continuously attempts to connect to the server. When connected, it waits for commands and performs them when received.

You can install the cli to manage these components:

```bash
npm install -g browser-cmd
```

You can also install it as a library to use within your own project:

```bash
npm install --save browser-cmd
```

You'll need to install the browser extension to the browser that you want to control. On Google Chrome, you can install the extension from the [Web Store](https://chrome.google.com/webstore/detail/browser-command/lbkjnllkflgclnghklcpelkeegcfcojn).

Then you need to start the server:

```bash
browser-cmd-server
```

Then you can query the tabs of the running browser:

```bash
browser-cmd tab get all
```

(*Linux* only) The server can also be installed and run as a startup service:

```bash
# install the service
sudo browser-cmd service install
# enable the service to run at startup
sudo browser-cmd service enable
# start the service
sudo browser-cmd service start
```

#### Javascript

In javascript, you can connect to the running browser with the **Client** object:

```javascript
const { Client } = require('browser-cmd');

var client = new Client();
client.connect().then(() => {
	// successfully connected to the server
	console.log("connected to the server");
}).catch((error) => {
	// connection failed
	console.error(error.message);
});
```

Once connected, you can get a local `browser` proxy object that functions almost exactly like the browser's [internal javascript API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API) (A [polyfill](https://github.com/mozilla/webextension-polyfill) is used in Google Chrome to mimic the webextension standard):

```javascript
client.getBrowserAPI().then((browser) => {
	// query a list of the open windows
	browser.windows.getAll().then((windows) => {
		// successfully got windows
		console.log(windows);
	}).catch((error) => {
		// failed to get windows
		console.error(error.message);
	});
}).catch((error) => {
	// failed to get browser API
	console.error(error.message);
});
```

You can even subscribe to events with the `browser` object:

```javascript
// Listen for a window being created
browser.windows.onCreated.addListener((window) => {
	console.log("a window was created:");
	console.log(window);
});
```



## Security

If usernames are specified in the **allowUsers** property of the [config file](#config), the server generates key files in the home directories of each of the allowed users, readable only by that user. When the cli sends messages to the server, it needs to read that key file authenticate it with the server. The server must be run as *root* in order to be able to generate the key files.



---



## Command Line API Reference

### browser-cmd

```bash
browser-cmd [--verbose] [--port=<port>] [--target=<identifier>] [--tmp-server] <command> [<args>]
```

#### Options

- **--verbose**

	Show as much information as possible.

- **--port**=\<port>

	Set the port to use to connect to the server. Defaults to 41904.

- **--target**=\<identifier>

	Specify the identifier of the browser to connect to. By default, the client will connect to the first browser extension with no identifier. The identifier can be set from the popup menu of the browser extension.

- **--tmp-server**

	If no server is running, start a temporary server to facilitate the browser connection.

#### Commands

The `browser-cmd` executable takes a variety of commands:

- **build-webext** [\<path>]

	Builds an unpacked browser extension at the specified path. If no path is given, it builds the extension to `browser-cmd.webextension` in the current working directory.

- **service** \<command>

	Manages running the server as a background service. This command currently only works on *Linux*.
	
	- **install**
	
		Installs the server as a system service. Requires *root*.
	
	- **uninstall**
	
		Uninstalls the server system service. Requires *root*.
	
	- **enable**
	
		Enables the service to run on startup. Requires *root*.
	
	- **disable**
	
		Disables the service from running on startup. Requires *root*.
	
	- **start**
	
		Starts the service. Requires *root*.
	
	- **stop**
	
		Stops the service. Requires *root*.
	
	- **restart**
	
		Restarts the service. Requires *root*.

	- **status**
	
		Queries the status of the service.

- **window** \<command> [\<args>]

	Manages the browser windows. Most of the sub-commands take a *selector* to query certain windows. Valid selectors are a window ID, **all**, **current**, **lastfocused**, **focused**, and **incognito**.
	
	- **get** *selector*...
	
		Queries general information about the specified windows.
	
	- **create** [--url=\<url>|-u \<url>]... [--left=\<integer>] [--top=\<integer>] [--width=\<integer>] [--height=\<integer>] [--focused] [--incognito] [--type=\<type>] [--state=\<state>]
	
		Creates a new browser window with optional settings.
	
		- **--url**=\<url>

			A url to open as a tab in the new window.

		- **--left**=\<integer>

			The x coordinate of the new window, in pixels from the left edge of the screen.

		- **--top**=\<integer>

			The y coordinate of the new window, in pixels from the top edge of the screen.

		- **--width**=\<integer>

			The width of the new window, in pixels.

		- **--height**=\<integer>

			The height of the new window, in pixels.
		
		- **--focused**
		
			Make the new window an active window
		
		- **--incognito**
		
			Make the new window an incognito window
		
		- **--type**=\<type>
		
			Set the type of window to create. Valid types are **normal**, **popup**, or **panel**.
		
		- **--state**=\<state>
		
			Set the state of the new window. Valid states are **normal**, **minimized**, **maximized**, or **fullscreen**.

	- **update** *selector*... [--left=\<integer>] [--top=\<integer>] [--width=\<integer>] [--height=\<integer>] [--focused] [--attention] [--state=\<state>]

		Updates the properties of the specified windows.
		
		- **--left**=\<integer>
		
			Set the x coordinate of the window(s), in pixels from the left edge of the screen.
		
		- **--top**=\<integer>
		
			Set the y coordinate of the window(s), in pixels from the top edge of the screen.
		
		- **--width**=\<integer>
		
			Set the width of the window(s), in pixels.
		
		- **--height**=\<integer>
		
			Set the height of the window(s), in pixels.
		
		- **--focused**=true|false
		
			Sets the focus state of the specified windows. Fails if multiple windows are focused.
		
		- **--attention**
		
			Draw the user's attention to the specified window. Fails if multiple windows are specified.
		
		- **--state**=\<state>
		
			Set the new state of the specified window(s). Valid states are **normal**, **minimized**, **maximized**, or **fullscreen**.
	
	- **remove** *selector*...
	
		Closes the specified windows.

- **tab** \<command> [\<args>]

	Manages the browser tabs. Most of the sub-commands take a *selector* to query certain tabs. Valid selectors are a tab ID, a [URL pattern](https://developer.chrome.com/extensions/match_patterns), **all**, **current**, **active**, **pinned**, **audible**, **muted**, **highlighted**, and **discarded**.

	- **get** *selector*...
	
		Queries general information about the specified tabs.
	
	- **query** [--active] [--pinned] [--audible] [--muted] [--highlighted] [--discarded] [--auto-discardable] [--current-window] [--last-focused-window] [--status=\<status>] [--title=\<pattern>] [--url=\<pattern>]... [--window-id=\<id>] [--window-type=\<type>] [--index=\<integer>]
	
		Gets all tabs that have the specified properties.
		
		- **--active**=true|false
		
			Whether the tabs are active or not.
		
		- **--pinned**=true|false
		
			Whether the tabs are pinned.
		
		- **--audible**=true|false
		
			Whether the tabs are audible.
		
		- **--highlighted**=true|false
		
			Whether the tabs are highlighted.
		
		- **--discarded**=true|false
		
			Whether the tabs are [discarded](https://developer.chrome.com/extensions/tabs#property-queryInfo-discarded).
		
		- **--current-window**=true|false
		
			Whether the tabs are in the [current window](https://developer.chrome.com/extensions/windows#current-window) or not
		
		- **--last-focused-window**=true|false
		
			Whether the tabs are in the last focused window.
		
		- **--status**=\<status>
		
			The status of the tabs. Valid statuses are **loading** and **complete**.
		
		- **--title**=\<pattern>
		
			Matches tab titles against a pattern.
		
		- **--url**=\<pattern>
		
			Matches the tabs against a url pattern.
		
		- **--window-id**=\<integer>
		
			The ID of the parent window of the tabs.
		
		- **--window-type**=\<type>
		
			The type of window the tabs are in. Valid types are **normal**, **popup**, **panel**, **app**, or **devtools**.
		
		- **--index**=\<integer>
		
			The position of the tabs within their windows.
	
	- **create** [--window-id=\<integer>] [--index=\<integer>] [--url=\<url>] [--active] [--pinned]
	
		Creates a new tab with the specified properties.
		
		- **--window-id**=\<integer>
		
			The ID of the window to create the new tab in.
		
		- **--index**=\<integer>
		
			The position the tab should take in the new window.
		
		- **--url**=\<url>
		
			The initial URL to navigate the new tab to.
		
		- **--active**
		
			Whether the new tab should become the active tab in the window.
		
		- **--pinned**
		
			Whether the tab should be pinned.

	- **duplicate** *selector*...
	
		Duplicates the specified tabs.
	
	- **highlight** *selector*...
	
		Highlights the specified tabs.
	
	- **update** *selector*...
	
		Modifies the properties of the specified tabs.
		
		- **--url**=\<url>
		
			A URL to navigate the tab to.
		
		- **--active**=true|false
		
			Sets the specified tab(s) as active within their windows.
		
		- **--highlighted**=true|false
		
			Adds or removes the tab from the current selection.
		
		- **--pinned**=true|false
		
			Sets whether the tab should be pinned.
		
		- **--muted**=true|false
		
			Sets whether the tab should be muted.
	
	- **reload** *selector*...
	
		Reloads the specified tabs.
	
	- **remove** *selector*...
	
		Removes the specified tabs.
	
	- **inject** js|css *selector*... --code|-c \<code>
	
		Injects javascript or CSS into the specified tabs.
		
		- **--code** \<code>
		
			The javascript or CSS to inject into the tab(s).

- **js** *query* [*parameter*]...

	Queries a javascript function or value. The following command shows how to create a new incognito window:
	
	```bash
	browser-cmd js browser.windows.create '{"incognito":true}'
	```
	
	All command arguments are passed as JSON. If the given argument is not a valid JSON string, it is passed as a string. If a return value of the query is a promise, the promise is resolved to a value or an error. If a **callback** argument is specified, a callback is passed to the function to resolve the result.

### browser-cmd-server

```bash
browser-cmd-server [--quiet] [--port=<port>] [--allow-user=<username>] [--allow-identifier=<identifier>] [--block-identifier=<identifier>] [--enforce-identifiers]
```

#### Options

- **--quiet**

	Disables log output.

- **--port**=\<port>

	The port to run the web socket server on. Defaults to 41904.
	
- **--allow-user**=\<username>

	A system user to allow to connect to the server. If no allowed users are specified (including in the config file), then all users are permitted to connect. The server must be run as root to use this option.

- **--allow-identifier**=\<identifier>

	An identifier set on the browser extension that is allowed to be used when connecting to the server. If no allowed or blocked identifiers are specified, and identifiers are not enforced, then all browser extensions are permitted to connect.
	
- **--block-identifier**=\<identifier>

	An identifier set on the browser extension that is not allowed to be used when connecting to the server. If no allowed or blocked identifiers are specified, and identifiers are not enforced, then all browser extensions are permitted to connect.

- **--enforce-identifiers**

	Requires all connecting browser extensions to have an identifier set. If the connecting browser extension gives an empty string or *null* as its identifier, it is blocked from connecting.



### config

The command line tools will load default options from a config file.

On *Linux* and *Mac* you can edit the configuration for the client and the server at */etc/browser-cmd.json*. On *Windows*, the config file is loaded from the module folder with the file name *config.json*.

*JSON example*:
```json
{
	"port": 41904,
	"allowUsers": [],
	"allowIdentifiers": [],
	"blockIdentifiers": [],
	"enforceIdentifiers": false
}
```

- **port** [\<integer>] the default port to run the server on.

- **allowUsers** [\<Array>] an array of usernames for users that are allowed to connect to the server.

- **allowIdentifiers** [\<Array>] an array of identifiers for browser extensions that are allowed to connect to the server.

- **blockIdentifiers** [\<Array>] an array of identifiers for browser extensions that are blocked from connecting to the server.

- **enforceIdentifiers** [\<boolean>] block any browser extension that doesn't have an identifier set from connecting to the server.



---



## Javascript API Reference

### Class: Client

```javascript
const { Client } = require('browser-cmd');
```

The client connects to the server and sends requests to be routed to the browser extension.

#### new Client([options])

- `options` [\<Object>]
	- `verbose` [\<boolean>] Log information while performing tasks. **Default:** `false`
	- `port` [\<integer>] The port to use to connect to the server. **Default:** `41904`
	- `eventSubscriptions` [\<Array>] An array of events to automatically subscribe to when the client connects to the server
		- [\<Object>]
			- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
			- `eventPath` [\<Array>] An array of strings representing a path of properties to the targetted Event object
				- Example: `[ 'browser', 'windows', 'onCreated' ]`
	- `username` [\<string>] The username to use to authenticate with the server.
	- `key` [\<string>] The key to use to authenticate with the server.

Create a new client instance.


#### Event: 'connect'

Emitted when the client connects to the server.


#### Event: 'disconnect'

Emitted when the client disconnects from the server.


#### Event: 'failure'

- `error` [\<Error>]

Emitted when the client fails to connect to the server.


#### Event: 'error'

- `error` [\<Error>]

Emitted when an error occurs.


#### client.connected

- [\<boolean>]

Indicates whether the client is connected to the server.


#### client.connect()

- Returns: [\<Promise>]

Attempts to connect the client to the server.


#### client.close()

- Returns: [\<Promise>]

Closes the client's connection with the server.


#### client.addEventSubscriber(target, eventPath, subscriber)

- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
- `eventPath` [\<Array>] An array representing a path of properties to the targetted Event object
	- Example: `[ 'browser', 'windows', 'onCreated' ]`
- `subscriber` [\<Function>] The function to be called with the event arguments when the event is received

Subscribes a function to listen for a specific event from the browser extension that matches the given target. By default, the client will not listen for an event unless there are subscribers or the event is specified in `options.eventSubscriptions` in the constructor.


#### client.removeEventSubscriber(target, eventPath, subscriber)

- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
- `eventPath` [\<Array>] An array of strings representing a path of properties to the targetted Event object
	- Example: `[ 'browser', 'windows', 'onCreated' ]`
- `subscriber` [\<Function>] The function to remove from being called when the event is received

Unsubscribes a function from listening for a specific event from the browser extension that matches the given target. The client will stop listening for an event when there are no more event subscribers and the event is not specified in `options.eventSubscriptions` in the constructor.


#### client.subscribeToEvent(target, eventPath)

- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
- `eventPath` [\<Array>] An array of strings representing a path of properties to the targetted Event object
	- Example: `[ 'browser', 'windows', 'onCreated' ]`

Manually subscribes the client to listen for a given event. Be aware that automatic subscribe/unsubscribe behavior will still occur when the first subscriber is added and the last subscriber is removed unless the event is specified in `options.eventSubscriptions` in the constructor.


#### client.unsubscribeFromEvent(target, eventPath)

- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
- `eventPath` [\<Array>] An array of strings representing a path of properties to the targetted Event object
	- Example: `[ 'browser', 'windows', 'onCreated' ]`

Manually unsubscribes the client from listening for a given event. Be aware that automatic subscribe/unsubscribe behavior will still occurr when the first subscriber is added and the last subscriber is removed unless the event is specified in `options.eventSubscriptions` in the constructor.


#### client.queryJS(target, query, ...args)

- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier
- `query` [\<Array>] An array of strings representing the path of properties to the variable to query
	- Example: `[ 'browser', 'windows', 'getAll' ]`
- `args` Optional arguments to be passed to the queried value if the queried value is a function

- Returns: [\<Promise>] A promise that resolves the result of a queried variable, or *undefined* if a callback function was passed to `args`

Queries a javascript variable or calls a function in the browser extension that matches the given target. If the queried variable is a function, the function is called with the given arguments. If the returned value from the queried function is a Promise, then the promise is resolved and the resolved value is the result. If the returned value from the queried function is not a Promise, then the returned value is the result. If the queried variable is not a function, then the value of the queried variable is the result. If a callback function was passed to `args`, then any value passed to the callback from the function call on the browser extension will be passed to the given callback, and a Promise will not be returned from this function.


#### client.getBrowserAPI([options])

- `options`
	- `target` [\<string>] The identifier of the browser extension to target, or *null* to target the first browser extension with no identifier. **Default:** `null`
	- `query` [\<string>] The name of the browser object to get the API for. Valid values are `'chrome'` and `'browser'`. **Default**: `'browser'`
	- `resubscribeOnConnect` [\<boolean>] Indicates whether events should be resubscribed to when the client disconnects and reconnects. By default when the client disconnects, the created `browser` object unsubscribes from all subscribed events. If this value is true, the created `browser` object will automatically resubscribe to events when the client object is reconnected. **Default:** `false`

- Returns: [\<Promise>] A promise that resolves to the created `browser` object

Creates a local proxy object for the `browser` or `chrome` object available in the browser extension. The resulting object functions almost exactly like the browser extension's [internal javascript API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API). In Google Chrome, a [polyfill](https://github.com/mozilla/webextension-polyfill) is used to mimic the standard `browser` object, and all of its function calls are just routed to the `chrome` object.

With the resulting proxy object, you can do nearly all of the things would be able to do in a standard webextension. For example, the following code queries a list of open windows in the browser:

```javascript
browser.windows.getAll().then((windows) => {
	// successfully got windows
	console.log(windows);
}).catch((error) => {
	// failed to get windows
	console.error(error.message);
});
```

You can even subscribe to browser events:

```javascript
// Listen for a window being created
browser.windows.onCreated.addListener((window) => {
	console.log("a window was created:");
	console.log(window);
});
```

All function calls will return a promise unless a callback was passed as an argument. Resolved values will not have any function attributes or special property descriptors (sorry haven't solved that yet).



### Class: Server

```javascript
const { Server } = require('browser-cmd');
```

The server routes messages between the client and the controller.

#### new Server([options])

- `options` [\<Object>]
	- `verbose` [\<boolean>] Log information while performing tasks. **Default:** `false`
	- `port` [\<integer>] The port to listen for connections on. **Default:** `41904`
	- `userKeys` [\<Object>] key-value pairs of usernames and their corresponding authentication keys. Specify this value to add access control for clients connecting to the server.

Create a new server instance.


#### Event: 'listening'

Emitted when the server opens and starts listening for connections.


#### Event: 'close'

Emitted when the server closes and stops listening for connections.


#### Event: 'failure'

Emitted when the server fails to open and start listening for connections.


#### Event: 'error'

- `error` [\<Error>]

Emitted when a server error occurs.


#### Event: 'registerClient'

- `event` [\<Object>]
	- `username` [\<string>] the reported system username of the registered client. This value is only verified to be accurate when user access to the server is restricted to select users.

Emitted when a client connects and registers with the server.


#### Event: 'unregisterClient'

- `event` [\<Object>]
	- `username` [\<string>] the reported system username of the unregistered client. This value is only verified to be accurate when user access to the server is restricted to select users.

Emitted when a registered client disconnects from the server.


#### Event: 'registerController'

- `event` [\<Object>]
	- `identifier` [\<string>] the identifier of the registered controller

Emitted when a controller connects and registers with the server.


#### Event: 'unregisterController'

- `event` [\<Object>]
	- `identifier` [\<string>] the identifier of the unregistered controller

Emitted when a registered controller disconnects from the server.


#### server.listening

Indicates if the server is open and listening for connections.


#### server.listen()

- Returns: [\<Promise>]

Opens the server and starts listening for connections.


#### server.close()

- Returns: [\<Promise>]

Closes the server and stops listening for connections.



### Class: Controller

```javascript
const { Controller } = require('browser-cmd');
```

The controller runs on the browser extension and listens for commands from the server.

#### new Controller([options])

- `options` [\<Object>]
	- `verbose` [\<boolean>] Log information while performing tasks. **Default:** `false`
	- `port` [\<integer>] The port to use to connect to the server. **Default:** `41904`
	- `identifier` [\<string>] An arbitrary identifier for the browser extension. **Default:** `null`
	- `reconnectWaitTime` [\<integer>] The amount of time to wait between connection attempts to the server, in milliseconds. **Default:** `200`


#### Event: 'start'

Emitted when the controller starts listening for connections/commands from the server (after the `start` method is called).


#### Event: 'stop'

Emitted when the controller stops listening for connections/commands from the server (after the `stop` method is called).


#### Event: 'connect'

Emitted when the controller actually establishes a connection to the server.


#### Event: 'disconnect'

Emitted when the controller loses its connection to the server.

#### Event: 'retryConnect'

Emitted when the controller retries connecting to the server.


#### controller.start()

Starts attempting to connect to the server to listen for commands.


#### controller.stop()

Disconnects from the server and stops any further connection attempts.


#### controller.restart()

Disconnects from the server if connected and tries to connect again.




[\<boolean>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Boolean_type
[\<number>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type
[\<integer>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#Number_type
[\<string>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures#String_type
[\<Object>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object
[\<Array>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array
[\<Function>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function
[\<Promise>]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[\<Error>]: https://nodejs.org/api/errors.html#errors_class_error
