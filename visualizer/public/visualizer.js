class GameVisualizer {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new GameRenderer(this.canvas);
        this.statsUpdater = new StatsUpdater();
        this.websocket = null;
        this.isConnected = false;
        
        this.connectionIndicator = document.getElementById('connection-indicator');
        
        // Для обновления таймера ожидания
        this.waitingData = null;
        this.countdownInterval = null;
        
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
            const wsUrl = `${protocol}//${location.hostname}:${location.port || 3001}/ws`;
            
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
                this.updateGameState(data.gameState, data.analysis, data.strategy);
                break;
            case 'gameUpdate':
                this.updateGameState(data.gameState, data.analysis, data.strategy);
                break;
            case 'roundStatus':
                this.updateRoundStatus(data);
                break;
            case 'error':
                console.error('Game error:', data.message);
                break;
            case 'status':
                console.log('Game status:', data.message);
                break;
            default:
                console.warn('Unknown message type:', data.type);
        }
    }
    
    updateGameState(gameState, analysis, strategy) {
        this.renderer.updateGameState(gameState, analysis);
        this.statsUpdater.updateStats(gameState, analysis, strategy);
        this.statsUpdater.updateHistory(gameState);
        
        // Скрываем оверлей ожидания, если игра началась
        this.hideWaitingOverlay();
    }
    
    updateRoundStatus(data) {
        if (data.waiting) {
            this.waitingData = data.status;
            this.showWaitingOverlay(data.status);
            this.startCountdownTimer();
        } else {
            this.hideWaitingOverlay();
            this.stopCountdownTimer();
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
        
        // Начальное отображение таймера
        if (status.startAt) {
            this.updateCountdown();
        } else {
            countdown.textContent = '';
            countdown.classList.remove('countdown-pulse');
        }
        
        if (status.roundName) {
            roundInfo.innerHTML = `
                <h3>Следующий раунд: ${status.roundName}</h3>
                ${status.startAt ? `<p>Начало: ${new Date(status.startAt).toLocaleString()}</p>` : ''}
            `;
        } else {
            roundInfo.innerHTML = '';
        }
    }
    
    hideWaitingOverlay() {
        const overlay = document.getElementById('round-waiting-overlay');
        overlay.classList.add('hidden');
    }
    
    startCountdownTimer() {
        this.stopCountdownTimer(); // Останавливаем предыдущий таймер
        
        if (!this.waitingData || !this.waitingData.startAt) {
            return;
        }
        
        this.countdownInterval = setInterval(() => {
            this.updateCountdown();
        }, 1000);
    }
    
    stopCountdownTimer() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
    }
    
    updateCountdown() {
        if (!this.waitingData || !this.waitingData.startAt) {
            return;
        }
        
        const now = new Date();
        const startTime = new Date(this.waitingData.startAt);
        const timeUntilStart = startTime.getTime() - now.getTime();
        
        if (timeUntilStart <= 0) {
            this.displayCountdown('Раунд должен начаться...');
            return;
        }
        
        const countdown = this.formatCountdown(timeUntilStart);
        this.displayCountdown(countdown);
    }
    
    formatCountdown(milliseconds) {
        const totalSeconds = Math.ceil(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
    
    displayCountdown(text) {
        const countdown = document.getElementById('countdown-timer');
        if (countdown) {
            countdown.textContent = text;
            
            // Добавляем пульсацию для последних 10 секунд
            if (text.includes('s') && !text.includes('m') && !text.includes('h')) {
                const seconds = parseInt(text.replace('s', ''));
                if (seconds <= 10) {
                    countdown.classList.add('countdown-pulse');
                } else {
                    countdown.classList.remove('countdown-pulse');
                }
            }
        }
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
        this.renderer.showVisionRange = false;
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