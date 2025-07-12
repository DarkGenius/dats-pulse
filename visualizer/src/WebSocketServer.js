const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const logger = require('../../src/utils/Logger');

class WebSocketServer {
    constructor(port = 3001) {
        this.port = port;
        this.server = null;
        this.wss = null;
        this.clients = new Set();
        this.gameState = null;
        this.analysis = null;
        this.strategy = null;
    }
    
    start() {
        try {
            // Создаем HTTP сервер для статических файлов
            this.server = http.createServer((req, res) => {
                this.handleHttpRequest(req, res);
            });
            
            // Создаем WebSocket сервер
            this.wss = new WebSocket.Server({ server: this.server });
            
            this.wss.on('connection', (ws, req) => {
                this.handleConnection(ws, req);
            });
            
            this.server.listen(this.port, () => {
                logger.info(`Visualizer server started on port ${this.port}`);
                logger.info(`Open http://localhost:${this.port} to view the game`);
            });
            
        } catch (error) {
            logger.error('Failed to start WebSocket server:', error);
        }
    }
    
    handleHttpRequest(req, res) {
        let filePath = path.join(__dirname, '../public', req.url === '/' ? 'index.html' : req.url);
        
        // Безопасность: не позволяем выйти за пределы public папки
        if (!filePath.startsWith(path.join(__dirname, '../public'))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        
        // Проверяем существование файла
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        
        // Определяем MIME тип
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        try {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            res.end(content);
        } catch (error) {
            logger.error('Error serving file:', error);
            res.writeHead(500);
            res.end('Internal Server Error');
        }
    }
    
    handleConnection(ws, req) {
        const clientIp = req.socket.remoteAddress;
        logger.info(`New WebSocket connection from ${clientIp}`);
        
        this.clients.add(ws);
        
        // Отправляем текущее состояние игры новому клиенту
        if (this.gameState) {
            this.sendToClient(ws, {
                type: 'gameState',
                gameState: this.gameState,
                analysis: this.analysis,
                strategy: this.strategy
            });
        }
        
        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                this.handleMessage(ws, data);
            } catch (error) {
                logger.error('Error parsing WebSocket message:', error);
            }
        });
        
        ws.on('close', () => {
            this.clients.delete(ws);
            logger.info(`WebSocket connection closed from ${clientIp}`);
        });
        
        ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            this.clients.delete(ws);
        });
    }
    
    handleMessage(ws, data) {
        switch (data.type) {
            case 'command':
                this.handleCommand(ws, data.command);
                break;
            case 'request':
                this.handleRequest(ws, data.request);
                break;
            default:
                logger.warn('Unknown WebSocket message type:', data.type);
        }
    }
    
    handleCommand(ws, command) {
        // Здесь можно добавить обработку команд от веб-интерфейса
        // Например: пауза, остановка, изменение параметров
        logger.info('Received command:', command);
        
        switch (command) {
            case 'pause':
                this.broadcast({ type: 'status', message: 'Game paused' });
                break;
            case 'resume':
                this.broadcast({ type: 'status', message: 'Game resumed' });
                break;
            default:
                this.sendToClient(ws, { type: 'error', message: 'Unknown command' });
        }
    }
    
    handleRequest(ws, request) {
        switch (request) {
            case 'gameState':
                if (this.gameState) {
                    this.sendToClient(ws, {
                        type: 'gameState',
                        gameState: this.gameState,
                        analysis: this.analysis,
                        strategy: this.strategy
                    });
                }
                break;
            default:
                this.sendToClient(ws, { type: 'error', message: 'Unknown request' });
        }
    }
    
    updateGameState(gameState, analysis = null, strategy = null) {
        this.gameState = gameState;
        this.analysis = analysis;
        this.strategy = strategy;
        
        logger.debug(`WebSocket: Broadcasting game update to ${this.clients.size} clients`);
        logger.debug(`WebSocket: Game state - Turn: ${gameState?.turnNo}, Ants: ${gameState?.ants?.length || 0}, Food: ${gameState?.food?.length || 0}`);
        
        // Отправляем обновление всем подключенным клиентам
        this.broadcast({
            type: 'gameUpdate',
            gameState: this.gameState,
            analysis: this.analysis,
            strategy: this.strategy
        });
    }
    
    sendToClient(ws, data) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(data));
            } catch (error) {
                logger.error('Error sending message to client:', error);
            }
        }
    }
    
    broadcast(data) {
        const message = JSON.stringify(data);
        
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                } catch (error) {
                    logger.error('Error broadcasting message:', error);
                    this.clients.delete(client);
                }
            }
        });
    }
    
    sendError(message) {
        this.broadcast({
            type: 'error',
            message: message
        });
    }
    
    sendStatus(message) {
        this.broadcast({
            type: 'status',
            message: message
        });
    }
    
    getStats() {
        return {
            connectedClients: this.clients.size,
            serverPort: this.port,
            hasGameState: !!this.gameState
        };
    }
    
    stop() {
        if (this.wss) {
            this.clients.forEach(client => {
                client.close();
            });
            this.wss.close();
        }
        
        if (this.server) {
            this.server.close();
        }
        
        logger.info('WebSocket server stopped');
    }
}

module.exports = WebSocketServer;