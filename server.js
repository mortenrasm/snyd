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
            diceCount: 5
        };

        rooms[room].players.push(newPlayer);
        io.to(room).emit('roomUpdate', rooms[room]);
    });

    socket.on('startGame', (roomName) => {
        const room = rooms[roomName];
        if (room && room.players.length > 1) {
            room.gameActive = true;
            room.currentBid = null;
            room.currentTurnIndex = 0; 
            
            // Roll dice for everyone
            room.players.forEach(p => {
                p.dice = [];
                // Only roll if they are still in the game
                if(p.diceCount > 0) {
                    for(let i=0; i < p.diceCount; i++) {
                        p.dice.push(Math.ceil(Math.random() * 6));
                    }
                    p.dice.sort((a,b) => a-b);
                }
            });

            // Ensure turn starts on someone with dice
            while(room.players[room.currentTurnIndex].diceCount === 0) {
                room.currentTurnIndex = (room.currentTurnIndex + 1) % room.players.length;
            }

            io.to(roomName).emit('gameStarted', room);
        }
    });

    socket.on('placeBid', ({ room, quantity, face }) => {
        const r = rooms[room];
        if (!r) return;

        // Server-side validation
        if (r.currentBid) {
            if (quantity < r.currentBid.quantity) return; 
            if (quantity === r.currentBid.quantity && face <= r.currentBid.face) return;
        }

        r.currentBid = { quantity, face, player: socket.id };
        
        // Move turn to next player with dice
        do {
            r.currentTurnIndex = (r.currentTurnIndex + 1) % r.players.length;
        } while (r.players[r.currentTurnIndex].diceCount === 0);
        
        io.to(room).emit('roomUpdate', r);
    });

    socket.on('callLiar', (roomName) => {
        const r = rooms[roomName];
        if (!r || !r.currentBid) return;

        // 1. Count Dice (1s are wild)
        const allDice = [];
        r.players.forEach(p => allDice.push(...p.dice));
        const targetFace = r.currentBid.face;
        const count = allDice.filter(d => d === targetFace || d === 1).length;

        const bidWasTrue = count >= r.currentBid.quantity;
        
        // 2. Determine Loser
        let loserIndex;
        if (bidWasTrue) {
            // Challenger loses (Current Turn)
            loserIndex = r.currentTurnIndex;
        } else {
            // Bidder loses (Previous Turn / Bid Owner)
            loserIndex = r.players.findIndex(p => p.id === r.currentBid.player);
        }

        const loser = r.players[loserIndex];
        loser.diceCount--;

        // 3. Reset Round
        r.gameActive = false;
        r.currentBid = null;

        // 4. Set turn to the loser (if they have dice), otherwise next person
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
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
