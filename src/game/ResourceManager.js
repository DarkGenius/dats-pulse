const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    FOOD_CALORIES,
    COLLECTION_EFFICIENCY 
} = require('../constants/GameConstants');

/**
 * Управляет сбором ресурсов, логистикой и оптимизацией ресурсных потоков.
 * Определяет приоритеты ресурсов, назначает юнитов, планирует маршруты и анализирует эффективность.
 */
class ResourceManager {
    /**
     * Инициализирует менеджер ресурсов с константами игры и системами отслеживания назначений.
     */
    constructor() {
        this.resourceValues = FOOD_CALORIES;
        this.collectionEfficiency = COLLECTION_EFFICIENCY;
        this.foodTypes = FOOD_TYPES;
        this.unitTypes = UNIT_TYPES;
        this.foodTypeNames = FOOD_TYPE_NAMES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        
        // Централизованная система заменяет старые resourceAssignments
        this.collectionHistory = [];
    }

    /**
     * Планирует сбор ресурсов на основе анализа игры и стратегии.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object} Объект с массивом действий по сбору ресурсов
     */
    planResourceCollection(analysis, strategy, resourceAssignmentManager) {
        return this.planResourceCollectionWithReservations(analysis, strategy, resourceAssignmentManager);
    }

    /**
     * Планирует сбор ресурсов с использованием централизованной системы резервирования.
     * @private
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Object} Объект с массивом действий по сбору ресурсов
     */
    planResourceCollectionWithReservations(analysis, strategy, resourceAssignmentManager) {
        const actions = [];
        
        // Получаем доступные юниты (не назначенные на ресурсы и не в бою)
        const availableUnits = this.getAvailableUnitsForReservation(analysis, resourceAssignmentManager);
        
        // Получаем незарезервированные ресурсы
        const availableResources = resourceAssignmentManager.getAvailableResources(analysis.resources.visible);
        
        if (availableUnits.length === 0 || availableResources.length === 0) {
            logger.info(`🚫 No resource collection: ${availableUnits.length} available units, ${availableResources.length} available resources (total units: ${analysis.units.myUnits.length}, total resources: ${analysis.resources.visible.length})`);
            if (availableUnits.length === 0 && analysis.units.myUnits.length > 0) {
                logger.info(`Units status: ${analysis.units.myUnits.map(u => `${u.id}(${this.unitTypeNames[u.type]}) - assigned: ${!!resourceAssignmentManager.getUnitAssignment(u.id)}`).join(', ')}`);
            }
            return { actions };
        }
        
        logger.info(`🔍 Resource assignment: ${availableUnits.length} available units, ${availableResources.length} available resources`);
        
        // Приоритизируем доступные ресурсы
        const prioritizedResources = this.prioritizeAvailableResources(availableResources, analysis, strategy);
        
        // Назначаем юнитов на ресурсы через систему резервирования
        prioritizedResources.forEach((resourceInfo, index) => {
            logger.debug(`Processing resource ${index + 1}/${prioritizedResources.length}: ${this.foodTypeNames[resourceInfo.resource.type]} at (${resourceInfo.resource.q}, ${resourceInfo.resource.r})`);
            
            const bestUnit = this.findBestUnitForResource(resourceInfo.resource, availableUnits, analysis);
            
            if (bestUnit) {
                logger.debug(`Found best unit ${bestUnit.id} (${this.unitTypeNames[bestUnit.type]}) for resource`);
                const priority = this.calculateReservationPriority(bestUnit, resourceInfo.resource, analysis, strategy);
                
                // Пытаемся зарезервировать ресурс
                const reserved = resourceAssignmentManager.reserveResource(
                    bestUnit.id,
                    resourceInfo.resource,
                    priority,
                    {
                        resourceType: this.foodTypeNames[resourceInfo.resource.type] || 'unknown',
                        estimatedValue: this.resourceValues[resourceInfo.resource.type] || 0,
                        distance: this.calculateDistance(bestUnit, resourceInfo.resource)
                    }
                );
                
                if (reserved) {
                    // Удаляем юнита из списка доступных
                    const unitIndex = availableUnits.findIndex(u => u.id === bestUnit.id);
                    if (unitIndex >= 0) {
                        availableUnits.splice(unitIndex, 1);
                    }
                    
                    // Создаем действие сбора ресурса
                    const gatherAction = {
                        type: 'gather',
                        unit_id: bestUnit.id,
                        resource_id: resourceInfo.resource.id,
                        resource_type: this.foodTypeNames[resourceInfo.resource.type] || 'unknown',
                        priority: priority,
                        target: resourceInfo.resource
                    };
                    
                    actions.push(gatherAction);
                    
                    logger.info(`✅ Unit ${bestUnit.id} (${this.unitTypeNames[bestUnit.type]}) assigned to collect ${gatherAction.resource_type} at (${resourceInfo.resource.q}, ${resourceInfo.resource.r}) with priority ${priority}`);
                } else {
                    logger.warn(`❌ Failed to reserve resource for unit ${bestUnit.id}: resource at (${resourceInfo.resource.q}, ${resourceInfo.resource.r}) could not be reserved`);
                }
            } else {
                logger.warn(`❌ No suitable unit found for ${this.foodTypeNames[resourceInfo.resource.type]} at (${resourceInfo.resource.q}, ${resourceInfo.resource.r})`);
            }
        });
        
        // Попытка переназначить освободившиеся ресурсы
        resourceAssignmentManager.reassignOrphanedResources(
            availableUnits,
            analysis.resources.visible,
            (unit, resource) => this.calculateReservationPriority(unit, resource, analysis, strategy)
        );
        
        // Планируем логистику
        const logisticsActions = this.planLogistics(analysis, strategy);
        actions.push(...logisticsActions);
        
        return { actions };
    }

