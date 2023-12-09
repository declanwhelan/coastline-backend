import { v4 as uuid } from 'uuid';
import { scheduleJob, scheduledJobs } from "node-schedule";
import moment from "moment";

export default class JobQueueManager {
    jobQueue = null;
    locations = {}

    constructor(locations) {
        this.jobQueue = [];
        this.locations = locations
    }

    generateJobRecord( location, runtime) {
        return {id: uuid(), location, runtime}
    }

    isJobRecordDateValid(record) {
        return moment(record.runtime, "YYYY-MM-DDTHH:mm", true).isValid()
    }

    isJobRecordLocationValid(record) {
        return this.locations[record.location] !== undefined
    }

    addToQueue(record, jobFn) {
        this.jobQueue.push(record);
        scheduleJob(
            record.id,
            moment(record.runtime, "YYYY-MM-DDTHH:mm").toDate(),
            jobFn.bind(null, record.id)
        );
    }

    removeFromQueue(id) {
        const jobIndex = this.jobQueue.findIndex((obj) => obj.id === id);
        this.jobQueue.splice(jobIndex, 1);
    }

    jobQueued(id) {
        return this.jobQueue.findIndex((obj) => obj.id === id) >= 0
    }

    cancelScheduledJob(id) {
        if(scheduledJobs[id] != undefined){
            scheduledJobs[id].cancel();
        }
    }
}