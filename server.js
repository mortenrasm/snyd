const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    console.log('User connected: ' + socket.id);

    socket.on('joinRoom', ({ username, room }) => {
        socket.join(room);
        
        if (!rooms[room]) {
            rooms[room] = { players: [], currentTurnIndex: 0, currentBid: null, gameActive: false };
        }

        const newPlayer = {
            id: socket.id,
            username: username,
            dice: [],
            diceCount: 5,
            isReady: false
        };
        rooms[room].players.push(newPlayer);
        io.to(room).emit('roomUpdate', rooms[room]);
    });

    socket.on('playerReady', (roomName) => {
        const room = rooms[roomName];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.isReady = true;

        const allReady = room.players.every(p => p.isReady);
        if (room.players.length > 1 && allReady) {
            startGameLogic(room, roomName);
        } else {
            io.to(roomName).emit('roomUpdate', room);
        }
    });

    function startGameLogic(room, roomName) {
        room.gameActive = true;
        room.currentBid = null;
        room.currentTurnIndex = 0; 
        
        room.players.forEach(p => {
            p.dice = [];
            if(p.diceCount > 0) {
                for(let i=0; i < p.diceCount; i++) {
                    p.dice.push(Math.ceil(Math.random() * 6));
                }
                p.dice.sort((a,b) => a-b);
            }
        });

        while(room.players[room.currentTurnIndex].diceCount === 0) {
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        }
        io.to(roomName).emit('gameStarted', room);
    }

    socket.on('placeBid', ({ room, quantity, face }) => {
        const r = rooms[room];
        if (!r) return;
        if (r.currentBid && (quantity < r.currentBid.quantity || (quantity === r.currentBid.quantity && face <= r.currentBid.face))) return;

        r.currentBid = { quantity, face, player: socket.id };
        do {
            r.currentTurnIndex = (r.currentTurnIndex + 1) % r.players.length;
        } while (r.players[r.currentTurnIndex].diceCount === 0);
        
        io.to(room).emit('roomUpdate', r);
    });

    socket.on('callLiar', (roomName) => {
        const r = rooms[roomName];
        if (!r || !r.currentBid) return;

        const allDice = r.players.flatMap(p => p.dice);
        const targetFace = r.currentBid.face;
        const count = allDice.filter(d => d === targetFace || d === 1).length;

        const bidWasTrue = count >= r.currentBid.quantity;
        
        // --- LOGIC FIX: In this version, the WINNER of the challenge loses a die ---
        let winnerIndex;
        if (bidWasTrue) {
            // The bidder was correct, they "won" the challenge.
            winnerIndex = r.players.findIndex(p => p.id === r.currentBid.player);
        } else {
            // The challenger correctly called liar, they "won".
            winnerIndex = r.currentTurnIndex;
        }
        
        const loserIndex = winnerIndex; // The "winner" loses a die.
        const loser = r.players[loserIndex];
        if (loser) loser.diceCount--;

        r.gameActive = false;
        r.currentBid = null;
        r.players.forEach(p => p.isReady = false);

        r.currentTurnIndex = loserIndex;
        if (loser && loser.diceCount === 0) {
             do {
                r.currentTurnIndex = (r.currentTurnIndex + 1) % r.players.length;
            } while (r.players[r.currentTurnIndex].diceCount === 0);
        }
        
        io.to(roomName).emit('roundOver', {
            allPlayers: r.players,
            message: `Result: There were ${count} ${targetFace}s. ${loser.username} loses a die!`
        });
    });

    socket.on('disconnect', () => { console.log('User disconnected'); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
