export const initialPresence = {
  status: 'connected',
  x: 0,
  y: 0,
  lastUpdate: null,
  actionCount: 0,
  updateCount: 0, // Tracks manual updates from this client
};

export const initialRoomState = {
  worldTime: 0,
  serverMessage: 'Welcome!',
  lastUpdate: null,
  updateCount: 0, // Tracks global updates
};

// Number of presence updates per second during stress test
export const stressTestUpdatesPerSecond = 100;

