
const backgroundPage = browser.extension.getBackgroundPage();
const controller = backgroundPage.controller;

window.addEventListener('load', () => {
	const identifierInput = document.getElementById('identifier');
	const identifierHelpButton = document.getElementById('identifier-help');
	const portInput = document.getElementById('port');
	const saveButton = document.getElementById('save-button');
	const permissionsDrawer = document.getElementById('permissions-drawer');
	const permissionsButton = document.getElementById('permissions-button');
	const permissionsList = document.getElementById('permissions');
	const connectionStatus = document.getElementById("connection-status");

	portInput.placeholder = controller.defaultPort;

	// load preferences
	if(controller.identifier != null)
	{
		identifierInput.value = controller.identifier;
	}
	if(controller.port != controller.defaultPort)
	{
		portInput.value = controller.port;
	}

	// handle permissions drawer button
	permissionsButton.onclick = function()
	{
		if(permissionsDrawer.classList.contains("folded"))
		{
			permissionsDrawer.classList.remove("folded");
		}
		else
		{
			permissionsDrawer.classList.add("folded");
		}
	}

	// load permissions
	var manifest = browser.runtime.getManifest();
	for(let permission of manifest.optional_permissions)
	{
		let permissionInfo = {
			permissions: [],
			origins: []
		};
		if(permission == "<all_urls>")
		{
			permissionInfo.origins.push(permission);
		}
		else
		{
			permissionInfo.permissions.push(permission);
		}

		let li = document.createElement('LI');

		// create checkbox
		let checkbox = document.createElement('INPUT');
		checkbox.type = 'checkbox';
		// handle checkbox checking / unchecking
		checkbox.onchange = function() {
			if(checkbox.checked)
			{
				browser.permissions.request(permissionInfo, (granted) => {
					if(!granted)
					{
						checkbox.checked = false;
					}
					if(browser.runtime.lastError)
					{
						window.alert(browser.runtime.lastError.message);
					}
				});
			}
			else
			{
				browser.permissions.remove(permissionInfo, (removed) => {
					if(!removed)
					{
						checkbox.checked = true;
					}
					if(browser.runtime.lastError)
					{
						window.alert(browser.runtime.lastError.message);
					}
				});
			}
		}
		// get initial permission status
		browser.permissions.contains(permissionInfo, (result) => {
			checkbox.checked = result;
		});

		// label
		let label = document.createElement('SPAN');
		label.textContent = permission;

		li.appendChild(checkbox);
		li.appendChild(document.createTextNode(" "));
		li.appendChild(label);

		permissionsList.appendChild(li);
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
		browser.storage.local.set({ 'port':port, 'identifier':identifier });

		// update controller settings
		var controllerOptions = controller.getOptions();
		controllerOptions.port = port;
		controllerOptions.identifier = identifier;
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
