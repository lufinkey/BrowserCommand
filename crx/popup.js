
const backgroundPage = chrome.extension.getBackgroundPage();
const controller = backgroundPage.controller;

window.addEventListener('load', () => {
	console.log("adding event listener");
	const identifierInput = document.getElementById('identifier');
	const identifierHelpButton = document.getElementById('identifier-help');
	const portInput = document.getElementById('port');
	const saveButton = document.getElementById('save-button');
	const connectionStatus = document.getElementById("connection-status");

	portInput.placeholder = controller.defaultPort;

	// add hover text for identifier help
	chrome.runtime.getPlatformInfo(function(info) {
		var usernameHelp = "";
		switch(info.os)
		{
			case 'win':
				usernameHelp = "To find the current username, open the command prompt and type: echo %username%\nThen hit enter and copy-paste the result here.";
				break;

			default:
				usernameHelp = "To find the current username, open a terminal and type: whoami\nThen hit enter and copy-paste the result here.";
				break;
		}
		identifierHelpButton.title =
			"A string that will uniquely identify this chrome instance.\n" +
			"It is recommended you use something that is guaranteed to be unique for this instance, such as your system username.\n\n"+
			usernameHelp;
	});

	// load preferences
	if(controller.identifier != null)
	{
		identifierInput.value = controller.identifier;
	}
	if(controller.port != controller.defaultPort)
	{
		portInput.value = controller.port;
	}

	// save button handler
	saveButton.addEventListener('click', () => {
		var identifier = identifierInput.value;
		var port = Number.parseInt(portInput.value);

		var valuesChanged = false;

		// validate identifier
		if(identifier != null)
		{
			identifier = identifier.trim();
			if(identifier == '')
			{
				identifier = null;
			}
			identifierInput.value = identifier;
		}

		// validate port
		if(isNaN(port))
		{
			if(controller.port == controller.defaultPort)
			{
				portInput.value = "";
			}
			else
			{
				portInput.value = ""+controller.port;
			}
			port = controller.port;
		}
		else
		{
			if(port == controller.defaultPort)
			{
				portInput.value = "";
			}
		}

		// save controller settings
		chrome.storage.local.set({ 'port':port, 'identifier':username });

		// update controller settings
		var controllerOptions = controller.getOptions();
		controllerOptions.port = port;
		controllerOptions.username = username;
		controller.setOptions(controllerOptions);

		// restart controller to apply changes
		controller.restart();
	});



	// handle status area
	function updateControllerStatus()
	{
		connectionStatus.className = controller.status;
	}



	// handle controller connect/disconnect
	function onControllerConnect()
	{
		updateControllerStatus();
	}

	function onControllerDisconnect()
	{
		updateControllerStatus();
	}

	controller.onConnect = onControllerConnect;
	controller.onDisconnect = onControllerDisconnect;

	updateControllerStatus();

	setInterval(() => {
		updateControllerStatus();
	}, 200);
});
