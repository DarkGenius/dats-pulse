const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');

/**
 * Управляет поведением и движением юнитов.
 * Отвечает за назначение задач, планирование маршрутов и координацию действий.
 */
class UnitManager {
    /**
     * Инициализирует менеджер юнитов с константами игры и системой назначений.
     */
    constructor() {
        this.unitStats = UNIT_STATS;
        this.foodTypes = FOOD_TYPES;
        this.unitTypes = UNIT_TYPES;
        this.foodTypeNames = FOOD_TYPE_NAMES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        
        this.movementQueue = [];
        this.unitAssignments = new Map();
    }

    /**
     * Планирует действия для всех юнитов на основе стратегии и анализа.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия для текущего хода
     * @returns {Object} Объект с массивом команд движения
     */
    planUnitActions(analysis, strategy) {
        const moves = [];
        const myUnits = analysis.units.myUnits;
        
        this.clearOldAssignments();
        
        myUnits.forEach(unit => {
            const unitAction = this.planUnitAction(unit, analysis, strategy);
            if (unitAction) {
                moves.push(unitAction);
                this.unitAssignments.set(unit.id, unitAction);
            }
        });

        return { moves };
    }

    /**
     * Планирует действие для конкретного юнита.
     * @param {Object} unit - Юнит для планирования
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия
     * @returns {Object|null} Команда движения или null
     */
    planUnitAction(unit, analysis, strategy) {
        const existingAssignment = this.unitAssignments.get(unit.id);
        
        if (existingAssignment && this.shouldContinueAssignment(existingAssignment, analysis)) {
            return this.continueAssignment(unit, existingAssignment, analysis);
        }

        const newAssignment = this.assignNewTask(unit, analysis, strategy);
        return newAssignment;
    }

    /**
     * Определяет, следует ли юниту продолжать текущее назначение.
     * @param {Object} assignment - Текущее назначение юнита
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если назначение остаётся актуальным
     */
    shouldContinueAssignment(assignment, analysis) {
        if (assignment.type === 'resource_collection') {
            return this.isResourceStillAvailable(assignment.target, analysis);
        }
        
        if (assignment.type === 'combat') {
            return this.isTargetStillValid(assignment.target, analysis);
        }
        
        if (assignment.type === 'exploration') {
            return !this.isAreaExplored(assignment.target, analysis);
        }
        
        return false;
    }

    /**
     * Продолжает выполнение текущего назначения юнита.
     * @param {Object} unit - Юнит
     * @param {Object} assignment - Назначение
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения или null
     */
    continueAssignment(unit, assignment, analysis) {
        const target = assignment.target;
        const path = this.findPath(unit, target, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: assignment
            };
        }
        
