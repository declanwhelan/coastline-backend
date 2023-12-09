## Backend to weather check scheduler

### Installation

 - to install all dependencies, run 

    ```npm install```

 - then you need to create a `.env` file for the 3rd party application key (declan will have emailed this to you). Just rename `.env.example` to `.env` and input the value in place of `<YOUR API KEY HERE>`

 - then to run the app run 

    ``` node index.js ```

*App requires a version of node 17+. This is due to the fallback for when the 3rd party API is rate limiting the free account. It is using a new enough experimental way to import JSON files. Usually this is not something you would do in a production environment but it stops this example from looking very broken for the testers sake*

### Rationale

The app is made of three main parts. Point of entry is `index.js` which makes use of two other classes: `JobQueueManager` and `SocketManager`, included to seperate concerns. 

- `Index.js` - our entry point. Creates the other Class objects then acts as a bridge between the inputs coming from the socketmanager and the functions in the JobQueueManager. The results queue is in here two, named `weatherData` whose update and maintenance is small enough to not require its own manager class. The job which accesses the 3rd party(tomorrow.io) is in this file, as well as a basic fallback as free weather APIs tend to be fairly aggressive with rate limiting and in my experience tend to do this without warning. 

- `JobQueueManager` - looks after the job queue and the scheduled tasks, keeps the job list and provides functions for updating the queue.   

- `SocketManager` - acts as a wrapper to the socket and makes all IO uniform and follow a contract. 
    All messages coming into the socket are expected to be of the form `{type: <operation_name>, data:<required_data>}` and the socketmanager outputs all messages in a similar fashion. One exception is errors which return as `{type: error, text: <error text>}`. There is a rudimentary passlist in this class to only allow a specific set of operations, namely ```cancel|locations|status|schedule```