    /**
     * Получает список доступных юнитов для назначения на сбор ресурсов.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив доступных юнитов
     */
    getAvailableUnits(analysis) {
        return analysis.units.myUnits.filter(unit => 
            !this.isUnitAssigned(unit.id) && 
            !this.isUnitInCombat(unit, analysis)
        );
    }

    /**
     * Приоритизирует ресурсы на основе ценности, расстояния, эффективности и безопасности.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Отсортированный массив ресурсов с приоритетами
     */
    prioritizeResources(analysis, strategy) {
        const resources = analysis.resources.visible;
        const resourcePriorities = [];
        
        resources.forEach(resource => {
            const priority = this.calculateResourcePriority(resource, analysis, strategy);
            resourcePriorities.push({
                resource,
                priority,
                distance: this.calculateNearestDistance(resource, analysis),
                value: this.resourceValues[resource.type] || 0,
                efficiency: this.calculateCollectionEfficiency(resource, analysis)
            });
        });
        
        return resourcePriorities.sort((a, b) => {
            const aScore = (a.priority * a.value * a.efficiency) / (a.distance + 1);
            const bScore = (b.priority * b.value * b.efficiency) / (b.distance + 1);
            return bScore - aScore;
        });
    }

    /**
     * Вычисляет приоритет конкретного ресурса на основе типа, фазы игры и безопасности.
     * @param {Object} resource - Ресурс для оценки
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {number} Числовой приоритет ресурса
     */
    calculateResourcePriority(resource, analysis, strategy) {
        let priority = 1.0;
        const phase = strategy.phase;
        
        if (resource.type === this.foodTypes.NECTAR) {
            // NECTAR is the highest priority - 60 calories per unit!
            priority *= 5.0;
            
            const distance = this.calculateNearestDistance(resource, analysis);
            if (distance <= 6) {
                priority *= 3.0; // Even higher priority if close
            }
        } else if (resource.type === this.foodTypes.BREAD) {
            // BREAD is second priority - 25 calories per unit
            priority *= 2.5;
            
            const distance = this.calculateNearestDistance(resource, analysis);
            if (distance <= 4) {
                priority *= 1.8;
            }
        } else if (resource.type === this.foodTypes.APPLE) {
            // APPLE is lowest priority - only 10 calories per unit
            priority *= 1.0;
        }
        
        // NECTAR gets additional priority bonuses in all phases
        if (resource.type === this.foodTypes.NECTAR) {
            if (phase === 'early') {
                priority *= 1.5; // Even in early game, nectar is valuable
            } else if (phase === 'mid') {
                priority *= 2.0; // Higher priority in mid game
            } else if (phase === 'late') {
                priority *= 2.5; // Maximum priority in late game
            }
        } else if (phase === 'early') {
            // In early game, also prioritize bread for steady income
            if (resource.type === this.foodTypes.BREAD) {
                priority *= 1.5;
            }
        }
        
        const safety = this.calculateResourceSafety(resource, analysis);
        priority *= safety;
        
        return priority;
    }

