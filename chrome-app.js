
(function(){
	const tcpServer = chrome.sockets.tcpServer;
	const tcpSocket = chrome.sockets.tcp;
	tcpServer.create({}, function(socketInfo) {
		tcpServer.listen(socketInfo.socketId, "127.0.0.1", 41904, 1024, function(result)
		{
			console.log("listening", result);

			function onAccept(acceptInfo)
			{
				console.log("onAccept", acceptInfo);
			}

			function onReceive(receiveInfo)
			{
				console.log("onReceive", receiveInfo);
			}

			tcpServer.onAccept.addListener(onAccept);
			tcpSocket.onReceive.addListener(onReceive);
		});
	});
})();