        return null;
    }

    /**
     * Назначает новую задачу юниту на основе приоритетов.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия
     * @returns {Object|null} Команда движения или null
     */
    assignNewTask(unit, analysis, strategy) {
        const taskPriority = this.getTaskPriority(unit, analysis, strategy);
        
        for (const task of taskPriority) {
            const action = this.executeTask(unit, task, analysis, strategy);
            if (action) {
                return action;
            }
        }
        
        return this.defaultBehavior(unit, analysis);
    }

    /**
     * Определяет приоритеты задач для юнита на основе типа и игровой ситуации.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия
     * @returns {Array} Массив задач в порядке приоритета
     */
    getTaskPriority(unit, analysis, strategy) {
        const tasks = [];
        const phase = strategy.phase;
        
        if (analysis.threats.immediateThreats.length > 0) {
            tasks.push('immediate_defense');
        }
        
        const unitTypeName = this.unitTypeNames[unit.type];
        if (unitTypeName === 'scout') {
            tasks.push('nectar_collection', 'exploration', 'resource_scouting');
        } else if (unitTypeName === 'soldier') {
            tasks.push('combat', 'convoy_protection', 'territory_defense');
        } else if (unitTypeName === 'worker') {
            tasks.push('bread_collection', 'apple_collection', 'construction');
        }
        
        if (phase === 'early') {
            tasks.push('resource_collection', 'exploration');
        } else if (phase === 'mid') {
            tasks.push('territory_control', 'resource_optimization');
        } else if (phase === 'late') {
            tasks.push('high_value_resources', 'enemy_disruption');
        }
        
        return tasks;
    }

    /**
     * Выполняет конкретную задачу для юнита.
     * @param {Object} unit - Юнит
     * @param {string} task - Тип задачи
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия
     * @returns {Object|null} Команда движения или null
     */
    executeTask(unit, task, analysis, strategy) {
        switch (task) {
            case 'immediate_defense':
                return this.defendAnthill(unit, analysis);
            case 'nectar_collection':
                return this.collectNectar(unit, analysis);
            case 'bread_collection':
                return this.collectBread(unit, analysis);
            case 'apple_collection':
                return this.collectApples(unit, analysis);
            case 'exploration':
                return this.exploreMap(unit, analysis);
            case 'combat':
                return this.engageCombat(unit, analysis);
            case 'convoy_protection':
                return this.protectConvoy(unit, analysis);
            case 'territory_defense':
                return this.defendTerritory(unit, analysis);
            case 'resource_scouting':
                return this.scoutResources(unit, analysis);
            default:
                return null;
        }
    }

    /**
     * Планирует защиту муравейника от непосредственных угроз.
     * @param {Object} unit - Юнит-защитник
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к точке перехвата или null
     */
    defendAnthill(unit, analysis) {
        const anthill = analysis.units.anthill;
        const immediateThreats = analysis.threats.immediateThreats;
        
        if (!anthill || immediateThreats.length === 0) {
            return null;
        }

        const nearestThreat = this.findNearestThreat(unit, immediateThreats);
        if (nearestThreat) {
            const interceptPoint = this.calculateInterceptPoint(unit, nearestThreat, anthill);
            const path = this.findPath(unit, interceptPoint, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'immediate_defense',
                        target: nearestThreat.unit,
                        priority: 'critical'
                    }
                };
            }
        }
        
        return null;
    }

    /**
     * Планирует сбор нектара - ресурса с наивысшей калорийностью.
     * @param {Object} unit - Юнит-сборщик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к нектару или null
     */
    collectNectar(unit, analysis) {
        const nectarResources = analysis.resources.byType.nectar;
        if (nectarResources.length === 0) {
            return null;
        }

        const nearestNectar = this.findNearestResource(unit, nectarResources);
        if (nearestNectar) {
            const path = this.findPath(unit, nearestNectar, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'resource_collection',
                        target: nearestNectar,
                        resource_type: this.foodTypes.NECTAR,
                        priority: 'high'
                    }
                };
            }
        }
        
        return null;
    }

    /**
     * Планирует сбор хлеба - ресурса со средней калорийностью.
     * @param {Object} unit - Юнит-сборщик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к хлебу или null
     */
    collectBread(unit, analysis) {
        const breadResources = analysis.resources.byType.bread;
        if (breadResources.length === 0) {
            return null;
        }

        const nearestBread = this.findNearestResource(unit, breadResources);
        if (nearestBread) {
            const path = this.findPath(unit, nearestBread, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'resource_collection',
                        target: nearestBread,
                        resource_type: this.foodTypes.BREAD,
                        priority: 'medium'
                    }
                };
            }
        }
        
        return null;
    }

    /**
     * Планирует сбор яблок - ресурса с низкой калорийностью.
     * @param {Object} unit - Юнит-сборщик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к яблокам или null
     */
    collectApples(unit, analysis) {
        const appleResources = analysis.resources.byType.apple;
        if (appleResources.length === 0) {
            return null;
        }

        const nearestApple = this.findNearestResource(unit, appleResources);
        if (nearestApple) {
            const path = this.findPath(unit, nearestApple, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'resource_collection',
                        target: nearestApple,
                        resource_type: this.foodTypes.APPLE,
                        priority: 'low'
                    }
                };
            }
        }
        
        return null;
    }

    /**
     * Планирует исследование карты для поиска новых ресурсов и территорий.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к цели исследования или null
     */
    exploreMap(unit, analysis) {
        const explorationTargets = this.generateExplorationTargets(unit, analysis);
        
        if (explorationTargets.length === 0) {
            return null;
        }

        const bestTarget = explorationTargets[0];
        const path = this.findPath(unit, bestTarget, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: {
                    type: 'exploration',
                    target: bestTarget,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

    /**
     * Планирует боевое взаимодействие с вражескими юнитами.
     * @param {Object} unit - Боевой юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к цели атаки или null
     */
    engageCombat(unit, analysis) {
        const combatTargets = analysis.threats.threats;
        if (combatTargets.length === 0) {
            return null;
        }

        const viableTargets = combatTargets.filter(threat => 
            this.canEngageThreat(unit, threat, analysis)
        );

        if (viableTargets.length === 0) {
            return null;
        }

        const bestTarget = viableTargets[0];
        const path = this.findPath(unit, bestTarget.unit, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: {
                    type: 'combat',
                    target: bestTarget.unit,
                    priority: 'high'
                }
            };
        }
        
        return null;
    }

    /**
     * Планирует защиту рабочих юнитов во время сбора ресурсов.
     * @param {Object} unit - Юнит-охранник
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к позиции защиты или null
     */
    protectConvoy(unit, analysis) {
        const workers = analysis.units.myUnits.filter(u => u.type === 'worker');
        const vulnerableWorkers = workers.filter(worker => 
            this.isWorkerVulnerable(worker, analysis)
        );

        if (vulnerableWorkers.length === 0) {
            return null;
        }

        const workerToProtect = vulnerableWorkers[0];
        const protectionPosition = this.calculateProtectionPosition(unit, workerToProtect, analysis);
        const path = this.findPath(unit, protectionPosition, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: {
                    type: 'convoy_protection',
                    target: workerToProtect,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

    /**
     * Планирует патрулирование территории для защиты от угроз.
     * @param {Object} unit - Патрульный юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к точке патрулирования или null
     */
    defendTerritory(unit, analysis) {
        const territoryThreats = analysis.threats.nearbyThreats;
        if (territoryThreats.length === 0) {
            return null;
        }

        const patrolPoints = this.generatePatrolPoints(analysis);
        const nearestPatrolPoint = this.findNearestPosition(unit, patrolPoints);
        
        if (nearestPatrolPoint) {
            const path = this.findPath(unit, nearestPatrolPoint, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'territory_defense',
                        target: nearestPatrolPoint,
                        priority: 'medium'
                    }
                };
            }
        }
        
        return null;
    }

    /**
     * Планирует разведку ресурсов в неисследованных областях.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к цели разведки или null
     */
    scoutResources(unit, analysis) {
        const unexploredAreas = this.identifyUnexploredAreas(analysis);
        const resourceHotspots = this.identifyResourceHotspots(analysis);
        
        const scoutingTargets = [...unexploredAreas, ...resourceHotspots];
        
        if (scoutingTargets.length === 0) {
            return null;
        }

        const bestTarget = scoutingTargets[0];
        const path = this.findPath(unit, bestTarget, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: {
                    type: 'resource_scouting',
                    target: bestTarget,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

    /**
     * Поведение по умолчанию - патрулирование вокруг муравейника.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к случайной точке или null
     */
    defaultBehavior(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return null;
        }

        const randomNearbyPoint = this.getRandomNearbyPoint(anthill, 5);
        const path = this.findPath(unit, randomNearbyPoint, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: {
                    type: 'patrol',
                    target: randomNearbyPoint,
                    priority: 'low'
                }
            };
        }
        
        return null;
    }

    /**
     * Находит путь от юнита к цели с учётом безопасности.
     * @param {Object} unit - Исходный юнит
     * @param {Object} target - Целевая позиция
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array|null} Массив точек пути или null
     */
    findPath(unit, target, analysis) {
        if (!unit || !target) {
            return null;
        }

        const directPath = this.calculateDirectPath(unit, target);
        
        if (directPath.length === 0) {
            return null;
        }

        const safetyCheckedPath = this.verifySafety(directPath, analysis);
        return safetyCheckedPath;
    }

    /**
     * Вычисляет прямой путь между двумя точками в гексагональной системе координат.
     * @param {Object} start - Начальная позиция с координатами q, r
     * @param {Object} end - Конечная позиция с координатами q, r
     * @returns {Array} Массив с первым шагом движения
     */
    calculateDirectPath(start, end) {
        const dq = end.q - start.q;
        const dr = end.r - start.r;
        
        if (Math.abs(dq) === 0 && Math.abs(dr) === 0) {
            return [];
        }

        const stepQ = dq !== 0 ? Math.sign(dq) : 0;
        const stepR = dr !== 0 ? Math.sign(dr) : 0;
        
        return [{ q: start.q + stepQ, r: start.r + stepR }];
    }

    /**
     * Проверяет безопасность пути и фильтрует опасные точки.
     * @param {Array} path - Массив точек пути
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Безопасный путь или исходный путь если все точки опасны
     */
    verifySafety(path, analysis) {
        const threats = analysis.threats.threats;
        const safetyRadius = 2;
        
        const safePath = path.filter(point => {
            const nearbyThreats = threats.filter(threat => 
                this.calculateDistance(point, threat.unit) <= safetyRadius
            );
            return nearbyThreats.length === 0;
        });
        
        return safePath.length > 0 ? safePath : path;
    }

    /**
     * Находит ближайший ресурс к юниту.
     * @param {Object} unit - Юнит
     * @param {Array} resources - Массив доступных ресурсов
     * @returns {Object|null} Ближайший ресурс или null
     */
    findNearestResource(unit, resources) {
        if (resources.length === 0) {
            return null;
        }

        const resourcesWithDistance = resources.map(resource => ({
            resource,
            distance: this.calculateDistance(unit, resource)
        }));

        resourcesWithDistance.sort((a, b) => a.distance - b.distance);
        return resourcesWithDistance[0].resource;
    }

    /**
     * Находит ближайшую угрозу к юниту.
     * @param {Object} unit - Юнит
     * @param {Array} threats - Массив угроз
     * @returns {Object|null} Ближайшая угроза или null
     */
    findNearestThreat(unit, threats) {
        if (threats.length === 0) {
            return null;
        }

        const threatsWithDistance = threats.map(threat => ({
            threat,
            distance: this.calculateDistance(unit, threat.unit)
        }));

        threatsWithDistance.sort((a, b) => a.distance - b.distance);
        return threatsWithDistance[0].threat;
    }

    /**
     * Находит ближайшую позицию к юниту из списка позиций.
     * @param {Object} unit - Юнит
     * @param {Array} positions - Массив позиций
     * @returns {Object|null} Ближайшая позиция или null
     */
    findNearestPosition(unit, positions) {
        if (positions.length === 0) {
            return null;
        }

        const positionsWithDistance = positions.map(pos => ({
            position: pos,
            distance: this.calculateDistance(unit, pos)
        }));

        positionsWithDistance.sort((a, b) => a.distance - b.distance);
        return positionsWithDistance[0].position;
    }

    /**
     * Генерирует цели для исследования на основе радиуса видимости юнита.
     * @param {Object} unit - Юнит-исследователь
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив целей для исследования
     */
    generateExplorationTargets(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const targets = [];
        const unitStats = this.unitStats[unit.type];
        
        if (!unitStats) {
            logger.warn(`Unknown unit type ${unit.type} for unit ${unit.id}, skipping exploration`);
            return [];
        }
        
        const vision = unitStats.vision;
        
        for (let radius = vision; radius <= vision * 3; radius += vision) {
            const ringTargets = this.generateRingPositions(anthill, radius);
            targets.push(...ringTargets);
        }

        return targets.filter(target => 
            !this.isPositionExplored(target, analysis)
        );
    }

    /**
     * Генерирует позиции на кольце указанного радиуса в гексагональной системе.
     * @param {Object} center - Центральная позиция с координатами q, r
     * @param {number} radius - Радиус кольца
     * @returns {Array} Массив позиций на кольце
     */
    generateRingPositions(center, radius) {
        const positions = [];
        const directions = [
            { dq: 1, dr: 0 }, { dq: 1, dr: -1 }, { dq: 0, dr: -1 },
            { dq: -1, dr: 0 }, { dq: -1, dr: 1 }, { dq: 0, dr: 1 }
        ];

        directions.forEach(dir => {
            positions.push({
                q: center.q + dir.dq * radius,
                r: center.r + dir.dr * radius
            });
        });

        return positions;
    }

    /**
     * Вычисляет оптимальную точку перехвата угрозы для защиты муравейника.
     * @param {Object} unit - Юнит-защитник
     * @param {Object} threat - Угроза
     * @param {Object} anthill - Муравейник
     * @returns {Object} Координаты точки перехвата
     */
    calculateInterceptPoint(unit, threat, anthill) {
        const threatToAnthill = {
            q: anthill.q - threat.unit.q,
            r: anthill.r - threat.unit.r
        };

        const interceptQ = threat.unit.q + threatToAnthill.q * 0.5;
        const interceptR = threat.unit.r + threatToAnthill.r * 0.5;

        return {
            q: Math.round(interceptQ),
            r: Math.round(interceptR)
        };
    }

    /**
     * Вычисляет оптимальную позицию для защиты рабочего юнита.
     * @param {Object} guard - Юнит-охранник
     * @param {Object} worker - Защищаемый рабочий
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Координаты позиции защиты
     */
    calculateProtectionPosition(guard, worker, analysis) {
        const threats = analysis.threats.threats;
        
        if (threats.length === 0) {
            return {
                q: worker.q + 1,
                r: worker.r
            };
        }

        const nearestThreat = this.findNearestThreat(worker, threats);
        if (nearestThreat) {
            const threatToWorker = {
                q: worker.q - nearestThreat.threat.unit.q,
                r: worker.r - nearestThreat.threat.unit.r
            };

            return {
                q: worker.q + Math.sign(threatToWorker.q),
                r: worker.r + Math.sign(threatToWorker.r)
            };
        }

        return {
            q: worker.q + 1,
            r: worker.r
        };
    }

    /**
     * Генерирует точки патрулирования вокруг муравейника.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив точек патрулирования
     */
    generatePatrolPoints(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const patrolRadius = 8;
        return this.generateRingPositions(anthill, patrolRadius);
    }

    /**
     * Определяет неисследованные области карты.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив неисследованных позиций
     */
    identifyUnexploredAreas(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const unexplored = [];
        const searchRadius = 15;

        for (let q = anthill.q - searchRadius; q <= anthill.q + searchRadius; q++) {
            for (let r = anthill.r - searchRadius; r <= anthill.r + searchRadius; r++) {
                const point = { q, r };
                if (!this.isPositionExplored(point, analysis)) {
                    unexplored.push(point);
                }
            }
        }

        return unexplored;
    }

    /**
     * Определяет области с высокой концентрацией ресурсов.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив центров кластеров ресурсов по стоимости
     */
    identifyResourceHotspots(analysis) {
        const resources = analysis.resources.visible;
        const hotspots = [];

        const clusters = this.clusterResources(resources);
        clusters.forEach(cluster => {
            hotspots.push({
                q: Math.round(cluster.centerQ),
                r: Math.round(cluster.centerR),
                value: cluster.totalValue
            });
        });

        return hotspots.sort((a, b) => b.value - a.value);
    }

    /**
     * Кластеризует ресурсы по расстоянию для определения ценных областей.
     * @param {Array} resources - Массив всех доступных ресурсов
     * @returns {Array} Массив кластеров с центрами и общей стоимостью
     */
    clusterResources(resources) {
        const clusters = [];
        const visited = new Set();

        resources.forEach((resource, index) => {
            if (visited.has(index)) {
                return;
            }

            const cluster = {
                resources: [resource],
                centerQ: resource.q,
                centerR: resource.r,
                totalValue: this.getResourceValue(resource)
            };

            visited.add(index);

            resources.forEach((otherResource, otherIndex) => {
                if (visited.has(otherIndex)) {
                    return;
                }

                const distance = this.calculateDistance(resource, otherResource);
                if (distance <= 5) {
                    cluster.resources.push(otherResource);
                    cluster.totalValue += this.getResourceValue(otherResource);
                    visited.add(otherIndex);
                }
            });

            if (cluster.resources.length > 1) {
                cluster.centerQ = cluster.resources.reduce((sum, r) => sum + r.q, 0) / cluster.resources.length;
                cluster.centerR = cluster.resources.reduce((sum, r) => sum + r.r, 0) / cluster.resources.length;
                clusters.push(cluster);
            }
        });

        return clusters;
    }

    /**
     * Определяет калорийную стоимость ресурса.
     * @param {Object} resource - Ресурс с типом
     * @returns {number} Калорийная стоимость ресурса
     */
    getResourceValue(resource) {
        const { FOOD_CALORIES } = require('../constants/GameConstants');
        return FOOD_CALORIES[resource.type] || 0;
    }

    /**
     * Генерирует случайную точку в заданном радиусе от центра.
     * @param {Object} center - Центральная позиция
     * @param {number} radius - Максимальный радиус
     * @returns {Object} Случайная позиция с координатами q, r
     */
    getRandomNearbyPoint(center, radius) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        
        return {
            q: Math.round(center.q + Math.cos(angle) * distance),
            r: Math.round(center.r + Math.sin(angle) * distance)
        };
    }

    /**
     * Проверяет, доступен ли ещё ресурс на карте.
     * @param {Object} resource - Проверяемый ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если ресурс ещё доступен
     */
    isResourceStillAvailable(resource, analysis) {
        return analysis.resources.visible.some(r => 
            r.q === resource.q && r.r === resource.r && r.type === resource.type
        );
    }

    /**
     * Проверяет, остаётся ли цель действительной (например, вражеский юнит).
     * @param {Object} target - Проверяемая цель
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если цель ещё действительна
     */
    isTargetStillValid(target, analysis) {
        return analysis.units.enemyUnits.some(enemy => 
            enemy.q === target.q && enemy.r === target.r
        );
    }

    /**
     * Проверяет, исследована ли область вокруг цели. Пока заглушка.
     * @param {Object} target - Целевая позиция
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} Всегда false (заглушка)
     */
    isAreaExplored(target, analysis) {
        return false;
    }

    /**
     * Проверяет, исследована ли конкретная позиция. Пока заглушка.
     * @param {Object} position - Проверяемая позиция
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} Всегда false (заглушка)
     */
    isPositionExplored(position, analysis) {
        return false;
    }

    /**
     * Определяет, может ли юнит эффективно сражаться с угрозой.
     * @param {Object} unit - Нападающий юнит
     * @param {Object} threat - Угроза
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если юнит может эффективно бороться с угрозой
     */
    canEngageThreat(unit, threat, analysis) {
        const unitStats = this.unitStats[unit.type];
        if (!unitStats) {
            logger.warn(`Unknown unit type ${unit.type} for unit ${unit.id}, using default attack`);
            return 10; // Default attack value
        }
        const unitStrength = unitStats.attack;
        const threatStrength = this.unitStats[threat.unit.type]?.attack || 50;
        
        return unitStrength >= threatStrength * 0.7;
    }

    /**
     * Определяет, находится ли рабочий юнит в опасности.
     * @param {Object} worker - Рабочий юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если рабочий нуждается в защите
     */
    isWorkerVulnerable(worker, analysis) {
        const nearbyThreats = analysis.threats.threats.filter(threat => 
            this.calculateDistance(worker, threat.unit) <= 5
        );
        
        const nearbyAllies = analysis.units.myUnits.filter(ally => 
            ally.type === this.unitTypes.SOLDIER && this.calculateDistance(worker, ally) <= 3
        );
        
        return nearbyThreats.length > 0 && nearbyAllies.length === 0;
    }

    /**
     * Очищает устаревшие назначения юнитов по временному лимиту.
     */
    clearOldAssignments() {
        const currentTime = Date.now();
        const maxAge = 30000;
        
        for (const [unitId, assignment] of this.unitAssignments) {
            if (currentTime - assignment.timestamp > maxAge) {
                this.unitAssignments.delete(unitId);
            }
        }
    }

    /**
     * Вычисляет расстояние между двумя позициями в гексагональной системе координат.
     * @param {Object} pos1 - Первая позиция с координатами q, r
     * @param {Object} pos2 - Вторая позиция с координатами q, r
     * @returns {number} Расстояние в гексагональных клетках или Infinity при ошибке
     */
    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        // Гексагональная система координат (q, r)
        const q1 = pos1.q || 0;
        const r1 = pos1.r || 0;
        const s1 = -q1 - r1;
        
        const q2 = pos2.q || 0;
        const r2 = pos2.r || 0;
        const s2 = -q2 - r2;
        
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }
}

module.exports = UnitManager;