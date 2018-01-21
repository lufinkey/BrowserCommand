
const config = require('./config');

function print_object(object, type, prefix=null)
{
	var typeInfo = config.EXTENSION_MAPPINGS.types[type];
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
			print_array(value, '', prefix+key);
		}
		else if(typeof value == 'object')
		{
			print_object(value, '', prefix+key);
		}
		else if(value !== undefined)
		{
			console.log(prefix+key+': '+value);
		}
	}
}

function print_array(array, type, prefix=null)
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
			print_array(value, type, valuePrefix);
		}
		else if(typeof value == 'object')
		{
			print_object(value, type, valuePrefix);
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

function print_response(response, type)
{
	if(response instanceof Array)
	{
		print_array(response, type);
	}
	else if(typeof response == 'object')
	{
		print_object(response, type);
	}
	else
	{
		print_json(response);
	}
}

function print_json(obj)
{
	console.log(JSON.stringify(obj, null, 4));
}



module.exports = {
	object: print_object,
	array: print_array,
	response: print_response,
	json: print_json
};
