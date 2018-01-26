
const Introspect = {};

function is_running_as_chrome_extension()
{
	if(window.chrome && chrome.runtime && chrome.runtime.id)
	{
		return true;
	}
	return false;
}



Introspect.read = function(obj, path)
{
	if(path == null)
	{
		path = [];
	}
	var info = {};
	if(obj instanceof Array)
	{
		info.type = 'array';
		info.contents = [];
		for(var i=0; i<obj.length; i++)
		{
			var newPath = path.slice(0);
			newPath.push(i);
			info.contents.push(Introspect.read(obj[i], newPath));
		}
	}
	else if(typeof obj == 'object')
	{
		info.type = 'object';
		if(is_running_as_chrome_extension() && obj instanceof Event)
		{
			info.objectType = 'Event';
		}
		info.proto = {};
		for(const key in Object.getPrototypeOf(obj))
		{
			var newPath = path.slice(0);
			newPath.push(key);
			info.proto[key] = Introspect.read(obj[key], newPath);
		}
		info.contents = {};
		for(const key in obj)
		{
			var newPath = path.slice(0);
			newPath.push(key);
			info.contents[key] = Introspect.read(obj[key], newPath);
		}
	}
	else if(typeof obj == 'function')
	{
		info.type = 'function';
		info.path = path.slice(0);
	}
	else
	{
		info.type = 'single';
		info.path = path.slice(0);
		info.value = obj;
	}
	return info;
}



Introspect.create = function(info, funcExecutor)
{
	switch(info.type)
	{
		case 'array':
			var obj = [];
			for(const entry of info.contents)
			{
				obj.push(Introspect.create(entry, funcExecutor));
			}
			return obj;

		case 'object':
			/*var ObjClass = function() {};
			for(const key in info.proto)
			{
				ObjClass.prototype[key] = Introspect.create(info.proto[key], funcExecutor);
			}
			var obj = new ObjClass();*/
			var obj = {};
			for(const key in info.contents)
			{
				obj[key] = Introspect.create(info.contents[key]);
			}
			return obj;

		case 'function':
			return function(...args) {
				return funcExecutor(info.path, ...args);
			};

		case 'single':
			break;

		default:
			return undefined;
	}
}



Introspect.createDefaultEntry = function(pathKey)
{
	if(typeof pathKey == 'number' && Number.isInteger(pathKey))
	{
		return [];
	}
	else if(typeof pathKey == 'string')
	{
		return {};
	}
	throw new Error("invalid path key "+pathKey+": key must be an integer or a string");
}



Introspect.getValidObjectForPath = function(receiver, path)
{
	var currentObj = receiver;
	for(const pathKey of path)
	{
		if(currentObj[pathKey] == undefined)
		{
			currentObj[pathKey] = Introspect.createDefaultEntry(pathKey);
		}
		currentObj = currentObj[pathKey];
	}
	return currentObj;
}



Introspect.put = function(receiver, path, value)
{
	if(path.length == 0)
	{
		throw new Error("cannot put value in object without a path");
	}
	var leadingPath = path.slice(0, path.length-1);
	var lastKey = path[path.length-1];
	var obj = Introspect.getValidObjectForPath(receiver, leadingPath);
	obj[lastKey] = value;
}



Introspect.push = function(receiver, path, value)
{
	if(path.length == 0)
	{
		throw new Error("cannot push value onto object without a path");
	}
	var leadingPath = path.slice(0, path.length-1);
	var lastKey = path[path.length-1];
	var obj = Introspect.getValidObjectForPath(receiver, leadingPath);
	if(!(obj[lastKey] instanceof Array))
	{
		obj[lastKey] = [];
	}
	obj[lastKey].push(value);
}



Introspect.query = function(receiver, path)
{
	var currentObj = receiver;
	for(const entry of path)
	{
		if(currentObj === null || currentObj === undefined)
		{
			return currentObj;
		}
		currentObj = currentObj[entry];
	}
	return currentObj;
}
