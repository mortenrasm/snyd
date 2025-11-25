const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let gameState = null;
let myId = null;
let myUsername = "";
let myRoom = "";

// Local selection state for the UI
let localQty = 1;
let localFace = 2; 

// --- SOCKET CONNECTION ---

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

// --- MAIN ACTIONS ---

function joinGame() {
    myUsername = document.getElementById('username').value;
    myRoom = document.getElementById('roomName').value;
    if(!myUsername || !myRoom) return alert("Please fill in both fields");

    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('game-container').classList.remove('hidden');
    document.getElementById('dispRoom').innerText = myRoom;

    socket.emit('joinRoom', { username: myUsername, room: myRoom });
}

function startGame() {
    socket.emit('startGame', myRoom);
}

function submitBid() {
    socket.emit('placeBid', { room: myRoom, quantity: localQty, face: localFace });
}

function callLiar() {
    socket.emit('callLiar', myRoom);
}

// --- UI / BIDDING LOGIC ---

function initBidControls() {
    const selector = document.getElementById('dice-selector');
    selector.innerHTML = '';
    
    // Create buttons for faces 2-6 (1s are usually wild so you can't bid them directly in some versions, 
    // but in standard Snyd you often can. We allow 2-6 here. If you need 1, change i=2 to i=1)
    for(let i=2; i<=6; i++) {
        const btn = document.createElement('div');
        btn.className = 'select-die';
        btn.onclick = () => selectFace(i);
        btn.id = `die-btn-${i}`;
        
        // Draw CSS Dots instead of numbers for cleaner look
        // We just use text number for simplicity of code reliability, 
        // but styled boldly.
        btn.innerHTML = `<span style="font-size:18px; font-weight:bold;">${i}</span>`;
        
        selector.appendChild(btn);
