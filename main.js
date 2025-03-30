import * as config from './config.js';

// --- DOM Elements ---
const statusElement = document.getElementById('status');
const metricsElement = document.getElementById('metrics');
const canvas = document.getElementById('simulation-canvas');
const ctx = canvas.getContext('2d');
const numAgentsInput = document.getElementById('num-agents-input');
const startStopButton = document.getElementById('start-stop-sim-button');
const loadPresenceButton = document.getElementById('load-presence-button');
// const loadRoomStateButton = document.getElementById('load-room-state-button'); // Optional for room state load
const peersListElement = document.getElementById('peers-list');
const debugLogElement = document.getElementById('debug-log');
const container = document.getElementById('container'); // Keep for potential future use, but less critical now

// --- State ---
const room = new WebsimSocket();
let visualAgents = []; // For local visualization only { x, y, vx, vy }
let simulationRunning = false;
let loadTestInterval = null;
let loadTestType = null; // 'presence' or 'roomState'
let animationFrameId = null;
let lastTimestamp = 0;
let fps = 0;
let presenceUpdatesSent = 0;
// let roomStateUpdatesSent = 0; // If using room state load

// --- Setup ---
canvas.width = config.canvasWidth;
canvas.height = config.canvasHeight;
numAgentsInput.value = Math.min(100, config.maxVisualAgents); // Default value
numAgentsInput.max = config.maxVisualAgents;

// --- Logging ---
function log(message) {
  console.log(message);
  const time = new Date().toLocaleTimeString();
  debugLogElement.textContent = `[${time}] ${message}\n` + debugLogElement.textContent;
  const lines = debugLogElement.textContent.split('\n');
  if (lines.length > 50) {
      debugLogElement.textContent = lines.slice(0, 50).join('\n');
  }
}

// --- Simulation Logic ---
function createVisualAgent() {
    return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 2, // Velocity x
        vy: (Math.random() - 0.5) * 2, // Velocity y
        color: '#888', // Default grey for simulated
    };
}

function updateVisualAgents(deltaTime) {
    const speed = 50; // Pixels per second
    visualAgents.forEach(agent => {
        agent.x += agent.vx * speed * deltaTime;
        agent.y += agent.vy * speed * deltaTime;

        // Bounce off walls
        if (agent.x < 0 || agent.x > canvas.width) {
            agent.vx *= -1;
            agent.x = Math.max(0, Math.min(canvas.width, agent.x)); // Clamp position
        }
        if (agent.y < 0 || agent.y > canvas.height) {
            agent.vy *= -1;
            agent.y = Math.max(0, Math.min(canvas.height, agent.y)); // Clamp position
        }
    });
}

function resizeVisualAgents(count) {
    count = Math.min(count, config.maxVisualAgents); // Enforce max
    const currentCount = visualAgents.length;
    if (count > currentCount) {
        for (let i = 0; i < count - currentCount; i++) {
            visualAgents.push(createVisualAgent());
        }
    } else if (count < currentCount) {
        visualAgents.splice(count, currentCount - count);
    }
    log(`Set visual agent count to ${visualAgents.length}`);
}

// --- Drawing Logic ---
function draw(timestamp) {
    if (!simulationRunning) {
        // Clear canvas if simulation stopped
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    };

    const deltaTime = (timestamp - lastTimestamp) / 1000 || 0; // Seconds
    lastTimestamp = timestamp;
    fps = Math.round(1 / deltaTime);

    // Update local simulation
    updateVisualAgents(deltaTime);

    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw visual agents (grey dots)
    visualAgents.forEach(agent => {
        ctx.fillStyle = agent.color;
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, 3, 0, Math.PI * 2); // Small dots
        ctx.fill();
    });

    // Draw real peers (colored dots)
    Object.entries(room.presence).forEach(([clientId, presence]) => {
        if (presence && typeof presence.x === 'number' && typeof presence.y === 'number') {
            const isSelf = clientId === room.clientId;
            ctx.fillStyle = isSelf ? '#4CAF50' : '#2196F3'; // Green for self, blue for others
            ctx.beginPath();
            ctx.arc(
                (presence.x / 500) * canvas.width, // Scale position to canvas
                (presence.y / 500) * canvas.height,
                isSelf ? 6 : 5, // Slightly larger dot for self
                0, Math.PI * 2
            );
            ctx.fill();

            // Draw username label near peer dot
            const peerInfo = room.peers[clientId];
            if (peerInfo) {
                ctx.fillStyle = '#eee';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(
                    peerInfo.username + (isSelf ? ' (You)' : ''),
                    (presence.x / 500) * canvas.width,
                    (presence.y / 500) * canvas.height - 10 // Position label above dot
                );
            }
        }
    });

    updateMetricsDisplay(); // Update metrics display

    animationFrameId = requestAnimationFrame(draw);
}

// --- UI Update Functions ---
function updateMetricsDisplay() {
    const realPeerCount = Object.keys(room.peers).length;
    metricsElement.innerHTML = `
        <span>FPS: ${fps}</span> |
        <span>Visual Agents: ${visualAgents.length}</span> |
        <span>Real Peers: ${realPeerCount}</span> |
        <span>Presence Sent: ${presenceUpdatesSent}</span>
    `; // Add room state updates if implemented
}

