# Browser Command

Control any [webextension](https://developer.mozilla.org/en-US/Add-ons/WebExtensions)-supported browser from nodejs or the terminal, using web sockets.

![Icon](extension/icon256.png)

<sub>*Icon by [Patrick Zopff](https://www.instagram.com/zopff.art/)*</sub>

## Setup

Browser Command has 3 components: a server, a client (eg. the [CLI](#command-line-usage)), and a browser extension.

**server** - listens for connections from either the client or the browser extension, and routes messages between them.

**client** - connects to the server and sends commands to be routed to the browser extension.

**browser extension** - continuously attempts to connect to the server. When connected, it waits for commands and performs them when received.

To install the cli tools to manage these components, run the following command:

```bash
npm install -g https://github.com/lufinkey/BrowserCommand
```

You can also install it as a library to use within your own project:

```bash
npm install --save https://github.com/lufinkey/BrowserCommand
```

## Command Line Usage

```bash
browser-cmd [--verbose] [--port=<port>] [--target=<browser>/<identifier>] [--tmp-server] <command> [<args>]
```

#### Options

* **--verbose**

	Show as much information as possible.

* **--port**=\<port>

	Set the port to use to connect to the server. Defaults to 41904.

* **--target**=\<browser>/\<identifier>

	Set the target browser to connect to when performing browser commands. Supported arguments are **chrome**, **firefox**, and **edge**. If you want to specify the *identifier* of the chrome extension, you can specify it with /\<identifier> after the browser name. (eg. `--target=chrome/billy`)

* **--tmp-server**

	If no server is running, start a temporary server to facilitate the browser connection.

#### Commands

The `browser-cmd` executable takes a variety of commands:

* **build-crx** \<path>

	Builds an unpacked browser extension at the specified path. If no path is given, it builds the extension to `browser-cmd.crx` in the current working directory.

* **service** \<command>

	Manages running the server as a background service. This command currently only works on *Linux*.
	
	* **install**
	
		Installs the server as a system service. Requires *root*.
	
	* **uninstall**
	
		Uninstalls the server system service. Requires *root*.
	
	* **enable**
	
		Enables the service to run on startup. Requires *root*.
	
	* **disable**
	
		Disables the service from running on startup. Requires *root*.
	
	* **start**
	
		Starts the service. Requires *root*.
	
	* **stop**
	
		Stops the service. Requires *root*.
	
	* **restart**
	
		Restarts the service. Requires *root*.

	* **status**
	
		Queries the status of the service.

* **window** \<command> [\<args>]

	Manages the browser windows. Most of the sub-commands take a *selector* to query certain windows. Valid selectors are a window ID, **all**, **current**, **lastfocused**, **focused**, are **incognito**.
	
	* **get** *selector*...
	
		Queries general information about the specified windows.
	
	* **create** [--url=\<url>|-u \<url>]... [--left=\<integer>] [--top=\<integer>] [--width=\<integer>] [--height=\<integer>] [--focused] [--incognito] [--type=\<type>] [--state=\<state>]
	
		Creates a new browser window with optional settings.
	
		* **--url**=\<url>

			A url to open as a tab in the new window.

		* **--left**=\<integer>

			The x coordinate of the new window, in pixels from the left edge of the screen.

		* **--top**=\<integer>

			The y coordinate of the new window, in pixels from the top edge of the screen.

		* **--width**=\<integer>

			The width of the new window, in pixels.

		* **--height**=\<integer>

			The height of the new window, in pixels.
		
		* **--focused**
		
			Make the new window an active window
		
		* **--incognito**
		
			Make the new window an incognito window
		
		* **--type**=\<type>
		
			Set the type of window to create. Valid types are **normal**, **popup**, or **panel**.
		
		* **--state**=\<state>
		
			Set the state of the new window. Valid states are **normal**, **minimized**, **maximized**, or **fullscreen**.

	* **update** *selector*... [--left=\<integer>] [--top=\<integer>] [--width=\<integer>] [--height=\<integer>] [--focused] [--attention] [--state=\<state>]

		Updates the properties of the specified windows.
		
		* **--left**=\<integer>
		
			Set the x coordinate of the window(s), in pixels from the left edge of the screen.
		
		* **--top**=\<integer>
		
			Set the y coordinate of the window(s), in pixels from the top edge of the screen.
		
		* **--width**=\<integer>
		
			Set the width of the window(s), in pixels.
		
		* **--height**=\<integer>
		
			Set the height of the window(s), in pixels.
		
		* **--focused**=true|false
		
			Sets the focus state of the specified windows. Fails if multiple windows are focused.
		
		* **--attention**
		
			Draw the user's attention to the specified window. Fails if multiple windows are specified.
		
		* **--state**=\<state>
		
			Set the new state of the specified window(s). Valid states are **normal**, **minimized**, **maximized**, or **fullscreen**.
	
	* **remove** *selector*...
	
		Closes the specified windows.

* **tab** \<command> [\<args>]

	Manages the browser tabs. Most of the sub-commands take a *selector* to query certain tabs. Valid selectors are a tab ID, **all**, **current**, **active**, **pinned**, **audible**, **muted**, **highlighted**, and **discarded**.

	* **get** *selector*...
	
		Queries general information about the specified tabs.
	
	* **query** [--active] [--pinned] [--audible] [--muted] [--highlighted] [--discarded] [--auto-discardable] [--current-window] [--last-focused-window] [--status=\<status>] [--title=\<pattern>] [--url=\<pattern>]... [--window-id=\<id>] [--window-type=\<type>] [--index=\<integer>]
	
		Gets all tabs that have the specified properties.
		
		* **--active**
		
			Queries tabs that are active in their windows.
		
		* **--pinned**
		
			Queries pinned tabs.
		
		* **--audible**
		
			Queries audible tabs.
		
		* **--highlighted**
		
			Queries highlighted tabs.
		
		* **--discarded**
		
			Queries tabs that are [discarded](https://developer.chrome.com/extensions/tabs#property-queryInfo-discarded).
		
		* **--current-window**
		
			Whether the tabs are in the [current window](https://developer.chrome.com/extensions/windows#current-window)
		
		* **--last-focused-window**
		
			Whether the tabs are in the last focused window.
		
		* **--status**=\<status>
		
			The status of the tabs. Valid statuses are **loading** and **complete**.
		
		* **--title**=\<pattern>
		
			Matches tab titles against a pattern.
		
		* **--url**=\<pattern>
		
			Matches the tabs against a url pattern.
		
		* **--window-id**=\<integer>
		
			The ID of the parent window of the tabs.
		
		* **--window-type**=\<type>
		
			The type of window the tabs are in. Valid types are **normal**, **popup**, **panel**, **app**, or **devtools**.
		
		* **--index**=\<integer>
		
			The position of the tabs within their windows.
	
	* **create** [--window-id=\<integer>] [--index=\<integer>] [--url=\<url>] [--active] [--pinned]
	
		Creates a new tab with the specified properties.
		
		* **--window-id**=\<integer>
		
			The ID of the window to create the new tab in.
		
		* **--index**=\<integer>
		
			The position the tab should take in the new window.
		
		* **--url**=\<url>
		
			The initial URL to navigate the new tab to.
		
		* **--active**
		
			Whether the new tab should become the active tab in the window.
		
		* **--pinned**
		
			Whether the tab should be pinned.

	* **duplicate** *selector*...
	
		Duplicates the specified tabs.
	
	* **highlight** *selector*...
	
		Highlights the specified tabs.
	
	* **update** *selector*...
	
		Modifies the properties of the specified tabs.
		
		* **--url**=\<url>
		
			A URL to navigate the tab to.
		
		* **--active**=true|false
		
			Sets the specified tab(s) as active within their windows.
		
		* **--highlighted**=true|false
		
			Adds or removes the tab from the current selection.
		
		* **--pinned**=true|false
		
			Sets whether the tab should be pinned.
		
		* **--muted**=true|false
		
			Sets whether the tab should be muted.
	
	* **reload** *selector*...
	
		Reloads the specified tabs.
	
	* **remove** *selector*...
	
		Removes the specified tabs.
	
	* **inject** js|css *selector*... --code|-c \<code>
	
		Injects javascript or CSS into the specified tabs.
		
		* **--code** \<code>
		
			The javascript or CSS to inject into the tab(s).

* **js** *query* [*parameter*]...

	Queries a javascript function or value. The following command shows how to create a new incognito window using this command:
	
	```bash
	browser-cmd js browser.window.create '{"incognito"true}'
	```
	
	All command arguments are passed as JSON. If the given argument is not a valid JSON string, it is passed as a string. If a return value of the query is a promise, the promise is resolved to a value or an error. If a **callback** argument is specified, a callback is passed to the function to resolve the result.

## Server Usage

```bash
browser-cmd-server [--quiet] [--port=<port>] [--allow-user=<username>]
```

#### Options

* **--quiet**

	Disables log output.

* **--port**=\<port>

	The port to run the web socket server on.
	
* **--allow-user**=\<username>

	A system user to allow to connect to the server. If no --allow-user arguments are given, and the config does not specify any allowed users, then all users are permitted. The server must be run as root to use this option.
