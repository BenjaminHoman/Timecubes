const express = require('express')
const app = express()
const expressWs = require('express-ws')(app);
const Game = require('./private/game.js');
const Player = require('./private/Player.js');
const port = 3010;

// Globals
let game = new Game.Game();

app.use('/timecubes', express.static('public'))
app.use('/timecubes', express.static('assets'))

// Ignore Favicon for now. it is annoying.
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.ws('/timecubes/connection', function(ws, req) {
    game.handle_newPlayer(new Player.Player(ws));

    ws.on('close', () => {
        if (ws.player){
            game.handle_exitPlayer(ws.player);

        } else {
            console.error("WS has no player object");
        }
    });

    ws.on('error', (msg) => {
        console.error(msg);
    })

    ws.on('message', (message) => {
        game.handle_ClientEvent(ws.player, JSON.parse(message));
    });
});

app.get('/timecubes', (req, res) => {
    res.send('Hello World!')
})

app.get('timecubes/three', (req, res) => {
    res.sendFile(__dirname + "/public/js/lib/three.module.js");
})

app.listen(port, () => {
    console.log(`Game app listening on port ${port}`);
})