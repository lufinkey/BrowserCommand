
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

	getKeyPath(username, port)
	{
		if(this._options.keyPathResolver)
		{
			return this._options.keyPathResolver(username, port);
		}
		var keyPath = null;
		var userHome = homedirSync(username);
		if(userHome == null)
		{
			return os.tmpdir()+'/.browser-cmd.'+username+'@'+port+'.key';
		}
		else
		{
			return userHome+'/.browser-cmd.'+port+'.key';
		}
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
		return this.generateRandomString(24);
	}

	saveKey(username, port, key=null)
	{
		// generate key if not given
		if(key == null)
		{
			key = this.generateKey();
		}

		// ensure elevated privileges
		if(!elevationinfo.isElevated() && username !== os.userInfo().username)
		{
			throw new Error("non-root user cannot save user key for other user");
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

		// delete key file if exists
		if(fs.existsSync(keyPath))
		{
			fs.unlinkSync(keyPath);
		}

		// create key file
		var fileMode = 0o400;
		if(process.platform === 'win32')
		{
			// permissions on windows are fucking ridiculous and I'm just not gonna deal with them
			fileMode = undefined;
		}
		fs.writeFileSync(keyPath, key, { uid: uid, gid: gid, mode: fileMode });

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
