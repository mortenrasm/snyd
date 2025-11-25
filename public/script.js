const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = null;
let myId = null;
let myUsername = "";
let myRoom = "";

// Local selection state for UI
let localQty = 1;
let localFace = 2; 

// --- CONNECTION ---

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
    gameState.players = data.allPlayers; // Reveal dice
    gameState.gameActive = false;
    gameState.currentBid = null;
    notify(data.message);
    updateUI();
    drawGame();
});

socket.on('notification', (msg) => {
    notify(msg);
});

// --- ACTIONS ---

function joinGame() {
    myUsername = document.getElementById('username').value;
    myRoom = document.getElementById('roomName').value;
    if(!myUsername || !myRoom) return alert("Please fill in both fields");

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('dispRoom').innerText = myRoom;

    socket.emit('joinRoom', { username: myUsername, room: myRoom });
}

function toggleReady() {
    socket.emit('playerReady', myRoom);
}

function submitBid() {
    socket.emit('placeBid', { room: myRoom, quantity: localQty, face: localFace });
}

function callLiar() {
    socket.emit('callLiar', myRoom);
}

// --- UI / BIDDING LOGIC ---

function notify(msg) {
    const el = document.getElementById('notification-area');
    el.innerText = msg;
    setTimeout(() => { el.innerText = ""; }, 5000);
}

function initBidControls() {
    const selector = document.getElementById('dice-selector');
    selector.innerHTML = '';
    
    // Faces 2-6 (Standard Snyd usually excludes 1s from direct bidding as they are wild)
    for(let i=2; i<=6; i++) {
        const btn = document.createElement('div');
        btn.className = 'select-die';
        btn.onclick = () => selectFace(i);
        btn.id = `die-btn-${i}`;
        // Simple bold number for the selector
        btn.innerHTML = `<span style="font-size:18px; font-weight:bold;">${i}</span>`;
        selector.appendChild(btn);
    }
}

function adjustQty(delta) {
    if (!gameState) return;

    // 1. Calculate Total Dice remaining in the game
    const totalDiceInPlay = gameState.players.reduce((sum, p) => sum + p.diceCount, 0);

    let newQty = localQty + delta;

    // Constraint: Max = Total dice in play
    if (newQty > totalDiceInPlay) {
        newQty = totalDiceInPlay;
    }

    // Constraint: Min = 1
    if (newQty < 1) newQty = 1;
    
    // Constraint: Cannot go lower than current bid quantity
    if (gameState.currentBid) {
        if (newQty < gameState.currentBid.quantity) {
            newQty = gameState.currentBid.quantity;
        }
    }

    localQty = newQty;
    validateSelection(); 
    updateBidVisuals();
}

function selectFace(face) {
    if (isValidBid(localQty, face)) {
        localFace = face;
        updateBidVisuals();
    }
}

function isValidBid(q, f) {
    if (!gameState.currentBid) return true;
    
    // Higher quantity is always valid
    if (q > gameState.currentBid.quantity) return true;
    
    // Same quantity but higher face is valid
    if (q === gameState.currentBid.quantity && f > gameState.currentBid.face) return true;
    
    return false;
}

function validateSelection() {
    if (!isValidBid(localQty, localFace)) {
        // Find the lowest valid face for this quantity
        for(let f=2; f<=6; f++) {
            if(isValidBid(localQty, f)) {
                localFace = f;
                break;
            }
        }
    }
}

function resetBidSelection() {
    if (!gameState.currentBid) {
        localQty = 1;
        localFace = 2;
    } else {
        // Smart default: Suggest next valid move
        if (gameState.currentBid.face < 6) {
            localQty = gameState.currentBid.quantity;
            localFace = gameState.currentBid.face + 1;
        } else {
            // Check if we have enough dice to raise quantity
            const totalDiceInPlay = gameState.players.reduce((sum, p) => sum + p.diceCount, 0);
            if (gameState.currentBid.quantity < totalDiceInPlay) {
                localQty = gameState.currentBid.quantity + 1;
                localFace = 2;
            } else {
                // Maxed out, stick to max
                localQty = gameState.currentBid.quantity;
                localFace = 6; 
            }
        }
    }
    updateBidVisuals();
}

