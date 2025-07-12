const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    FOOD_CALORIES,
    UNIT_STATS 
} = require('../constants/GameConstants');

/**
 * Анализирует состояние игры и предоставляет метрики для принятия стратегических решений.
 * Обрабатывает данные о юнитах, ресурсах, угрозах, территории и экономике.
 */
class GameAnalyzer {
    /**
     * Создает новый экземпляр анализатора игры.
     * Инициализирует константы и типы для анализа.
     */
    constructor() {
        this.foodTypes = FOOD_TYPES;
        this.unitTypes = UNIT_TYPES;
        this.foodTypeNames = FOOD_TYPE_NAMES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        this.foodCalories = FOOD_CALORIES;
        this.unitStats = UNIT_STATS;
        
        // Threat map for proactive reconnaissance
        this.threatMap = new Map(); // key: "q,r", value: { interest: number, lastSeen: turn }
        this.enemySightingHistory = []; // Array of {position, turn, unitType}
        this.maxThreatMapSize = 1000; // Prevent memory bloat
    }

    /**
     * Выполняет полный анализ состояния игры.
     * @param {Object} gameState - Текущее состояние игры от API
     * @returns {Object} Объект с результатами анализа всех аспектов игры
     */
    analyze(gameState) {
        // Update threat map with new enemy sightings
        this.updateThreatMap(gameState);
        
        const analysis = {
            gamePhase: this.determineGamePhase(gameState),
            units: this.analyzeUnits(gameState),
            resources: this.analyzeResources(gameState),
            threats: this.analyzeThreats(gameState),
            territory: this.analyzeTerritory(gameState),
            economy: this.analyzeEconomy(gameState),
            threatMap: this.generateThreatMapAnalysis(gameState),
            gameState: gameState
        };

        logger.debug('Game analysis:', analysis);
        return analysis;
    }

    /**
     * Определяет текущую фазу игры на основе событий и состояния игры.
     * @param {Object} gameState - Состояние игры
     * @returns {string} Фаза игры: 'early', 'mid', 'late'
     */
    determineGamePhase(gameState) {
        const turn = gameState.turnNo || 0;
        const myUnits = (gameState.ants || []).filter(unit => unit.type !== 0);
        const enemyUnits = (gameState.enemies || []).filter(unit => unit.type !== 0);
        const discoveredEnemyAnthills = gameState.discoveredEnemyAnthills || [];
        
        // Event-based phase determination
        
        // Late game triggers
        if (turn > 300) {
            return 'late'; // Always late game after turn 300
        }
        if (discoveredEnemyAnthills.length > 0 && myUnits.length >= 10) {
            return 'late'; // Found enemy base and have army - time to attack
        }
        if (enemyUnits.length > 5 && turn > 30) {
            return 'late'; // Many enemies spotted - escalate to war
        }
        
        // Mid game triggers
        if (turn > 50) {
            return 'mid'; // Default mid game after turn 50
        }
        if (myUnits.length >= 8) {
            return 'mid'; // Have decent army - time to expand aggressively
        }
        if (enemyUnits.length > 0 && turn > 15) {
            return 'mid'; // Enemy contact made - increase readiness
        }
        
        // Early game (default)
        return 'early';
    }

    /**
     * Анализирует юниты игрока и противников.
     * @param {Object} gameState - Состояние игры
     * @returns {Object} Анализ юнитов с подсчетом, пропорциями и местоположением муравейника
     */
    analyzeUnits(gameState) {
        // Фильтруем муравейники (type: 0) из обычных юнитов
        const myUnits = (gameState.ants || []).filter(unit => unit.type !== 0);
        const enemyUnits = (gameState.enemies || []).filter(unit => unit.type !== 0);

        const unitCounts = {
            worker: 0,
            soldier: 0,
            scout: 0,
            total: myUnits.length
        };

        myUnits.forEach(unit => {
            if (unit.type) {
                const unitTypeName = this.unitTypeNames[unit.type];
                if (unitTypeName) {
                    unitCounts[unitTypeName] = (unitCounts[unitTypeName] || 0) + 1;
                }
            }
        });

        const unitProportions = {
            worker: unitCounts.total > 0 ? unitCounts.worker / unitCounts.total : 0,
            soldier: unitCounts.total > 0 ? unitCounts.soldier / unitCounts.total : 0,
            scout: unitCounts.total > 0 ? unitCounts.scout / unitCounts.total : 0
        };

        return {
            myUnits,
            enemyUnits,
            counts: unitCounts,
            proportions: unitProportions,
            anthill: this.findAnthill(gameState)
        };
    }

