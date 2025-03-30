import * as config from './config.js';

const peersContainer = document.getElementById('peers-container');
const statusElement = document.getElementById('status');
const updatePresenceButton = document.getElementById('update-presence-button');
const updateRoomStateButton = document.getElementById('update-room-state-button');
const requestUpdateButton = document.getElementById('request-update-button');
const stressTestButton = document.getElementById('stress-test-button');
const debugLogElement = document.getElementById('debug-log');
const container = document.getElementById('container');

const room = new WebsimSocket();
let stressTestInterval = null;

function log(message) {
  console.log(message);
  const time = new Date().toLocaleTimeString();
  debugLogElement.textContent = `[${time}] ${message}\n` + debugLogElement.textContent;
  // Keep log trimmed
  const lines = debugLogElement.textContent.split('\n');
  if (lines.length > 50) {
      debugLogElement.textContent = lines.slice(0, 50).join('\n');
  }
}

function getElementCenter(element) {
    const rect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
    };
}

function updateConnectionLines() {
    let svg = document.getElementById('connection-lines');
    if (!svg) {
        svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'connection-lines';
        container.insertBefore(svg, peersContainer); // Insert before peers
    }
    svg.innerHTML = ''; // Clear existing lines

    const peerElements = Array.from(peersContainer.children);
    if (peerElements.length < 2) return;

    const selfElement = peersContainer.querySelector('.self');
    if (!selfElement) return; // Should not happen if client is connected

    const selfCenter = getElementCenter(selfElement);

    peerElements.forEach(peerElement => {
        if (peerElement === selfElement) return; // Don't draw line to self

        const peerCenter = getElementCenter(peerElement);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', selfCenter.x);
        line.setAttribute('y1', selfCenter.y);
        line.setAttribute('x2', peerCenter.x);
        line.setAttribute('y2', peerCenter.y);
        line.setAttribute('class', 'connection-line');
        line.setAttribute('data-peer-id', peerElement.dataset.clientId); // Link line to peer
        svg.appendChild(line);
    });
}


function updatePeersUI() {
  peersContainer.innerHTML = ''; // Clear existing peers

  Object.entries(room.peers).forEach(([clientId, peerInfo]) => {
    const isSelf = clientId === room.clientId;
    const presenceData = room.presence[clientId] || {};

    const peerElement = document.createElement('div');
    peerElement.classList.add('peer');
    if (isSelf) {
      peerElement.classList.add('self');
    }
    peerElement.dataset.clientId = clientId;

    const avatar = document.createElement('img');
    avatar.src = peerInfo.avatarUrl || 'https://via.placeholder.com/50'; // Default avatar
    avatar.alt = `${peerInfo.username}'s avatar`;

    const username = document.createElement('div');
    username.classList.add('username');
    username.textContent = peerInfo.username + (isSelf ? ' (You)' : '');

    const presenceDisplay = document.createElement('div');
    presenceDisplay.classList.add('presence-data');
    presenceDisplay.textContent = JSON.stringify(presenceData, null, 2);

    peerElement.appendChild(avatar);
    peerElement.appendChild(username);
    peerElement.appendChild(presenceDisplay);
    peersContainer.appendChild(peerElement);
  });

  updateConnectionLines(); // Redraw lines after updating peers
  log(`Peers updated. Count: ${Object.keys(room.peers).length}`);
}

function highlightConnection(targetClientId, type) {
    const line = document.querySelector(`#connection-lines .connection-line[data-peer-id="${targetClientId}"]`);
    if (line) {
        line.classList.remove('sending', 'receiving', 'active'); // Remove existing states
        line.classList.add(type); // Add the new state (e.g., 'sending', 'receiving')
        setTimeout(() => line.classList.remove(type), 500); // Remove highlight after 500ms
    }
}

function highlightPeer(clientId, type) {
    const peerElement = peersContainer.querySelector(`.peer[data-clientId="${clientId}"]`);
    if (peerElement) {
        const animationClass = type === 'send' ? 'highlight-send' : 'highlight-receive';
        peerElement.classList.add(animationClass);
        setTimeout(() => peerElement.classList.remove(animationClass), 500);
    }
}


