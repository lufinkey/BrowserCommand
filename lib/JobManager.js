
const EventEmitter = require('events');

class JobManager extends EventEmitter
{
	constructor()
	{
		super();

		this._jobs = {
			//<JOB KEY>: function(resolve, reject)
		};

		this._batchCounter = 0;
	}

	addJob(key, promise)
	{
		if(this._jobs[key] !== undefined)
		{
			throw new Error("Job already exists with the key "+key);
		}

		if(!(promise instanceof Promise))
		{
			throw new Error("invalid promise");
		}

		this._jobs[key] = promise;
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
		let jobs = Object.assign({}, this._jobs);
		this._jobs = {};
		let jobKeys = Object.keys(jobs);

		let batchId = this._batchCounter;
		this._batchCounter++;

		var responded = {};
		var responses = {};
		var errors = {};

		// create function that will collect and count the job responses
		var collectJobResponse = (key, response, error) => {
			responded[key] = true;

			// collect response
			if(response !== undefined)
			{
				responses[key] = response;
			}
			if(error != null)
			{
				errors[key] = error;
			}

			// send event
			this.emit('jobComplete', { batchId: batchId, jobKey: key });
	
			// check if all jobs have finished
			for(const checkKey of jobKeys)
			{
				if(!responded[checkKey])
				{
					// a job has not yet finished
					return;
				}
			}

			// all jobs have finished
			this.emit('batchComplete', { batchId: batchId, jobs: jobs });
			if(completion)
			{
				completion(responses, errors);
			}
		};

		// perform jobs
		for(let jobKey of jobKeys)
		{
			var executor = jobs[jobKey];
			executor.then((response) => {
				collectJobResponse(jobKey, response, undefined);
			}).catch((error) => {
				collectJobResponse(jobKey, undefined, error);
			});
		}

		return batchId;
	}
}

module.exports = JobManager;
