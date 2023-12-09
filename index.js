import 'dotenv/config'
import moment from "moment";
import https from 'https';
import { WebSocketServer } from "ws";
import { v4 as uuid } from 'uuid';
import { scheduleJob, scheduledJobs } from "node-schedule";

// json fallback examples
import exDublin from './json/exampleDublin.json' assert {type: 'json'};
import exNYC from './json/exampleNYC.json' assert {type: 'json'};

// used for third party. they can have random rate limits on the free tier.
const WEATHER_RATE_LIMIT_HIT = 4290001;
const jobQueue = [];
const weatherData = [];

// make the Websocket global so we can use it all over instead of passing.
let globalWS = null;
const wss = new WebSocketServer({ port: 8080 });


// used to ascertain the location 3rd party API urls
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

wss.on("connection", function connection(ws) {
    globalWS = ws;
    ws.on("message", function message(data) {
        const parsedData = JSON.parse(data);
        
        switch(parsedData.type) {
            case "cancel": 
                const jobIndex = jobQueue.findIndex((obj) => obj.id === parsedData.id);
                if (jobIndex < 0) sendError("Job could not be found.")
                else {
                    jobQueue.splice(jobIndex, 1);
                    scheduledJobs[parsedData.id].cancel();
                    sendStatus();
                } 
                break;
            case "locations": 
                sendData({type: 'locations', data: locationIDs })
                break;
            case "status":
                sendStatus();
                break;
            case "schedule": 
                generateJobAndSchedule(parsedData.data)
                break;
            default: 
                sendError("Message incorrectly formatted")
        }

    });
});

function sendData(details) {
    globalWS.send(JSON.stringify(details));
}

function sendError(text) {
    sendData({type: "error", data: text})
}
function sendStatus() {
    const organisedJobs = jobQueue.sort((a, b) =>  moment(a.runtime).diff(moment(b.runtime)))
    const organisedWeather = weatherData.sort((a, b) =>  moment(a.data.time).diff(moment(b.data.time)))
    sendData({
        type: 'status',
        data: {
            jobs: organisedJobs, 
            results: organisedWeather.reverse().slice(0,10),
        }
    });
}

function generateJobAndSchedule(job) {
    const jobRecord = { id: uuid(), location: job.location, runtime: job.runtime }

    const validDate = moment(jobRecord.runtime, "YYYY-MM-DDTHH:mm", true).isValid()
    const validLocation = locationTypes[jobRecord.location] !== undefined
    
    if(validDate && validLocation) {
        jobQueue.push(jobRecord);
        scheduleJob(
            jobRecord.id, 
            moment(jobRecord.runtime, "YYYY-MM-DDTHH:mm").toDate(),
            runWeatherCheckJob.bind(null, jobRecord.id)
        );
        sendStatus();
    } else {
        if(!validDate) sendError("date is not in the correct format")
        else if(!validLocation) sendError("the location you picked is not valid")
    }
}

function removeJobFromQueue(id) {
    const jobIndex = jobQueue.findIndex((obj) => obj.id === id);
    jobQueue.splice(jobIndex, 1);
}

function runWeatherCheckJob(id) {
    const jobDetails = jobQueue.find((job) => job.id === id);
    const weatherApiUrl = locationTypes[jobDetails.location].url;
    https.get(weatherApiUrl, (resp) => {
        let data = '';
        resp.on('data', (chunk) => data += chunk)
        resp.on('end', () => {
            const response = JSON.parse(data);
            if(response.data){
                weatherData.push({
                    location: locationTypes[jobDetails.location].name,
                    datetime: new Date(), 
                    data: JSON.parse(data).data
                });
                removeJobFromQueue(jobDetails.id);
                sendStatus();
            } else if(response.code === WEATHER_RATE_LIMIT_HIT) {
                weatherData.push({
                    location: locationTypes[jobDetails.location].name,
                    datetime: new Date(),
                    data: jobDetails.location === 1 ? exDublin.data.values : exNYC.data.values
                })
                removeJobFromQueue(jobDetails.id);
                sendStatus();
                sendError("rate limit for 3rd party app has been hit, falling back to some local data");
            }
        });
    })
}