    /**
     * Находит координаты муравейника игрока.
     * @param {Object} gameState - Состояние игры
     * @returns {Object|null} Координаты муравейника {q, r} или null если не найден
     */
    findAnthill(gameState) {
        // Ищем муравейник в home (массиве координат)
        if (gameState.home && Array.isArray(gameState.home) && gameState.home.length > 0) {
            const homePos = gameState.home[0];
            return { q: homePos.q, r: homePos.r };
        }
        
        return null;
    }

    /**
     * Анализирует доступные ресурсы и их приоритеты.
     * @param {Object} gameState - Состояние игры
     * @returns {Object} Анализ ресурсов с группировкой по типам, расстояниям и приоритетами
     */
    analyzeResources(gameState) {
        const resources = gameState.food || [];
        const anthill = this.findAnthill(gameState);
        
        // CRITICAL FIX: Exclude any resources that are at the anthill location
        const validResources = anthill ? 
            resources.filter(r => r.q !== anthill.q || r.r !== anthill.r) : 
            resources;
        
        if (resources.length !== validResources.length) {
            logger.warn(`Excluded ${resources.length - validResources.length} resources at anthill location (${anthill?.q}, ${anthill?.r})`);
        }
        
        const resourcesByType = {
            nectar: validResources.filter(r => r.type === this.foodTypes.NECTAR),
            bread: validResources.filter(r => r.type === this.foodTypes.BREAD),
            apple: validResources.filter(r => r.type === this.foodTypes.APPLE)
        };

        const resourceDistances = this.calculateResourceDistances(resourcesByType, gameState);
        
        return {
            visible: validResources,
            byType: resourcesByType,
            distances: resourceDistances,
            highValue: this.identifyHighValueResources(resourcesByType, resourceDistances)
        };
    }

    /**
     * Вычисляет расстояния от муравейника до всех ресурсов.
     * @param {Object} resourcesByType - Ресурсы, сгруппированные по типам
     * @param {Object} gameState - Состояние игры
     * @returns {Object} Ресурсы с расстояниями, отсортированные по близости
     */
    calculateResourceDistances(resourcesByType, gameState) {
        const anthill = this.findAnthill(gameState);
        if (!anthill) return {};

        const distances = {};
        
        Object.keys(resourcesByType).forEach(type => {
            distances[type] = resourcesByType[type].map(resource => ({
                resource,
                distance: this.calculateHexDistance(anthill, resource)
            })).sort((a, b) => a.distance - b.distance);
        });

        return distances;
    }

