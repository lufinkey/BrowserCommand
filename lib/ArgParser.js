
/*

Options

{
	args: [
		{
			type: 'boolean',
			name: 'verbose',
			short: 'v',
			default: false
		},
		{
			type: 'uinteger',
			name: 'establish-server-timeout',
			default: 10000
		},
		{
			type: 'uinteger',
			name: 'chrome-connect-timeout',
			default: 10000
		}
	],
	options: {
		stopAtStray: true,
		stopAtError: true,
		allowUnmappedArgs: false
	}
}


Result

{
	args: {},
	strays: [],
	errors: [],
	lastIndex: -1
}
*/


function validateValue(type, value)
{
	switch(type)
	{
		case 'string':
			return value;

		case 'boolean':
			if(value=='true' || value=='1')
			{
				return true;
			}
			else if(value=='false' || value=='0')
			{
				return false;
			}
			return null;

		case 'float':
			var val = Number.parseFloat(value);
			if(isNaN(val))
			{
				return null;
			}
			return val;

		case 'ufloat':
			var val = Number.parseFloat(value);
			if(isNaN(val))
			{
				return null;
			}
			else if(val < 0)
			{
				return null;
			}
			return val;

		case 'integer':
			var val = Number.parseInt(value);
			if(isNaN(val))
			{
				return null;
			}
			return val;

		case 'uinteger':
			var val = Number.parseInt(value);
			if(isNaN(val))
			{
				return null;
			}
			return val;

		default:
			throw new Error("invalid type "+type);
	}
}

function getOptionsArg(options, argName)
{
	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];
		if(argName == arg.name || argName == arg.short)
		{
			return arg;
		}
	}
	return null;
}

function isOptionsArgBoolean(options, argName)
{
	var arg = getOptionsArg(options, argName);
	if(arg != null && arg.type == 'boolean')
	{
		return true;
	}
	return false;
}

function addArgIfPossible(result, options, argName, argValue)
{
	var arg = getOptionsArg(options, argName);
	if(arg === null)
	{
		if(options.allowUnmappedArgs)
		{
			var value = validateValue('boolean', argValue);
			if(value === null)
			{
				result.errors.push("invalid value for argument "+argName);
				return false;
			}
			else
			{
				result.args[argName] = value;
				return true;
			}
		}
		else
		{
			result.errors.push("invalid argument "+argName);
			return false;
		}
	}
	else
	{
		var value = validateValue(arg.type, argValue);
		if(value === null)
		{
			result.errors.push("invalid value for argument "+argName);
			return false;
		}
		else
		{
			result.args[arg.name] = value;
			return true;
		}
	}
}

function parseArgs(args, options)
{
	var result = {
		args: {},
		strays: [],
		errors: [],
		lastIndex: -1
	}

	for(var i=0; i<args.length; i++)
	{
		result.lastIndex = i;

		var arg = args[i];
		var matches = arg.match(new RegExp('^--(.*)=(.*)$'));
		if(matches != null)
		{
			var argName = matches[1];
			var argValue = matches[2];
			var success = addArgIfPossible(result, options, argName, argValue);
			if(!success && options.stopAtError)
			{
				return result;
			}
			continue;
		}

		matches = arg.match(new RegExp('^--(.*)$'));
		if(matches == null)
		{
			matches = arg.match(new RegExp('^-(.*)$'))
		}
		if(matches != null)
		{
			var argName = matches[1];
			var success = false;
			if(isOptionsArgBoolean(options, argName))
			{
				success = addArgIfPossible(result, options, argName, 'true');
			}
			else
			{
				i++;
				var argValue = args[i];
				success = addArgIfPossible(result, options, argName, argValue);
			}
			if(!success && options.stopAtError)
			{
				return result;
			}
			continue;
		}

		result.strays.push(arg);
		if(options.stopAtStray)
		{
			return result;
		}
	}

	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];
		if(result.args[arg] === undefined)
		{
			if(arg.default !== undefined)
			{
				result.args[arg.name] = arg.default;
			}
			continue;
		}
	}

	result.lastIndex = args.length - 1;
	return result;
}

module.exports = parseArgs;
