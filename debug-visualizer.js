// Простой скрипт для отладки визуализатора
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
    console.log('Connected to visualizer WebSocket');
    
    // Запрашиваем текущее состояние игры
    ws.send(JSON.stringify({
        type: 'request',
        request: 'gameState'
    }));
});

ws.on('message', function message(data) {
    const parsed = JSON.parse(data);
    console.log('Received message:', {
        type: parsed.type,
        hasGameState: !!parsed.gameState,
        turn: parsed.gameState?.turnNo,
        ants: parsed.gameState?.ants?.length || 0,
        food: parsed.gameState?.food?.length || 0,
        home: parsed.gameState?.home
    });
});

ws.on('error', function error(err) {
    console.log('WebSocket error:', err);
});

ws.on('close', function close() {
    console.log('WebSocket connection closed');
});

setTimeout(() => {
    ws.close();
    process.exit(0);
}, 5000);