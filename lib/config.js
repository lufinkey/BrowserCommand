
module.exports = {
	HOST: '127.0.0.1',
	PORT: 41904,

	EXTENSION_MAPPINGS: {
		types: {
			'Window': {
				order: [ 'id', 'type', 'state', 'focused', 'incognito', 'top', 'left', 'width', 'height', 'tabs' ]
			},
			'Tab': {
				order: [ 'id', 'title', 'url', 'windowId', 'index', 'selected', 'highlighted', 'active', 'pinned', 'incognito',
						'audible', 'discarded', 'autoDiscarded', 'openerTabId', 'faviconUrl', 'status', 'width', 'height' ]
			}
		}
	}
};