    /**
     * Оценивает безопасность сбора ресурса на основе близости угроз и союзников.
     * @param {Object} resource - Ресурс для оценки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Коэффициент безопасности от 0.3 до 2.0
     */
    calculateResourceSafety(resource, analysis) {
        const threats = analysis.threats.threats;
        const nearbyThreats = threats.filter(threat => 
            this.calculateDistance(resource, threat.unit) <= 5
        );
        
        const nearbyAllies = analysis.units.myUnits.filter(ally => 
            this.calculateDistance(resource, ally) <= 4
        );
        
        let safety = 1.0;
        
        if (nearbyThreats.length > 0) {
            safety *= Math.max(0.3, 1.0 - (nearbyThreats.length * 0.2));
        }
        
        if (nearbyAllies.length > 0) {
            const fighters = nearbyAllies.filter(ally => ally.type === 'fighter');
            safety *= (1.0 + fighters.length * 0.3);
        }
        
        return Math.min(safety, 2.0);
    }

    /**
     * Находит кратчайшее расстояние от ресурса до любого из моих юнитов.
     * @param {Object} resource - Ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Минимальное расстояние или Infinity если нет юнитов
     */
    calculateNearestDistance(resource, analysis) {
        const myUnits = analysis.units.myUnits;
        if (myUnits.length === 0) {
            return Infinity;
        }
        
        const distances = myUnits.map(unit => 
            this.calculateDistance(resource, unit)
        );
        
        return Math.min(...distances);
    }

    /**
     * Вычисляет эффективность сбора ресурса доступными юнитами.
     * @param {Object} resource - Ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Максимальная эффективность среди доступных юнитов
     */
    calculateCollectionEfficiency(resource, analysis) {
        // Централизованная система использует этот метод для оценки эффективности
        // Оцениваем эффективность на основе типа ресурса
        const resourceType = resource.type;
        
        // Максимальная эффективность для каждого типа ресурса
        const maxEfficiencies = {
            [this.foodTypes.NECTAR]: 1.0,  // Скауты наиболее эффективны
            [this.foodTypes.BREAD]: 0.8,   // Рабочие хороши
            [this.foodTypes.APPLE]: 0.8    // Рабочие хороши
        };
        
        return maxEfficiencies[resourceType] || 0.5;
    }

    /**
     * Назначает оптимальных юнитов для сбора конкретного ресурса.
     * @param {Object} resourceInfo - Информация о ресурсе с приоритетом
     * @param {Array} availableUnits - Доступные для назначения юниты
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Object|null} Назначение ресурса или null
     */
    assignUnitsToResource(resourceInfo, availableUnits, analysis, strategy) {
        const resource = resourceInfo.resource;
        const bestUnits = this.selectBestUnitsForResource(resource, availableUnits, analysis);
        
        if (bestUnits.length === 0) {
            return null;
        }
        
        const assignments = bestUnits.map(unit => {
            const assignment = {
                type: 'gather',
                unit_id: unit.id,
                resource_id: resource.id,
                resource_type: this.foodTypeNames[resource.type] || 'unknown',
                priority: resourceInfo.priority
            };
            this.markUnitAsAssigned(unit.id, assignment);
            return assignment;
        });
        
        return assignments;
    }

