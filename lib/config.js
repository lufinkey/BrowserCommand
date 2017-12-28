
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
			
			'windows.get': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'windows.getAll': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'windows.getCurrent': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'windows.getLastFocused': {
				params: [ 'getInfo', 'callback' ],
				returns: 'Window'
			},
			'windows.create': {
				params: [ 'createData', 'callback' ],
				returns: 'Window'
			},
			'windows.update': {
				params: [ 'windowId', 'updateInfo', 'callback' ],
				returns: 'Window'
			},
			'windows.remove': {
				params: [ 'windowId', 'callback' ],
				returns: undefined
			}
		}
	}
};
