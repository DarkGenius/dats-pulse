const ApiClient = require('./api/ApiClient');
const GameAnalyzer = require('./game/GameAnalyzer');
const StrategyManager = require('./game/StrategyManager');
const UnitManager = require('./game/UnitManager');
const ResourceManager = require('./game/ResourceManager');
const CombatManager = require('./game/CombatManager');
const logger = require('./utils/Logger');

class GameBot {
    constructor(config) {
        this.config = config;
        this.apiClient = new ApiClient(config.apiUrl, config.token);
        this.gameAnalyzer = new GameAnalyzer();
        this.strategyManager = new StrategyManager();
        this.unitManager = new UnitManager();
        this.resourceManager = new ResourceManager();
        this.combatManager = new CombatManager();
        
        this.gameState = null;
        this.turnNumber = 0;
        this.isRunning = false;
    }

    async run() {
        logger.info('Starting game bot...');
        
        try {
            await this.apiClient.register(this.config.teamName);
            logger.info('Successfully registered to game');
            
            this.isRunning = true;
            await this.gameLoop();
        } catch (error) {
            logger.error('Error in game loop:', error);
            this.isRunning = false;
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

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = GameBot;