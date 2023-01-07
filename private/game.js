const Utils = require('./utils.js');

class Game {
    constructor(){
        let that = this;

        this.level = "blank_scene.gltf";
        this.state_update_interval = 100; //milliseconds
        this.players = [];

        setInterval(() => that.updateInterval(), this.state_update_interval);
    }

    handle_newPlayer(player){
        console.log('New player');
        this.players.push(player);
        player.send({
            type: "new_game",
            level: this.level,
            id: player.id
        });
    }

    handle_exitPlayer(player){
        this.players = this.players.filter((player_p) => player_p.id !== player.id);
        console.log(`Exit player. Size: ${this.players.length}`);
    }

    handle_ClientEvent(player, data){
        switch (data.type){
            case "player_state_update":
                player.state = data;
                break;
        }
    }

    updateInterval(){
        this.handle_Collision();

        let game_state = {
            type: "game_state_update",
            state_update_interval: this.state_update_interval,
            players: this.players.reduce((filtered, player) => {
                if (player.state){
                    filtered.push(player.state); 
                }
                return filtered;
            }, [])
        }
        this.players.forEach((player) => {
            if (player.state != null){
                player.send(game_state);
            }
        });
    }

    handle_Collision(){
        let that = this;
        this.players.forEach((playerA) => {
            that.players.forEach((playerB) => {
                if (playerA.state && playerB.state && playerA.id !== playerB.id && Utils.distance(playerA.state.position, playerB.state.position) < (playerA.state.radius + playerB.state.radius)){
                    playerA.state.is_touching = true;
                }
            });
        });
    }
}

exports.Game = Game;