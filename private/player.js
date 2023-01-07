const { v4: uuidv4 } = require('uuid');
const expressWs = require('express-ws');

class Player {
    constructor(ws) {
        this.ws = ws;
        this.ws.player = this;
        this.id = uuidv4();

        this.state = null;
    }

    send(data){
        if (this.ws._readyState === 1){ // Socket is open
            this.ws.send(JSON.stringify(data));
        }
    }
}

exports.Player = Player;