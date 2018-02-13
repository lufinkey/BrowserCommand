
const { Client } = require('./');

var client = new Client();
client.connect().then(() => {
	console.log("successfully connected to the server");
	client.getBrowserAPI({browser: 'chrome'}).then((browser) => {
		console.log("successfully got the browser object");
		// query a list of the open windows
		browser.windows.getAll().then((windows) => {
			console.log(windows);
			process.exit(0);
		}).catch((error) => {
			console.error(error.message);
			process.exit(1);
		});
	}).catch((error) => {
		console.error(error.message);
		process.exit(1);
	});
}).catch((error) => {
	console.error(error.message);
	process.exit(1);
});
