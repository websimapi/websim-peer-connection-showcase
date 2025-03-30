export const initialPresence = {
  status: 'connected',
  x: Math.random() * 500, 
  y: Math.random() * 500,
  lastUpdate: null,
};

export const initialRoomState = {
  worldTime: 0,
  serverMessage: 'Welcome to the MMORPG Stress Test!',
  lastUpdate: null,
  simulatedEntities: {}, 
};

export const maxVisualAgents = 2000;
export const loadTestUpdatesPerSecond = 100;
export const roomStateLoadBatchSize = 10;
export const canvasWidth = 800;
export const canvasHeight = 600;