function updatePeersList() {
  peersListElement.innerHTML = ''; // Clear existing list

  Object.entries(room.peers).forEach(([clientId, peerInfo]) => {
    const isSelf = clientId === room.clientId;

    const peerElement = document.createElement('div');
    peerElement.classList.add('peer-item');
    if (isSelf) {
      peerElement.classList.add('self');
    }
    peerElement.dataset.clientId = clientId;

    const avatar = document.createElement('img');
    avatar.src = peerInfo.avatarUrl || 'https://via.placeholder.com/20'; // Default avatar
    avatar.alt = `${peerInfo.username}'s avatar`;
    avatar.onerror = () => avatar.src = 'https://via.placeholder.com/20'; // Fallback

    const username = document.createElement('span');
    username.textContent = peerInfo.username + (isSelf ? ' (You)' : '');

    peerElement.appendChild(avatar);
    peerElement.appendChild(username);
    peersListElement.appendChild(peerElement);
  });
  log(`Peers list updated. Count: ${Object.keys(room.peers).length}`);
}

function startSimulation() {
    if (simulationRunning) return;
    simulationRunning = true;
    startStopButton.textContent = 'Stop Simulation';
    startStopButton.classList.add('active');
    resizeVisualAgents(parseInt(numAgentsInput.value, 10)); // Ensure agents are created
    lastTimestamp = performance.now(); // Reset timestamp
    animationFrameId = requestAnimationFrame(draw);
    log('Simulation started.');
}

function stopSimulation() {
    if (!simulationRunning) return;
    simulationRunning = false;
    startStopButton.textContent = 'Start Simulation';
    startStopButton.classList.remove('active');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
     // Optionally clear canvas immediately
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    log('Simulation stopped.');
}

function stopLoadTest() {
    if (loadTestInterval) {
        clearInterval(loadTestInterval);
        loadTestInterval = null;
        loadPresenceButton.textContent = 'Load Test (Presence)';
        loadPresenceButton.classList.remove('active');
        // Reset room state button too if implemented
        log(`Load test (${loadTestType}) stopped.`);
        loadTestType = null;
    }
}

// --- Websim Integration ---
async function initializeApp() {
  try {
    statusElement.textContent = 'Initializing connection...';
    await room.initialize();
    statusElement.textContent = `Connected as ${room.peers[room.clientId]?.username || 'Unknown'}`;
    log(`Initialized. Client ID: ${room.clientId}`);

    // Initial presence state (places user on map)
    room.updatePresence({
      ...config.initialPresence,
      lastUpdate: Date.now(),
    });
    presenceUpdatesSent++;

    // Initial room state (only if needed, e.g., for shared simulation elements)
    if (Object.keys(room.roomState).length === 0) {
        room.updateRoomState({
            ...config.initialRoomState,
            lastUpdate: Date.now(),
        });
        log("Initialized room state.");
    } else {
        log("Room state already exists.");
        // Sync simulated entities from existing room state if applicable
    }

    updatePeersList(); // Initial render of peer list
    startSimulation(); // Start visualization automatically

    room.subscribePresence((currentPresence) => {
      log('Presence updated.');
      updatePeersList(); // Update list if peers joined/left
      // Canvas is updated in the animation loop
    });

    room.subscribeRoomState((currentRoomState) => {
      log('Room state updated.');
      // Update visualization based on room state if needed
      // e.g., draw entities from currentRoomState.simulatedEntities
    });

    room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
      log(`Received presence update request from ${room.peers[fromClientId]?.username || fromClientId}: ${JSON.stringify(updateRequest)}`);
      // Handle requests if needed (e.g., game interactions)
      // For this demo, maybe just log it.
    });

  } catch (error) {
    console.error('Initialization failed:', error);
    statusElement.textContent = 'Connection failed. Please refresh.';
    log(`Error: ${error.message}`);
    stopSimulation();
    stopLoadTest();
  }
}

// --- Event Listeners ---

startStopButton.addEventListener('click', () => {
    if (simulationRunning) {
        stopSimulation();
    } else {
        startSimulation();
    }
});

numAgentsInput.addEventListener('change', () => {
    if (simulationRunning) {
        resizeVisualAgents(parseInt(numAgentsInput.value, 10));
    }
     // If not running, the count will be applied when starting
});

loadPresenceButton.addEventListener('click', () => {
    if (loadTestInterval && loadTestType === 'presence') {
        stopLoadTest();
    } else {
        stopLoadTest(); // Stop any other running test first
        loadTestType = 'presence';
        loadPresenceButton.textContent = 'Stop Load Test';
        loadPresenceButton.classList.add('active');
        log(`Starting presence load test (${config.loadTestUpdatesPerSecond} updates/sec)...`);
        let stressCounter = 0;
        loadTestInterval = setInterval(() => {
            const currentClientPresence = room.presence[room.clientId] || {};
            room.updatePresence({
                ...currentClientPresence,
                x: Math.random() * 500, // Simulate rapid movement
                y: Math.random() * 500,
                loadCounter: stressCounter++,
                lastUpdate: Date.now()
            });
            presenceUpdatesSent++;
            if (stressCounter % 100 === 0) log(`Sent ${stressCounter} presence stress updates.`);
        }, 1000 / config.loadTestUpdatesPerSecond);
    }
});

// Optional: Add listener for room state load test button if implemented

// --- Initial Load ---
initializeApp();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    stopSimulation();
    stopLoadTest();
    // Consider unsubscribing, though Websim might handle disconnects gracefully
});