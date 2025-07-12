class StatsUpdater {
    constructor() {
        this.gameState = null;
        this.analysis = null;
        this.strategy = null;
        
        this.elements = {
            // Game Info
            turnNumber: document.getElementById('turn-number'),
            gamePhase: document.getElementById('game-phase'),
            score: document.getElementById('score'),
            caloriesPerTurn: document.getElementById('calories-per-turn'),
            
            // Units
            totalUnits: document.getElementById('total-units'),
            workerCount: document.getElementById('worker-count'),
            workerPercentage: document.getElementById('worker-percentage'),
            scoutCount: document.getElementById('scout-count'),
            scoutPercentage: document.getElementById('scout-percentage'),
            soldierCount: document.getElementById('soldier-count'),
            soldierPercentage: document.getElementById('soldier-percentage'),
            
            // Resources
            nectarSources: document.getElementById('nectar-sources'),
            breadSources: document.getElementById('bread-sources'),
            appleSources: document.getElementById('apple-sources'),
            highValueResources: document.getElementById('high-value-resources'),
            
            // Threats
            threatLevel: document.getElementById('threat-level'),
            immediateThreats: document.getElementById('immediate-threats'),
            enemyUnits: document.getElementById('enemy-units'),
            
            // Strategy
            nextUnit: document.getElementById('next-unit'),
            formation: document.getElementById('formation'),
            combatStance: document.getElementById('combat-stance')
        };
        
        this.unitTypes = {
            1: 'worker',
            2: 'soldier', 
            3: 'scout'
        };
        
        this.resourceTypes = {
            1: 'apple',
            2: 'bread',
            3: 'nectar'
        };
    }
    
    updateStats(gameState, analysis, strategy) {
        this.gameState = gameState;
        this.analysis = analysis;
        this.strategy = strategy;
        
        this.updateGameInfo();
        this.updateUnitStats();
        this.updateResourceStats();
        this.updateThreatStats();
        this.updateStrategyStats();
    }
    
    updateGameInfo() {
        if (!this.gameState) return;
        
        this.setText('turnNumber', this.gameState.turnNo || 0);
        this.setText('gamePhase', this.analysis?.gamePhase || 'unknown');
        this.setText('score', this.gameState.score || 0);
        this.setText('caloriesPerTurn', this.analysis?.economy?.caloriesPerTurn || 0);
    }
    
    updateUnitStats() {
        if (!this.analysis?.units) return;
        
        const units = this.analysis.units;
        
        this.setText('totalUnits', units.counts.total);
        this.setText('workerCount', units.counts.worker || 0);
        this.setText('scoutCount', units.counts.scout || 0);
        this.setText('soldierCount', units.counts.soldier || 0);
        
        // Обновляем проценты
        const total = units.counts.total;
        if (total > 0) {
            this.setText('workerPercentage', `(${Math.round((units.counts.worker || 0) / total * 100)}%)`);
            this.setText('scoutPercentage', `(${Math.round((units.counts.scout || 0) / total * 100)}%)`);
            this.setText('soldierPercentage', `(${Math.round((units.counts.soldier || 0) / total * 100)}%)`);
        } else {
            this.setText('workerPercentage', '(0%)');
            this.setText('scoutPercentage', '(0%)');
            this.setText('soldierPercentage', '(0%)');
        }
    }
    
    updateResourceStats() {
        if (!this.analysis?.resources) return;
        
        const resources = this.analysis.resources;
        
        this.setText('nectarSources', resources.byType.nectar?.length || 0);
        this.setText('breadSources', resources.byType.bread?.length || 0);
        this.setText('appleSources', resources.byType.apple?.length || 0);
        this.setText('highValueResources', resources.highValue?.length || 0);
    }
    
    updateThreatStats() {
        if (!this.analysis?.threats) return;
        
        const threats = this.analysis.threats;
        
        // Обновляем уровень угрозы с цветовым индикатором
        const threatLevel = threats.overallLevel;
        const threatElement = this.elements.threatLevel;
        
        if (threatElement) {
            threatElement.textContent = Math.round(threatLevel * 100) + '%';
            threatElement.className = 'threat-indicator';
            
            if (threatLevel < 0.3) {
                threatElement.classList.add('threat-low');
            } else if (threatLevel < 0.7) {
                threatElement.classList.add('threat-medium');
            } else {
                threatElement.classList.add('threat-high');
            }
        }
        
        this.setText('immediateThreats', threats.immediateThreats?.length || 0);
        this.setText('enemyUnits', threats.threats?.length || 0);
    }
    
    updateStrategyStats() {
        if (!this.strategy) return;
        
        // Следующий юнит для производства
        const nextUnit = this.strategy.unitProduction?.nextUnitType;
        if (nextUnit) {
            this.setText('nextUnit', this.capitalizeFirst(nextUnit));
        }
        
        // Формация
        const formations = this.strategy.combatStrategy?.formations;
        if (formations && formations.length > 0) {
            const formationNames = formations.map(f => f.type).join(', ');
            this.setText('formation', formationNames);
        } else {
            this.setText('formation', 'none');
        }
        
        // Боевая стойка
        const stance = this.strategy.combatStrategy?.strategy?.stance;
        if (stance) {
            this.setText('combatStance', this.capitalizeFirst(stance));
        }
    }
    
    setText(elementId, text) {
        const element = this.elements[elementId];
        if (element) {
            element.textContent = text;
        }
    }
    
    capitalizeFirst(str) {
        if (!str) return str;
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
    
    formatPercentage(value, total) {
        if (total === 0) return '0%';
        return Math.round((value / total) * 100) + '%';
    }
    
    // Обновление статистики производительности
    updatePerformanceStats(performance) {
        if (!performance) return;
        
        // Можно добавить дополнительные элементы для отображения производительности
        // Например: FPS, задержка обновления, время обработки ходов и т.д.
    }
    
    // Обновление целей и прогресса
    updateGoals(goals) {
        if (!goals) return;
        
        // Отображение текущих целей бота
        // Например: "Collect nectar", "Defend anthill", "Expand territory"
    }
    
    // Анимация изменений
    animateChange(elementId, newValue, oldValue) {
        const element = this.elements[elementId];
        if (!element) return;
        
        // Простая анимация для числовых значений
        if (typeof newValue === 'number' && typeof oldValue === 'number') {
            element.classList.add('stat-changing');
            
            setTimeout(() => {
                element.classList.remove('stat-changing');
            }, 500);
        }
    }
    
    // Показ тенденций
    showTrends(data) {
        // Можно добавить маленькие графики или стрелки для показа тенденций
        // Например: ↑ рост, ↓ падение, → стабильно
    }
    
    // Обновление истории для графиков
    updateHistory(gameState) {
        if (!this.history) {
            this.history = {
                turns: [],
                scores: [],
                unitCounts: [],
                caloriesPerTurn: []
            };
        }
        
        this.history.turns.push(gameState.turnNo || 0);
        this.history.scores.push(gameState.score || 0);
        this.history.unitCounts.push(this.analysis?.units?.counts?.total || 0);
        this.history.caloriesPerTurn.push(this.analysis?.economy?.caloriesPerTurn || 0);
        
        // Ограничиваем размер истории
        const maxHistory = 100;
        if (this.history.turns.length > maxHistory) {
            this.history.turns.shift();
            this.history.scores.shift();
            this.history.unitCounts.shift();
            this.history.caloriesPerTurn.shift();
        }
    }
    
    // Получение данных для экспорта
    getExportData() {
        return {
            gameState: this.gameState,
            analysis: this.analysis,
            strategy: this.strategy,
            history: this.history,
            timestamp: new Date().toISOString()
        };
    }
}