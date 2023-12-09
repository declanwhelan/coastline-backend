import { WebSocketServer } from "ws";
import { EventEmitter } from 'node:events';

const messagePassList = ['cancel', 'locations', 'status', 'schedule']

export default class SocketManager extends EventEmitter {
    socket = null;
    socketService = null;

    constructor(socketPort) {
        super();
        this.socketService = new WebSocketServer({ port: socketPort });
        const _this = this;
        this.socketService.on("connection", function connection(ws) {
            _this.socket = ws;
            _this.socket.on("message", function message(data) {
                const parsedData = JSON.parse(data);
                if (messagePassList.includes(parsedData.type) || false) {
                    _this.emit(`${parsedData.type}`, parsedData.data);
                } else {
                    _this.sendError("Message is not recognised")
                }
            });
        });
    }

    sendData(type, data) {
        this.socket.send(JSON.stringify({ type, data }));
    }

    sendError(text) {
        this.sendData("error", text)
    }

}