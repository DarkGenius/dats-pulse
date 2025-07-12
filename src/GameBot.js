const ApiClient = require('./api/ApiClient');
const GameAnalyzer = require('./game/GameAnalyzer');
const StrategyManager = require('./game/StrategyManager');
const UnitManager = require('./game/UnitManager');
const ResourceManager = require('./game/ResourceManager');
const CombatManager = require('./game/CombatManager');
const RoundManager = require('./game/RoundManager');
const GameLogger = require('./game/GameLogger');
const ResourceAssignmentManager = require('./game/ResourceAssignmentManager');
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
        this.gameLogger = new GameLogger();
        this.resourceAssignmentManager = new ResourceAssignmentManager();
        
        this.gameState = null;
        this.currentRoundId = null;
        this.currentGameId = null;
        this.previousGameState = null;
        this.turnNumber = 0;
        this.isRunning = false;
        this.isWaitingForRound = false;
        this.isGameActive = false;
        this.registeredRoundId = null;
        this.isInLobby = false;
        
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
        this.isRunning = true;
        
        // Continuous loop for multiple rounds
        while (this.isRunning) {
            try {
                await this.waitForRoundAndRegister();
                await this.gameLoop();
            } catch (error) {
                logger.error('Error in game loop:', error);
                
                // End game logging if active
                if (this.gameLogger.currentGameLog) {
                    await this.endGame();
                }
                
                // Reset state to prevent re-registration issues
                this.isGameActive = false;
                this.registeredRoundId = null;
                
                // Wait before retrying
                await this.sleep(5000);
            }
        }
        
        logger.info('Game bot stopped.');
    }

    async waitForRoundAndRegister() {
        while (this.isRunning) {
            try {
                await this.roundManager.checkRounds();
                
                if (this.roundManager.isRoundActive()) {
                    const currentRoundId = this.roundManager.currentRound?.name;
                    
                    // Check if we already registered for this round
                    if (this.registeredRoundId === currentRoundId) {
                        logger.debug(`Already registered for round ${currentRoundId}, waiting...`);
                        await this.sleep(5000);
                        continue;
                    }
                    
                    const registrationInfo = await this.roundManager.tryRegisterForCurrentRound(this.config.teamName);
                    if (registrationInfo) {
                        logger.info('Successfully registered to game');
                        logger.debug('Registration info:', registrationInfo);
                        
                        // Mark as registered for this round
                        this.registeredRoundId = currentRoundId;
                        
                        // Start logging for new game
                        this.currentRoundId = currentRoundId || 'unknown';
                        this.currentGameId = registrationInfo.gameId || Date.now().toString();
                        this.gameLogger.startNewGame(this.currentRoundId, this.currentGameId, this.config.teamName);
                        
                        // Clear resource assignments for new game
                        this.resourceAssignmentManager.clearAllAssignments();

                        if (registrationInfo.lobbyEndsIn && registrationInfo.lobbyEndsIn > 0) {
                            this.isInLobby = true;
                            await this.waitForLobby(registrationInfo.lobbyEndsIn);
                            this.isInLobby = false;
                        } else {
                            logger.warn('No lobby wait time, game may have already started');
                        }
                        
                        // Only hide waiting status after lobby ends
                        this.isWaitingForRound = false;
                        this.sendWaitingStatus(false);
                        
                        // Wait for game to actually start
                        await this.waitForGameStart();
                        
                        // Mark game as active after game starts
                        this.isGameActive = true;
                        return;
                    }
                }
                
                logger.info('No active round available, waiting for next round...');
                this.isWaitingForRound = true;
                this.sendWaitingStatus(true);
                await this.roundManager.waitForNextRound();
                
            } catch (error) {
                logger.error('Error waiting for round:', error);
                await this.sleep(5000);
            }
        }
    }

    sendWaitingStatus(isWaiting) {
        if (this.visualizer) {
            const roundStatus = this.roundManager.getRoundSummary();
            logger.debug(`Sending waiting status: ${isWaiting}, roundStatus:`, roundStatus);
            this.visualizer.broadcast({
                type: 'roundStatus',
                waiting: isWaiting,
                status: roundStatus
            });
        }
    }
    
    async updateWaitingCountdown() {
        // Only update round status if waiting for round, not during lobby
        if (this.isWaitingForRound && !this.isInLobby && this.visualizer) {
            const roundStatus = this.roundManager.getRoundSummary();
            this.visualizer.broadcast({
                type: 'roundStatus',
                waiting: true,
                status: roundStatus
            });
        }
    }

    async waitForLobby(lobbyEndsIn) {
        logger.info(`Waiting for lobby to end in ${lobbyEndsIn} seconds`);
        let remainingTime = lobbyEndsIn;

        const lobbyTimer = setInterval(() => {
            if (this.visualizer) {
                this.visualizer.broadcast({
                    type: 'lobbyStatus',
                    waiting: true,
                    remainingTime: remainingTime
                });
            }
            remainingTime--;
            if (remainingTime < 0) {
                clearInterval(lobbyTimer);
            }
        }, 1000);

        await this.sleep(lobbyEndsIn * 1000);
        logger.info('Lobby ended, waiting a moment before checking game state...');
        
        // Add a small delay after lobby ends to allow server to initialize game
        await this.sleep(2000);
    }
    
    async waitForGameStart() {
        logger.info('Waiting for game to start...');
        let attempts = 0;
        const maxAttempts = 60; // 60 seconds max wait
        
        // Show waiting overlay
        if (this.visualizer) {
            this.visualizer.broadcast({
                type: 'lobbyStatus',
                waiting: true,
                remainingTime: 0
            });
        }
        
        while (attempts < maxAttempts) {
            try {
                const gameState = await this.apiClient.getGameState();
                logger.debug(`waitForGameStart: Attempt ${attempts + 1}/${maxAttempts}, gameState:`, {
                    hasGameState: !!gameState,
                    turnNo: gameState?.turnNo,
                    myUnits: gameState?.myUnits?.length || 0,
                    ants: gameState?.ants?.length || 0,
                    home: gameState?.home?.length || 0,
                    food: gameState?.food?.length || 0
                });
                
                // Check multiple conditions for game start
                if (gameState) {
                    // Check if we have myUnits
                    if (gameState.myUnits && gameState.myUnits.length > 0) {
                        logger.info('Game started! Found myUnits:', gameState.myUnits.length);
                        
                        // Hide waiting overlay
                        if (this.visualizer) {
                            this.visualizer.broadcast({
                                type: 'lobbyStatus',
                                waiting: false
                            });
                        }
                        return;
                    }
                    
                    // Alternative: check if we have ants (API format)
                    if (gameState.ants && gameState.ants.length > 0) {
                        // Filter out anthills (type 0) to check for actual units
                        const actualUnits = gameState.ants.filter(ant => ant.type !== 0);
                        if (actualUnits.length > 0) {
                            logger.info('Game started! Found ants:', actualUnits.length);
                            
                            // Hide waiting overlay
                            if (this.visualizer) {
                                this.visualizer.broadcast({
                                    type: 'lobbyStatus',
                                    waiting: false
                                });
                            }
                            return;
                        }
                    }
                    
                    // Check if game has actually started (turn > 0)
                    if (gameState.turnNo && gameState.turnNo > 0) {
                        logger.info('Game started! Turn:', gameState.turnNo);
                        
                        // Hide waiting overlay
                        if (this.visualizer) {
                            this.visualizer.broadcast({
                                type: 'lobbyStatus',
                                waiting: false
                            });
                        }
                        return;
                    }
                }
                
                // Still waiting
                logger.debug(`No game start indicators yet (attempt ${attempts + 1}/${maxAttempts})`);
                await this.sleep(1000);
                attempts++;
                
            } catch (error) {
                logger.debug(`Error checking game state while waiting (attempt ${attempts + 1}):`, error.message);
                
                // If we get "not registered" error, it might mean the lobby ended without starting
                if (error.message && error.message.includes('not registered')) {
                    logger.warn('Lost registration while waiting for game start, lobby may have ended');
                    
                    // Hide waiting overlay
                    if (this.visualizer) {
                        this.visualizer.broadcast({
                            type: 'lobbyStatus',
                            waiting: false
                        });
                    }
                    
                    // Throw error to trigger re-registration
                    throw error;
                }
                
                await this.sleep(1000);
                attempts++;
            }
        }
        
        logger.warn('Timeout waiting for game to start - proceeding anyway');
        
        // Hide waiting overlay
        if (this.visualizer) {
            this.visualizer.broadcast({
                type: 'lobbyStatus',
                waiting: false
            });
        }
    }

    async gameLoop() {
        let lastTurnNumber = -1;
        let turnStartTime = Date.now();
        const MAX_TURNS = 420; // Maximum turns per round
        
        while (this.isRunning) {
            try {
                this.gameState = await this.apiClient.getGameState();
                
                if (!this.gameState) {
                    logger.warn('No game state received, waiting...');
                    await this.sleep(1000);
                    continue;
                }

                // Normalize game state - ensure myUnits exists (filter out anthills)
                if (!this.gameState.myUnits && this.gameState.ants) {
                    this.gameState.myUnits = this.gameState.ants.filter(ant => ant.type !== 0);
                    logger.debug(`Normalized game state: copied ${this.gameState.myUnits.length} actual ants to myUnits (filtered out anthills)`);
                }

                this.turnNumber = this.gameState.turnNo || 0;
                
                // Get units from either myUnits or ants field (filter out anthills)
                const units = this.gameState.myUnits || 
                    (this.gameState.ants ? this.gameState.ants.filter(ant => ant.type !== 0) : []);
                
                // If we're on turn 0 and no units, game hasn't started yet
                if (this.turnNumber === 0 && units.length === 0) {
                    logger.debug('Waiting for game to start...');
                    await this.sleep(1000);
                    continue;
                }
                
                // Only check for game over if the game has actually started (turn > 0)
                if (this.turnNumber > 0 && units.length === 0) {
                    logger.info('All units are dead. Game over.');
                    
                    // End current game logging
                    if (this.gameLogger.currentGameLog) {
                        await this.endGame();
                    }
                    
                    // Reset game state
                    this.isGameActive = false;
                    this.registeredRoundId = null;
                    
                    // Wait for next round and re-register
                    logger.info('Waiting for next round...');
                    this.isWaitingForRound = true;
                    this.sendWaitingStatus(true);
                    
                    await this.waitForRoundAndRegister();
                    
                    // Reset for new game
                    lastTurnNumber = -1;
                    this.previousGameState = null;
                    continue;
                }
                
                // Check if round has ended (reached max turns)
                if (this.turnNumber >= MAX_TURNS) {
                    logger.info(`Round ended at turn ${this.turnNumber}. Game over.`);
                    
                    // End current game logging
                    if (this.gameLogger.currentGameLog) {
                        await this.endGame();
                    }
                    
                    // Reset game state
                    this.isGameActive = false;
                    this.registeredRoundId = null;
                    
                    // Wait for next round and re-register
                    logger.info('Waiting for next round...');
                    this.isWaitingForRound = true;
                    this.sendWaitingStatus(true);
                    
                    await this.waitForRoundAndRegister();
                    
                    // Reset for new game
                    lastTurnNumber = -1;
                    this.previousGameState = null;
                    continue;
                }
                
                // Check if turn has progressed
                if (this.turnNumber === lastTurnNumber) {
                    const elapsed = Date.now() - turnStartTime;
                    if (elapsed < 2000) {
                        logger.debug(`Turn ${this.turnNumber}: Waiting for turn progression (${elapsed}ms elapsed)`);
                        await this.sleep(1000);
                        continue;
                    } else if (elapsed > 30000) {
                        logger.warn(`Turn ${this.turnNumber}: Stuck for ${elapsed}ms, forcing progression`);
                        lastTurnNumber = -1; // Reset to allow processing
                    } else {
                        logger.debug(`Turn ${this.turnNumber}: Still processing same turn (${elapsed}ms elapsed)`);
                        await this.sleep(1000);
                        continue;
                    }
                }
                
                // New turn detected or forced progression
                if (this.turnNumber !== lastTurnNumber) {
                    logger.info(`Turn ${this.turnNumber}: New turn detected (previous: ${lastTurnNumber})`);
                    lastTurnNumber = this.turnNumber;
                    turnStartTime = Date.now();
                }

                logger.info(`Turn ${this.turnNumber}: Processing game state`);
                logger.debug(`Turn ${this.turnNumber}: Game state - Units: ${this.gameState.ants?.length || 0}, Resources: ${this.gameState.food?.length || 0}`);

                // Track state changes for logging
                if (this.previousGameState) {
                    this.logStateChanges(this.previousGameState, this.gameState);
                }

                const analysis = this.gameAnalyzer.analyze(this.gameState);
                const strategy = this.strategyManager.determineStrategy(analysis, this.turnNumber);
                const decisions = this.makeDecisions(analysis, strategy);
                
                // Log turn data
                this.gameLogger.logTurn(
                    this.turnNumber,
                    this.gameState,
                    {
                        strategy: strategy.name,
                        phase: strategy.phase,
                        reasoning: this.collectReasoningData(analysis, strategy)
                    },
                    this.extractActions(decisions)
                );

                logger.debug(`Turn ${this.turnNumber}: Generated ${decisions.unitMoves.length} moves, ${decisions.combatActions.length} combat actions, ${decisions.resourceActions.length} resource actions`);

                // Обновляем визуализатор с решениями
                this.updateVisualizer(analysis, strategy, decisions);

                await this.executeDecisions(decisions);
                
                // Save state for next turn comparison
                this.previousGameState = JSON.parse(JSON.stringify(this.gameState));
                
                // Wait longer after executing decisions to allow server processing
                logger.debug(`Turn ${this.turnNumber}: Waiting for server to process moves...`);
                await this.sleep(2000);
                
            } catch (error) {
                logger.error('Error in game loop iteration:', error);
                
                // Check if error is due to not being registered (game ended)
                if (error.message && error.message.includes('not registered in the game')) {
                    logger.info('Game registration lost, likely round ended.');
                    
                    // End current game logging
                    if (this.gameLogger.currentGameLog) {
                        await this.endGame();
                    }
                    
                    // Wait for next round and re-register
                    logger.info('Waiting for next round...');
                    this.isWaitingForRound = true;
                    this.sendWaitingStatus(true);
                    
                    await this.waitForRoundAndRegister();
                    
                    // Reset for new game
                    lastTurnNumber = -1;
                    this.previousGameState = null;
                } else {
                    // Other errors, just wait and retry
                    await this.sleep(2000);
                }
            }
        }
    }

    makeDecisions(analysis, strategy) {
        const decisions = {
            unitMoves: [],
            combatActions: [],
            resourceActions: [],
            unitAssignments: new Map() // Сохраняем назначения для визуализатора
        };

        // Обновляем состояние назначений ресурсов
        this.resourceAssignmentManager.updateAssignments(analysis);

        // Планируем действия с учетом системы резервирования
        const unitDecisions = this.unitManager.planUnitActions(analysis, strategy, this.resourceAssignmentManager);
        const resourceDecisions = this.resourceManager.planResourceCollection(analysis, strategy, this.resourceAssignmentManager);
        const combatDecisions = this.combatManager.planCombatActions(analysis, strategy);

        decisions.unitMoves = unitDecisions.moves;
        decisions.resourceActions = resourceDecisions.actions;
        decisions.combatActions = combatDecisions.actions;
        
        // Сохраняем назначения юнитов из центрального менеджера
        analysis.units.myUnits.forEach(unit => {
            const assignment = this.resourceAssignmentManager.getUnitAssignment(unit.id);
            if (assignment) {
                decisions.unitAssignments.set(unit.id, assignment);
            }
        });

        // Также сохраняем назначения из unitManager для других типов задач
        unitDecisions.moves.forEach(move => {
            if (move.assignment) {
                decisions.unitAssignments.set(move.unit_id, move.assignment);
            }
        });

        return decisions;
    }

    async executeDecisions(decisions) {
        try {
            if (decisions.unitMoves.length > 0) {
                decisions.unitMoves.forEach(move => {
                    const unitId = move.unit_id || move.ant_id;
                    const target = move.move || (move.path && move.path.length > 0 ? move.path[0] : null);
                    if (target) {
                        this.sendLog(`Unit ${unitId} moving to (${target.q}, ${target.r})`, 'move');
                    }
                });
                const response = await this.apiClient.sendMoves(decisions.unitMoves);
                logger.info(`Turn ${this.turnNumber}: Sent ${decisions.unitMoves.length} unit moves successfully`);
            } else {
                logger.debug(`Turn ${this.turnNumber}: No unit moves to send`);
            }

            if (decisions.combatActions.length > 0) {
                decisions.combatActions.forEach(action => {
                    this.sendLog(`Unit ${action.unit_id} engaging in combat`, 'combat');
                });
                logger.info(`Turn ${this.turnNumber}: Planned ${decisions.combatActions.length} combat actions`);
            }

            if (decisions.resourceActions.length > 0) {
                decisions.resourceActions.forEach(action => {
                    this.sendLog(`Unit ${action.unit_id} gathering ${action.resource_type}`, 'gather');
                });
                logger.info(`Turn ${this.turnNumber}: Planned ${decisions.resourceActions.length} resource actions`);
            }
            
            if (decisions.unitMoves.length === 0 && decisions.combatActions.length === 0 && decisions.resourceActions.length === 0) {
                this.sendLog('No actions generated for this turn.', 'system');
                logger.warn(`Turn ${this.turnNumber}: No decisions generated - this might indicate an issue`);
            }
        } catch (error) {
            this.sendLog('Error executing decisions.', 'system');
            logger.error(`Turn ${this.turnNumber}: Error executing decisions:`, error);
            if (error.response) {
                logger.error(`Turn ${this.turnNumber}: Server response:`, error.response);
            }
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
    
    updateVisualizer(analysis, strategy, decisions) {
        if (this.visualizer && this.gameState) {
            // Преобразуем Map в обычный объект для передачи
            const unitAssignments = decisions ? Object.fromEntries(decisions.unitAssignments) : {};
            
            this.visualizer.updateGameState(this.gameState, analysis, strategy, unitAssignments);
            
            // Отправляем информацию о стратегии в лог
            if (strategy) {
                this.sendLog(`Strategy: ${strategy.name} (${strategy.phase} phase)`, 'strategy');
                
                // Логируем приоритеты
                if (strategy.priorities && strategy.priorities.length > 0) {
                    this.sendLog(`Priorities: ${strategy.priorities.join(', ')}`, 'strategy');
                }
                
                // Логируем боевую стратегию
                if (strategy.combatStrategy) {
                    this.sendLog(`Combat stance: ${strategy.combatStrategy.stance || 'none'}`, 'strategy');
                }
            }
        }
    }

    sendLog(message, type) {
        if (this.visualizer) {
            this.visualizer.broadcast({
                type: 'log',
                message: message,
                logType: type
            });
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    collectReasoningData(analysis, strategy) {
        const reasoning = [];
        
        // Check for immediate threats
        if (analysis.threats && analysis.threats.immediateThreats && analysis.threats.immediateThreats.length > 0) {
            reasoning.push({
                category: 'threat',
                decision: 'immediate_threat_detected',
                details: `${analysis.threats.immediateThreats.length} immediate threats detected`
            });
        }
        
        // Check for high threat level
        if (analysis.threats && analysis.threats.overallLevel === 'high') {
            reasoning.push({
                category: 'threat',
                decision: 'high_threat_level',
                details: 'Overall threat level is high'
            });
        }
        
        // Check for nectar resources
        if (analysis.resources && analysis.resources.byType && analysis.resources.byType.nectar && analysis.resources.byType.nectar.length > 0) {
            reasoning.push({
                category: 'resources',
                decision: 'nectar_available',
                details: `${analysis.resources.byType.nectar.length} nectar sources found`
            });
        }
        
        // Check for high value resources
        if (analysis.resources && analysis.resources.highValue && analysis.resources.highValue.length > 0) {
            reasoning.push({
                category: 'resources',
                decision: 'high_value_resources',
                details: `${analysis.resources.highValue.length} high value resources identified`
            });
        }
        
        reasoning.push({
            category: 'strategy',
            decision: strategy.name,
            details: `Phase: ${strategy.phase}, Turn: ${this.turnNumber}`
        });
        
        return reasoning;
    }
    
    extractActions(decisions) {
        const actions = [];
        
        decisions.unitMoves.forEach(move => {
            actions.push({
                type: 'move',
                unitId: move.unit_id || move.ant_id,
                target: move.move || move.path?.[0] || null,
                assignment: move.assignment
            });
        });
        
        decisions.combatActions.forEach(action => {
            actions.push({
                type: 'combat',
                unitId: action.unit_id,
                target: action.target
            });
        });
        
        decisions.resourceActions.forEach(action => {
            actions.push({
                type: 'collect',
                unitId: action.unit_id,
                resourceType: action.resource_type
            });
        });
        
        return actions;
    }
    
    async endGame() {
        // Get final scores
        const finalState = this.gameState;
        const myScore = finalState?.scores?.find(s => s.team === this.config.teamName);
        const finalPosition = this.calculateFinalPosition(finalState?.scores);
        
        this.gameLogger.endGame(myScore?.score || 0, finalPosition);
        logger.info(`Game ended. Final position: ${finalPosition}, Score: ${myScore?.score || 0}`);
    }
    
    calculateFinalPosition(scores) {
        if (!scores || scores.length === 0) return null;
        
        const sortedScores = [...scores].sort((a, b) => b.score - a.score);
        const myIndex = sortedScores.findIndex(s => s.team === this.config.teamName);
        
        return myIndex >= 0 ? myIndex + 1 : null;
    }
    
    logStateChanges(previousState, currentState) {
        if (!this.gameLogger.currentGameLog) return;
        
        // Track unit losses and health changes
        const prevUnits = previousState.myUnits || [];
        const currUnits = currentState.myUnits || [];
        const prevEnemies = previousState.enemies || [];
        const currEnemies = currentState.enemies || [];
        
        // Create maps for quick lookup
        const prevUnitMap = new Map(prevUnits.map(u => [u.id, u]));
        const currUnitMap = new Map(currUnits.map(u => [u.id, u]));
        const prevEnemyMap = new Map(prevEnemies.map(u => [u.id, u]));
        const currEnemyMap = new Map(currEnemies.map(u => [u.id, u]));
        
        // Track our unit losses
        let unitsLost = 0;
        prevUnitMap.forEach((unit, id) => {
            if (!currUnitMap.has(id)) {
                unitsLost++;
                const unitType = this.getUnitTypeName(unit.type);
                this.sendLog(`Our ${unitType} was destroyed at (${unit.q}, ${unit.r})`, 'death');
                this.gameLogger.logDecision('combat', 'unit_death', `${unitType} destroyed at (${unit.q}, ${unit.r})`);
            } else {
                // Check health changes
                const prevHealth = unit.health || 0;
                const currHealth = currUnitMap.get(id).health || 0;
                if (currHealth < prevHealth) {
                    const damage = prevHealth - currHealth;
                    const unitType = this.getUnitTypeName(unit.type);
                    this.sendLog(`Our ${unitType} took ${damage} damage`, 'damage');
                    this.gameLogger.logDecision('combat', 'damage_taken', `${unitType} took ${damage} damage`);
                }
            }
        });
        
        if (unitsLost > 0) {
            this.gameLogger.logCombatResult(0, unitsLost);
        }
        
        // Track enemy discoveries and eliminations
        let enemiesDestroyed = 0;
        
        // Check for new enemies
        currEnemyMap.forEach((enemy, id) => {
            if (!prevEnemyMap.has(id)) {
                const enemyType = this.getUnitTypeName(enemy.type);
                this.sendLog(`Enemy ${enemyType} spotted at (${enemy.q}, ${enemy.r})`, 'enemy');
                this.gameLogger.logDecision('combat', 'enemy_spotted', `Enemy ${enemyType} at (${enemy.q}, ${enemy.r})`);
            }
        });
        
        // Check for destroyed enemies
        prevEnemyMap.forEach((enemy, id) => {
            if (!currEnemyMap.has(id)) {
                enemiesDestroyed++;
                const enemyType = this.getUnitTypeName(enemy.type);
                this.sendLog(`Enemy ${enemyType} destroyed!`, 'kill');
                this.gameLogger.logDecision('combat', 'enemy_killed', `Destroyed enemy ${enemyType}`);
            }
        });
        
        if (enemiesDestroyed > 0) {
            this.gameLogger.logCombatResult(enemiesDestroyed, 0);
        }
        
        // Track resource collection (based on score changes)
        const prevScore = previousState.scores?.find(s => s.team === this.config.teamName)?.score || 0;
        const currScore = currentState.scores?.find(s => s.team === this.config.teamName)?.score || 0;
        const scoreGain = currScore - prevScore;
        
        if (scoreGain > 0) {
            this.gameLogger.logDecision('resources', 'collection', `Collected resources worth ${scoreGain} calories`);
            // Estimate resource types based on score gain
            if (scoreGain >= 60) {
                this.gameLogger.logResourceCollection(3, Math.floor(scoreGain / 60)); // nectar
            } else if (scoreGain >= 25) {
                this.gameLogger.logResourceCollection(2, Math.floor(scoreGain / 25)); // bread
            } else if (scoreGain >= 10) {
                this.gameLogger.logResourceCollection(1, Math.floor(scoreGain / 10)); // apple
            }
        }
    }
    
    getUnitTypeName(type) {
        const unitTypes = {
            1: 'worker',
            2: 'soldier',
            3: 'scout'
        };
        return unitTypes[type] || 'unit';
    }
}

module.exports = GameBot;