    /**
     * Определяет высокоценные ресурсы на основе типа и расстояния.
     * @param {Object} resourcesByType - Ресурсы по типам
     * @param {Object} resourceDistances - Ресурсы с расстояниями
     * @returns {Array} Список высокоценных ресурсов с приоритетами
     */
    identifyHighValueResources(resourcesByType, resourceDistances) {
        const highValue = [];
        
        if (resourceDistances.nectar) {
            const nearNectar = resourceDistances.nectar.filter(r => r.distance <= 6);
            highValue.push(...nearNectar.map(r => ({ ...r, priority: 'high', reason: 'nectar_close' })));
        }
        
        if (resourceDistances.bread) {
            const nearBread = resourceDistances.bread.filter(r => r.distance <= 4);
            highValue.push(...nearBread.map(r => ({ ...r, priority: 'medium', reason: 'bread_close' })));
        }

        return highValue.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        });
    }

    /**
     * Анализирует угрозы от вражеских юнитов.
     * @param {Object} gameState - Состояние игры
     * @returns {Object} Анализ угроз с уровнями опасности и классификацией по расстоянию
     */
    analyzeThreats(gameState) {
        // Фильтруем муравейники (type: 0) из обычных юнитов
        const myUnits = (gameState.ants || []).filter(unit => unit.type !== 0);
        const enemyUnits = (gameState.enemies || []).filter(unit => unit.type !== 0);
        const anthill = this.findAnthill(gameState);

        const threats = enemyUnits.map(enemy => {
            const distanceToAnthill = anthill ? this.calculateHexDistance(anthill, enemy) : Infinity;
            const nearbyAllies = myUnits.filter(ally => this.calculateHexDistance(ally, enemy) <= 3);
            
            return {
                unit: enemy,
                distanceToAnthill,
                threatLevel: this.calculateThreatLevel(enemy, distanceToAnthill, nearbyAllies.length),
                nearbyAllies: nearbyAllies.length
            };
        });

        const overallThreatLevel = this.calculateOverallThreatLevel(threats);

        return {
            threats: threats.sort((a, b) => b.threatLevel - a.threatLevel),
            overallLevel: overallThreatLevel,
            immediateThreats: threats.filter(t => t.distanceToAnthill <= 5),
            nearbyThreats: threats.filter(t => t.distanceToAnthill <= 10)
        };
    }

    /**
     * Вычисляет уровень угрозы от конкретного вражеского юнита.
     * @param {Object} enemy - Вражеский юнит
     * @param {number} distanceToAnthill - Расстояние до муравейника
     * @param {number} alliesNearby - Количество союзников рядом
     * @returns {number} Числовой уровень угрозы
     */
    calculateThreatLevel(enemy, distanceToAnthill, alliesNearby) {
        let threatLevel = 0;
        
        if (enemy.type === 'fighter') {
            threatLevel += 3;
        } else if (enemy.type === 'scout') {
            threatLevel += 1;
        } else if (enemy.type === 'worker') {
            threatLevel += 0.5;
        }

        if (distanceToAnthill <= 5) {
            threatLevel *= 2;
        } else if (distanceToAnthill <= 10) {
            threatLevel *= 1.5;
        }

        if (alliesNearby > 0) {
            threatLevel *= Math.max(0.3, 1 - (alliesNearby * 0.2));
        }

        return threatLevel;
    }

    /**
     * Вычисляет общий уровень угрозы от всех вражеских юнитов.
     * @param {Array} threats - Список угроз
     * @returns {number} Общий уровень угрозы от 0 до 1
     */
    calculateOverallThreatLevel(threats) {
        if (threats.length === 0) return 0;
        
        const totalThreat = threats.reduce((sum, threat) => sum + threat.threatLevel, 0);
        const maxThreat = Math.max(...threats.map(t => t.threatLevel));
        
        return Math.min(1, (totalThreat / 10) + (maxThreat / 5));
    }

    /**
     * Анализирует контроль территории и возможности расширения.
     * @param {Object} gameState - Состояние игры
     * @returns {Object} Анализ территории с контролируемой областью, спорными зонами и возможностями расширения
     */
    analyzeTerritory(gameState) {
        // Фильтруем муравейники (type: 0) из обычных юнитов
        const myUnits = (gameState.ants || []).filter(unit => unit.type !== 0);
        const enemyUnits = (gameState.enemies || []).filter(unit => unit.type !== 0);
        
        const controlledArea = this.calculateControlledArea(myUnits);
        const contested = this.findContestedAreas(myUnits, enemyUnits);
        
        return {
            controlledArea,
            contested,
            expansion: this.identifyExpansionOpportunities(myUnits, gameState)
        };
    }

    /**
     * Вычисляет размер контролируемой территории на основе зон видимости юнитов.
     * @param {Array} myUnits - Юниты игрока
     * @returns {number} Количество контролируемых клеток
     */
    calculateControlledArea(myUnits) {
        const controlledCells = new Set();
        
        myUnits.forEach(unit => {
            const vision = this.getUnitVision(unit.type);
            for (let dq = -vision; dq <= vision; dq++) {
                for (let dr = -vision; dr <= vision; dr++) {
                    if (this.calculateHexDistance({q: 0, r: 0}, {q: dq, r: dr}) <= vision) {
                        controlledCells.add(`${unit.q + dq},${unit.r + dr}`);
                    }
                }
            }
        });
        
        return controlledCells.size;
    }

    /**
     * Получает дальность видимости юнита по его типу.
     * @param {number} unitType - Тип юнита
     * @returns {number} Дальность видимости в гексах
     */
    getUnitVision(unitType) {
        const unitTypeName = this.unitTypeNames[unitType];
        if (!unitTypeName) return 2;
        
        const visionMap = {
            scout: 4,
            soldier: 2,
            worker: 2
        };
        return visionMap[unitTypeName] || 2;
    }

    /**
     * Находит спорные области где есть противостояние с врагами.
     * @param {Array} myUnits - Юниты игрока
     * @param {Array} enemyUnits - Вражеские юниты
     * @returns {Array} Список спорных областей с информацией о противостоящих силах
     */
    findContestedAreas(myUnits, enemyUnits) {
        const contested = [];
        
        myUnits.forEach(myUnit => {
            const nearbyEnemies = enemyUnits.filter(enemy => 
                this.calculateHexDistance(myUnit, enemy) <= 5
            );
            
            if (nearbyEnemies.length > 0) {
                contested.push({
                    position: { q: myUnit.q, r: myUnit.r },
                    myUnit,
                    nearbyEnemies
                });
            }
        });
        
        return contested;
    }

    /**
     * Определяет возможности для территориального расширения к неконтролируемым ресурсам.
     * @param {Array} myUnits - Юниты игрока
     * @param {Object} gameState - Состояние игры
     * @returns {Array} Список возможностей расширения, отсортированный по эффективности
     */
    identifyExpansionOpportunities(myUnits, gameState) {
        const resources = gameState.food || [];
        const opportunities = [];
        
        resources.forEach(resource => {
            const nearbyUnits = myUnits.filter(unit => 
                this.calculateHexDistance(unit, resource) <= 8
            );
            
            if (nearbyUnits.length === 0) {
                opportunities.push({
                    resource,
                    distance: this.findNearestUnitDistance(resource, myUnits),
                    value: this.resourceCalories[resource.type] || 0
                });
            }
        });
        
        return opportunities.sort((a, b) => (b.value / b.distance) - (a.value / a.distance));
    }

    findNearestUnitDistance(target, units) {
        if (units.length === 0) return Infinity;
        
        return Math.min(...units.map(unit => this.calculateHexDistance(unit, target)));
    }

    analyzeEconomy(gameState) {
        const score = gameState.score || 0;
        const caloriesPerTurn = this.estimateCaloriesPerTurn(gameState);
        const units = this.analyzeUnits(gameState);
        
        return {
            score,
            caloriesPerTurn,
            efficiency: this.calculateEconomicEfficiency(units, caloriesPerTurn),
            targets: this.getEconomicTargets(gameState.turnNo || 0)
        };
    }

    estimateCaloriesPerTurn(gameState) {
        const myUnits = gameState.ants || [];
        let estimated = 0;
        
        myUnits.forEach(unit => {
            const unitTypeName = this.unitTypeNames[unit.type];
            if (unitTypeName === 'worker') {
                estimated += 20;
            } else if (unitTypeName === 'soldier') {
                estimated += 4;
            } else if (unitTypeName === 'scout') {
                estimated += 8;
            }
        });
        
        return estimated;
    }

    calculateEconomicEfficiency(units, caloriesPerTurn) {
        if (units.counts.total === 0) return 0;
        return caloriesPerTurn / units.counts.total;
    }

    getEconomicTargets(turn) {
        if (turn <= 20) {
            return { caloriesPerTurn: 200, totalCalories: 4000 };
        } else if (turn <= 50) {
            return { caloriesPerTurn: 500, totalCalories: 15000 };
        } else {
            return { caloriesPerTurn: 800, totalCalories: 30000 };
        }
    }

    calculateHexDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        // Конвертируем из hex координат (q, r) в кубические координаты
        const q1 = pos1.q || 0;
        const r1 = pos1.r || 0;
        const s1 = -q1 - r1;
        
        const q2 = pos2.q || 0;
        const r2 = pos2.r || 0;
        const s2 = -q2 - r2;
        
        // Расстояние в кубических координатах
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }
    
    /**
     * Updates the threat map with new enemy sightings.
     * @param {Object} gameState - Current game state
     */
    updateThreatMap(gameState) {
        const currentTurn = gameState.turnNo || 0;
        const enemies = gameState.enemies || [];
        
        // Process new enemy sightings
        enemies.forEach(enemy => {
            const posKey = `${enemy.q},${enemy.r}`;
            const sighting = {
                position: { q: enemy.q, r: enemy.r },
                turn: currentTurn,
                unitType: enemy.type
            };
            
            // Add to sighting history
            this.enemySightingHistory.push(sighting);
            
            // Update threat map interest for this position and surrounding area
            this.updateThreatInterest(enemy.q, enemy.r, currentTurn, enemy.type);
        });
        
        // Trim old history to prevent memory bloat
        const maxHistoryAge = 50; // Keep last 50 turns
        this.enemySightingHistory = this.enemySightingHistory.filter(
            sighting => currentTurn - sighting.turn <= maxHistoryAge
        );
        
        // Decay threat map values over time
        this.decayThreatMap(currentTurn);
    }
    
    /**
     * Updates threat interest for a position and surrounding area.
     * @param {number} q - Q coordinate
     * @param {number} r - R coordinate
     * @param {number} turn - Current turn
     * @param {number} unitType - Type of enemy unit
     */
    updateThreatInterest(q, r, turn, unitType) {
        // Base interest based on unit type
        let baseInterest = 10;
        if (unitType === this.unitTypes.SOLDIER) {
            baseInterest = 20; // Soldiers are more threatening
        } else if (unitType === this.unitTypes.SCOUT) {
            baseInterest = 15; // Scouts indicate exploration
        }
        
        // Update interest in a radius around the sighting
        const interestRadius = 8;
        for (let dq = -interestRadius; dq <= interestRadius; dq++) {
            for (let dr = -interestRadius; dr <= interestRadius; dr++) {
                const distance = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));
                if (distance > interestRadius) continue;
                
                const targetQ = q + dq;
                const targetR = r + dr;
                const posKey = `${targetQ},${targetR}`;
                
                // Interest decreases with distance
                const distanceMultiplier = Math.max(0.1, 1 - (distance / interestRadius));
                const interest = baseInterest * distanceMultiplier;
                
                const currentData = this.threatMap.get(posKey) || { interest: 0, lastSeen: 0 };
                this.threatMap.set(posKey, {
                    interest: Math.max(currentData.interest, interest),
                    lastSeen: turn
                });
            }
        }
        
        // Manage map size to prevent memory issues
        if (this.threatMap.size > this.maxThreatMapSize) {
            this.pruneOldThreatData(turn);
        }
    }
    
    /**
     * Decays threat map values over time.
     * @param {number} currentTurn - Current turn number
     */
    decayThreatMap(currentTurn) {
        const decayRate = 0.95; // 5% decay per turn
        const maxAge = 30; // Remove entries older than 30 turns
        
        for (const [posKey, data] of this.threatMap.entries()) {
            const age = currentTurn - data.lastSeen;
            
            if (age > maxAge) {
                this.threatMap.delete(posKey);
            } else {
                data.interest *= Math.pow(decayRate, age);
                if (data.interest < 0.1) {
                    this.threatMap.delete(posKey);
                }
            }
        }
    }
    
    /**
     * Removes oldest threat data to maintain memory limits.
     * @param {number} currentTurn - Current turn number
     */
    pruneOldThreatData(currentTurn) {
        const entries = Array.from(this.threatMap.entries());
        
        // Sort by age (oldest first)
        entries.sort((a, b) => a[1].lastSeen - b[1].lastSeen);
        
        // Remove oldest 25% of entries
        const toRemove = Math.floor(entries.length * 0.25);
        for (let i = 0; i < toRemove; i++) {
            this.threatMap.delete(entries[i][0]);
        }
        
        logger.debug(`Pruned ${toRemove} old threat map entries, ${this.threatMap.size} remaining`);
    }
    
    /**
     * Generates threat map analysis for strategic decisions.
     * @param {Object} gameState - Current game state
     * @returns {Object} Threat map analysis
     */
    generateThreatMapAnalysis(gameState) {
        const currentTurn = gameState.turnNo || 0;
        const anthill = gameState.ants?.find(ant => ant.type === 0); // Find our anthill
        
        if (!anthill) {
            return {
                highInterestAreas: [],
                recommendedScoutTargets: [],
                threatDirections: []
            };
        }
        
        // Find high interest areas for exploration
        const highInterestAreas = [];
        const threatDirections = new Map();
        
        for (const [posKey, data] of this.threatMap.entries()) {
            if (data.interest > 5) { // Significant interest threshold
                const [q, r] = posKey.split(',').map(Number);
                const position = { q, r };
                const distance = this.calculateHexDistance(anthill, position);
                
                highInterestAreas.push({
                    position,
                    interest: data.interest,
                    distance,
                    age: currentTurn - data.lastSeen
                });
                
                // Calculate threat direction
                const direction = this.getDirection(anthill, position);
                const currentThreat = threatDirections.get(direction) || 0;
                threatDirections.set(direction, currentThreat + data.interest);
            }
        }
        
        // Sort by interest and proximity
        highInterestAreas.sort((a, b) => {
            const scoreA = a.interest * Math.max(0.1, 1 / (1 + a.distance * 0.1));
            const scoreB = b.interest * Math.max(0.1, 1 / (1 + b.distance * 0.1));
            return scoreB - scoreA;
        });
        
        // Generate recommended scout targets based on threat map
        const recommendedScoutTargets = this.generateScoutTargetsFromThreatMap(
            anthill, 
            highInterestAreas.slice(0, 10)
        );
        
        return {
            highInterestAreas: highInterestAreas.slice(0, 15),
            recommendedScoutTargets,
            threatDirections: Array.from(threatDirections.entries())
                .map(([dir, threat]) => ({ direction: dir, threatLevel: threat }))
                .sort((a, b) => b.threatLevel - a.threatLevel)
        };
    }
    
    /**
     * Gets the general direction from one position to another.
     * @param {Object} from - Source position
     * @param {Object} to - Target position
     * @returns {string} Direction name
     */
    getDirection(from, to) {
        const dq = to.q - from.q;
        const dr = to.r - from.r;
        
        // Convert to angle and determine octant
        const angle = Math.atan2(dr, dq);
        const octant = Math.round((angle + Math.PI) / (Math.PI / 4)) % 8;
        
        const directions = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
        return directions[octant];
    }
    
    /**
     * Generates scout targets based on threat map analysis.
     * @param {Object} anthill - Our anthill position
     * @param {Array} highInterestAreas - Areas of high interest
     * @returns {Array} Recommended scout targets
     */
    generateScoutTargetsFromThreatMap(anthill, highInterestAreas) {
        const targets = [];
        const maxScoutDistance = 40;
        
        highInterestAreas.forEach(area => {
            if (area.distance <= maxScoutDistance) {
                // Create exploration targets around the area of interest
                const explorationRadius = 5;
                const directions = [
                    { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
                    { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
                ];
                
                directions.forEach(dir => {
                    const target = {
                        q: area.position.q + dir.q * explorationRadius,
                        r: area.position.r + dir.r * explorationRadius,
                        priority: area.interest,
                        reason: 'threat_area_exploration',
                        sourceInterest: area.interest
                    };
                    
                    const targetDistance = this.calculateHexDistance(anthill, target);
                    if (targetDistance <= maxScoutDistance) {
                        targets.push(target);
                    }
                });
            }
        });
        
        // Sort by priority (interest level)
        targets.sort((a, b) => b.priority - a.priority);
        
        return targets.slice(0, 8); // Return top 8 targets
    }
}

module.exports = GameAnalyzer;