function updateBidVisuals() {
    document.getElementById('displayQty').innerText = localQty;
    
    for(let i=2; i<=6; i++) {
        const btn = document.getElementById(`die-btn-${i}`);
        if(btn) {
            btn.className = 'select-die';
            if (!isValidBid(localQty, i)) btn.classList.add('disabled');
            if (i === localFace) btn.classList.add('selected');
        }
    }

    const btn = document.getElementById('btn-place-bid');
    if(btn) btn.innerText = `Bid ${localQty} x ${localFace}s`;
}

// Call once on load
initBidControls();

function updateUI() {
    if (!gameState) return;

    const readyArea = document.getElementById('ready-area');
    const controls = document.getElementById('controls-area');
    const liarBtn = document.getElementById('btnLiar');
    const turnBar = document.getElementById('turn-bar');
    const readyBtn = document.getElementById('btn-ready');
    const readyStatusText = document.getElementById('ready-status-text');

    // LOBBY PHASE
    if (!gameState.gameActive) {
        controls.classList.add('hidden');
        readyArea.classList.remove('hidden');

        turnBar.innerText = "Lobby Phase";
        turnBar.className = "turn-waiting";

        const readyCount = gameState.players.filter(p => p.isReady).length;
        const totalCount = gameState.players.length;
        readyStatusText.innerText = `${readyCount} / ${totalCount} Players Ready`;

        const myPlayer = gameState.players.find(p => p.id === myId);
        if (myPlayer && myPlayer.isReady) {
            readyBtn.innerText = "Waiting for others...";
            readyBtn.disabled = true;
            readyBtn.style.background = "#8e8e93";
        } else {
            readyBtn.innerText = "I'M READY";
            readyBtn.disabled = false;
            readyBtn.style.background = "#34c759";
        }

    } else {
        // GAME ACTIVE PHASE
        readyArea.classList.add('hidden');

        const activePlayer = gameState.players[gameState.currentTurnIndex];
        const isMyTurn = (activePlayer.id === myId);

        if (isMyTurn) {
            controls.classList.remove('hidden');
            
            // Render my dice inside the panel
            const myPlayer = gameState.players.find(p => p.id === myId);
            renderHandInPanel(myPlayer);

            // Logic to ensure defaults are valid
            if (!isValidBid(localQty, localFace)) {
                resetBidSelection();
            } else {
                updateBidVisuals();
            }

            liarBtn.disabled = !gameState.currentBid;
            turnBar.innerText = "IT'S YOUR TURN!";
            turnBar.className = "turn-mine";
        } else {
            controls.classList.add('hidden');
            turnBar.innerText = `Waiting for ${activePlayer.username}...`;
            turnBar.className = "turn-others";
        }
    }
}

function renderHandInPanel(player) {
    const container = document.getElementById('my-hand-display');
    if(!container || !player) return;
    
    container.innerHTML = '';
    
    player.dice.forEach(val => {
        const dieDiv = document.createElement('div');
        dieDiv.className = 'large-die';
        dieDiv.innerText = val;
        
        // Add specific color for 1s (Wilds)
        if (val === 1) dieDiv.style.color = "#ff3b30"; 
        
        container.appendChild(dieDiv);
    });
}

// --- CANVAS DRAWING ---

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!gameState) return;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const tableRadius = 220;

    // Center Info
    ctx.textAlign = "center";
    if (gameState.currentBid) {
        ctx.fillStyle = "#f1c40f";
        ctx.font = "bold 40px Arial";
        ctx.fillText(`${gameState.currentBid.quantity} x `, cx - 25, cy);
        drawDieFace(cx + 30, cy - 20, 40, gameState.currentBid.face);
        ctx.font = "16px Arial";
        ctx.fillStyle = "#ddd";
        ctx.fillText(`(Current Bid)`, cx, cy + 40);
    } else {
        if (!gameState.gameActive) {
            ctx.fillStyle = "rgba(255,255,255,0.5)";
            ctx.font = "italic 20px Arial";
            ctx.fillText("Waiting for players...", cx,
