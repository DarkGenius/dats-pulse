class GameVisualizer {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new GameRenderer(this.canvas);
        this.statsUpdater = new StatsUpdater();
        this.logManager = new LogManager('log-container');
        this.websocket = null;
        this.isConnected = false;
        this.isInitialLoad = true;
        
        this.connectionIndicator = document.getElementById('connection-indicator');
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.connectWebSocket();
        this.setupEventListeners();
        
        // Попытка переподключения каждые 5 секунд если не подключены
        setInterval(() => {
            if (!this.isConnected) {
                this.connectWebSocket();
            }
        }, 5000);
        
        // Делаем визуализатор глобально доступным для других компонентов
        window.gameVisualizer = this;
        
        // Инициализируем предыдущие состояния для детекции изменений
        this.previousGameState = null;
        this.previousAnalysis = null;
    }
    
    setupCanvas() {
        this.resizeCanvas();
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        
        this.renderer.resize();
    }
    
    connectWebSocket() {
        if (this.websocket) {
            this.websocket.close();
        }
        
        try {
            // Пытаемся подключиться к WebSocket серверу
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${location.host}/`;
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus(true);
                console.log('WebSocket connected');
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };
            
            this.websocket.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus(false);
                console.log('WebSocket disconnected');
            };
            
            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.isConnected = false;
                this.updateConnectionStatus(false);
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.updateConnectionStatus(false);
        }
    }
    
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'gameState':
            case 'gameUpdate':
                this.updateGameState(data.gameState, data.analysis, data.strategy, data.unitAssignments);
                if (this.isInitialLoad && data.gameState) {
                    this.centerOnHome(data.gameState);
                    this.isInitialLoad = false;
                }
                break;
            case 'roundStatus':
                this.updateRoundStatus(data);
                break;
            case 'lobbyStatus':
                this.updateLobbyStatus(data);
                break;
            case 'error':
                console.error('Game error:', data.message);
                break;
            case 'status':
                this.logManager.addMessage(data.message, 'system');
                break;
            case 'log':
                this.logManager.addMessage(data.message, data.logType);
                break;
            default:
                console.warn('Unknown message type:', data.type);
        }
    }
    
    updateGameState(gameState, analysis, strategy, unitAssignments) {
        // Детекция боевых событий
        this.detectCombatEvents(gameState, analysis);
        
        this.renderer.updateGameState(gameState, analysis, unitAssignments);
        this.statsUpdater.updateStats(gameState, analysis, strategy);
        this.statsUpdater.updateHistory(gameState);
        
        // Скрываем оверлей ожидания, если игра началась
        this.hideWaitingOverlay();
        
        // Сохраняем состояние для следующего сравнения
        this.previousGameState = gameState;
        this.previousAnalysis = analysis;
    }

    updateLobbyStatus(data) {
        if (data.waiting) {
            this.showWaitingOverlay({
                message: 'Waiting for game to start...',
                countdown: this.formatCountdown(data.remainingTime)
            });
        } else {
            this.hideWaitingOverlay();
        }
    }
    
    formatCountdown(seconds) {
        if (!seconds || seconds < 0) return '';
        
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        
        if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    centerOnHome(gameState) {
        if (gameState.home && Array.isArray(gameState.home) && gameState.home.length > 0) {
            const home = gameState.home[0];
            this.renderer.hexGrid.centerOn(home.q, home.r);
            this.renderer.render();
        }
    }
    
    updateRoundStatus(data) {
        if (data.waiting) {
            this.showWaitingOverlay(data.status);
        } else {
            this.hideWaitingOverlay();
        }
    }
    
    showWaitingOverlay(status) {
        const overlay = document.getElementById('round-waiting-overlay');
        const message = document.getElementById('waiting-message');
        const countdown = document.getElementById('countdown-timer');
        const roundInfo = document.getElementById('round-info');
        
        overlay.classList.remove('hidden');
        
        if (status.message) {
            message.textContent = status.message;
        }
        
        if (status.countdown) {
            countdown.textContent = status.countdown;
            countdown.classList.add('countdown-pulse');
        } else {
            countdown.textContent = '';
            countdown.classList.remove('countdown-pulse');
        }
        
        if (status.roundName) {
            roundInfo.innerHTML = `
                <h3>Next Round: ${status.roundName}</h3>
                ${status.startAt ? `<p>Starts: ${new Date(status.startAt).toLocaleString()}</p>` : ''}
            `;
        } else {
            roundInfo.innerHTML = '';
        }
    }
    
    hideWaitingOverlay() {
        const overlay = document.getElementById('round-waiting-overlay');
        overlay.classList.add('hidden');
    }
    
    updateConnectionStatus(connected) {
        if (connected) {
            this.connectionIndicator.textContent = 'Connected';
            this.connectionIndicator.className = 'status-online';
        } else {
            this.connectionIndicator.textContent = 'Disconnected';
            this.connectionIndicator.className = 'status-offline';
        }
    }
    
    setupEventListeners() {
        // Обработчики клавиатуры
        document.addEventListener('keydown', (event) => {
            switch (event.key) {
                case 'c':
                case 'C':
                    // Центрировать на муравейнике
                    document.getElementById('centerView').click();
                    break;
                case 'f':
                case 'F':
                    // Переключить следование за юнитами
                    document.getElementById('followUnits').click();
                    break;
                case '=':
                case '+':
                    // Увеличить масштаб
                    document.getElementById('zoomIn').click();
                    break;
                case '-':
                case '_':
                    // Уменьшить масштаб
                    document.getElementById('zoomOut').click();
                    break;
                case 'v':
                case 'V':
                    // Переключить отображение областей видимости
                    this.renderer.showVisionRange = !this.renderer.showVisionRange;
                    this.renderer.render();
                    break;
                case 'm':
                case 'M':
                    // Переключить отображение путей движения
                    this.renderer.showMovementPaths = !this.renderer.showMovementPaths;
                    this.renderer.render();
                    break;
                case 'Escape':
                    // Сбросить все настройки отображения
                    this.resetView();
                    break;
            }
        });
        
        // Обработчики мыши для canvas
        this.canvas.addEventListener('contextmenu', (event) => {
            event.preventDefault();
            // Контекстное меню для дополнительных действий
        });
        
        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            setTimeout(() => {
                this.resizeCanvas();
            }, 100);
        });
    }
    
    resetView() {
        this.renderer.showVisionRange = true;
        this.renderer.showMovementPaths = true;
        this.renderer.followUnits = false;
        this.renderer.hexGrid.zoom = 1;
        this.renderer.hexGrid.offsetX = 0;
        this.renderer.hexGrid.offsetY = 0;
        this.renderer.render();
        
        // Обновляем кнопки
        document.getElementById('followUnits').textContent = 'Follow Units';
    }
    
    // Метод для отправки команд боту (если потребуется)
    sendCommand(command) {
        if (this.websocket && this.isConnected) {
            this.websocket.send(JSON.stringify({
                type: 'command',
                command: command
            }));
        }
    }
    
    // Экспорт данных
    exportData() {
        const data = this.statsUpdater.getExportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `game-data-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Показ справки
    showHelp() {
        const helpText = `
Управление визуализатором:

Клавиатуру:
  C - Центрировать на муравейнике
  F - Следовать за юнитами
  + - Увеличить масштаб
  - - Уменьшить масштаб
  V - Показать/скрыть области видимости
  M - Показать/скрыть пути движения
  Esc - Сбросить настройки

Мышь:
  Левая кнопка - Перетаскивание карты
  Колесо - Изменение масштаба
  Наведение - Информация о объектах
        `;
        
        alert(helpText);
    }
    
    /**
     * Детектирует боевые события, изменения в юнитах и логирует их.
     * @param {Object} gameState - Текущее состояние игры
     * @param {Object} analysis - Анализ игрового состояния
     */
    detectCombatEvents(gameState, analysis) {
        if (!this.previousGameState || !gameState) return;
        
        // Детекция новых врагов
        this.detectNewEnemies(gameState);
        
        // Детекция потерянных юнитов (смерть)
        this.detectLostUnits(gameState);
        
        // Детекция уничтоженных врагов
        this.detectDefeatedEnemies(gameState);
        
        // Детекция изменений здоровья (урон)
        this.detectHealthChanges(gameState);
        
        // Детекция новых угроз
        this.detectNewThreats(analysis);
        
        // Детекция обнаружения вражеских муравейников
        this.detectEnemyAnthillDiscovery(gameState);
    }
    
    detectNewEnemies(gameState) {
        if (!this.previousGameState.enemies || !gameState.enemies) return;
        
        const prevEnemyIds = new Set(this.previousGameState.enemies.map(e => `${e.q},${e.r},${e.type}`));
        const newEnemies = gameState.enemies.filter(enemy => 
            !prevEnemyIds.has(`${enemy.q},${enemy.r},${enemy.type}`)
        );
        
        newEnemies.forEach(enemy => {
            if (enemy.type === 0) {
                this.logManager.addEnemyEvent(`Enemy anthill discovered at (${enemy.q}, ${enemy.r})!`);
            } else {
                const unitTypes = { 1: 'Worker', 2: 'Soldier', 3: 'Scout' };
                const unitType = unitTypes[enemy.type] || 'Unit';
                this.logManager.addEnemyEvent(`Enemy ${unitType} spotted at (${enemy.q}, ${enemy.r})`);
            }
        });
    }
    
    detectLostUnits(gameState) {
        if (!this.previousGameState.ants || !gameState.ants) return;
        
        const currentUnitIds = new Set(gameState.ants.map(u => u.id));
        const lostUnits = this.previousGameState.ants.filter(unit => 
            !currentUnitIds.has(unit.id)
        );
        
        lostUnits.forEach(unit => {
            const unitTypes = { 1: 'Worker', 2: 'Soldier', 3: 'Scout' };
            const unitType = unitTypes[unit.type] || 'Unit';
            this.logManager.addDeathEvent(`Our ${unitType} (ID: ${unit.id}) was destroyed at (${unit.q}, ${unit.r})`);
        });
    }
    
    detectDefeatedEnemies(gameState) {
        if (!this.previousGameState.enemies || !gameState.enemies) return;
        
        const currentEnemyIds = new Set(gameState.enemies.map(e => `${e.q},${e.r},${e.type}`));
        const defeatedEnemies = this.previousGameState.enemies.filter(enemy => 
            !currentEnemyIds.has(`${enemy.q},${enemy.r},${enemy.type}`) && enemy.type !== 0
        );
        
        defeatedEnemies.forEach(enemy => {
            const unitTypes = { 1: 'Worker', 2: 'Soldier', 3: 'Scout' };
            const unitType = unitTypes[enemy.type] || 'Unit';
            this.logManager.addCombatEvent(`Enemy ${unitType} defeated at (${enemy.q}, ${enemy.r})`);
        });
    }
    
    detectHealthChanges(gameState) {
        if (!this.previousGameState.ants || !gameState.ants) return;
        
        const prevUnitsMap = new Map();
        this.previousGameState.ants.forEach(unit => {
            prevUnitsMap.set(unit.id, unit);
        });
        
        gameState.ants.forEach(unit => {
            const prevUnit = prevUnitsMap.get(unit.id);
            if (prevUnit && prevUnit.health && unit.health && unit.health < prevUnit.health) {
                const damage = prevUnit.health - unit.health;
                const unitTypes = { 1: 'Worker', 2: 'Soldier', 3: 'Scout' };
                const unitType = unitTypes[unit.type] || 'Unit';
                this.logManager.addDamageEvent(`Our ${unitType} (ID: ${unit.id}) took ${damage} damage (${unit.health}/${prevUnit.health})`);
            }
        });
    }
    
    detectNewThreats(analysis) {
        if (!this.previousAnalysis?.threats || !analysis?.threats) return;
        
        const prevThreatCount = this.previousAnalysis.threats.threats?.length || 0;
        const currentThreatCount = analysis.threats.threats?.length || 0;
        
        if (currentThreatCount > prevThreatCount) {
            const newThreatCount = currentThreatCount - prevThreatCount;
            this.logManager.addMessage(`⚠️ ${newThreatCount} new threat(s) detected! Total threats: ${currentThreatCount}`, 'warning');
        }
        
        // Детекция критических угроз
        const immediateThreatCount = analysis.threats.immediateThreats?.length || 0;
        const prevImmediateThreatCount = this.previousAnalysis.threats.immediateThreats?.length || 0;
        
        if (immediateThreatCount > prevImmediateThreatCount) {
            this.logManager.addMessage(`🚨 IMMEDIATE THREAT! ${immediateThreatCount} enemies near our anthill!`, 'error');
        }
    }
    
    detectEnemyAnthillDiscovery(gameState) {
        const prevAnthills = this.previousGameState.discoveredEnemyAnthills?.length || 0;
        const currentAnthills = gameState.discoveredEnemyAnthills?.length || 0;
        
        if (currentAnthills > prevAnthills) {
            this.logManager.addMessage(`🏴 Enemy anthill discovered! Total found: ${currentAnthills}`, 'enemy');
        }
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    window.gameVisualizer = new GameVisualizer();
    
    // Добавляем кнопку справки
    const helpButton = document.createElement('button');
    helpButton.textContent = 'Help';
    helpButton.onclick = () => window.gameVisualizer.showHelp();
    document.querySelector('.game-controls').appendChild(helpButton);
    
    // Добавляем кнопку экспорта
    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export';
    exportButton.onclick = () => window.gameVisualizer.exportData();
    document.querySelector('.game-controls').appendChild(exportButton);
    
    console.log('Game Visualizer initialized');
});