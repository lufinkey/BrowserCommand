
const EventEmitter = require('events');

class JobManager extends EventEmitter
{
	constructor()
	{
		super();

		this._jobs = {
			//<JOB KEY>: function(completion)
		};

		this._batchCounter = 0;
	}

	addJob(key, executor)
	{
		if(this._jobs[key] !== undefined)
		{
			throw new Error("Job already exists with the key "+key);
		}

		this._jobs[key] = executor;
	}

	hasJob(key)
	{
		if(this._jobs[key] === undefined)
		{
			return false;
		}
		return true;
	}

	removeJob(key)
	{
		delete this._jobs[key];
	}

	removeAllJobs()
	{
		this._jobs = {};
	}

	execute(completion)
	{
		var jobs = Object.assign({}, this._jobs);
		var batchId = this._batchCounter;
		this._batchCounter++;
		var jobKeys = Object.keys(jobs);

		var responded = {};
		var responses = {};
		var errors = {};

		// create function that will collect and count the job responses
		var collectJobResponse = (key, response, error) => {
			responded[key] = true;
			if(response !== undefined)
			{
				responses[key] = response;
			}
			if(error !== undefined)
			{
				errors[key] = error;
			}

			this.emit('jobComplete', { batchId: batchId, jobKey: key });
	
			for(const checkKey of jobKeys)
			{
				if(!responded[checkKey])
				{
					return;
				}
			}

			this.emit('batchComplete', { batchId: batchId, jobs: jobs });
			completion(responses, errors);
		};

		// create function that will create the callback for executor
		var createExecutorCallback = (key) => {
			return function(response) {
				collectJobResponse(key, response, undefined);
			};
		};

		// perform jobs
		for(var jobKey in jobs)
		{
			var executor = jobs[jobKey];
			try
			{
				executor(createExecutorCallback(jobKey));
			}
			catch(error)
			{
				console.error("job error: ", error);
				this.emit('jobError', { batchId: batchId, jobKey: jobKey, error: error });
				if(!responded[jobKey])
				{
					collectJobResponse(jobKey, undefined, error);
				}
			}
		}

		return batchId;
	}
}

module.exports = JobManager;