    /**
     * Выбирает лучших юнитов для сбора конкретного ресурса.
     * @param {Object} resource - Ресурс
     * @param {Array} availableUnits - Доступные юниты
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив выбранных юнитов
     */
    selectBestUnitsForResource(resource, availableUnits, analysis) {
        const unitsWithScore = availableUnits.map(unit => ({
            unit,
            score: this.calculateUnitResourceScore(unit, resource, analysis)
        }));
        
        unitsWithScore.sort((a, b) => b.score - a.score);
        
        const resourceType = resource.type;
        let unitsNeeded = 1;
        
        if (resourceType === this.foodTypes.NECTAR) {
            unitsNeeded = Math.min(2, unitsWithScore.length);
        } else if (resourceType === this.foodTypes.BREAD) {
            unitsNeeded = Math.min(3, unitsWithScore.length);
        } else {
            unitsNeeded = Math.min(4, unitsWithScore.length);
        }
        
        return unitsWithScore.slice(0, unitsNeeded).map(item => item.unit);
    }

    /**
     * Вычисляет оценку пригодности юнита для сбора конкретного ресурса.
     * @param {Object} unit - Юнит
     * @param {Object} resource - Ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Оценка пригодности юнита
     */
    calculateUnitResourceScore(unit, resource, analysis) {
        let score = 0;
        
        // CRITICAL FIX: Soldiers should not collect resources
        if (unit.type === this.unitTypes.SOLDIER) {
            logger.debug(`Unit ${unit.id}: soldier penalty (-1000)`);
            return -1000; // Heavily penalize soldiers for resource collection
        }
        
        const efficiency = this.collectionEfficiency[resource.type]?.[unit.type] || 0.5;
        score += efficiency * 10;
        
        const distance = this.calculateDistance(unit, resource);
        const distanceScore = Math.max(0, 10 - distance);
        score += distanceScore;
        
        const unitTypeName = this.unitTypeNames[unit.type];
        const cargo = this.getUnitCargoCapacity(unitTypeName);
        const cargoScore = cargo * 0.5;
        score += cargoScore;
        
        const safety = this.calculateUnitSafety(unit, resource, analysis);
        score *= safety;
        
        logger.debug(`Unit ${unit.id} (${unitTypeName}) score for ${this.foodTypeNames[resource.type]}: efficiency=${efficiency*10}, distance=${distanceScore}, cargo=${cargoScore}, safety=${safety}, final=${score}`);
        
        return score;
    }

    /**
     * Получает грузоподъёмность юнита по его типу.
     * @param {string} unitType - Тип юнита
     * @returns {number} Грузоподъёмность юнита
     */
    getUnitCargoCapacity(unitType) {
        const capacities = {
            worker: 8,
            scout: 4,
            fighter: 2
        };
        return capacities[unitType] || 2;
    }

    /**
     * Оценивает безопасность маршрута юнита к ресурсу.
     * @param {Object} unit - Юнит
     * @param {Object} resource - Целевой ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Коэффициент безопасности маршрута
     */
    calculateUnitSafety(unit, resource, analysis) {
        // TEMPORARY FIX: Return 1.0 (safe) to test if safety calculation is blocking assignments
        // TODO: Fix safety calculation properly
        return 1.0;
        
        /* Original implementation that may be too restrictive:
        const threats = analysis.threats.threats;
        const path = this.estimatePath(unit, resource);
        
        let safety = 1.0;
        
        path.forEach(point => {
            const nearbyThreats = threats.filter(threat => 
                this.calculateDistance(point, threat.unit) <= 3
            );
            
            if (nearbyThreats.length > 0) {
                safety *= Math.max(0.5, 1.0 - (nearbyThreats.length * 0.1));
            }
        });
        
        return safety;
        */
    }

