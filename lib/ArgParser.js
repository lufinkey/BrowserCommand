
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
	stopAtStray: true,
	stopAtError: true,
	ignoreErrors: false,
	errorExitCode: -1,
	allowUnmappedArgs: false,
	parentOptions: undefined,
	parentResult: undefined
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

		case 'json':
			try
			{
				return JSON.parse(val);
			}
			catch(e)
			{
				return val;
			}

		default:
			throw new Error("invalid type "+type);
	}
}

function createEntry(object, query, value)
{
	var props = query.split('.');
	var currentObj = object;
	for(var i=0; i<(props.length-1); i++)
	{
		if(currentObj[props[i]] === undefined)
		{
			currentObj[props[i]] = {};
		}
		currentObj = currentObj[props[i]];
	}
	currentObj[props[props.length-1]] = value;
}

function getOptionsArg(options, argName)
{
	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];
		if(arg.type == 'json')
		{
			if(argName.startsWith(arg.name+'.'))
			{
				return arg;
			}
		}
		else if(argName == arg.name || argName == arg.short)
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
		//see if parent options accept argument
		if(options.parentOptions != null && options.parentResult != null)
		{
			var parentOptions = {};
			parentOptions.args = options.parentOptions.args;
			parentOptions.allowUnmappedArgs = false;
			parentOptions.ignoreErrors = true;
			parentOptions.parentOptions = options.parentOptions.parentOptions;
			parentOptions.parentResult = options.parentOptions.parentResult;
			var success = addArgIfPossible(options.parentResult, parentOptions, argName, argValue);
			if(success)
			{
				return true;
			}
		}
		if(options.allowUnmappedArgs)
		{
			var value = validateValue('boolean', argValue);
			if(value === null)
			{
				if(!options.ignoreErrors)
				{
					result.errors.push("invalid value for argument "+argName);
				}
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
			if(!options.ignoreErrors)
			{
				result.errors.push("invalid argument "+argName);
			}
			return false;
		}
	}
	else
	{
		var value = validateValue(arg.type, argValue);
		if(value === null)
		{
			if(!options.ignoreErrors)
			{
				result.errors.push("invalid value for argument "+argName);
			}
			return false;
		}
		else
		{
			if(arg.type=='json')
			{
				createEntry(result.args, argName, argValue);
			}
			else
			{
				result.args[arg.name] = value;
			}
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

	var stopped = false;
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
				stopped = true;
				break;
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
				stopped = true;
				break;
			}
			continue;
		}

		result.strays.push(arg);
		if(options.stopAtStray)
		{
			stopped = true;
			break;
		}
	}

	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];
		if(result.args[arg.name] === undefined)
		{
			if(arg.default !== undefined)
			{
				result.args[arg.name] = arg.default;
			}
			continue;
		}
	}

	if(!stopped)
	{
		result.lastIndex = args.length - 1;
	}

	if(options.errorExitCode > 0 && !options.ignoreErrors)
	{
		if(result.errors.length > 0)
		{
			for(var i=0; i<result.errors.length; i++)
			{
				console.error(result.errors[i]);
			}
			process.exit(options.errorExitCode);
		}
	}

	return result;
}

module.exports = parseArgs;
