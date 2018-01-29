
const defaults = require('./defaults');

const Print = {};
module.exports = Print;

Print.object = function(object, type, prefix=null)
{
	var typeInfo = defaults.TYPES[type];
	var order = [];
	if(typeInfo != null && typeInfo.order != null)
	{
		order = typeInfo.order;
	}
	else
	{
		order = Object.keys(object);
	}
	var hasPrefix = true;
	if(prefix === null || prefix === undefined)
	{
		hasPrefix = false;
		prefix = '';
	}
	else if(prefix != '')
	{
		prefix += '.';
	}
	for(var i=0; i<order.length; i++)
	{
		var key = order[i];
		var value = object[key];
		if(value instanceof Array)
		{
			Print.array(value, '', prefix+key);
		}
		else if(typeof value == 'object')
		{
			Print.object(value, '', prefix+key);
		}
		else if(value !== undefined)
		{
			console.log(prefix+key+': '+value);
		}
	}
}

Print.array = function(array, type, prefix=null)
{
	var hasPrefix = true;
	if(prefix === null)
	{
		hasPrefix = false;
		prefix = '';
	}
	for(var i=0; i<array.length; i++)
	{
		var value = array[i];

		var valuePrefix = '';
		if(hasPrefix)
		{
			valuePrefix = prefix+'['+i+']';
		}
		if(value instanceof Array)
		{
			Print.array(value, type, valuePrefix);
		}
		else if(typeof value == 'object')
		{
			Print.object(value, type, valuePrefix);
		}
		else
		{
			console.log(valuePrefix+': '+value);
		}
		if(!hasPrefix && i != (array.length-1))
		{
			console.log("");
		}
	}
}

Print.pretty = function(response, type)
{
	if(response instanceof Array)
	{
		Print.array(response, type);
	}
	else if(typeof response == 'object')
	{
		Print.object(response, type);
	}
	else
	{
		Print.json(response);
	}
}

Print.json = function(obj)
{
	console.log(JSON.stringify(obj, null, 4));
}

Print.ids = function(object, type)
{
	if(object instanceof Array)
	{
		for(const entry of object)
		{
			var id = entry['id'];
			console.log(id);
		}
	}
	else
	{
		console.log(object['id']);
	}
}

Print.formats = [ 'json', 'pretty', 'id' ];
Print.format = function(object, format, type)
{
	if(format == 'json')
	{
		Print.json(object);
	}
	else if(format == 'pretty')
	{
		Print.pretty(object, type);
	}
	else if(format == 'id')
	{
		Print.ids(object, type);
	}
	else
	{
		console.log(object);
	}
}
