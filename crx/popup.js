
const backgroundPage = chrome.extension.getBackgroundPage();
const controller = backgroundPage.controller;

window.addEventListener('load', () => {
	const saveButton = document.getElementById('save-button');
	const portInput = document.getElementById('port');

	portInput.placeholder = controller.defaultPort;
	
	saveButton.addEventListener('click', () => {
		var port = Number.parseInt(portInput.value);
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
		}
		else
		{
			chrome.storage.local.set({'port':port});

			var controllerOptions = controller.options;
			controllerOptions.port = port;
			controller.options = controllerOptions;

			controller.restart();

			if(controller.port == controller.defaultPort)
			{
				portInput.value = "";
			}
		}
	});
});
