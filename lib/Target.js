
const Target = {};
module.exports = Target;

// targetting functions

const allowedTargetTypes = ['server','controller'];

Target.parse = function(targetStr)
{
	// regex parse target
	var matches = targetStr.match(new RegExp('^('+allowedTargetTypes.join('|')+')(?::([^:\/]+)(?:\/(.*))?)?$'));
	if(matches == null)
	{
		return null;
	}
	// create target
	var target = {
		type: matches[1],
		name: matches[2],
		identifier: matches[3]
	};
	// clean up properties
	if(target.name === undefined)
	{
		target.name = null;
	}
	if(target.identifier === undefined)
	{
		target.identifier = null;
	}
	// validate target
	if(target.type == 'server' && (target.name !== null || target.identifier !== null))
	{
		return null;
	}
	return target;
}

Target.fromParts = function(type, name, identifier)
{
	if(!allowedTargetTypes.includes(type))
	{
		return null;
	}
	if(name === undefined)
	{
		name = null;
	}
	if(identifier === undefined)
	{
		identifier = null;
	}
	return { type: type, name: name, identifier: identifier };
}

Target.equal = function(target1, target2)
{
	if(target1 == null || target2 == null)
	{
		return false;
	}
	if(target1.type !== target2.type || target1.name !== target2.name)
	{
		return false;
	}
	if(target1.identifier !== target2.identifier)
	{
		return false;
	}
	return true;
}

Target.match = function(target, cmpTarget)
{
	if(target == null || cmpTarget == null)
	{
		return false;
	}
	if(target.type !== cmpTarget.type || target.name !== cmpTarget.name)
	{
		return false;
	}
	if(target.identifier === null)
	{
		return true;
	}
	else if(target.identifier !== cmpTarget.identifier)
	{
		return false;
	}
	return true;
}

Target.stringify = function(target)
{
	var targetStr = ''+target.type;
	if(target.name != null)
	{
		targetStr += ':'+target.name;
		if(target.identifier != null)
		{
			targetStr += '/'+target.identifier;
		}
	}
	return targetStr;
}
