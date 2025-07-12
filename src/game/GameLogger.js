const fs = require('fs');
const path = require('path');
const logger = require('../utils/Logger');

class GameLogger {
  constructor() {
    this.logger = logger;
    this.currentGameLog = null;
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
      this.logger.info('Created logs directory');
    }
  }

  startNewGame(roundId, gameId, teamName) {
    this.currentGameLog = {
      roundId,
      gameId,
      teamName,
      startTime: new Date().toISOString(),
      endTime: null,
      finalScore: null,
      finalPosition: null,
      turns: [],
      summary: {
        totalTurns: 0,
        peakCalories: 0,
        peakUnitCount: 0,
        resourcesCollected: {
          apples: 0,
          bread: 0,
          nectar: 0
        },
        unitsLost: 0,
        enemiesDefeated: 0,
        movementsMade: 0,
        decisionsExecuted: 0
      }
    };
    
    // Create log filename once at the start
    this.currentLogFilename = `round_${roundId}_game_${gameId}_${Date.now()}.json`;
    this.currentLogPath = path.join(this.logsDir, this.currentLogFilename);
    
    // Write initial log file
    this.saveCurrentLog();
    
    this.logger.info(`Started logging for round ${roundId}, game ${gameId}`);
    this.logger.info(`Log file: ${this.currentLogFilename}`);
  }

  logTurn(turnNumber, gameState, decisions, actions) {
    if (!this.currentGameLog) {
      this.logger.error('No active game log');
      return;
    }

    const turnData = {
      turnNumber,
      timestamp: new Date().toISOString(),
      gameState: gameState,  // Store raw API response
      gameStateSummary: this.sanitizeGameState(gameState),  // Keep sanitized version for quick reference
      decisions: {
        strategy: decisions.strategy || 'unknown',
        phase: decisions.phase || 'unknown',
        actions: actions || [],
        reasoning: decisions.reasoning || []
      },
      metrics: this.calculateTurnMetrics(gameState),
      combatEvents: []  // Will be populated by logDecision calls
    };

    this.currentGameLog.turns.push(turnData);
    this.updateSummary(gameState, actions);
    
    // Save log after each turn for real-time updates
    this.saveCurrentLog();
    
    this.logger.debug(`Logged turn ${turnNumber}`);
  }

  sanitizeGameState(gameState) {
    // Create a summary with key information for quick reference
    // This doesn't replace the raw data but provides a convenient overview
    const myUnits = gameState.myUnits || gameState.ants || [];
    const enemies = gameState.enemies || [];
    const food = gameState.food || [];
    const home = gameState.home || [];
    
    return {
      turnNo: gameState.turnNo,
      scores: gameState.scores,
      home: home.length > 0 ? home[0] : null,
      unitCount: myUnits.filter(u => u.type !== 0).length,  // Exclude anthills
      enemyCount: enemies.filter(u => u.type !== 0).length,  // Exclude anthills
      foodCount: food.length,
      unitsByType: this.countUnitsByType(myUnits),
      enemiesByType: this.countUnitsByType(enemies),
      foodByType: this.countFoodByType(food),
      nextTurnIn: gameState.nextTurnIn
    };
  }

  calculateTurnMetrics(gameState) {
    // Find my team name from the game state - it might be in different places
    const myTeamName = this.currentGameLog?.teamName;
    const myScore = gameState.scores?.find(s => s.team === myTeamName);
    
    // Get units from the correct field
    const myUnits = gameState.myUnits || gameState.ants || [];
    const enemies = gameState.enemies || [];
    const food = gameState.food || [];
    
    const unitCounts = this.countUnitsByType(myUnits);
    
    return {
      totalCalories: myScore?.score || 0,
      unitCounts,
      totalUnits: myUnits.filter(u => u.type !== 0).length,  // Exclude anthills
      visibleResources: food.length,
      visibleEnemies: enemies.filter(u => u.type !== 0).length,  // Exclude anthills
      unitsWithCargo: myUnits.filter(u => u.cargo > 0).length || 0
    };
  }

  countUnitsByType(units) {
    const counts = { workers: 0, soldiers: 0, scouts: 0, anthills: 0 };
    if (!units) return counts;
    
    units.forEach(unit => {
      switch(unit.type) {
        case 0: counts.anthills++; break;
        case 1: counts.workers++; break;
        case 2: counts.soldiers++; break;
        case 3: counts.scouts++; break;
      }
    });
    
    return counts;
  }
  
  countFoodByType(food) {
    const counts = { apples: 0, bread: 0, nectar: 0 };
    if (!food) return counts;
    
    food.forEach(item => {
      switch(item.type) {
        case 1: counts.apples++; break;
        case 2: counts.bread++; break;
        case 3: counts.nectar++; break;
      }
    });
    
    return counts;
  }

  updateSummary(gameState, actions) {
    const summary = this.currentGameLog.summary;
    const myTeamName = this.currentGameLog?.teamName;
    const myScore = gameState.scores?.find(s => s.team === myTeamName);
    const currentCalories = myScore?.score || 0;
    
    const myUnits = gameState.myUnits || gameState.ants || [];
    const currentUnitCount = myUnits.filter(u => u.type !== 0).length;  // Exclude anthills
    
    summary.totalTurns = gameState.turnNo || 0;
    summary.peakCalories = Math.max(summary.peakCalories, currentCalories);
    summary.peakUnitCount = Math.max(summary.peakUnitCount, currentUnitCount);
    
    // Count actions executed
    actions?.forEach(action => {
      if (action.type === 'move') {
        summary.movementsMade++;
      }
      summary.decisionsExecuted++;
    });
  }

  logDecision(category, decision, reasoning) {
    if (!this.currentGameLog || !this.currentGameLog.turns.length) return;
    
    const currentTurn = this.currentGameLog.turns[this.currentGameLog.turns.length - 1];
    if (!currentTurn.decisions.reasoning) {
      currentTurn.decisions.reasoning = [];
    }
    
    currentTurn.decisions.reasoning.push({
      category,
      decision,
      reasoning,
      timestamp: new Date().toISOString()
    });
    
    // Also add combat events to a separate array for easier analysis
    if (category === 'combat') {
      if (!currentTurn.combatEvents) {
        currentTurn.combatEvents = [];
      }
      currentTurn.combatEvents.push({
        type: decision,
        details: reasoning,
        timestamp: new Date().toISOString()
      });
    }
    
    // Save after decision logging
    this.saveCurrentLog();
  }

  logCombatResult(enemiesDefeated, unitsLost) {
    if (!this.currentGameLog) return;
    
    const summary = this.currentGameLog.summary;
    summary.enemiesDefeated += enemiesDefeated || 0;
    summary.unitsLost += unitsLost || 0;
    
    // Save after combat logging
    this.saveCurrentLog();
  }

  logResourceCollection(resourceType, amount) {
    if (!this.currentGameLog) return;
    
    const summary = this.currentGameLog.summary;
    switch(resourceType) {
      case 1: summary.resourcesCollected.apples += amount; break;
      case 2: summary.resourcesCollected.bread += amount; break;
      case 3: summary.resourcesCollected.nectar += amount; break;
    }
    
    // Save after resource logging
    this.saveCurrentLog();
  }

  endGame(finalScore, finalPosition) {
    if (!this.currentGameLog) {
      this.logger.error('No active game log to end');
      return;
    }

    this.currentGameLog.endTime = new Date().toISOString();
    this.currentGameLog.finalScore = finalScore;
    this.currentGameLog.finalPosition = finalPosition;

    // Save final version of the log
    this.saveCurrentLog();

    this.logger.info(`Game log saved to ${this.currentLogFilename}`);
    this.logger.info(`Final position: ${finalPosition}, Score: ${finalScore}`);

    // Clear current log
    this.currentGameLog = null;
    this.currentLogFilename = null;
    this.currentLogPath = null;
  }

  saveCurrentLog() {
    if (!this.currentGameLog || !this.currentLogPath) return;
    
    try {
      fs.writeFileSync(this.currentLogPath, JSON.stringify(this.currentGameLog, null, 2));
      // Don't log every save to avoid spam, only log errors
    } catch (error) {
      this.logger.error(`Failed to save game log: ${error.message}`);
    }
  }

  saveSnapshot(prefix = 'snapshot') {
    if (!this.currentGameLog) return;
    
    const filename = `${prefix}_round_${this.currentGameLog.roundId}_turn_${this.currentGameLog.summary.totalTurns}.json`;
    const filepath = path.join(this.logsDir, filename);
    
    try {
      fs.writeFileSync(filepath, JSON.stringify(this.currentGameLog, null, 2));
      this.logger.debug(`Snapshot saved to ${filename}`);
    } catch (error) {
      this.logger.error(`Failed to save snapshot: ${error.message}`);
    }
  }
}

module.exports = GameLogger;