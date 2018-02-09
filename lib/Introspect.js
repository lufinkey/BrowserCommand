
const Introspect = {};
module.exports = Introspect;



Introspect.read = function(obj, options)
{
	if(!options)
	{
		options = {};
	}
	var info = {};
	if(obj instanceof Array)
	{
		info.type = 'array';
		info.contents = [];
		for(const entry of obj)
		{
			info.contents.push(Introspect.read(entry, options));
		}
	}
	else if(typeof obj == 'object')
	{
		info.type = 'object';

		var handled = false;
		if(options.classes)
		{
			for(const className in options.classes)
			{
				var classInfo = options.classHandlers[className];
				if(obj instanceof classInfo.type)
				{
					info.className = className;
					info.contents = classInfo.serialize(obj);
					handled = true;
					break;
				}
			}
		}
		if(!handled)
		{
			/*info.proto = {};
			for(const key in Object.getPrototypeOf(obj))
			{
				info.proto[key] = Introspect.read(obj[key]);
			}*/
			info.contents = {};
			for(const key of Object.keys(obj))
			{
				info.contents[key] = Introspect.read(obj[key], options);
			}
		}
	}
	else if(typeof obj == 'function')
	{
		info.type = 'function';
	}
	else
	{
		info.type = 'single';
		info.value = obj;
	}
	return info;
}



Introspect.create = function(info, options, path)
{
	if(!path)
	{
		path = [];
	}
	switch(info.type)
	{
		case 'array':
			var obj = [];
			for(var i=0; i<info.contents.length; i++)
			{
				obj.push(Introspect.create(info.contents[i], options, path.concat([i])));
			}
			return obj;

		case 'object':
			/*var ObjClass = function() {};
			for(const key in info.proto)
			{
				ObjClass.prototype[key] = Introspect.create(info.proto[key], funcExecutor);
			}
			var obj = new ObjClass();*/
			if(info.className)
			{
				if(!options.classes)
				{
					return null;
				}
				var classInfo = options.classes[info.className];
				return classInfo.deserialize(info.contents, path);
			}
			var obj = {};
			for(const key in info.contents)
			{
				obj[key] = Introspect.create(info.contents[key], options, path.concat([key]));
			}
			return obj;

		case 'function':
			if(!options.functionHandler)
			{
				return null;
			}
			let functionHandler = options.functionHandler;
			return (...args) => {
				return functionHandler(path, ...args);
			};

		case 'single':
			return info.value;

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


Introspect.arePathsEqual = function(path1, path2)
{
	if(path1.length !== path2.length)
	{
		return false;
	}

	for(var i=0; i<path1.length; i++)
	{
		var entry1 = path1[i];
		var entry2 = path2[i];
		if(entry1 !== entry2)
		{
			return false;
		}
	}
	return true;
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