    /**
     * Оценивает прямой путь от юнита к ресурсу для анализа безопасности.
     * @param {Object} unit - Исходный юнит
     * @param {Object} resource - Целевой ресурс
     * @returns {Array} Массив точек прямого пути
     */
    estimatePath(unit, resource) {
        const path = [];
        const steps = Math.max(Math.abs(unit.x - resource.x), Math.abs(unit.y - resource.y));
        
        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const x = Math.round(unit.x + (resource.x - unit.x) * progress);
            const y = Math.round(unit.y + (resource.y - unit.y) * progress);
            path.push({ x, y });
        }
        
        return path;
    }

    /**
     * Определяет стратегию сбора для группы юнитов и ресурса.
     * @param {Object} resource - Целевой ресурс
     * @param {Array} units - Назначенные юниты
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект со стратегией сбора
     */
    determineCollectionStrategy(resource, units, analysis) {
        const strategy = {
            formation: 'standard',
            protection: 'none',
            route: 'direct'
        };
        
        const distance = this.calculateNearestDistance(resource, analysis);
        const threats = analysis.threats.threats;
        
        if (distance > 8) {
            strategy.formation = 'convoy';
        }
        
        const nearbyThreats = threats.filter(threat => 
            this.calculateDistance(resource, threat.unit) <= 8
        );
        
        if (nearbyThreats.length > 0) {
            strategy.protection = 'escort';
            strategy.route = 'safe';
        }
        
        if (units.length > 3) {
            strategy.formation = 'group';
        }
        
        return strategy;
    }

    /**
     * Рассчитывает ожидаемую доходность от сбора ресурса.
     * @param {Object} resource - Ресурс
     * @param {Array} units - Юниты, назначенные на сбор
     * @returns {number} Ожидаемая доходность
     */
    calculateEstimatedYield(resource, units) {
        const baseYield = this.resourceValues[resource.type] || 0;
        const totalCapacity = units.reduce((sum, unit) => 
            sum + this.getUnitCargoCapacity(unit.type), 0
        );
        
        const efficiency = units.reduce((sum, unit) => 
            sum + (this.collectionEfficiency[resource.type]?.[unit.type] || 0.5), 0
        ) / units.length;
        
        return Math.min(baseYield, totalCapacity * efficiency);
    }

    /**
     * Планирует логистические операции: возвращение, конвои, оптимизацию потоков.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Массив логистических действий
     */
    planLogistics(analysis, strategy) {
        const actions = [];
        
        const returnActions = this.planReturnJourneys(analysis);
        actions.push(...returnActions);
        
        const convoyActions = this.planConvoyFormation(analysis, strategy);
        actions.push(...convoyActions);
        
        const optimizationActions = this.optimizeResourceFlow(analysis);
        actions.push(...optimizationActions);
        
        return actions;
    }

    /**
     * Планирует возвращение юнитов с ресурсами в муравейник.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив действий по возвращению
     */
    planReturnJourneys(analysis) {
        const actions = [];
        const myUnits = analysis.units.myUnits;
        const anthill = analysis.units.anthill;
        
        if (!anthill) {
            return actions;
        }
        
        const unitsWithResources = myUnits.filter(unit => 
            this.unitHasResources(unit)
        );
        
        unitsWithResources.forEach(unit => {
            const returnAction = {
                type: 'return_journey',
                unit: unit,
                destination: anthill,
                priority: 'high',
                estimatedValue: this.calculateUnitResourceValue(unit)
            };
            
            actions.push(returnAction);
        });
        
        return actions;
    }

    /**
     * Планирует формирование конвоев для безопасного сбора дальних ресурсов.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Массив действий по формированию конвоев
     */
    planConvoyFormation(analysis, strategy) {
        const actions = [];
        
        if (!strategy.resourceStrategy.logistics.convoyFormation) {
            return actions;
        }
        
        const workers = analysis.units.myUnits.filter(u => u.type === this.unitTypes.WORKER);
        const fighters = analysis.units.myUnits.filter(u => u.type === this.unitTypes.SOLDIER);
        
        if (workers.length >= 4 && fighters.length >= 1) {
            const convoyAction = {
                type: 'convoy_formation',
                workers: workers.slice(0, 4),
                escort: fighters.slice(0, 1),
                priority: 'medium'
            };
            
            actions.push(convoyAction);
        }
        
        return actions;
    }

    /**
     * Оптимизирует потоки ресурсов, устраняя узкие места и перегрузки.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив действий по оптимизации
     */
    optimizeResourceFlow(analysis) {
        const actions = [];
        
        const flowOptimization = this.analyzeResourceFlow(analysis);
        
        if (flowOptimization.bottlenecks.length > 0) {
            flowOptimization.bottlenecks.forEach(bottleneck => {
                const optimizationAction = {
                    type: 'flow_optimization',
                    bottleneck: bottleneck,
                    solution: this.suggestBottleneckSolution(bottleneck, analysis),
                    priority: 'low'
                };
                
                actions.push(optimizationAction);
            });
        }
        
        return actions;
    }

    /**
     * Анализирует потоки ресурсов и определяет узкие места в логистике.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект с массивом узких мест
     */
    analyzeResourceFlow(analysis) {
        const myUnits = analysis.units.myUnits;
        const anthill = analysis.units.anthill;
        const bottlenecks = [];
        
        if (!anthill) {
            return { bottlenecks };
        }
        
        const unitsNearAnthill = myUnits.filter(unit => 
            this.calculateDistance(unit, anthill) <= 3
        );
        
        if (unitsNearAnthill.length > 5) {
            bottlenecks.push({
                type: 'anthill_congestion',
                location: anthill,
                severity: Math.min(1.0, unitsNearAnthill.length / 10)
            });
        }
        
        const resourceClusters = this.identifyResourceClusters(analysis);
        resourceClusters.forEach(cluster => {
            const unitsInCluster = myUnits.filter(unit => 
                this.calculateDistance(unit, cluster.center) <= 4
            );
            
            if (unitsInCluster.length > cluster.capacity) {
                bottlenecks.push({
                    type: 'resource_congestion',
                    location: cluster.center,
                    severity: Math.min(1.0, unitsInCluster.length / cluster.capacity)
                });
            }
        });
        
        return { bottlenecks };
    }

    /**
     * Определяет кластеры ресурсов для анализа пропускной способности.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив кластеров с центрами и пропускной способностью
     */
    identifyResourceClusters(analysis) {
        const resources = analysis.resources.visible;
        const clusters = [];
        const visited = new Set();
        
        resources.forEach((resource, index) => {
            if (visited.has(index)) {
                return;
            }
            
            const cluster = {
                center: resource,
                resources: [resource],
                capacity: 2
            };
            
            visited.add(index);
            
            resources.forEach((otherResource, otherIndex) => {
                if (visited.has(otherIndex)) {
                    return;
                }
                
                const distance = this.calculateDistance(resource, otherResource);
                if (distance <= 4) {
                    cluster.resources.push(otherResource);
                    cluster.capacity += 2;
                    visited.add(otherIndex);
                }
            });
            
            if (cluster.resources.length > 1) {
                clusters.push(cluster);
            }
        });
        
        return clusters;
    }

    /**
     * Предлагает решение для устранения узкого места в логистике.
     * @param {Object} bottleneck - Описание узкого места
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект с рекомендациями по решению
     */
    suggestBottleneckSolution(bottleneck, analysis) {
        if (bottleneck.type === 'anthill_congestion') {
            return {
                type: 'stagger_returns',
                description: 'Stagger unit return times to reduce congestion'
            };
        }
        
        if (bottleneck.type === 'resource_congestion') {
            return {
                type: 'redistribute_units',
                description: 'Redistribute units to less crowded resources'
            };
        }
        
        return {
            type: 'general_optimization',
            description: 'General flow optimization needed'
        };
    }

    /**
     * Обновляет назначения ресурсов, удаляя устаревшие и недоступные.
     * @param {Object} analysis - Анализ состояния игры
     */
    updateResourceAssignments(analysis) {
        const currentTime = Date.now();
        const assignmentTimeout = 60000;
        
        for (const [resourceId, assignment] of this.resourceAssignments) {
            if (currentTime - assignment.timestamp > assignmentTimeout) {
                assignment.units.forEach(unit => {
                    this.unmarkUnitAsAssigned(unit.id);
                });
                this.resourceAssignments.delete(resourceId);
            }
        }
        
        const unavailableResources = Array.from(this.resourceAssignments.keys()).filter(
            resourceId => !this.isResourceAvailable(resourceId, analysis)
        );
        
        unavailableResources.forEach(resourceId => {
            const assignment = this.resourceAssignments.get(resourceId);
            assignment.units.forEach(unit => {
                this.unmarkUnitAsAssigned(unit.id);
            });
            this.resourceAssignments.delete(resourceId);
        });
    }

    /**
     * Проверяет, доступен ли ещё ресурс на карте.
     * @param {string} resourceId - Идентификатор ресурса
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если ресурс доступен
     */
    isResourceAvailable(resourceId, analysis) {
        return analysis.resources.visible.some(resource => 
            resource.id === resourceId
        );
    }

    /**
     * Проверяет, назначен ли юнит на сбор ресурсов.
     * @param {string} unitId - Идентификатор юнита
     * @returns {boolean} true, если юнит назначен
     */
    isUnitAssigned(unitId) {
        for (const assignment of this.resourceAssignments.values()) {
            if (assignment.units.some(unit => unit.id === unitId)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Проверяет, участвует ли юнит в бою (находится ли рядом с врагом).
     * @param {Object} unit - Юнит
     * @param {Object} analysis - Анализ состояния игры
     * @returns {boolean} true, если юнит в бою
     */
    isUnitInCombat(unit, analysis) {
        const threats = analysis.threats.threats;
        return threats.some(threat => 
            this.calculateDistance(unit, threat.unit) <= 2
        );
    }

    /**
     * Отмечает юнит как назначенный на ресурс.
     * @param {string} unitId - Идентификатор юнита
     * @param {Object} assignment - Назначение ресурса
     */
    markUnitAsAssigned(unitId, assignment) {
        assignment.timestamp = Date.now();
    }

    /**
     * Снимает отметку о назначении юнита. Пока заглушка.
     * @param {string} unitId - Идентификатор юнита
     */
    unmarkUnitAsAssigned(unitId) {
    }

    /**
     * Проверяет, есть ли у юнита ресурсы в грузовом отсеке.
     * @param {Object} unit - Юнит
     * @returns {boolean} true, если у юнита есть ресурсы
     */
    unitHasResources(unit) {
        return unit.cargo && unit.cargo > 0;
    }

    /**
     * Рассчитывает оценочную стоимость ресурсов, которые несёт юнит.
     * @param {Object} unit - Юнит с грузом
     * @returns {number} Оценочная стоимость груза
     */
    calculateUnitResourceValue(unit) {
        if (!unit.cargo || unit.cargo === 0) {
            return 0;
        }
        
        return unit.cargo * 15;
    }

    /**
     * Получает доступных юнитов для резервирования (не назначенных и не в бою).
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} resourceAssignmentManager - Менеджер назначений ресурсов
     * @returns {Array} Массив доступных юнитов
     */
    getAvailableUnitsForReservation(analysis, resourceAssignmentManager) {
        // CRITICAL FIX: Only workers (type 1) and scouts (type 3) should collect resources
        // Soldiers (type 2) should focus on combat
        const allNonSoldiers = analysis.units.myUnits.filter(unit => unit.type !== this.unitTypes.SOLDIER);
        const availableUnits = allNonSoldiers.filter(unit => {
            const hasAssignment = !!resourceAssignmentManager.getUnitAssignment(unit.id);
            const inCombat = this.isUnitInCombat(unit, analysis);
            
            if (hasAssignment || inCombat) {
                logger.debug(`Unit ${unit.id} (${this.unitTypeNames[unit.type]}) unavailable: assignment=${hasAssignment}, inCombat=${inCombat}`);
            }
            
            return !hasAssignment && !inCombat;
        });
        
        logger.debug(`Available units for resource collection: ${availableUnits.length}/${allNonSoldiers.length} (excluded ${analysis.units.myUnits.length - allNonSoldiers.length} soldiers)`);
        return availableUnits;
    }

    /**
     * Приоритизирует доступные ресурсы.
     * @param {Array} resources - Доступные ресурсы
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Отсортированный массив ресурсов с приоритетами
     */
    prioritizeAvailableResources(resources, analysis, strategy) {
        const resourcePriorities = [];
        
        resources.forEach(resource => {
            const priority = this.calculateResourcePriority(resource, analysis, strategy);
            resourcePriorities.push({
                resource,
                priority,
                distance: this.calculateNearestDistance(resource, analysis),
                value: this.resourceValues[resource.type] || 0,
                efficiency: this.calculateCollectionEfficiency(resource, analysis)
            });
        });
        
        return resourcePriorities.sort((a, b) => {
            const aScore = (a.priority * a.value * a.efficiency) / (a.distance + 1);
            const bScore = (b.priority * b.value * b.efficiency) / (b.distance + 1);
            return bScore - aScore;
        });
    }

    /**
     * Находит лучшего юнита для сбора конкретного ресурса.
     * @param {Object} resource - Ресурс
     * @param {Array} availableUnits - Доступные юниты
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Лучший юнит или null
     */
    findBestUnitForResource(resource, availableUnits, analysis) {
        if (availableUnits.length === 0) return null;
        
        let bestUnit = null;
        let bestScore = -1;
        
        availableUnits.forEach(unit => {
            const score = this.calculateUnitResourceScore(unit, resource, analysis);
            if (score > bestScore) {
                bestScore = score;
                bestUnit = unit;
            }
        });
        
        return bestUnit;
    }

    /**
     * Вычисляет приоритет резервирования ресурса для юнита.
     * @param {Object} unit - Юнит
     * @param {Object} resource - Ресурс
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {number} Приоритет резервирования
     */
    calculateReservationPriority(unit, resource, analysis, strategy) {
        let priority = this.calculateResourcePriority(resource, analysis, strategy);
        
        // Учитываем эффективность юнита для данного ресурса
        const efficiency = this.collectionEfficiency[resource.type]?.[unit.type] || 0.5;
        priority *= efficiency;
        
        // Учитываем расстояние
        const distance = this.calculateDistance(unit, resource);
        priority = priority / Math.max(1, distance * 0.1);
        
        // Бонус за совместимость типа ресурса с грузом юнита
        if (unit.food && unit.food.type === resource.type) {
            priority *= 1.5; // Бонус за совместимость типа ресурса
        } else if (unit.food && unit.food.type !== resource.type) {
            priority *= 0.3; // Штраф за несовместимость типа ресурса
        }
        
        return Math.round(priority * 100) / 100; // Округляем до 2 знаков
    }

    /**
     * Вычисляет расстояние между двумя позициями в гексагональной системе координат.
     * @param {Object} pos1 - Первая позиция с координатами x, y
     * @param {Object} pos2 - Вторая позиция с координатами x, y
     * @returns {number} Расстояние в гексагональных клетках или Infinity при ошибке
     */
    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        
        return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
    }
}

module.exports = ResourceManager;