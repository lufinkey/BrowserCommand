
// represents browser.runtime, and handles browser.runtime.lastError
class WebExtRuntime
{
	constructor()
	{
		this._options = options;

		this._lastError = null;
		this._lastFunc = null;
		this._lastErrorChecked = false;
	}

	get lastError()
	{
		if(this._lastError != null)
		{
			this._lastErrorChecked = true;
		}
		return this._lastError;
	}

	_setLastError(error, func)
	{
		this._lastError = error;
		this._lastFunc = func;
		this._lastErrorChecked = false;
	}

	_unsetLastError()
	{
		var error = this._lastError;
		var func = this._lastFunc;
		var checked = this._lastErrorChecked;

		this._lastError = null;
		this._lastFunc = null;
		this._lastErrorChecked = false;
		
		if(error != null && !checked)
		{
			console.error("Unchecked runtime.lastError while running "+func+": "+error.message);
		}
	}
}
