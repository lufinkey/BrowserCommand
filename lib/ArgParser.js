
const { URL } = require('url');
const Introspect = require('./Introspect');

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
	maxStrays: 1,
	unmappedArgsDefault: 'stray' | 'boolean' | 'string' | null,
	dontPopulateErrors: false,
	stopAtError: true,
	stopIfTooManyStrays: true,
	errorExitCode: -1,
	parentOptions: undefined,
	parentResult: undefined
}


Result

{
	args: {},
	strays: [],
	errors: [],
	endIndex: -1
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
				return JSON.parse(value);
			}
			catch(e) {}
			return value;

		case 'url':
			try
			{
				new URL(value);
				return value;
			}
			catch(e) {}
			if(value.split('.').length < 2 || value.indexOf(':/') !== -1 || value.startsWith('/') || value.startsWith('\\'))
			{
				return null;
			}
			try
			{
				new URL('http://'+value);
				return 'http://'+value;
			}
			catch(e) {}
			return null;
		
		case 'urlpattern':
			try
			{
				var urlstr = value.replace("*", "aaa");
				new URL(value);
				return value;
			}
			catch(e) {}
			return null;

		default:
			throw new Error("invalid type "+type);
	}
}

function createEntry(receiver, path, value, is_array=false)
{
	if(is_array)
	{
		Introspect.push(receiver, path, value);
	}
	else
	{
		Introspect.put(receiver, path, value);
	}
}

