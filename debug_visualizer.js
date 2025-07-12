const WebSocketServer = require('./visualizer/src/WebSocketServer');
const logger = require('./src/utils/Logger');

const port = 3001;
const visualizer = new WebSocketServer(port);

visualizer.start();

logger.info('Debug visualizer started. Sending mock data every 3 seconds...');

// Mock game state data
const mockGameState = {
    turnNo: 1,
    score: 100,
    ants: [
        { id: 'ant1', q: 0, r: 0, type: 1, health: 10, food: { type: 0, amount: 0 } },
        { id: 'ant2', q: 1, r: -1, type: 2, health: 20, food: { type: 0, amount: 0 } }
    ],
    enemies: [
        { id: 'enemy1', q: 5, r: -5, type: 1, health: 10 }
    ],
    food: [
        { q: 2, r: 2, type: 1, amount: 50 },
        { q: -2, r: -2, type: 2, amount: 30 }
    ],
    home: [
        { q: 0, r: 0 }
    ],
    nextTurnIn: 5000
};

const mockAnalysis = {
    unitCount: 2,
    enemyCount: 1,
    resourceCount: 2
};

const mockStrategy = {
    name: 'Test Strategy',
    description: 'Sending mock data for debugging'
};

// Send mock data to the visualizer every 3 seconds
setInterval(() => {
    if (visualizer.clients.size > 0) {
        logger.info(`Sending mock game state to ${visualizer.clients.size} client(s)`);
        visualizer.updateGameState(mockGameState, mockAnalysis, mockStrategy);
        mockGameState.turnNo++; // Increment turn number for visual feedback
    } else {
        logger.info('No clients connected, skipping data send.');
    }
}, 3000);