async function initializeApp() {
  try {
    statusElement.textContent = 'Initializing connection...';
    await room.initialize();
    statusElement.textContent = `Connected as ${room.peers[room.clientId]?.username || 'Unknown'}`;
    log(`Initialized. Client ID: ${room.clientId}`);

    // Initial presence state
    room.updatePresence({
      ...config.initialPresence,
      lastUpdate: Date.now(),
      actionCount: 0
    });

    // Initial room state (only if no state exists)
    if (Object.keys(room.roomState).length === 0) {
        room.updateRoomState({
            ...config.initialRoomState,
            lastUpdate: Date.now(),
            updateCount: 0
        });
        log("Initialized room state.");
    } else {
        log("Room state already exists.");
    }

    updatePeersUI(); // Initial render

    room.subscribePresence((currentPresence) => {
      log('Presence updated.');
      updatePeersUI();
    });

    room.subscribeRoomState((currentRoomState) => {
      log('Room state updated.');
      // Could update a separate UI element for room state if needed
      const roomStateDisplay = document.getElementById('room-state-display'); // Example
      if (roomStateDisplay) {
        roomStateDisplay.textContent = JSON.stringify(currentRoomState, null, 2);
      }
    });

    room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
      log(`Received presence update request from ${room.peers[fromClientId]?.username || fromClientId}: ${JSON.stringify(updateRequest)}`);
      highlightConnection(fromClientId, 'receiving');
      highlightPeer(room.clientId, 'receive'); // Highlight self as receiver

      const currentClientPresence = room.presence[room.clientId] || {};
      if (updateRequest.type === 'increment_action') {
        room.updatePresence({
          ...currentClientPresence,
          actionCount: (currentClientPresence.actionCount || 0) + 1,
          lastUpdate: Date.now()
        });
        log(`Updated presence based on request from ${fromClientId}. New actionCount: ${currentClientPresence.actionCount + 1}`);
      }
      // Add more request types here as needed
    });

  } catch (error) {
    console.error('Initialization failed:', error);
    statusElement.textContent = 'Connection failed. Please refresh.';
    log(`Error: ${error.message}`);
  }
}

// --- Button Event Listeners ---

updatePresenceButton.addEventListener('click', () => {
  const currentClientPresence = room.presence[room.clientId] || {};
  const newUpdateCount = (currentClientPresence.updateCount || 0) + 1;
  room.updatePresence({
    ...currentClientPresence,
    updateCount: newUpdateCount,
    lastUpdate: Date.now(),
    randomValue: Math.random().toString(16).substring(2, 8) // Add some changing data
  });
  log(`Manually updated own presence. Update count: ${newUpdateCount}`);
  highlightPeer(room.clientId, 'send'); // Highlight self
});

updateRoomStateButton.addEventListener('click', () => {
  const currentRoomState = room.roomState || {};
  const newUpdateCount = (currentRoomState.updateCount || 0) + 1;
  room.updateRoomState({
    ...currentRoomState, // Preserve existing state
    updateCount: newUpdateCount,
    lastGlobalUpdate: Date.now(),
    randomGlobalValue: Math.random().toString(36).substring(7)
  });
  log(`Manually updated room state. Update count: ${newUpdateCount}`);
  // Optionally highlight all peers or a central element
});

requestUpdateButton.addEventListener('click', () => {
  const peerIds = Object.keys(room.peers).filter(id => id !== room.clientId);
  if (peerIds.length === 0) {
    log('No other peers to send request to.');
    return;
  }
  const randomPeerId = peerIds[Math.floor(Math.random() * peerIds.length)];
  room.requestPresenceUpdate(randomPeerId, {
    type: 'increment_action',
    timestamp: Date.now()
  });
  log(`Requested presence update (increment_action) from ${room.peers[randomPeerId]?.username || randomPeerId}`);
  highlightConnection(randomPeerId, 'sending');
  highlightPeer(room.clientId, 'send'); // Highlight self as sender
});

stressTestButton.addEventListener('click', () => {
  if (stressTestInterval) {
    clearInterval(stressTestInterval);
    stressTestInterval = null;
    stressTestButton.textContent = 'Stress Test (100 updates/sec)';
    log('Stress test stopped.');
  } else {
    stressTestButton.textContent = 'Stop Stress Test';
    log(`Starting stress test (${config.stressTestUpdatesPerSecond} updates/sec)...`);
    let stressCounter = 0;
    stressTestInterval = setInterval(() => {
        const currentClientPresence = room.presence[room.clientId] || {};
        room.updatePresence({
            ...currentClientPresence,
            stressCounter: stressCounter++,
            lastUpdate: Date.now()
        });
        // Optional: Update room state or send requests too
        // log(`Stress update ${stressCounter}`); // Avoid logging every update during stress test
        if (stressCounter % 100 === 0) log(`Sent ${stressCounter} stress updates.`);
        highlightPeer(room.clientId, 'send'); // Highlight self quickly
    }, 1000 / config.stressTestUpdatesPerSecond); // Interval based on config
  }
});


// Resize observer to redraw lines when container size changes
const resizeObserver = new ResizeObserver(entries => {
    updateConnectionLines();
});
resizeObserver.observe(container);


// Initial setup
initializeApp();

// Optional: Add a display for room state
const roomStateDiv = document.createElement('div');
roomStateDiv.id = 'room-state-display';
roomStateDiv.style.marginTop = '1em';
roomStateDiv.style.padding = '1em';
roomStateDiv.style.backgroundColor = '#f0f0f0';
roomStateDiv.style.border = '1px solid #ddd';
roomStateDiv.style.borderRadius = '4px';
roomStateDiv.style.maxHeight = '100px';
roomStateDiv.style.overflowY = 'auto';
roomStateDiv.style.whiteSpace = 'pre-wrap';
roomStateDiv.style.wordWrap = 'break-word';
roomStateDiv.textContent = 'Room State: (updates automatically)';
container.insertBefore(roomStateDiv, debugLogElement); // Insert before debug log

