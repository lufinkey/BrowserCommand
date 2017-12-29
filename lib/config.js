
module.exports = {
	HOST: '127.0.0.1',
	PORT: 41904,

	EXTENSION_MAPPINGS: {
		types: {
			'Window': {
				order: [ "id", "type", "state", "focused", "incognito", "top", "left", "width", "height" ]
			}
		},
		functions: {
			// windows
			
			'chrome.windows.get': {
				params: [ 'windowId', 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.getAll': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.getCurrent': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.getLastFocused': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.create': {
				params: [ 'createData', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.update': {
				params: [ 'windowId', 'updateInfo', 'callback' ],
				returns: 'Window'
			},
			'chrome.windows.remove': {
				params: [ 'windowId', 'callback' ],
				returns: undefined
			}
		}
	}
};
