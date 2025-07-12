const ApiClient = require('./api/ApiClient');
const GameAnalyzer = require('./game/GameAnalyzer');
const StrategyManager = require('./game/StrategyManager');
const UnitManager = require('./game/UnitManager');
const ResourceManager = require('./game/ResourceManager');
const CombatManager = require('./game/CombatManager');
const RoundManager = require('./game/RoundManager');
const logger = require('./utils/Logger');
const WebSocketServer = require('../visualizer/src/WebSocketServer');

class GameBot {
    constructor(config) {
        this.config = config;
        this.apiClient = new ApiClient(config.apiUrl, config.token);
        this.gameAnalyzer = new GameAnalyzer();
        this.strategyManager = new StrategyManager();
        this.unitManager = new UnitManager();
        this.resourceManager = new ResourceManager();
        this.combatManager = new CombatManager();
        this.roundManager = new RoundManager(this.apiClient);
        
        this.gameState = null;
        this.turnNumber = 0;
        this.isRunning = false;
        this.isWaitingForRound = false;
        
        // Инициализация визуализатора
        this.visualizer = new WebSocketServer(config.visualizerPort || 3001);
        this.startVisualizer();
        
        // Таймер для обновления обратного отсчета
        this.countdownTimer = setInterval(() => {
            this.updateWaitingCountdown();
        }, 1000);
    }

    async run() {
        logger.info('Starting game bot...');
        
        try {
            this.isRunning = true;
            await this.waitForRoundAndRegister();
            await this.gameLoop();
        } catch (error) {
            logger.error('Error in game loop:', error);
            this.isRunning = false;
        }
    }

    async waitForRoundAndRegister() {
        while (this.isRunning) {
            try {
                // Проверяем текущее состояние раундов
                await this.roundManager.checkRounds();
                
                // Пытаемся зарегистрироваться в текущем раунде
                if (this.roundManager.isRoundActive()) {
                    const success = await this.roundManager.tryRegisterForCurrentRound(this.config.teamName);
                    if (success) {
                        logger.info('Successfully registered to game');
                        this.isWaitingForRound = false;
                        this.sendWaitingStatus(false);
                        return;
                    }
                }
                
                // Если нет активного раунда, ждем следующего
                logger.info('No active round available, waiting for next round...');
                this.isWaitingForRound = true;
                
                // Отправляем статус ожидания в визуализатор
                this.sendWaitingStatus(true);
                
                // Ждем начала следующего раунда
                await this.roundManager.waitForNextRound();
                
                // После начала раунда пытаемся зарегистрироваться
                const success = await this.roundManager.tryRegisterForCurrentRound(this.config.teamName);
                if (success) {
                    logger.info('Successfully registered to new round');
                    this.isWaitingForRound = false;
                    this.sendWaitingStatus(false);
                    return;
                }
                
            } catch (error) {
                logger.error('Error waiting for round:', error);
                await this.sleep(5000); // Ждем 5 секунд перед повторной попыткой
            }
        }
    }

    sendWaitingStatus(isWaiting) {
        if (this.visualizer) {
            const roundStatus = this.roundManager.getRoundSummary();
            this.visualizer.broadcast({
                type: 'roundStatus',
                waiting: isWaiting,
                status: roundStatus
            });
        }
    }
    
    async updateWaitingCountdown() {
        if (this.isWaitingForRound && this.visualizer) {
            const roundStatus = this.roundManager.getRoundSummary();
            this.visualizer.broadcast({
                type: 'roundStatus',
                waiting: true,
                status: roundStatus
            });
        }
    }

    async gameLoop() {
        while (this.isRunning) {
            try {
                this.gameState = await this.apiClient.getGameState();
                
                if (!this.gameState) {
                    logger.warn('No game state received, waiting...');
                    await this.sleep(1000);
                    continue;
                }

                this.turnNumber = this.gameState.turnNo || 0;
                logger.info(`Turn ${this.turnNumber}: Processing game state`);

                const analysis = this.gameAnalyzer.analyze(this.gameState);
                const strategy = this.strategyManager.determineStrategy(analysis, this.turnNumber);
                const decisions = this.makeDecisions(analysis, strategy);

                // Обновляем визуализатор
                this.updateVisualizer(analysis, strategy);

                await this.executeDecisions(decisions);
                await this.sleep(500);
                
            } catch (error) {
                logger.error('Error in game loop iteration:', error);
                await this.sleep(2000);
            }
        }
    }

    makeDecisions(analysis, strategy) {
        const decisions = {
            unitMoves: [],
            combatActions: [],
            resourceActions: []
        };

        const unitDecisions = this.unitManager.planUnitActions(analysis, strategy);
        const resourceDecisions = this.resourceManager.planResourceCollection(analysis, strategy);
        const combatDecisions = this.combatManager.planCombatActions(analysis, strategy);

        decisions.unitMoves = unitDecisions.moves;
        decisions.resourceActions = resourceDecisions.actions;
        decisions.combatActions = combatDecisions.actions;

        return decisions;
    }

    async executeDecisions(decisions) {
        try {
            if (decisions.unitMoves.length > 0) {
                await this.apiClient.sendMoves(decisions.unitMoves);
                logger.info(`Sent ${decisions.unitMoves.length} unit moves`);
            }

            if (decisions.combatActions.length > 0) {
                logger.info(`Planned ${decisions.combatActions.length} combat actions`);
            }

            if (decisions.resourceActions.length > 0) {
                logger.info(`Planned ${decisions.resourceActions.length} resource actions`);
            }
        } catch (error) {
            logger.error('Error executing decisions:', error);
        }
    }

    startVisualizer() {
        try {
            this.visualizer.start();
            logger.info('Game visualizer started');
        } catch (error) {
            logger.error('Failed to start visualizer:', error);
        }
    }
    
    updateVisualizer(analysis, strategy) {
        if (this.visualizer && this.gameState) {
            this.visualizer.updateGameState(this.gameState, analysis, strategy);
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GameBot;