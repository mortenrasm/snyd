const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = null;
let myId = null;
let myUsername = "";
let myRoom = "";

// --- Socket Events ---

socket.on('connect', () => {
    myId = socket.id;
});

socket.on('roomUpdate', (room) => {
    gameState = room;
    updateUI();
    drawGame();
});

socket.on('gameStarted', (room) => {
    gameState = room;
    notify("Game Started!");
    updateUI();
    drawGame();
});

socket.on('roundOver', (data) => {
    // We update local state to show revealed dice
    gameState.players = data.allPlayers; 
    gameState.gameActive = false;
    gameState.currentBid = null;
    
    notify(data.message);
    updateUI();
    drawGame();
});

socket.on('notification', (msg) => {
    notify(msg);
});

// --- UI Logic ---

function joinGame() {
    myUsername = document.getElementById('username').value;
    myRoom = document.getElementById('roomName').value;
    if(!myUsername || !myRoom) return alert("Enter details");

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('dispRoom').innerText = myRoom;

    socket.emit('joinRoom', { username: myUsername, room: myRoom });
}

function startGame() {
    socket.emit('startGame', myRoom);
}

function placeBid() {
    const qty = parseInt(document.getElementById('bidQty').value);
    const face = parseInt(document.getElementById('bidFace').value);
    socket.emit('placeBid', { room: myRoom, quantity: qty, face: face });
}

function callLiar() {
    socket.emit('callLiar', myRoom);
}

function notify(msg) {
    const el = document.getElementById('notification-area');
    el.innerText = msg;
    setTimeout(() => { el.innerText = ""; }, 5000); // Clear after 5s
}

function updateUI() {
    if (!gameState) return;

    const startBtn = document.getElementById('start-btn');
    const controls = document.getElementById('controls-area');
    const liarBtn = document.getElementById('btnLiar');

    // Show start button if game not active
    if (!gameState.gameActive) {
        startBtn.classList.remove('hidden');
        controls.classList.add('hidden');
    } else {
        startBtn.classList.add('hidden');
        
        // Is it my turn?
        const myIndex = gameState.players.findIndex(p => p.id === myId);
        if (myIndex === gameState.currentTurnIndex) {
            controls.classList.remove('hidden');
            liarBtn.disabled = !gameState.currentBid; // Can't call liar on first turn
            notify("YOUR TURN!");
        } else {
            controls.classList.add('hidden');
        }
    }
}

// --- CANVAS DRAWING LOGIC ---

function drawGame() {
    // 1. Clear Screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!gameState) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const tableRadius = 200;

    // 2. Draw Table Center Info
    ctx.textAlign = "center";
    if (gameState.currentBid) {
        ctx.fillStyle = "#f1c40f";
        ctx.font = "bold 30px Arial";
        ctx.fillText(`${gameState.currentBid.quantity} x `, cx - 20, cy);
        drawDieFace(cx + 20, cy - 15, 30, gameState.currentBid.face);
        ctx.font = "16px Arial";
        ctx.fillStyle = "#ddd";
        ctx.fillText(`(Current Bid)`, cx, cy + 35);
    } else if (gameState.gameActive) {
        ctx.fillStyle = "white";
        ctx.font = "20px Arial";
        ctx.fillText("Make a bid...", cx, cy);
    }

    // 3. Draw Players in a circle
    const totalPlayers = gameState.players.length;
    
    gameState.players.forEach((player, i) => {
        // Calculate angle: (360 / count) * index
        const angle = (Math.PI * 2 / totalPlayers) * i;
        
        // Position player around the circle
        const px = cx + Math.cos(angle) * tableRadius;
        const py = cy + Math.sin(angle) * tableRadius;

        drawPlayer(player, px, py, i === gameState.currentTurnIndex);
    });
}

function drawPlayer(player, x, y, isTurn) {
    // Avatar Circle
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, Math.PI * 2);
    ctx.fillStyle = isTurn ? "#3498db" : "#444";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = isTurn ? "white" : "#222";
    ctx.stroke();
    ctx.closePath();

    // Name
    ctx.fillStyle = "white";
    ctx.font = "bold 16px Arial";
    ctx.textAlign = "center";
    ctx.fillText(player.username, x, y + 50);

    // Dice Container Background
    // If it's me OR the round is over, I can see the dice values
    // Otherwise, I see '?' blocks
    const showValues = (player.id === myId) || (!gameState.gameActive);
    
    // Draw Dice below name
    const diceSize = 25;
    const gap = 5;
    const totalWidth = (player.diceCount * diceSize) + ((player.diceCount-1) * gap);
    let startX = x - (totalWidth / 2);
    let startY = y + 60;

    if (player.diceCount > 0) {
        // We iterate based on dice count. 
        // Note: gameState.players[i].dice might be empty if it's not me and game is active
        // But the server sends *my* dice.
        
        for(let i=0; i<player.diceCount; i++) {
            let val = 0; // 0 means hidden
            
            if (showValues && player.dice[i]) {
                val = player.dice[i];
            }
            
            drawDieFace(startX + (i * (diceSize + gap)), startY, diceSize, val);
        }
    } else {
        ctx.fillStyle = "#e74c3c";
        ctx.font = "12px Arial";
        ctx.fillText("ELIMINATED", x, startY + 15);
    }
}

function drawDieFace(x, y, size, val) {
    // Draw Box
    ctx.fillStyle = "white";
    if (val === 0) ctx.fillStyle = "#7f8c8d"; // Gray if hidden
    
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 5); // Round rect needs newer browsers, fallback to rect if needed
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw Pips (Dots)
    ctx.fillStyle = "black";
    const dotSize = size / 5;
    const c = size / 2; // center offset
    const q = size / 4; // quarter offset

    // Helper to draw dot relative to x,y
    const dot = (dx, dy) => {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, dotSize/2, 0, Math.PI*2);
        ctx.fill();
    };

    if (val === 0) {
        // Draw Question Mark
        ctx.fillStyle = "#ccc";
        ctx.font = `bold ${size/1.5}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", x + c, y + c);
        return;
    }

    // Standard Dice Logic
    if (val % 2 === 1) dot(c, c); // Center dot for 1, 3, 5
    if (val > 1) { dot(q, q); dot(size-q, size-q); } // Top-left, Bottom-right
    if (val > 3) { dot(size-q, q); dot(q, size-q); } // Top-right, Bottom-left
    if (val === 6) { dot(q, c); dot(size-q, c); } // Middle-left, Middle-right
}

// Polyfill for roundRect if browser is old
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.beginPath();
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}
