
const defaults = require('./defaults');
const os = require('os');
const fs = require('fs');
const path = require('path');
const elevationinfo = require('elevationinfo');
const { spawnSync } = require('child_process');
const { homedirSync } = require('userhomepath');


class UserKeyManaager
{
	constructor(options)
	{
		if(options == null)
		{
			options = {};
		}

		this._options = Object.assign({}, options);
		/*
		{
			keyPathResolver: function(username, port)
		}
		*/
	}

	getKeyFileName(username, port)
	{
		return username+'@'+port+".key";
	}

	getKeyPath(username, port)
	{
		if(this._options.keyPathResolver)
		{
			return this._options.keyPathResolver(username, port);
		}
		var basePath = homedirSync(username);
		if(basePath == null)
		{
			basePath = os.tmpdir()+'/.'+defaults.MODULE_NAME+'.'+username+'.config';
		}
		else
		{
			basePath = basePath+'/.'+defaults.MODULE_NAME;
		}
		return basePath+"/"+this.getKeyFileName(username, port);
	}

	getKey(username, port)
	{
		var keyPath = this.getKeyPath(username, port);
		if(keyPath == null)
		{
			return null;
		}
		try
		{
			var content = fs.readFileSync(keyPath);
			if(content == null)
			{
				return null;
			}
			return content.toString();
		}
		catch(error)
		{
			return null;
		}
	}

	generateRandomString(length)
	{
		var text = "";
		var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for(var i=0; i<length; i++)
		{
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	generateKey()
	{
		// generate key
		var key = this.generateRandomString(24);
	}

	saveKey(username, port, key)
	{
		// ensure elevated privileges
		if(!elevationinfo.isElevated())
		{
			throw new Error("non-root user cannot generate user key");
		}

		// get path for key file
		var keyPath = this.getKeyPath(username, port);
		if(keyPath == null)
		{
			throw new Error("cannot generate user key for "+username+" on port "+port);
		}

		// get uid and gid of user
		var uid = undefined;
		var gid = undefined;
		if(process.platform !== 'win32')
		{
			uid = parseInt(spawnSync('id', ['-u', username ]).stdout.toString());
			if(isNaN(uid))
			{
				throw new Error("user does not exist");
			}
			gid = parseInt(spawnSync('id', ['-g', username ]).stdout.toString());
			if(isNaN(gid))
			{
				throw new Error("user has no effective group");
			}
		}

		// create containing directory for key file, if needed
		var keyDir = path.dirname(keyPath);
		if(!fs.existsSync(keyDir))
		{
			fs.mkdirSync(keyDir);
		}

		// create key file
		var fileMode = 0o400;
		if(process.platform === 'win32')
		{
			// permissions on windows are fucking ridiculous and I'm just not gonna deal with them
			fileMode = undefined;
		}
		fs.writeFileSync(keyPath, key, { mode: fileMode });

		// fix owner for key file if necessary
		if(process.platform !== 'win32')
		{
			fs.chownSync(keyPath, uid, gid);
		}

		return key;
	}

	deleteKey(username, port)
	{
		var keyPath = this.getKeyPath(username, port);
		if(keyPath == null)
		{
			return;
		}
		fs.unlinkSync(keyPath);
	}
}


module.exports = UserKeyManaager;