function getOptionsArg(options, argName)
{
	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];
		if(arg.type == 'object')
		{
			if(argName.startsWith(arg.name+'.'))
			{
				return arg;
			}
			else if(argName == arg.name)
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

function isOptionsArgFlag(options, argName)
{
	var arg = getOptionsArg(options, argName);
	if(arg === null)
	{
		if(options.parentOptions !== undefined && options.parentOptions !== null)
		{
			return isOptionsArgFlag(options.parentOptions, argName);
		}
		return true;
	}
	else if(arg.type == 'boolean')
	{
		return true;
	}
	return false;
}

function addArgIfPossible(result, options, fullArg, argName, argValue)
{
	var arg = getOptionsArg(options, argName);
	if(arg === null)
	{
		//see if parent options accept argument
		if(options.parentOptions != null && options.parentResult != null)
		{
			var parentOptions = {};
			parentOptions.args = options.parentOptions.args;
			parentOptions.dontPopulateErrors = true;
			parentOptions.parentOptions = options.parentOptions.parentOptions;
			parentOptions.parentResult = options.parentOptions.parentResult;
			var addInfo = addArgIfPossible(options.parentResult, parentOptions, fullArg, argName, argValue);
			if(addInfo.added || addInfo.error != null)
			{
				return addInfo;
			}
		}
		switch(options.unmappedArgsDefault)
		{
			case 'stray':
				return { added: false, error: null };

			case 'boolean':
				var value = true;
				if(argValue !== undefined && argValue !== null)
				{
					value = validateValue('boolean', argValue);
				}
				if(value === null)
				{
					return { added: false, error: "invalid argument "+fullArg };
				}
				result.args[argName] = value;
				return { added: true, error: null };

			case 'string':
				result.args[argName] = argValue;
				return { added: true, error: null };

			case null:
			case undefined:
				return { added: false, error: "invalid argument "+fullArg };

			default:
				throw new Error("invalid value "+options.unmappedArgsDefault+" for options.unmappedArgsDefault");
		}
	}
	else
	{
		if(arg.type == 'stray')
		{
			var strayResult = addStrayIfPossible(result, options, argValue);
			var error = null;
			if(!strayResult.added && !strayResult.stopped)
			{
				error = new Error("too many parameters");
			}
			return {
				added: strayResult.added,
				stopped: strayResult.stopped,
				error: error
			};
		}

		var valType = arg.type;
		if(arg.type == 'object')
		{
			valType = 'json';
		}
		if(arg.type == 'boolean' && (argValue === null || argValue === undefined))
		{
			argValue = 'true';
		}

		var value = validateValue(valType, argValue);
		if(value === null)
		{
			var argFront = fullArg.split('=')[0];
			return { added: false, error: "invalid value for argument "+argFront };
		}

		if(arg.values instanceof Array)
		{
			var foundMatch = false;
			for(var i=0; i<arg.values.length; i++)
			{
				var possibleValue = arg.values[i];
				if(value === possibleValue)
				{
					foundMatch = true;
					break;
				}
			}
			if(!foundMatch)
			{
				var argFront = fullArg.split('=')[0];
				return { added: false, error: "invalid value for argument "+argFront };
			}
		}

		if(arg.type == 'object')
		{
			if(argName == arg.name && typeof value != 'object')
			{
				return { added: false, error: "invalid value for argument "+argFront };
			}
			if(arg.path)
			{
				createEntry(result.args, arg.path.concat(argName.split('.')), value, arg.array);
			}
			else
			{
				createEntry(result.args, argName.split('.'), value, arg.array);
			}
		}
		else if(arg.path)
		{
			createEntry(result.args, arg.path, value, arg.array);
		}
		else
		{
			result.args[arg.name] = value;
		}
		return { added: true, error: null };
	}
}

function addStrayIfPossible(result, options, stray)
{
	if(typeof options.maxStrays != 'number')
	{
		// we're not allowed to have strays
		return { added: false, stopped: false };
	}
	else if(options.maxStrays >= 0 && options.maxStrays <= result.strays.length)
	{
		// we have too many strays
		if(options.stopIfTooManyStrays)
		{
			// we should stop parsing arguments
			return { added: false, stopped: true };
		}
		return { added: false, stopped: false };
	}

	// get path for stray arguments
	var strayPath = ['strays'];
	if(options.strayPath)
	{
		strayPath = ['args'].concat(options.strayPath);
	}

	if(options.strayTypes instanceof Array)
	{
		// validate stray type
		for(const possibleType of options.strayTypes)
		{
			if(possibleType instanceof Array)
			{
				// validate stray against possible values
				for(const possibleValue of possibleType)
				{
					var valueType = typeof possibleValue;
					if(valueType == 'string' || valueType == 'boolean' || valueType == 'number')
					{
						if(valueType == 'number')
						{
							// recognize integer vs float
							if(Number.isInteger(possibleValue))
							{
								valueType = 'integer';
							}
							else
							{
								valueType = 'float';
							}
						}
						// validate stray value
						var value = validateValue(valueType, stray);
						if(value === possibleValue)
						{
							// add stray
							if(options.singleStray)
							{
								Introspect.put(result, strayPath, value);
							}
							else
							{
								Introspect.push(result, strayPath, value);
							}
							return { added: true, stopped: false };
						}
					}
					else
					{
						throw new Error("invalid type "+valueType+" for strayTypes");
					}
				}
			}
			else
			{
				// validate stray against type
				var value = validateValue(possibleType, stray);
				if(value !== null)
				{
					// add stray
					if(options.singleStray)
					{
						Introspect.put(result, strayPath, value);
					}
					else
					{
						Introspect.push(result, strayPath, value);
					}
					return { added: true, stopped: false };
				}
			}
		}
		return { added: false, stopped: false };
	}

	// add stray
	if(options.singleStray)
	{
		Introspect.put(result, strayPath, stray);
	}
	else
	{
		Introspect.push(result, strayPath, stray);
	}
	return { added: true, stopped: false };
}

function parseArgs(args, options)
{
	var result = {
		args: {},
		strays: [],
		errors: [],
		endIndex: -1
	}

	var stopped = false;
	for(var i=0; i<args.length; i++)
	{
		result.endIndex = i;

		var arg = args[i];
		var addResult = null;

		var matches = arg.match(new RegExp('^--(.*)=(.*)$'));
		if(matches == null)
		{
			matches = arg.match(new RegExp('^-(.*)=(.*)$'));
		}
		if(matches != null)
		{
			var argName = matches[1];
			var argValue = matches[2];
			var addResult = addArgIfPossible(result, options, arg, argName, argValue);
		}
		else
		{
			matches = arg.match(new RegExp('^--(.*)$'));
			if(matches == null)
			{
				matches = arg.match(new RegExp('^-(.*)$'))
			}
			if(matches != null)
			{
				var argName = matches[1];
				var addResult = null;
				if(isOptionsArgFlag(options, argName))
				{
					addResult = addArgIfPossible(result, options, arg, argName);
				}
				else
				{
					i++;
					result.endIndex = i;
					var argValue = args[i];
					addResult = addArgIfPossible(result, options, arg, argName, argValue);
				}
			}
		}

		if(addResult != null)
		{
			if(addResult.stopped)
			{
				stopped = true;
				break;
			}
			else if(addResult.error != null)
			{
				if(!options.dontPopulateErrors)
				{
					result.errors.push(addResult.error);
				}
				if(options.stopAtError)
				{
					stopped = true;
					break;
				}
				continue;
			}
			else if(addResult.added)
			{
				result.endIndex = i+1;
				continue;
			}
			else if(options.unmappedArgsDefault == 'stray')
			{
				var strayResult = addStrayIfPossible(result, options, arg);
				if(strayResult.stopped)
				{
					stopped = true;
					break;
				}
				else if(strayResult.added)
				{
					result.endIndex = i+1;
					continue;
				}
			}
		}
		else
		{
			var strayResult = addStrayIfPossible(result, options, arg);
			if(strayResult.stopped)
			{
				stopped = true;
				break;
			}
			else if(strayResult.added)
			{
				result.endIndex = i+1;
				continue;
			}
		}

		if(!options.dontPopulateErrors)
		{
			result.errors.push("invalid argument "+arg);
		}
		if(options.stopAtError)
		{
			stopped = true;
			break;
		}
	}

	for(var i=0; i<options.args.length; i++)
	{
		var arg = options.args[i];

		if(arg.default !== undefined)
		{
			// check if a value exists for the argument
			var hasEntry = false;
			if(arg.path)
			{
				if(Introspect.query(result.args, arg.path) !== undefined)
				{
					hasEntry = true;
				}
			}
			else
			{
				if(result.args[arg.name] !== undefined)
				{
					hasEntry = true;
				}
			}
			// store default value for argument if there was no entry
			if(!hasEntry)
			{
				if(arg.path)
				{
					createEntry(result.args, arg.path, arg.default);
				}
				else
				{
					result.args[arg.name] = arg.default;
				}
			}
		}
	}

	if(!stopped)
	{
		result.endIndex = args.length - 1;
	}

	if(options.errorExitCode > 0)
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

module.exports = {
	parse: parseArgs,
	validate: validateValue
};
