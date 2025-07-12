const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');
const PathfindingValidator = require('./PathfindingValidator');
const AStarPathfinder = require('./AStarPathfinder');

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
        this.pathValidator = new PathfindingValidator();
        this.pathfinder = new AStarPathfinder();
    }

    /**
     * Планирует действия для всех юнитов на основе стратегии и анализа.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия для текущего хода
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object} Объект с массивом команд движения
     */
    planUnitActions(analysis, strategy, resourceAssignmentManager) {
        const moves = [];
        const myUnits = analysis.units.myUnits;
        
        this.clearOldAssignments();
        
        myUnits.forEach(unit => {
            const unitAction = this.planUnitAction(unit, analysis, strategy, resourceAssignmentManager);
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
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object|null} Команда движения или null
     */
    planUnitAction(unit, analysis, strategy, resourceAssignmentManager) {
        // RECOVERY MODE: Emergency protocols override normal behavior
        if (strategy && strategy.recoveryMode) {
            return this.handleRecoveryModeUnit(unit, analysis, strategy, resourceAssignmentManager);
        }
        
        // ПРИОРИТЕТ 1: Проверяем, есть ли уже назначение из центрального менеджера
        const centralAssignment = resourceAssignmentManager.getUnitAssignment(unit.id);
        if (centralAssignment) {
            logger.info(`🎯 Unit ${unit.id} executing central assignment to collect ${centralAssignment.resourceType || 'resource'} at (${centralAssignment.target.q}, ${centralAssignment.target.r})`);
            const moveResult = this.executeResourceAssignment(unit, centralAssignment, analysis, resourceAssignmentManager);
            if (!moveResult) {
                // Path failed - release assignment and try again next turn
                logger.warn(`🚫 Releasing assignment for unit ${unit.id} due to pathfinding failure`);
                resourceAssignmentManager.releaseUnitAssignment(unit.id);
            }
            return moveResult;
        }
        
        // Если юнит может собирать ресурсы, но не имеет назначения,
        // он ждет назначения от ResourceManager (но не солдаты!)
        if (unit.type !== this.unitTypes.SOLDIER && 
            this.canCollectResources(unit, analysis) && 
            this.hasAvailableResources(analysis)) {
            logger.info(`⏳ Unit ${unit.id} (${this.unitTypeNames[unit.type]}) waiting for resource assignment from central manager. Available resources: ${analysis.resources.visible.length}`);
            // Don't patrol - just stay still or return to base
            return null;
        }
        
        const existingAssignment = this.unitAssignments.get(unit.id);
        
        if (existingAssignment && this.shouldContinueAssignment(existingAssignment, analysis)) {
            return this.continueAssignment(unit, existingAssignment, analysis);
        }

        const newAssignment = this.assignNewTask(unit, analysis, strategy, resourceAssignmentManager);
        return newAssignment;
    }

    /**
     * Выполняет назначение ресурса из центрального менеджера
     * @param {Object} unit - Юнит
     * @param {Object} assignment - Назначение ресурса
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения или null
     */
    executeResourceAssignment(unit, assignment, analysis, resourceAssignmentManager = null) {
        const target = assignment.target;
        const path = this.findPath(unit, target, analysis);
        
        if (path && path.length > 0) {
            logger.debug(`Unit ${unit.id} executing centralized resource assignment to (${target.q}, ${target.r})`);
            return {
                unit_id: unit.id,
                path: path,
                assignment: assignment
            };
        }
        
        logger.warn(`Unit ${unit.id} cannot path to assigned resource at (${target.q}, ${target.r})`);
        return null;
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
                path: path,
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
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object|null} Команда движения или null
     */
    assignNewTask(unit, analysis, strategy, resourceAssignmentManager) {
        const taskPriority = this.getTaskPriority(unit, analysis, strategy, resourceAssignmentManager);
        
        for (const task of taskPriority) {
            const action = this.executeTask(unit, task, analysis, strategy, resourceAssignmentManager);
            if (action) {
                return action;
            }
        }
        
        // Workers and scouts without assignments should not patrol
        // Only soldiers get defaultBehavior (patrol)
        if (unit.type === this.unitTypes.SOLDIER) {
            return this.defaultBehavior(unit, analysis);
        }
        
        // Non-combat units without tasks stay still
        return null;
    }

    /**
     * Определяет приоритеты задач для юнита на основе типа и игровой ситуации.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Array} Массив задач в порядке приоритета
     */
    getTaskPriority(unit, analysis, strategy, resourceAssignmentManager) {
        const tasks = [];
        const phase = strategy.phase;
        const currentTurn = analysis.gameState?.turnNo || 0;
        
        // CRITICAL: Always check if unit needs to return to anthill first
        if (this.shouldReturnToAnthill(unit, analysis)) {
            tasks.push('return_to_anthill');
            return tasks; // Return immediately - this is the highest priority
        }
        
        // END-GAME HEURISTIC: If game is nearing end (turn 380+), restrict unit movement
        if (this.shouldRestrictMovementForEndGame(unit, analysis, currentTurn)) {
            // В конце игры юниты не берут новые задачи ресурсов
            tasks.push('return_to_anthill');
            return tasks;
        }
        
        // CARGO-AWARE PRIORITIZATION: If unit is moderately loaded (50%+), avoid distractions
        const shouldAvoidDistractions = this.shouldAvoidDistractions(unit, analysis);
        
        // Централизованная система назначений ресурсов управляет всеми задачами сбора
        // Юниты НЕ получают прямые задачи nectar_collection, bread_collection, apple_collection
        logger.debug(`Unit ${unit.id}: Resource tasks managed by central assignment system`);
        
        // If unit should avoid distractions, only allow safe resource collection
        if (shouldAvoidDistractions) {
            logger.debug(`Unit ${unit.id} avoiding distractions due to moderate cargo load, focusing on safe resource collection`);
            const safeTasks = this.getSafeResourceTasks(unit, analysis, resourceAssignmentManager);
            if (safeTasks.length > 0) {
                return safeTasks;
            }
            // If no safe resource tasks, continue to anthill
            tasks.push('return_to_anthill');
            return tasks;
        }
        
        // Only proceed to other tasks if no nectar is available or unit cannot collect it
        
        // Always prioritize raiding enemy anthills if discovered
        if (this.hasDiscoveredEnemyAnthills(analysis)) {
            tasks.push('raid_enemy_anthill');
        }
        
        if (analysis.threats.immediateThreats.length > 0) {
            tasks.push('immediate_defense');
        }
        
        const unitTypeName = this.unitTypeNames[unit.type];
        
        if (unitTypeName === 'scout') {
            // Scouts prioritize systematic exploration and enemy base finding
            // They should avoid combat and focus on reconnaissance
            tasks.push('systematic_exploration', 'find_enemy_anthill', 'avoid_combat_exploration', 'resource_scouting');
            // Централизованная система управляет всеми ресурсными задачами
        } else if (unitTypeName === 'soldier') {
            // Soldiers should not get any tasks from UnitManager
            // Combat decisions are handled by CombatManager
            return [];
        } else if (unitTypeName === 'worker') {
            // Workers focus on support tasks, central manager handles resources
            tasks.push('assist_raid', 'construction');
        }
        
        if (phase === 'early') {
            tasks.push('resource_collection', 'aggressive_exploration');
        } else if (phase === 'mid') {
            tasks.push('find_enemy_anthill', 'territory_control', 'resource_optimization');
        } else if (phase === 'late') {
            tasks.push('raid_enemy_anthill', 'high_value_resources', 'enemy_disruption');
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
    executeTask(unit, task, analysis, strategy, resourceAssignmentManager) {
        switch (task) {
            case 'return_to_anthill':
                return this.returnToAnthill(unit, analysis);
            case 'immediate_defense':
                return this.defendAnthill(unit, analysis);
            case 'nectar_collection':
                return this.collectNectar(unit, analysis, resourceAssignmentManager);
            case 'bread_collection':
                return this.collectBread(unit, analysis, resourceAssignmentManager);
            case 'apple_collection':
                return this.collectApples(unit, analysis, resourceAssignmentManager);
            case 'exploration':
                return this.exploreMap(unit, analysis);
            case 'aggressive_exploration':
                return this.aggressiveExploration(unit, analysis);
            case 'systematic_exploration':
                return this.systematicExploration(unit, analysis);
            case 'avoid_combat_exploration':
                return this.avoidCombatExploration(unit, analysis);
            case 'find_enemy_anthill':
                return this.findEnemyAnthill(unit, analysis);
            case 'raid_enemy_anthill':
                return this.raidEnemyAnthill(unit, analysis);
            // case 'hunt_enemies':
            //     return this.huntEnemies(unit, analysis);  // Combat handled by CombatManager
            case 'assist_raid':
                return this.assistRaid(unit, analysis);
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
                    path: path,  // Отправляем весь путь, а не только первый шаг
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
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object|null} Команда движения к нектару или null
     */
    collectNectar(unit, analysis, resourceAssignmentManager) {
        // RULE CHECK: Юнит не может переносить несколько типов ресурсов одновременно
        if (unit.food && unit.food.amount > 0 && unit.food.type !== this.foodTypes.NECTAR) {
            logger.debug(`Unit ${unit.id} cannot collect nectar: already carrying ${this.foodTypeNames[unit.food.type] || unit.food.type} (${unit.food.amount} units)`);
            return null; // Уже несет другой тип ресурса
        }
        
        // Проверяем наличие ресурсов нектара
        if (!analysis.resources || !analysis.resources.byType) {
            logger.warn(`Unit ${unit.id}: No resources analysis available`);
            return null;
        }
        
        const nectarResources = analysis.resources.byType.nectar;
        if (!nectarResources) {
            logger.debug(`Unit ${unit.id}: No nectar array in analysis.resources.byType`);
            return null;
        }
        
        if (nectarResources.length === 0) {
            logger.debug(`Unit ${unit.id}: No nectar resources available (array empty)`);
            return null;
        }

        logger.debug(`Unit ${unit.id}: Found ${nectarResources.length} nectar resources available`);

        // Централизованная система управляет доступностью ресурсов
        const availableNectar = resourceAssignmentManager.getAvailableResources(nectarResources);

        if (availableNectar.length === 0) {
            logger.debug(`Unit ${unit.id}: No available nectar resources (all reserved)`);
            return null;
        }

        const nearestNectar = this.findNearestResource(unit, availableNectar);
        if (nearestNectar) {
            const distance = this.calculateDistance(unit, nearestNectar);
            logger.debug(`Unit ${unit.id}: Nearest nectar at (${nearestNectar.q}, ${nearestNectar.r}), distance: ${distance}`);
            
            const path = this.findPath(unit, nearestNectar, analysis);
            
            if (path && path.length > 0) {
                logger.info(`Unit ${unit.id}: Assigned to collect nectar at (${nearestNectar.q}, ${nearestNectar.r})`);
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'resource_collection',
                        target: nearestNectar,
                        resource_type: this.foodTypes.NECTAR,
                        priority: 'high'
                    }
                };
            } else {
                logger.warn(`Unit ${unit.id}: No valid path to nectar at (${nearestNectar.q}, ${nearestNectar.r})`);
            }
        } else {
            logger.warn(`Unit ${unit.id}: Could not find nearest nectar from ${availableNectar.length} available`);
        }
        
        return null;
    }

    /**
     * Планирует сбор хлеба - ресурса со средней калорийностью.
     * @param {Object} unit - Юнит-сборщик
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object|null} Команда движения к хлебу или null
     */
    collectBread(unit, analysis, resourceAssignmentManager) {
        // RULE CHECK: Юнит не может переносить несколько типов ресурсов одновременно
        if (unit.food && unit.food.amount > 0 && unit.food.type !== this.foodTypes.BREAD) {
            return null; // Уже несет другой тип ресурса
        }
        
        const breadResources = analysis.resources.byType.bread;
        if (breadResources.length === 0) {
            return null;
        }

        // Централизованная система управляет доступностью ресурсов
        const availableBread = resourceAssignmentManager.getAvailableResources(breadResources);

        if (availableBread.length === 0) {
            logger.debug(`Unit ${unit.id}: No available bread resources (all reserved)`);
            return null;
        }

        const nearestBread = this.findNearestResource(unit, availableBread);
        if (nearestBread) {
            const path = this.findPath(unit, nearestBread, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
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
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object|null} Команда движения к яблокам или null
     */
    collectApples(unit, analysis, resourceAssignmentManager) {
        // RULE CHECK: Юнит не может переносить несколько типов ресурсов одновременно
        if (unit.food && unit.food.amount > 0 && unit.food.type !== this.foodTypes.APPLE) {
            return null; // Уже несет другой тип ресурса
        }
        
        const appleResources = analysis.resources.byType.apple;
        if (appleResources.length === 0) {
            return null;
        }

        // Централизованная система управляет доступностью ресурсов
        const availableApples = resourceAssignmentManager.getAvailableResources(appleResources);

        if (availableApples.length === 0) {
            logger.debug(`Unit ${unit.id}: No available apple resources (all reserved)`);
            return null;
        }

        const nearestApple = this.findNearestResource(unit, availableApples);
        if (nearestApple) {
            const path = this.findPath(unit, nearestApple, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
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
                path: path,
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
                path: path,
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
                path: path,
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
        // CRITICAL FIX: Soldiers should patrol even without visible threats
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        // Generate patrol points around the anthill
        const patrolRadius = 10;
        const patrolPoints = [];
        
        // Create a ring of patrol points around the anthill
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const q = Math.round(anthill.q + Math.cos(angle) * patrolRadius);
            const r = Math.round(anthill.r + Math.sin(angle) * patrolRadius);
            patrolPoints.push({ q, r });
        }
        
        // Find the farthest patrol point from current position to ensure movement
        let farthestPoint = null;
        let maxDistance = 0;
        
        patrolPoints.forEach(point => {
            const distance = this.calculateDistance(unit, point);
            if (distance > maxDistance) {
                maxDistance = distance;
                farthestPoint = point;
            }
        });
        
        if (farthestPoint) {
            const path = this.findPath(unit, farthestPoint, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'territory_defense',
                        target: farthestPoint,
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
                path: path,
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
                path: path,
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
     * Находит путь от юнита к цели с учётом безопасности и игровых ограничений.
     * @param {Object} unit - Исходный юнит
     * @param {Object} target - Целевая позиция
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array|null} Массив точек пути или null
     */
    findPath(unit, target, analysis) {
        if (!unit || !target) {
            return null;
        }

        // CRITICAL FIX: Use A* pathfinding instead of simple direct path
        // Create walkability check function
        const isWalkable = (pos) => {
            return this.pathValidator.validatePosition(pos, analysis.gameState);
        };

        // Calculate maximum search distance based on unit speed and remaining moves
        const unitSpeed = this.getUnitSpeed(unit.type);
        // Increase search distance for recovery mode or long-range pathfinding
        const distance = this.calculateDistance(unit, target);
        const baseSearchDistance = Math.min(200, unitSpeed * 15); // Increased base distance
        const maxSearchDistance = Math.max(baseSearchDistance, distance + 10); // Ensure we can reach the target

        // Try A* pathfinding
        let path = this.pathfinder.findPath(unit, target, isWalkable, maxSearchDistance);
        
        // If direct path fails, try using pathValidator alternative path
        if (!path || path.length === 0) {
            logger.debug(`A* direct path failed for unit ${unit.id} to (${target.q}, ${target.r}), trying PathValidator alternative`);
            path = this.pathValidator.findAlternativePath(unit, target, analysis.gameState);
        }

        if (path && path.length > 0) {
            // Additional safety check
            const safetyCheckedPath = this.verifySafety(path, analysis);
            if (safetyCheckedPath && safetyCheckedPath.length > 0) {
                logger.debug(`A* path found for unit ${unit.id}: ${path.length} steps to (${target.q}, ${target.r})`);
                return safetyCheckedPath;
            }
        }

        // No fallback - if A* can't find a path, it means there's no valid path
        logger.debug(`No valid path found for unit ${unit.id} to target (${target.q}, ${target.r})`);
        return null;
    }

    // DEPRECATED: Direct path calculation replaced by A* pathfinding
    /*
    calculateDirectPath(start, end) {
        if (!start || !end) return [];
        
        const distance = this.calculateDistance(start, end);
        if (distance === 0) return [];

        // Для простоты и эффективности, возвращаем путь по шагам
        // в направлении цели, используя соседние гексы
        const path = [];
        let current = { q: start.q, r: start.r };
        
        for (let i = 0; i < distance && i < 10; i++) { // Ограничиваем длину пути
            const nextStep = this.getNextStepTowards(current, end);
            if (!nextStep) break;
            
            path.push(nextStep);
            current = nextStep;
            
            // Если достигли цели, останавливаемся
            if (current.q === end.q && current.r === end.r) {
                break;
            }
        }
        
        return path;
    }
    */

    /**
     * Определяет следующий шаг в направлении цели
     * @param {Object} from - Текущая позиция
     * @param {Object} to - Целевая позиция
     * @returns {Object|null} Следующая позиция или null
     */
    getNextStepTowards(from, to) {
        const dq = to.q - from.q;
        const dr = to.r - from.r;
        const ds = (-dq - dr);
        
        // Определяем основное направление движения
        let stepQ = 0;
        let stepR = 0;
        
        if (Math.abs(dq) >= Math.abs(dr) && Math.abs(dq) >= Math.abs(ds)) {
            // Движение по оси Q
            stepQ = Math.sign(dq);
            if (dr !== 0) {
                stepR = Math.sign(dr);
            }
        } else if (Math.abs(dr) >= Math.abs(ds)) {
            // Движение по оси R
            stepR = Math.sign(dr);
            if (dq !== 0) {
                stepQ = Math.sign(dq);
            }
        } else {
            // Движение по оси S (диагональ)
            if (dq !== 0) stepQ = -Math.sign(ds);
            if (dr !== 0) stepR = -Math.sign(ds);
        }
        
        // Корректируем, чтобы оставаться на соседнем гексе
        if (Math.abs(stepQ) + Math.abs(stepR) > 1) {
            // Выбираем одно из двух направлений
            if (Math.abs(dq) > Math.abs(dr)) {
                stepR = 0;
            } else {
                stepQ = 0;
            }
        }
        
        if (stepQ === 0 && stepR === 0) {
            return null;
        }
        
        return {
            q: from.q + stepQ,
            r: from.r + stepR
        };
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
        // Increased search radius for aggressive exploration
        const searchRadius = 50;
        
        // Use spiral pattern for better exploration coverage
        const spiralPoints = this.generateSpiralPattern(anthill, searchRadius);
        
        for (const point of spiralPoints) {
            if (!this.isPositionExplored(point, analysis)) {
                unexplored.push(point);
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
     * Проверяет, может ли юнит собирать ресурсы (не полностью загружен)
     * @param {Object} unit - Юнит
     * @returns {boolean} true, если юнит может собирать ресурсы
     */
    canCollectResources(unit, analysis) {
        // Юнит должен вернуться к муравейнику, если загружен на 80%+
        if (this.shouldReturnToAnthill(unit, analysis)) {
            return false;
        }
        
        // Проверяем грузоподъемность
        const unitTypeName = this.unitTypeNames[unit.type];
        const maxCapacity = this.getUnitCargoCapacity(unitTypeName);
        const currentCargo = unit.food?.amount || 0;
        
        // Может собирать, если есть свободное место
        return currentCargo < maxCapacity;
    }
    
    /**
     * Проверяет, есть ли доступные ресурсы для сбора
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если есть видимые ресурсы
     */
    hasAvailableResources(analysis) {
        return analysis.resources && 
               analysis.resources.visible && 
               analysis.resources.visible.length > 0;
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
    
    /**
     * Генерирует точки в виде спирали для эффективного исследования карты.
     * @param {Object} center - Центральная точка (муравейник)
     * @param {number} maxRadius - Максимальный радиус спирали
     * @returns {Array} Массив точек в порядке спирали
     */
    generateSpiralPattern(center, maxRadius) {
        const points = [];
        const directions = [
            { q: 1, r: 0 },   // right
            { q: 0, r: 1 },   // down-right
            { q: -1, r: 1 },  // down-left
            { q: -1, r: 0 },  // left
            { q: 0, r: -1 },  // up-left
            { q: 1, r: -1 }   // up-right
        ];
        
        let q = center.q;
        let r = center.r;
        points.push({ q, r });
        
        for (let radius = 1; radius <= maxRadius; radius++) {
            // Move to the starting position of this ring
            q = center.q + radius;
            r = center.r;
            
            // Traverse each side of the hexagonal ring
            for (let dir = 0; dir < 6; dir++) {
                for (let step = 0; step < radius; step++) {
                    points.push({ q, r });
                    // Move in current direction
                    q += directions[dir].q;
                    r += directions[dir].r;
                }
            }
        }
        
        return points;
    }
    
    /**
     * Проверяет, обнаружены ли вражеские муравейники.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если обнаружены вражеские муравейники
     */
    hasDiscoveredEnemyAnthills(analysis) {
        if (!analysis.gameState || !analysis.gameState.discoveredEnemyAnthills) {
            return false;
        }
        return analysis.gameState.discoveredEnemyAnthills.length > 0;
    }
    
    /**
     * Агрессивное исследование карты для поиска врагов.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения
     */
    aggressiveExploration(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        // Explore in expanding circles, prioritizing unexplored distant areas
        const maxDistance = 50;
        const currentDistance = this.calculateDistance(unit, anthill);
        
        // If unit is close to home, send it far
        let targetDistance = currentDistance < 15 ? 30 : currentDistance + 10;
        targetDistance = Math.min(targetDistance, maxDistance);
        
        // Generate target in a random direction at target distance
        const angle = Math.random() * Math.PI * 2;
        const target = {
            q: Math.round(anthill.q + Math.cos(angle) * targetDistance),
            r: Math.round(anthill.r + Math.sin(angle) * targetDistance)
        };
        
        const path = this.findPath(unit, target, analysis);
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                path: path,
                assignment: {
                    type: 'aggressive_exploration',
                    target: target,
                    priority: 'high'
                }
            };
        }
        
        return null;
    }
    
    /**
     * Ищет вражеские муравейники.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения
     */
    findEnemyAnthill(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        // Scout in systematic grid pattern to find enemy bases
        const gridSize = 20;
        const maxSearchRadius = 60;
        
        // Calculate grid position to explore
        const gridX = Math.floor(unit.q / gridSize) * gridSize;
        const gridY = Math.floor(unit.r / gridSize) * gridSize;
        
        // Find unexplored grid cells
        const unexploredGrids = [];
        for (let dx = -3; dx <= 3; dx++) {
            for (let dy = -3; dy <= 3; dy++) {
                const target = {
                    q: gridX + dx * gridSize,
                    r: gridY + dy * gridSize
                };
                
                const distance = this.calculateDistance(anthill, target);
                if (distance <= maxSearchRadius && !this.isPositionExplored(target, analysis)) {
                    unexploredGrids.push(target);
                }
            }
        }
        
        if (unexploredGrids.length > 0) {
            // Sort by distance from home (explore far areas first)
            unexploredGrids.sort((a, b) => {
                const distA = this.calculateDistance(anthill, a);
                const distB = this.calculateDistance(anthill, b);
                return distB - distA;
            });
            
            const target = unexploredGrids[0];
            const path = this.findPath(unit, target, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'find_enemy_anthill',
                        target: target,
                        priority: 'high'
                    }
                };
            }
        }
        
        // If no grid cells to explore, do aggressive exploration
        return this.aggressiveExploration(unit, analysis);
    }
    
    /**
     * Атакует обнаруженный вражеский муравейник.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения
     */
    raidEnemyAnthill(unit, analysis) {
        // Check if we have discovered enemy anthills
        const enemyAnthills = analysis.gameState?.discoveredEnemyAnthills || [];
        if (enemyAnthills.length === 0) {
            // Check enemies array for anthills (type 0)
            const enemyAnthillsFromEnemies = (analysis.gameState?.enemies || [])
                .filter(enemy => enemy.type === 0);
            
            if (enemyAnthillsFromEnemies.length > 0) {
                enemyAnthills.push(...enemyAnthillsFromEnemies);
            }
        }
        
        if (enemyAnthills.length === 0) return null;
        
        // Analyze feasibility of raiding each enemy anthill
        const raidOpportunities = enemyAnthills.map(anthill => 
            this.analyzeRaidFeasibility(unit, anthill, analysis)
        ).filter(opportunity => opportunity.feasible);
        
        if (raidOpportunities.length === 0) {
            logger.debug(`Unit ${unit.id}: No feasible enemy anthill raids available`);
            return null;
        }
        
        // Sort by raid score (higher is better)
        raidOpportunities.sort((a, b) => b.score - a.score);
        const bestTarget = raidOpportunities[0];
        
        logger.info(`Unit ${unit.id}: Initiating raid on enemy anthill at (${bestTarget.anthill.q}, ${bestTarget.anthill.r}) - Score: ${bestTarget.score.toFixed(2)}`);
        
        const path = this.findPath(unit, bestTarget.anthill, analysis);
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                path: path,
                assignment: {
                    type: 'raid_enemy_anthill',
                    target: bestTarget.anthill,
                    priority: 'critical',
                    raidScore: bestTarget.score
                }
            };
        }
        
        return null;
    }
    
    /**
     * Охотится на вражеские юниты.
     * @param {Object} unit - Юнит-солдат
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения
     */
    huntEnemies(unit, analysis) {
        const enemies = analysis.units.enemyUnits || [];
        if (enemies.length === 0) {
            // No visible enemies, explore aggressively to find them
            return this.aggressiveExploration(unit, analysis);
        }
        
        // Prioritize enemy workers and scouts
        const priorityTargets = enemies.filter(enemy => 
            enemy.type === this.unitTypes.WORKER || enemy.type === this.unitTypes.SCOUT
        );
        
        const targets = priorityTargets.length > 0 ? priorityTargets : enemies;
        const nearestTarget = this.findNearestPosition(unit, targets);
        
        if (nearestTarget) {
            const path = this.findPath(unit, nearestTarget, analysis);
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'hunt_enemies',
                        target: nearestTarget,
                        priority: 'high'
                    }
                };
            }
        }
        
        return null;
    }
    
    /**
     * Помогает в рейде на вражеский муравейник (для рабочих).
     * @param {Object} unit - Юнит-рабочий
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения
     */
    assistRaid(unit, analysis) {
        // Check if any soldiers are raiding
        const raidingSoldiers = analysis.units.myUnits.filter(u => {
            const assignment = this.unitAssignments.get(u.id);
            return assignment && assignment.assignment?.type === 'raid_enemy_anthill';
        });
        
        if (raidingSoldiers.length === 0) return null;
        
        // Follow the nearest raiding soldier
        const nearestRaider = this.findNearestPosition(unit, raidingSoldiers);
        if (!nearestRaider) return null;
        
        // Stay close but not too close
        const followDistance = 3;
        const currentDistance = this.calculateDistance(unit, nearestRaider);
        
        if (currentDistance > followDistance) {
            const path = this.findPath(unit, nearestRaider, analysis);
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'assist_raid',
                        target: nearestRaider,
                        priority: 'medium'
                    }
                };
            }
        }
        
        return null;
    }
    
    /**
     * Проверяет, должен ли юнит вернуться к муравейнику для разгрузки ресурсов.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если юнит должен вернуться к муравейнику
     */
    shouldReturnToAnthill(unit, analysis) {
        if (!unit.food || !unit.food.amount) {
            return false; // No cargo
        }
        
        const unitTypeName = this.unitTypeNames[unit.type];
        const maxCapacity = this.getUnitCargoCapacity(unitTypeName);
        const currentCargo = unit.food.amount;
        const cargoPercentage = (currentCargo / maxCapacity) * 100;
        
        // Return when cargo is 80% full or more, or when carrying high-value resources
        const cargoThreshold = maxCapacity * 0.8;
        const isNearlyFull = currentCargo >= cargoThreshold;
        
        // Always return immediately if carrying nectar (most valuable resource)
        const hasNectar = unit.food.type === this.foodTypes.NECTAR;
        
        // Log cargo status for debugging
        const resourceType = this.foodTypeNames[unit.food.type] || unit.food.type;
        logger.debug(`Unit ${unit.id} cargo check: ${currentCargo}/${maxCapacity} (${cargoPercentage.toFixed(1)}%) of ${resourceType}`);
        
        if (hasNectar) {
            logger.info(`Unit ${unit.id} must return to anthill: carrying valuable nectar (${currentCargo} units)`);
            return true;
        }
        
        if (isNearlyFull) {
            logger.info(`Unit ${unit.id} must return to anthill: cargo nearly full (${cargoPercentage.toFixed(1)}%)`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Планирует возвращение юнита к муравейнику для разгрузки ресурсов.
     * @param {Object} unit - Юнит с грузом
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения к муравейнику или null
     */
    returnToAnthill(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            logger.warn(`Unit ${unit.id} needs to return but no anthill found`);
            return null;
        }
        
        // Check if unit is already at anthill
        const distanceToAnthill = this.calculateDistance(unit, anthill);
        if (distanceToAnthill === 0 && unit.food && unit.food.amount > 0) {
            // Unit has reached anthill and can unload resources
            const cargoValue = this.calculateCargoValue(unit);
            const resourceType = this.foodTypeNames[unit.food.type] || unit.food.type;
            const cargoAmount = unit.food.amount;
            
            logger.info(`🏠 Unit ${unit.id} has reached anthill and unloaded ${cargoAmount} units of ${resourceType} (${cargoValue} calories total)`);
            
            // Note: The actual unloading will happen automatically when the unit steps on the anthill hex
            // We just log this event for tracking purposes
        }
        
        // Calculate path to anthill
        const path = this.findPath(unit, anthill, analysis);
        if (path && path.length > 0) {
            const cargoValue = this.calculateCargoValue(unit);
            const resourceType = this.foodTypeNames[unit.food.type] || unit.food.type;
            const cargoAmount = unit.food.amount;
            
            logger.info(`📦 Unit ${unit.id} heading to anthill to unload ${cargoAmount} units of ${resourceType} (${cargoValue} calories), distance: ${distanceToAnthill} hexes`);
            
            return {
                unit_id: unit.id,
                path: path,
                assignment: {
                    type: 'return_to_anthill',
                    target: anthill,
                    priority: 'critical',
                    cargoValue: cargoValue,
                    cargoType: resourceType,
                    cargoAmount: cargoAmount
                }
            };
        }
        
        logger.warn(`Unit ${unit.id} cannot find path to anthill (distance: ${distanceToAnthill})`);
        return null;
    }
    
    /**
     * Получает грузоподъёмность юнита по его типу.
     * @param {string} unitTypeName - Название типа юнита
     * @returns {number} Грузоподъёмность юнита
     */
    getUnitCargoCapacity(unitTypeName) {
        const capacities = {
            worker: 8,    // Workers are the best carriers
            scout: 4,     // Scouts are fast but carry less
            soldier: 2    // Soldiers focus on combat, not carrying
        };
        return capacities[unitTypeName] || 2;
    }
    
    /**
     * Вычисляет стоимость груза, который несёт юнит.
     * @param {Object} unit - Юнит с грузом
     * @returns {number} Общая калорийная стоимость груза
     */
    calculateCargoValue(unit) {
        if (!unit.food || !unit.food.amount || !unit.food.type) {
            return 0;
        }
        
        const { FOOD_CALORIES } = require('../constants/GameConstants');
        const resourceValue = FOOD_CALORIES[unit.food.type] || 0;
        
        return resourceValue * unit.food.amount;
    }
    
    /**
     * Анализирует целесообразность рейда на вражеский муравейник.
     * @param {Object} unit - Юнит-нападающий
     * @param {Object} enemyAnthill - Вражеский муравейник
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Результат анализа с флагом feasible и оценкой score
     */
    analyzeRaidFeasibility(unit, enemyAnthill, analysis) {
        const myAnthill = analysis.units.anthill;
        if (!myAnthill) {
            return { feasible: false, score: 0, reason: 'No home anthill found' };
        }
        
        // Базовые факторы анализа
        const distance = this.calculateDistance(unit, enemyAnthill);
        const distanceFromHome = this.calculateDistance(myAnthill, enemyAnthill);
        const myUnits = analysis.units.myUnits;
        const enemyUnits = analysis.units.enemyUnits;
        
        // Проверяем дистанцию - слишком далеко не стоит идти
        if (distance > 40) {
            return { feasible: false, score: 0, reason: `Too far (distance: ${distance})` };
        }
        
        // Анализируем силы
        const myFighters = myUnits.filter(u => u.type === this.unitTypes.SOLDIER);
        const nearbyEnemies = enemyUnits.filter(enemy => 
            this.calculateDistance(enemy, enemyAnthill) <= 8
        );
        
        // Оценка моих боевых сил
        const myPower = myFighters.reduce((power, fighter) => {
            const stats = this.unitStats[fighter.type];
            return power + (stats ? stats.attack * (stats.health / 100) : 50);
        }, 0);
        
        // Оценка вражеских сил рядом с их муравейником
        const enemyPower = nearbyEnemies.reduce((power, enemy) => {
            const stats = this.unitStats[enemy.type];
            return power + (stats ? stats.attack * (stats.health / 100) : 50);
        }, 0) + 200; // Добавляем бонус за защиту муравейника
        
        // Проверяем численное превосходство
        if (myPower < enemyPower * 0.8) {
            return { 
                feasible: false, 
                score: 0, 
                reason: `Insufficient power (my: ${myPower.toFixed(1)}, enemy: ${enemyPower.toFixed(1)})` 
            };
        }
        
        // Анализируем игровую фазу и ресурсы
        const gameState = analysis.gameState;
        const myCalories = gameState.calories || 0;
        const turn = gameState.turnNo || 0;
        
        // В поздней игре рейд становится более приоритетным
        let phaseMultiplier = 1.0;
        if (turn > 50) {
            phaseMultiplier = 2.0; // Поздняя игра - агрессивная стратегия
        } else if (turn > 25) {
            phaseMultiplier = 1.5; // Средняя игра
        }
        
        // Рассчитываем итоговую оценку
        let score = 0;
        
        // Фактор превосходства в силе (0-100)
        const powerRatio = Math.min(myPower / enemyPower, 2.0);
        score += powerRatio * 100;
        
        // Бонус за близость (чем ближе, тем лучше) (0-50)
        const distanceScore = Math.max(0, 50 - distance);
        score += distanceScore;
        
        // Штраф за удаленность от дома (0-30)
        const homeDistancePenalty = Math.min(30, distanceFromHome * 0.5);
        score -= homeDistancePenalty;
        
        // Бонус за наличие ресурсов для затяжного боя (0-30)
        const resourceBonus = Math.min(30, myCalories / 100);
        score += resourceBonus;
        
        // Применяем фазовый множитель
        score *= phaseMultiplier;
        
        // Минимальный порог для начала рейда
        const minScore = 120;
        const feasible = score >= minScore;
        
        logger.debug(`Raid analysis for anthill at (${enemyAnthill.q}, ${enemyAnthill.r}): 
            Power ratio: ${powerRatio.toFixed(2)}, Distance: ${distance}, 
            Score: ${score.toFixed(1)}, Feasible: ${feasible}`);
        
        return {
            feasible,
            score,
            anthill: enemyAnthill,
            powerRatio,
            distance,
            reason: feasible ? 'Raid is feasible' : `Score too low (${score.toFixed(1)} < ${minScore})`
        };
    }
    
    /**
     * Определяет, нужно ли ограничивать движение юнитов в конце игры.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {number} currentTurn - Номер текущего хода
     * @returns {boolean} true, если нужно ограничить движение
     */
    shouldRestrictMovementForEndGame(unit, analysis, currentTurn) {
        const gameEndTurn = 420;
        const endGameThreshold = 380; // Начинаем ограничения за 40 ходов до конца
        
        if (currentTurn < endGameThreshold) {
            return false;
        }
        
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return false;
        }
        
        const turnsLeft = gameEndTurn - currentTurn;
        const distanceToHome = this.calculateDistance(unit, anthill);
        const unitSpeed = this.getUnitSpeed(unit.type);
        
        // Максимальное расстояние, на которое юнит может уйти и успеть вернуться
        const maxSafeDistance = Math.floor((turnsLeft * unitSpeed) / 2) - 2; // -2 для запаса
        
        logger.debug(`End-game check: Turn ${currentTurn}, turns left: ${turnsLeft}, distance to home: ${distanceToHome}, max safe distance: ${maxSafeDistance}`);
        
        // Если юнит уже далеко, он должен возвращаться
        if (distanceToHome > maxSafeDistance) {
            logger.info(`Unit ${unit.id} restricted movement due to end-game (distance: ${distanceToHome} > max: ${maxSafeDistance})`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Получает задачи по сбору близких ресурсов для конца игры.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Array} Массив задач для близких ресурсов
     */
    getNearbyResourceTasks(unit, analysis, resourceAssignmentManager = null) {
        const tasks = [];
        const anthill = analysis.units.anthill;
        if (!anthill) return tasks;
        
        // Если используется централизованная система, не даем прямые задачи
        if (resourceAssignmentManager) {
            logger.debug(`Unit ${unit.id}: Using central manager for end-game resource assignment`);
            return tasks;
        }
        
        const currentTurn = analysis.gameState?.turnNo || 0;
        const turnsLeft = 420 - currentTurn;
        const maxSafeDistance = Math.floor(turnsLeft / 4); // Очень консервативный подход
        
        // Проверяем нектар (всегда приоритет)
        const nearbyNectar = (analysis.resources.byType.nectar || []).filter(resource => 
            this.calculateDistance(unit, resource) <= maxSafeDistance
        );
        if (nearbyNectar.length > 0) {
            tasks.push('nectar_collection');
        }
        
        // Проверяем хлеб
        const nearbyBread = (analysis.resources.byType.bread || []).filter(resource => 
            this.calculateDistance(unit, resource) <= maxSafeDistance
        );
        if (nearbyBread.length > 0) {
            tasks.push('bread_collection');
        }
        
        // Проверяем яблоки
        const nearbyApples = (analysis.resources.byType.apple || []).filter(resource => 
            this.calculateDistance(unit, resource) <= maxSafeDistance
        );
        if (nearbyApples.length > 0) {
            tasks.push('apple_collection');
        }
        
        logger.debug(`End-game nearby resources for unit ${unit.id}: nectar=${nearbyNectar.length}, bread=${nearbyBread.length}, apples=${nearbyApples.length}`);
        
        return tasks;
    }
    
    /**
     * Получает скорость юнита по его типу.
     * @param {number} unitType - Тип юнита
     * @returns {number} Скорость юнита в гексах за ход
     */
    getUnitSpeed(unitType) {
        const speeds = {
            [this.unitTypes.WORKER]: 3,
            [this.unitTypes.SOLDIER]: 4,
            [this.unitTypes.SCOUT]: 7
        };
        return speeds[unitType] || 3;
    }
    
    /**
     * Определяет, должен ли юнит избегать отвлечений из-за значительной загрузки.
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если юнит должен избегать отвлечений
     */
    shouldAvoidDistractions(unit, analysis) {
        if (!unit.food || !unit.food.amount) {
            return false; // Нет груза - отвлечения не критичны
        }
        
        const unitTypeName = this.unitTypeNames[unit.type];
        const maxCapacity = this.getUnitCargoCapacity(unitTypeName);
        const currentCargo = unit.food.amount;
        const cargoPercentage = (currentCargo / maxCapacity) * 100;
        
        // Порог для избегания отвлечений - 50% загрузки
        const distractionThreshold = maxCapacity * 0.5;
        const shouldAvoid = currentCargo >= distractionThreshold;
        
        if (shouldAvoid) {
            const resourceType = this.foodTypeNames[unit.food.type] || unit.food.type;
            logger.info(`💼 Unit ${unit.id} avoiding distractions: ${cargoPercentage.toFixed(1)}% loaded with ${resourceType} (${currentCargo}/${maxCapacity})`);
        }
        
        return shouldAvoid;
    }
    
    /**
     * Получает безопасные задачи по сбору ресурсов для загруженных юнитов.
     * Приоритизирует близкие ресурсы и избегает опасных областей.
     * @param {Object} unit - Загруженный юнит
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Array} Массив безопасных задач по ресурсам
     */
    getSafeResourceTasks(unit, analysis, resourceAssignmentManager) {
        const tasks = [];
        const anthill = analysis.units.anthill;
        if (!anthill) return tasks;
        
        // Централизованная система управляет всеми назначениями ресурсов
        logger.debug(`Unit ${unit.id}: Using central manager for safe resource assignment`);
        return tasks;
        
        const maxSafeDistance = 8; // Ограничиваем расстояние для безопасности
        const threats = analysis.threats.threats || [];
        
        // Функция проверки безопасности позиции
        const isSafePosition = (position) => {
            return threats.every(threat => 
                this.calculateDistance(position, threat.unit) > 5
            );
        };
        
        // Проверяем нектар (всегда приоритет, даже для загруженных юнитов)
        if (analysis.resources.byType.nectar) {
            const safeNectar = analysis.resources.byType.nectar.filter(resource => {
                const distance = this.calculateDistance(unit, resource);
                return distance <= maxSafeDistance && isSafePosition(resource);
            });
            
            if (safeNectar.length > 0) {
                logger.debug(`Unit ${unit.id} found ${safeNectar.length} safe nectar sources nearby`);
                tasks.push('nectar_collection');
                return tasks; // Нектар - абсолютный приоритет
            }
        }
        
        // Только если юнит несет совместимый ресурс, он может собирать еще
        if (unit.food && unit.food.type) {
            const compatibleResourceType = this.foodTypeNames[unit.food.type];
            
            // Проверяем совместимые ресурсы
            let resourceArray = [];
            let taskName = '';
            
            if (unit.food.type === this.foodTypes.BREAD) {
                resourceArray = analysis.resources.byType.bread || [];
                taskName = 'bread_collection';
            } else if (unit.food.type === this.foodTypes.APPLE) {
                resourceArray = analysis.resources.byType.apple || [];
                taskName = 'apple_collection';
            }
            
            if (resourceArray.length > 0) {
                const safeResources = resourceArray.filter(resource => {
                    const distance = this.calculateDistance(unit, resource);
                    return distance <= maxSafeDistance && isSafePosition(resource);
                });
                
                if (safeResources.length > 0) {
                    logger.debug(`Unit ${unit.id} found ${safeResources.length} safe ${compatibleResourceType} sources nearby`);
                    tasks.push(taskName);
                }
            }
        }
        
        if (tasks.length === 0) {
            logger.debug(`Unit ${unit.id} found no safe resource collection opportunities, should head to anthill`);
        }
        
        return tasks;
    }
    /**
     * Систематическая разведка карты с использованием карты угроз.
     * Разведчики приоритезируют области с повышенным интересом на основе вражеских контактов.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения или null
     */
    systematicExploration(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        const gameState = analysis.gameState;
        const turn = gameState.turnNo || 0;
        const threatMap = analysis.threatMap;
        const traversabilityMap = analysis.traversabilityMap;
        
        // PRIORITY 1: Use traversability-optimized exploration targets
        if (traversabilityMap && traversabilityMap.explorationTargets.length > 0) {
            const bestTarget = this.selectBestTraversabilityTarget(unit, traversabilityMap.explorationTargets);
            if (bestTarget) {
                const path = this.findPath(unit, bestTarget.position, analysis);
                if (path && path.length > 0) {
                    logger.info(`🗺️ Scout ${unit.id} exploring low-cost area at (${bestTarget.position.q}, ${bestTarget.position.r}) - Cost: ${bestTarget.cost}, Priority: ${bestTarget.priority.toFixed(1)}`);
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'systematic_exploration',
                            target: bestTarget.position,
                            priority: 'high',
                            reason: 'optimal_traversability',
                            traversabilityBased: true,
                            movementCost: bestTarget.cost
                        }
                    };
                }
            }
        }
        
        // PRIORITY 2: Check for threat map based targets
        if (threatMap && threatMap.recommendedScoutTargets.length > 0) {
            const threatBasedTarget = this.selectBestThreatMapTarget(unit, threatMap.recommendedScoutTargets, traversabilityMap);
            if (threatBasedTarget) {
                const path = this.findPath(unit, threatBasedTarget, analysis);
                if (path && path.length > 0) {
                    logger.info(`🎯 Scout ${unit.id} investigating threat area at (${threatBasedTarget.q}, ${threatBasedTarget.r}) - Interest: ${threatBasedTarget.priority.toFixed(1)}`);
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'systematic_exploration',
                            target: threatBasedTarget,
                            priority: 'high',
                            reason: threatBasedTarget.reason,
                            threatMapBased: true
                        }
                    };
                }
            }
        }
        
        // PRIORITY 2: Enhanced directional exploration based on threat directions
        if (threatMap && threatMap.threatDirections.length > 0) {
            const priorityDirection = threatMap.threatDirections[0]; // Highest threat direction
            const directionalTarget = this.generateDirectionalExplorationTarget(
                unit, anthill, priorityDirection.direction, turn
            );
            
            if (directionalTarget) {
                const path = this.findPath(unit, directionalTarget, analysis);
                if (path && path.length > 0) {
                    logger.info(`🧭 Scout ${unit.id} priority directional exploration ${priorityDirection.direction} to (${directionalTarget.q}, ${directionalTarget.r})`);
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'systematic_exploration',
                            target: directionalTarget,
                            priority: 'high',
                            direction: priorityDirection.direction,
                            threatDirectionBased: true
                        }
                    };
                }
            }
        }
        
        // PRIORITY 3: Fallback to traditional spiral exploration
        const currentRadius = Math.min(60, 15 + Math.floor(turn / 20) * 2);
        const spiralTarget = this.generateSpiralExplorationTarget(unit, anthill, currentRadius, analysis);
        
        if (spiralTarget) {
            const path = this.findPath(unit, spiralTarget, analysis);
            if (path && path.length > 0) {
                logger.info(`🌀 Scout ${unit.id} spiral exploration to (${spiralTarget.q}, ${spiralTarget.r}) at radius ${currentRadius}`);
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'systematic_exploration',
                        target: spiralTarget,
                        priority: 'medium',
                        explorationRadius: currentRadius,
                        spiralBased: true
                    }
                };
            }
        }
        
        logger.debug(`Scout ${unit.id}: No valid exploration targets found`);
        return null;
    }
    
    /**
     * Выбирает лучшую цель из рекомендаций карты угроз.
     * @param {Object} unit - Юнит-разведчик
     * @param {Array} threatTargets - Цели от карты угроз
     * @returns {Object|null} Лучшая цель или null
     */
    selectBestThreatMapTarget(unit, threatTargets, traversabilityMap = null) {
        if (threatTargets.length === 0) return null;
        
        // Score targets based on priority, distance, and traversability
        const scoredTargets = threatTargets.map(target => {
            const distance = this.calculateDistance(unit, target);
            const distanceScore = Math.max(0.1, 1 / (1 + distance * 0.1));
            let traversabilityScore = 1.0;
            
            // Factor in traversability if available
            if (traversabilityMap && traversabilityMap.traversabilityMap) {
                const posKey = `${target.q},${target.r}`;
                const hexData = traversabilityMap.traversabilityMap.get(posKey);
                if (hexData) {
                    // Lower cost = higher score
                    traversabilityScore = Math.max(0.1, 3 / (hexData.cost + 1));
                }
            }
            
            const score = target.priority * distanceScore * traversabilityScore;
            
            return { ...target, distance, score, traversabilityScore };
        });
        
        // Sort by score (highest first)
        scoredTargets.sort((a, b) => b.score - a.score);
        
        // Return best target within reasonable distance
        const maxDistance = 35;
        for (const target of scoredTargets) {
            if (target.distance <= maxDistance) {
                return target;
            }
        }
        
        return null;
    }
    
    /**
     * Selects best exploration target from traversability analysis.
     * @param {Object} unit - Scout unit
     * @param {Array} explorationTargets - Available exploration targets
     * @returns {Object|null} Best target or null
     */
    selectBestTraversabilityTarget(unit, explorationTargets) {
        if (explorationTargets.length === 0) return null;
        
        // Score targets based on priority, distance, and movement cost
        const scoredTargets = explorationTargets.map(target => {
            const distance = this.calculateDistance(unit, target.position);
            const distanceScore = Math.max(0.1, 1 / (1 + distance * 0.05));
            const costScore = Math.max(0.1, 3 / (target.cost + 1)); // Lower cost = higher score
            const priorityScore = target.priority;
            
            const totalScore = priorityScore * distanceScore * costScore;
            
            return { 
                ...target, 
                distance, 
                totalScore,
                distanceScore,
                costScore,
                priorityScore
            };
        });
        
        // Sort by total score (highest first)
        scoredTargets.sort((a, b) => b.totalScore - a.totalScore);
        
        // Return best target within reasonable distance and low cost
        const maxDistance = 30;
        const maxCost = 4; // Avoid high-cost areas
        
        for (const target of scoredTargets) {
            if (target.distance <= maxDistance && target.cost <= maxCost) {
                logger.debug(`Selected traversability target: cost=${target.cost}, distance=${target.distance}, priority=${target.priority}, score=${target.totalScore.toFixed(2)}`);
                return target;
            }
        }
        
        // If no good targets, take the best available even if suboptimal
        return scoredTargets.length > 0 ? scoredTargets[0] : null;
    }
    
    /**
     * Генерирует цель для направленного исследования.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} anthill - Муравейник
     * @param {string} direction - Направление угрозы
     * @param {number} turn - Номер хода
     * @returns {Object|null} Цель для исследования
     */
    generateDirectionalExplorationTarget(unit, anthill, direction, turn) {
        // Convert direction to vector
        const directionVectors = {
            'E': { q: 1, r: 0 },
            'SE': { q: 0, r: 1 },
            'S': { q: -1, r: 1 },
            'SW': { q: -1, r: 0 },
            'W': { q: 0, r: -1 },
            'NW': { q: 1, r: -1 },
            'N': { q: 1, r: 0 },
            'NE': { q: 1, r: -1 }
        };
        
        const dirVector = directionVectors[direction];
        if (!dirVector) return null;
        
        // Calculate target distance based on game progression
        const baseDistance = 20;
        const timeMultiplier = Math.floor(turn / 15);
        const targetDistance = Math.min(40, baseDistance + timeMultiplier * 3);
        
        // Add some randomness to avoid predictable patterns
        const randomOffset = (Math.random() - 0.5) * 0.3;
        const effectiveDistance = targetDistance * (1 + randomOffset);
        
        return {
            q: Math.round(anthill.q + dirVector.q * effectiveDistance),
            r: Math.round(anthill.r + dirVector.r * effectiveDistance)
        };
    }
    
    /**
     * Генерирует цель для спирального исследования.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} anthill - Муравейник
     * @param {number} currentRadius - Текущий радиус исследования
     * @param {Object} analysis - Анализ игры
     * @returns {Object|null} Цель для исследования
     */
    generateSpiralExplorationTarget(unit, anthill, currentRadius, analysis) {
        // Generate exploration points in spiral pattern
        const explorationPoints = this.generateSpiralPattern(anthill, currentRadius);
        
        // Filter out explored points
        const unexploredPoints = explorationPoints.filter(point => 
            !this.isPositionExplored(point, analysis)
        );
        
        if (unexploredPoints.length === 0) {
            // If all points explored, expand radius
            const extendedPoints = this.generateSpiralPattern(anthill, currentRadius + 10);
            unexploredPoints.push(...extendedPoints.slice(explorationPoints.length));
        }
        
        // Select closest unexplored point
        let bestTarget = null;
        let minDistance = Infinity;
        
        for (const point of unexploredPoints) {
            const distance = this.calculateDistance(unit, point);
            if (distance < minDistance) {
                minDistance = distance;
                bestTarget = point;
            }
        }
        
        return bestTarget;
    }
    
    /**
     * Разведка с избеганием боя - разведчики исследуют карту, но отступают при виде врагов.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения или null
     */
    avoidCombatExploration(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        const enemyUnits = analysis.units.enemyUnits || [];
        const threats = analysis.threats.threats || [];
        
        // Проверяем, есть ли враги поблизости
        const nearbyEnemies = enemyUnits.filter(enemy => 
            this.calculateDistance(unit, enemy) <= 10
        );
        
        const nearbyThreats = threats.filter(threat => 
            this.calculateDistance(unit, threat.unit) <= 8
        );
        
        // Если рядом есть враги, отступаем к базе
        if (nearbyEnemies.length > 0 || nearbyThreats.length > 0) {
            logger.info(`🏃 Scout ${unit.id} retreating from combat: ${nearbyEnemies.length} enemies, ${nearbyThreats.length} threats nearby`);
            
            // Находим безопасную позицию между текущим местоположением и базой
            const safeRetreatPosition = this.calculateSafeRetreatPosition(unit, anthill, enemyUnits);
            
            if (safeRetreatPosition) {
                const path = this.findPath(unit, safeRetreatPosition, analysis);
                if (path && path.length > 0) {
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'avoid_combat_exploration',
                            target: safeRetreatPosition,
                            priority: 'high',
                            reason: 'retreating_from_enemies'
                        }
                    };
                }
            }
            
            // Если не можем найти безопасный путь отступления, идем прямо к базе
            const path = this.findPath(unit, anthill, analysis);
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'avoid_combat_exploration',
                        target: anthill,
                        priority: 'high',
                        reason: 'emergency_retreat'
                    }
                };
            }
        }
        
        // Если нет угроз, продолжаем разведку, но более осторожно
        return this.cautiousExploration(unit, analysis);
    }
    
    /**
     * Осторожная разведка - исследование безопасных областей.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Команда движения или null
     */
    cautiousExploration(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        const maxSafeDistance = 25; // Ограничиваем дистанцию для безопасности
        const currentDistance = this.calculateDistance(unit, anthill);
        
        // Если разведчик слишком далеко от базы, возвращаем его
        if (currentDistance > maxSafeDistance) {
            logger.info(`🔙 Scout ${unit.id} returning to base: too far from home (${currentDistance} > ${maxSafeDistance})`);
            const path = this.findPath(unit, anthill, analysis);
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'avoid_combat_exploration',
                        target: anthill,
                        priority: 'medium',
                        reason: 'return_to_safe_distance'
                    }
                };
            }
        }
        
        // Ищем безопасные области для исследования
        const safeExplorationTargets = this.generateSafeExplorationTargets(unit, analysis, maxSafeDistance);
        
        if (safeExplorationTargets.length > 0) {
            const target = safeExplorationTargets[0];
            const path = this.findPath(unit, target, analysis);
            
            if (path && path.length > 0) {
                logger.info(`🔍 Scout ${unit.id} cautious exploration to (${target.q}, ${target.r})`);
                return {
                    unit_id: unit.id,
                    path: path,
                    assignment: {
                        type: 'avoid_combat_exploration',
                        target: target,
                        priority: 'medium',
                        reason: 'safe_exploration'
                    }
                };
            }
        }
        
        logger.debug(`Scout ${unit.id}: No safe exploration targets found`);
        return null;
    }
    
    /**
     * Вычисляет безопасную позицию для отступления.
     * @param {Object} unit - Отступающий юнит
     * @param {Object} safePosition - Безопасная позиция (обычно база)
     * @param {Array} enemies - Массив вражеских юнитов
     * @returns {Object|null} Безопасная позиция для отступления
     */
    calculateSafeRetreatPosition(unit, safePosition, enemies) {
        if (!unit || !safePosition) return null;
        
        // Вычисляем направление от юнита к базе
        const directionToSafety = {
            q: safePosition.q - unit.q,
            r: safePosition.r - unit.r
        };
        
        // Нормализуем направление
        const distance = this.calculateDistance(unit, safePosition);
        if (distance === 0) return safePosition;
        
        const normalizedDir = {
            q: directionToSafety.q / distance,
            r: directionToSafety.r / distance
        };
        
        // Ищем позицию на полпути к базе, которая далека от врагов
        const retreatDistance = Math.min(8, Math.floor(distance / 2));
        const retreatPosition = {
            q: Math.round(unit.q + normalizedDir.q * retreatDistance),
            r: Math.round(unit.r + normalizedDir.r * retreatDistance)
        };
        
        // Проверяем, безопасна ли эта позиция
        const isSafe = enemies.every(enemy => 
            this.calculateDistance(retreatPosition, enemy) > 5
        );
        
        return isSafe ? retreatPosition : safePosition;
    }
    
    /**
     * Генерирует безопасные цели для исследования.
     * @param {Object} unit - Юнит-разведчик
     * @param {Object} analysis - Анализ состояния игры
     * @param {number} maxDistance - Максимальная дистанция от базы
     * @returns {Array} Массив безопасных целей для исследования
     */
    generateSafeExplorationTargets(unit, analysis, maxDistance) {
        const anthill = analysis.units.anthill;
        const enemyUnits = analysis.units.enemyUnits || [];
        const threats = analysis.threats.threats || [];
        
        if (!anthill) return [];
        
        const targets = [];
        const directions = [
            { q: 1, r: 0 },   // East
            { q: 0, r: 1 },   // Southeast  
            { q: -1, r: 1 },  // Southwest
            { q: -1, r: 0 },  // West
            { q: 0, r: -1 },  // Northwest
            { q: 1, r: -1 }   // Northeast
        ];
        
        // Генерируем цели в разных направлениях на разных дистанциях
        for (let distance = 8; distance <= maxDistance; distance += 4) {
            for (const direction of directions) {
                const target = {
                    q: anthill.q + Math.round(direction.q * distance),
                    r: anthill.r + Math.round(direction.r * distance)
                };
                
                // Проверяем безопасность цели
                const isSafe = this.isTargetSafeForScout(target, enemyUnits, threats);
                const isUnexplored = !this.isPositionExplored(target, analysis);
                
                if (isSafe && isUnexplored) {
                    targets.push({
                        ...target,
                        distance: this.calculateDistance(unit, target),
                        safetyScore: this.calculateSafetyScore(target, enemyUnits, threats)
                    });
                }
            }
        }
        
        // Сортируем по безопасности и близости
        targets.sort((a, b) => {
            const safetyDiff = b.safetyScore - a.safetyScore;
            if (Math.abs(safetyDiff) > 0.1) return safetyDiff;
            return a.distance - b.distance;
        });
        
        return targets.slice(0, 5); // Возвращаем топ-5 целей
    }
    
    /**
     * Проверяет, безопасна ли цель для разведчика.
     * @param {Object} target - Целевая позиция
     * @param {Array} enemies - Вражеские юниты
     * @param {Array} threats - Угрозы
     * @returns {boolean} true, если цель безопасна
     */
    isTargetSafeForScout(target, enemies, threats) {
        const safeDistance = 8;
        
        // Проверяем расстояние до врагов
        const tooCloseToEnemies = enemies.some(enemy => 
            this.calculateDistance(target, enemy) < safeDistance
        );
        
        // Проверяем расстояние до угроз
        const tooCloseToThreats = threats.some(threat => 
            this.calculateDistance(target, threat.unit) < safeDistance
        );
        
        return !tooCloseToEnemies && !tooCloseToThreats;
    }
    
    /**
     * Вычисляет оценку безопасности позиции.
     * @param {Object} position - Позиция для оценки
     * @param {Array} enemies - Вражеские юниты
     * @param {Array} threats - Угрозы
     * @returns {number} Оценка безопасности (выше = безопаснее)
     */
    calculateSafetyScore(position, enemies, threats) {
        let score = 100; // Базовая оценка
        
        // Штрафуем за близость к врагам
        enemies.forEach(enemy => {
            const distance = this.calculateDistance(position, enemy);
            if (distance < 15) {
                const penalty = Math.max(0, 50 - distance * 3);
                score -= penalty;
            }
        });
        
        // Штрафуем за близость к угрозам
        threats.forEach(threat => {
            const distance = this.calculateDistance(position, threat.unit);
            if (distance < 12) {
                const penalty = Math.max(0, 40 - distance * 3);
                score -= penalty;
            }
        });
        
        return Math.max(0, score);
    }
    
    /**
     * Handles unit actions during recovery mode.
     * @param {Object} unit - Unit to handle
     * @param {Object} analysis - Game analysis
     * @param {Object} strategy - Recovery strategy
     * @param {Object} resourceAssignmentManager - Resource assignment manager
     * @returns {Object|null} Unit action or null
     */
    handleRecoveryModeUnit(unit, analysis, strategy, resourceAssignmentManager) {
        const anthill = analysis.units.anthill;
        if (!anthill) return null;
        
        const distanceToBase = this.calculateDistance(unit, anthill);
        const maxSafeDistance = strategy.resourceStrategy?.maxCollectionDistance || 15;
        
        // PRIORITY 1: Return loaded units to base immediately
        if (this.shouldReturnToAnthill(unit, analysis)) {
            logger.info(`🚨 Recovery: Unit ${unit.id} returning to base with cargo`);
            return this.returnToAnthill(unit, analysis);
        }
        
        // PRIORITY 2: Soldiers defend base perimeter only
        if (unit.type === this.unitTypes.SOLDIER) {
            // Keep soldiers close to base in recovery mode
            if (distanceToBase > 8) {
                logger.info(`🚨 Recovery: Soldier ${unit.id} returning to defensive perimeter`);
                const defensivePosition = this.getRecoveryDefensivePosition(unit, anthill);
                const path = this.findPath(unit, defensivePosition, analysis);
                
                if (path && path.length > 0) {
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'recovery_defense',
                            target: defensivePosition,
                            priority: 'high'
                        }
                    };
                }
            }
            
            // Stay in defensive position - don't patrol far
            return null;
        }
        
        // PRIORITY 3: Non-combat units - only workers collect in recovery mode
        if (unit.type === this.unitTypes.WORKER) {
            // Only collect resources very close to base
            const centralAssignment = resourceAssignmentManager.getUnitAssignment(unit.id);
            if (centralAssignment) {
                const resourceDistance = this.calculateDistance(anthill, centralAssignment.target);
                if (resourceDistance <= maxSafeDistance) {
                    logger.info(`🚨 Recovery: Worker ${unit.id} collecting safe resource at distance ${resourceDistance}`);
                    const moveResult = this.executeResourceAssignment(unit, centralAssignment, analysis, resourceAssignmentManager);
                    if (!moveResult) {
                        // Path failed - release assignment
                        logger.warn(`🚫 Recovery: Releasing assignment for unit ${unit.id} due to pathfinding failure`);
                        resourceAssignmentManager.releaseUnitAssignment(unit.id);
                    }
                    return moveResult;
                } else {
                    logger.warn(`🚨 Recovery: Worker ${unit.id} abandoning distant resource (distance ${resourceDistance} > ${maxSafeDistance})`);
                    // Release the assignment
                    resourceAssignmentManager.releaseUnitAssignment(unit.id);
                }
            }
            
            // If no safe assignment, return to base
            if (distanceToBase > 5) {
                logger.info(`🚨 Recovery: Worker ${unit.id} returning to base (distance ${distanceToBase})`);
                const path = this.findPath(unit, anthill, analysis);
                if (path && path.length > 0) {
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'recovery_return',
                            target: anthill,
                            priority: 'medium'
                        }
                    };
                }
            }
            
            return null; // Stay near base
        }
        
        // PRIORITY 4: Scouts should return to base immediately in recovery mode
        if (unit.type === this.unitTypes.SCOUT) {
            if (distanceToBase > 3) {
                logger.info(`🚨 Recovery: Scout ${unit.id} returning to base immediately`);
                const path = this.findPath(unit, anthill, analysis);
                if (path && path.length > 0) {
                    return {
                        unit_id: unit.id,
                        path: path,
                        assignment: {
                            type: 'recovery_return',
                            target: anthill,
                            priority: 'medium'
                        }
                    };
                }
            }
            
            return null; // Stay at base
        }
        
        return null;
    }
    
    /**
     * Gets a defensive position near the anthill for recovery mode.
     * @param {Object} unit - Soldier unit
     * @param {Object} anthill - Anthill position
     * @returns {Object} Defensive position
     */
    getRecoveryDefensivePosition(unit, anthill) {
        const defensiveRadius = 6;
        
        // Position soldiers in a defensive ring around the anthill
        const soldierHash = Math.abs(unit.id.charCodeAt(0)) % 8;
        const angle = (soldierHash / 8) * Math.PI * 2;
        
        return {
            q: Math.round(anthill.q + Math.cos(angle) * defensiveRadius),
            r: Math.round(anthill.r + Math.sin(angle) * defensiveRadius)
        };
    }
}

module.exports = UnitManager;