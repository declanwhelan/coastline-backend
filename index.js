import 'dotenv/config'
import moment from "moment";
import https from 'https';

// json fallback examples
import exDublin from './json/exampleDublin.json' assert {type: 'json'};
import exNYC from './json/exampleNYC.json' assert {type: 'json'};

import SocketManager from './SocketManager.js';
import JobQueueManager from './JobQueueManager.js';

// used for third party. they can have random rate limits on the free tier.
const WEATHER_RATE_LIMIT_HIT = 429001;
const weatherData = [];
let socketManager = null;
let jobQueueManager = null;

const locationTypes = {
    1: {
        name: "Dublin",
        url: `https://api.tomorrow.io/v4/weather/realtime?location=dublin&apikey=${process.env.TOMORROW_API_KEY}`
    },
    2: {
        name: "New York",
        url: `https://api.tomorrow.io/v4/weather/realtime?location=new%20york&apikey=${process.env.TOMORROW_API_KEY}`
    }
}

/*
* sent to the client side so we can add any new locations whenever we want
*/
const locationIDs = [
    { id: 1, name: 'Dublin' },
    { id: 2, name: 'New York' }
]

function start() {
    socketManager = new SocketManager(8080);
    jobQueueManager = new JobQueueManager(locationTypes);

    socketManager.on('status', sendStatus)
    socketManager.on('cancel', cancelJob)
    socketManager.on('locations', () => socketManager.sendData('locations', locationIDs))
    socketManager.on('schedule', scheduleJob)
    socketManager.on('error', (data) => socketManager.sendError(data))
}

function sendStatus() {
    const organisedJobs = jobQueueManager.jobQueue.sort((a, b) => moment(a.runtime).diff(moment(b.runtime)))
    const organisedWeather = weatherData.sort((a, b) => moment(a.data.time).diff(moment(b.data.time)))
    socketManager.sendData('status', { jobs: organisedJobs, results: organisedWeather.reverse().slice(0, 10) });
}

function cancelJob(data) {
    if (!jobQueueManager.jobQueued(data.id)) 
        socketManager.sendError("Job could not be found.")
    else {
        jobQueueManager.cancelScheduledJob(data.id);
        jobQueueManager.removeFromQueue(data.id)
        sendStatus();
    }
}

function scheduleJob(job) {
    const jobRecord = jobQueueManager.generateJobRecord(job.location, job.runtime);

    const validDate = jobQueueManager.isJobRecordDateValid(jobRecord)
    const validLocation = jobQueueManager.isJobRecordLocationValid(jobRecord)

    if (validDate && validLocation) {
        jobQueueManager.addToQueue(jobRecord, weatherCheckJob);
        sendStatus();
    } else {
        if (!validDate) socketManager.sendError("date is not in the correct format")
        else if (!validLocation) socketManager.sendError("the location you picked is not valid")
    }
}

function weatherCheckJob(id) {
    const jobDetails = jobQueueManager.jobQueue.find((job) => job.id === id);
    const weatherApiUrl = locationTypes[jobDetails.location].url;
    https.get(weatherApiUrl, (resp) => {
        let data = '';
        resp.on('data', (chunk) => data += chunk)
        resp.on('end', () => {
            const response = JSON.parse(data);
            if (response.data !== undefined) {
                weatherData.push({
                    location: locationTypes[jobDetails.location].name,
                    datetime: new Date(),
                    data: JSON.parse(data).data
                });
                jobQueueManager.removeFromQueue(jobDetails.id);
                sendStatus();
            } else if (response.code === WEATHER_RATE_LIMIT_HIT) {
                weatherData.push({
                    location: locationTypes[jobDetails.location].name,
                    datetime: new Date(),
                    data: jobDetails.location === 1 ? exDublin.data : exNYC.data
                })
                jobQueueManager.removeFromQueue(jobDetails.id);
                sendStatus();
                socketManager.sendError("rate limit for 3rd party app has been hit, falling back to some local data");
            }
        });
    })
}

start();