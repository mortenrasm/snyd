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
            rooms[room] = {
                players: [],
                currentTurnIndex: 0,
                currentBid: null, 
                gameActive: false
            };
        }

        const newPlayer = {
            id: socket.id,
            username: username,
            dice: [],
            diceCount: 5,
            isReady: false // <--- NEW: Track ready status
        };

        rooms[room].players.push(newPlayer);
        io.to(room).emit('roomUpdate', rooms[room]);
    });

    // NEW: Handle Ready Click
    socket.on('playerReady', (roomName) => {
        const room = rooms[roomName];
        if (!room) return;

        // Find player and toggle ready
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = true;
        }

        // Check if ALL players are ready
        const allReady = room.players.every(p => p.isReady);
        const playerCount = room.players.length;

        // Auto-Start if >1 player and all are ready
        if (playerCount > 1 && allReady) {
            startGameLogic(room, roomName);
        } else {
            // Just update UI to show checkmarks
            io.to(roomName).emit('roomUpdate', room);
        }
    });

    function startGameLogic(room, roomName) {
        room.gameActive = true;
        room.currentBid = null;
        room.currentTurnIndex = 0; 
        
        // Roll dice
        room.players.forEach(p => {
            p.dice = [];
            if(p.diceCount > 0) {
                for(let i=0; i < p.diceCount; i++) {
                    p.dice.push(Math.ceil(Math.random() * 6));
                }
                p.dice.sort((a,b) => a-b);
            }
        });

        // Find starter
        while(room.players[room.currentTurnIndex].diceCount === 0) {
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
        }

        io.to(roomName).emit('gameStarted', room);
    }

    socket.on('placeBid', ({ room, quantity, face }) => {
        const r = rooms[room];
        if (!r) return;

        if (r.currentBid) {
            if (quantity < r.currentBid.quantity) return; 
            if (quantity === r.currentBid.quantity && face <= r.currentBid.face) return;
        }

        r.currentBid = { quantity, face, player: socket.id };
        
        do {
            r.currentTurnIndex = (r.currentTurnIndex + 1) % r.players.length;
        } while (r.players[r.currentTurnIndex].diceCount === 0);
        
        io.to(room).emit('roomUpdate', r);
    });

    socket.on('callLiar', (roomName) => {
        const r = rooms[roomName];
        if (!r || !r.currentBid) return;

        const allDice = [];
        r.players.forEach(p => allDice.push(...p.dice));
        const targetFace = r.currentBid.face;
        const count = allDice.filter(d => d === targetFace || d === 1).length; // 1s are wild

        const bidWasTrue = count >= r.currentBid.quantity;
        
        let loserIndex;
        if (bidWasTrue) {
            loserIndex = r.currentTurnIndex;
        } else {
            loserIndex = r.players.findIndex(p => p.id === r.currentBid.player);
        }

        const loser = r.players[loserIndex];
        loser.diceCount--;

        // Reset Round & Ready Statuses
        r.gameActive = false;
        r.currentBid = null;
        r.players.forEach(p => p.isReady = false); // <--- Reset ready so they must click again

        r.currentTurnIndex = loserIndex;
        if (loser.diceCount === 0) {
             do {
                r.currentTurnIndex = (r.currentTurnIndex + 1) % r.players.length;
            } while (r.players[r.currentTurnIndex].diceCount === 0);
        }
        
        io.to(roomName).emit('roundOver', {
            allPlayers: r.players,
            message: `Result: There were ${count} ${targetFace}s. ${loser.username} loses a die!`
        });
    });

    socket.on('disconnect', () => {
        // Logic to remove player from array could go here
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
