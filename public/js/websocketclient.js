
class WSClient {
    constructor(open_callback, message_callback, close_callback){
        let that = this;

        this.ws_protocol = window.location.protocol == "https:" ? "wss:" : "ws:";
        this.ws_url = `${this.ws_protocol}//${window.location.host}/timecubes/connection`;
        this.open_callback = open_callback;
        this.message_callback = message_callback;
        this.close_callback = close_callback;
        this.is_closed = true;

        this.ws = new WebSocket(this.ws_url);
        this.ws.onopen = (e) => that.onOpen(e);
        this.ws.onmessage = (msg) => that.onMessage(msg);
        this.ws.onclose = () => that.onClose();
    }

    onOpen(e){
        this.is_closed = false;
        console.log("Connection Opened");
        this.open_callback();
    }

    onMessage(message){
        this.message_callback(JSON.parse(message.data));
    }

    onClose(){
        this.is_closed = true;
        console.log("On close");
        this.close_callback();
    }

    send(message){
        if (this.is_closed && this.ws.readyState !== 1){ // Web socket not OPEN state
            console.error("Web Socekt is Closed");
            return;
        }
        this.ws.send(JSON.stringify(message));
    }
}