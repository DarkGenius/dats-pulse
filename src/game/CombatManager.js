const logger = require('../utils/Logger');
const { 
    UNIT_TYPES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');

/**
 * Управляет боевыми операциями, формированиями и тактикой.
 * Определяет боевые строи, планирует атаки и оборону, анализирует угрозы и определяет оптимальные тактики.
 */
class CombatManager {
    /**
     * Инициализирует менеджер боёв с константами игры, формированиями и тактикой.
     */
    constructor() {
        this.unitTypes = UNIT_TYPES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        this.unitStats = UNIT_STATS;
        this.formations = {
            TRILEAF: 'trileaf',
            CONCENTRIC: 'concentric',
            LINE: 'line',
            WEDGE: 'wedge',
            DEFENSIVE_RING: 'defensive_ring'
        };
        
        this.tactics = {
            AGGRESSIVE: 'aggressive',
            DEFENSIVE: 'defensive',
            HIT_AND_RUN: 'hit_and_run',
            AMBUSH: 'ambush',
            RETREAT: 'retreat'
        };
        
        this.combatHistory = [];
        this.activeEngagements = new Map();
    }

    /**
     * Планирует комплексные боевые действия на основе анализа и стратегии.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Object} Объект с массивом боевых действий
     */
    planCombatActions(analysis, strategy) {
        const actions = [];
        
        this.updateActiveEngagements(analysis);
        
        const combatSituations = this.analyzeCombatSituations(analysis);
        const formationActions = this.planFormations(analysis, strategy);
        const tacticalActions = this.planTacticalActions(analysis, strategy);
        const targetingActions = this.planTargeting(analysis, strategy);
        
        actions.push(...formationActions);
        actions.push(...tacticalActions);
        actions.push(...targetingActions);
        
        return { actions };
    }

    /**
     * Анализирует текущие боевые ситуации и определяет угрозы.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив боевых ситуаций
     */
    analyzeCombatSituations(analysis) {
        const situations = [];
        const myUnits = analysis.units.myUnits;
        const enemyUnits = analysis.units.enemyUnits;
        
        enemyUnits.forEach(enemy => {
            const nearbyAllies = myUnits.filter(ally => 
                this.calculateDistance(ally, enemy) <= 5
            );
            
            if (nearbyAllies.length > 0) {
                situations.push({
                    type: 'engagement',
                    enemy: enemy,
                    allies: nearbyAllies,
                    advantage: this.calculateCombatAdvantage(nearbyAllies, [enemy])
                });
            }
        });
        
        const anthillThreats = this.identifyAnthillThreats(analysis);
        if (anthillThreats.length > 0) {
            situations.push({
                type: 'anthill_defense',
                threats: anthillThreats,
                defenders: this.getAnthillDefenders(analysis)
            });
        }
        
        return situations;
    }

    /**
     * Планирует боевые формирования на основе стратегической ситуации.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Массив действий по формированию боевых порядков
     */
    planFormations(analysis, strategy) {
        const actions = [];
        const combatReadiness = strategy.combatStrategy.readiness;
        
        // Функция для преобразования формирования в отдельные действия для каждого юнита
        const expandFormation = (formation) => {
            if (!formation || !formation.units) {
                return [];
            }
            
            return formation.units.map(unit => ({
                type: 'formation_action',
                formation: formation.formation,
                unit_id: unit.id,
                position: formation.positions ? formation.positions[unit.id] : null,
                priority: formation.priority || 'medium'
            }));
        };
        
        if (combatReadiness.recommendation === 'attack') {
            const offensiveFormation = this.planOffensiveFormation(analysis);
            if (offensiveFormation) {
                actions.push(...expandFormation(offensiveFormation));
            }
        } else if (combatReadiness.recommendation === 'hold') {
            const defensiveFormation = this.planDefensiveFormation(analysis);
            if (defensiveFormation) {
                actions.push(...expandFormation(defensiveFormation));
            }
        }
        
        const immediateThreats = analysis.threats.immediateThreats;
        if (immediateThreats.length > 0) {
            const emergencyFormation = this.planEmergencyFormation(analysis);
            if (emergencyFormation) {
                actions.push(...expandFormation(emergencyFormation));
            }
        }
        
        return actions;
    }

    /**
     * Планирует наступательное формирование для атаки.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Наступательное формирование или null
     */
    planOffensiveFormation(analysis) {
        const fighters = analysis.units.myUnits.filter(u => u.type === this.unitTypes.SOLDIER);
        const scouts = analysis.units.myUnits.filter(u => u.type === this.unitTypes.SCOUT);
        
        if (fighters.length >= 3 && scouts.length >= 2) {
            return this.createTrileafFormation(fighters, scouts, analysis);
        }
        
        if (fighters.length >= 2) {
            return this.createWedgeFormation(fighters, analysis);
        }
        
        return null;
    }

    /**
     * Планирует оборонительное формирование для защиты.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Оборонительное формирование или null
     */
    planDefensiveFormation(analysis) {
        const allCombatUnits = analysis.units.myUnits.filter(u => 
            u.type === this.unitTypes.SOLDIER || u.type === this.unitTypes.SCOUT
        );
        
        if (allCombatUnits.length >= 4) {
            return this.createConcentricFormation(allCombatUnits, analysis);
        }
        
        return this.createDefensiveRing(allCombatUnits, analysis);
    }

    /**
     * Планирует чрезвычайное оборонительное формирование при непосредственной угрозе.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Чрезвычайное оборонительное формирование или null
     */
    planEmergencyFormation(analysis) {
        const allUnits = analysis.units.myUnits;
        const anthill = analysis.units.anthill;
        
        if (!anthill) {
            return null;
        }
        
        return {
            type: 'emergency_defense',
            formation: this.formations.DEFENSIVE_RING,
            units: allUnits,
            center: anthill,
            priority: 'critical',
            positions: this.calculateDefensivePositions(allUnits, anthill)
        };
    }

    /**
     * Создаёт формирование "трёхлистник" - оффенсивное построение с бойцами в центре и разведчиками на флангах.
     * @param {Array} fighters - Массив боевых юнитов
     * @param {Array} scouts - Массив разведчиков
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект формирования "трёхлистник" или null
     */
    createTrileafFormation(fighters, scouts, analysis) {
        const targets = this.identifyOffensiveTargets(analysis);
        if (targets.length === 0) {
            return null;
        }
        
        const primaryTarget = targets[0];
        const formationCenter = this.calculateFormationCenter(primaryTarget, analysis);
        
        const positions = this.calculateTrileafPositions(formationCenter, fighters, scouts);
        
        return {
            type: 'offensive_formation',
            formation: this.formations.TRILEAF,
            units: [...fighters.slice(0, 3), ...scouts.slice(0, 2)],
            target: primaryTarget,
            center: formationCenter,
            positions: positions,
            priority: 'high'
        };
    }

    /**
     * Создаёт клиновидное формирование для пробива вражеских линий.
     * @param {Array} fighters - Массив боевых юнитов
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект клиновидного формирования или null
     */
    createWedgeFormation(fighters, analysis) {
        const targets = this.identifyOffensiveTargets(analysis);
        if (targets.length === 0) {
            return null;
        }
        
        const primaryTarget = targets[0];
        const formationTip = this.calculateWedgeTip(primaryTarget, analysis);
        
        const positions = this.calculateWedgePositions(formationTip, fighters);
        
        return {
            type: 'offensive_formation',
            formation: this.formations.WEDGE,
            units: fighters.slice(0, Math.min(4, fighters.length)),
            target: primaryTarget,
            tip: formationTip,
            positions: positions,
            priority: 'high'
        };
    }

    /**
     * Создаёт концентрическое оборонительное формирование с несколькими кольцами обороны.
     * @param {Array} units - Массив всех боевых юнитов
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект концентрического формирования или null
     */
    createConcentricFormation(units, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return null;
        }
        
        const rings = this.organizeConcentricRings(units, anthill);
        
        return {
            type: 'defensive_formation',
            formation: this.formations.CONCENTRIC,
            units: units,
            center: anthill,
            rings: rings,
            priority: 'medium'
        };
    }

    /**
     * Создаёт оборонительное кольцо вокруг муравейника.
     * @param {Array} units - Массив обороняющих юнитов
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект оборонительного кольца или null
     */
    createDefensiveRing(units, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return null;
        }
        
        const ringPositions = this.calculateDefensiveRingPositions(anthill, units.length);
        
        return {
            type: 'defensive_formation',
            formation: this.formations.DEFENSIVE_RING,
            units: units,
            center: anthill,
            positions: ringPositions,
            priority: 'medium'
        };
    }

    /**
     * Вычисляет позиции юнитов в формировании "трёхлистник".
     * @param {Object} center - Центральная позиция формирования
     * @param {Array} fighters - Массив боевых юнитов
     * @param {Array} scouts - Массив разведчиков
     * @returns {Array} Массив позиций юнитов с ролями
     */
    calculateTrileafPositions(center, fighters, scouts) {
        const positions = [];
        
        const fighterPositions = [
            { x: center.x - 1, y: center.y + 1 },
            { x: center.x, y: center.y },
            { x: center.x + 1, y: center.y + 1 }
        ];
        
        const scoutPositions = [
            { x: center.x - 2, y: center.y },
            { x: center.x + 2, y: center.y }
        ];
        
        fighters.slice(0, 3).forEach((fighter, index) => {
            if (fighterPositions[index]) {
                positions.push({
                    unit: fighter,
                    position: fighterPositions[index],
                    role: 'assault'
                });
            }
        });
        
        scouts.slice(0, 2).forEach((scout, index) => {
            if (scoutPositions[index]) {
                positions.push({
                    unit: scout,
                    position: scoutPositions[index],
                    role: 'flanking'
                });
            }
        });
        
        return positions;
    }

    /**
     * Вычисляет позиции юнитов в клиновидном формировании.
     * @param {Object} tip - Остриё клина
     * @param {Array} fighters - Массив боевых юнитов
     * @returns {Array} Массив позиций юнитов с ролями
     */
    calculateWedgePositions(tip, fighters) {
        const positions = [];
        
        const wedgePositions = [
            tip,
            { x: tip.x - 1, y: tip.y - 1 },
            { x: tip.x + 1, y: tip.y - 1 },
            { x: tip.x - 2, y: tip.y - 2 },
            { x: tip.x + 2, y: tip.y - 2 }
        ];
        
        fighters.forEach((fighter, index) => {
            if (wedgePositions[index]) {
                positions.push({
                    unit: fighter,
                    position: wedgePositions[index],
                    role: index === 0 ? 'spearhead' : 'support'
                });
            }
        });
        
        return positions;
    }

    /**
     * Организует юниты в концентрические кольца обороны.
     * @param {Array} units - Массив всех доступных юнитов
     * @param {Object} center - Центр обороны (муравейник)
     * @returns {Object} Объект с кольцами обороны
     */
    organizeConcentricRings(units, center) {
        const rings = {
            inner: [],
            middle: [],
            outer: []
        };
        
        const fighters = units.filter(u => u.type === this.unitTypes.SOLDIER);
        const scouts = units.filter(u => u.type === this.unitTypes.SCOUT);
        const workers = units.filter(u => u.type === this.unitTypes.WORKER);
        
        rings.inner = fighters.slice(0, 6).map(fighter => ({
            unit: fighter,
            position: this.calculateRingPosition(center, 2, rings.inner.length),
            role: 'primary_defense'
        }));
        
        rings.middle = [...fighters.slice(6), ...scouts.slice(0, 4)].map(unit => ({
            unit: unit,
            position: this.calculateRingPosition(center, 4, rings.middle.length),
            role: 'secondary_defense'
        }));
        
        rings.outer = [...scouts.slice(4), ...workers].map(unit => ({
            unit: unit,
            position: this.calculateRingPosition(center, 6, rings.outer.length),
            role: 'early_warning'
        }));
        
        return rings;
    }

    /**
     * Вычисляет позицию юнита на кольце заданного радиуса.
     * @param {Object} center - Центр кольца
     * @param {number} radius - Радиус кольца
     * @param {number} unitIndex - Индекс юнита на кольце
     * @returns {Object} Позиция юнита с координатами x, y
     */
    calculateRingPosition(center, radius, unitIndex) {
        const angle = (unitIndex * 2 * Math.PI) / 8;
        return {
            x: Math.round(center.x + radius * Math.cos(angle)),
            y: Math.round(center.y + radius * Math.sin(angle))
        };
    }

    /**
     * Вычисляет позиции для оборонительного кольца.
     * @param {Object} center - Центр обороны
     * @param {number} unitCount - Количество юнитов
     * @returns {Array} Массив позиций
     */
    calculateDefensiveRingPositions(center, unitCount) {
        const positions = [];
        const radius = 3;
        
        for (let i = 0; i < unitCount; i++) {
            const angle = (i * 2 * Math.PI) / unitCount;
            positions.push({
                x: Math.round(center.x + radius * Math.cos(angle)),
                y: Math.round(center.y + radius * Math.sin(angle))
            });
        }
        
        return positions;
    }

    /**
     * Вычисляет оборонительные позиции для конкретных юнитов.
     * @param {Array} units - Массив обороняющих юнитов
     * @param {Object} center - Центр обороны
     * @returns {Array} Массив позиций с назначенными юнитами
     */
    calculateDefensivePositions(units, center) {
        const positions = [];
        const radius = 2;
        
        units.forEach((unit, index) => {
            const angle = (index * 2 * Math.PI) / units.length;
            positions.push({
                unit: unit,
                position: {
                    x: Math.round(center.x + radius * Math.cos(angle)),
                    y: Math.round(center.y + radius * Math.sin(angle))
                },
                role: 'defender'
            });
        });
        
        return positions;
    }

    /**
     * Планирует тактические действия на основе боевой готовности.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия игры
     * @returns {Array} Массив тактических действий
     */
    planTacticalActions(analysis, strategy) {
        const actions = [];
        const combatReadiness = strategy.combatStrategy.readiness;
        
        if (combatReadiness.recommendation === 'attack') {
            const attackActions = this.planAttackTactics(analysis, strategy);
            actions.push(...attackActions);
        } else if (combatReadiness.recommendation === 'retreat') {
            const retreatActions = this.planRetreatTactics(analysis);
            actions.push(...retreatActions);
        } else {
            const holdActions = this.planHoldTactics(analysis);
            actions.push(...holdActions);
        }
        
        return actions;
    }

    /**
     * Планирует наступательные тактики для каждой цели.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия с целями для атаки
     * @returns {Array} Массив наступательных действий
     */
    planAttackTactics(analysis, strategy) {
        const actions = [];
        const targets = strategy.combatStrategy.targets;
        
        targets.forEach(target => {
            const tactic = this.selectAttackTactic(target, analysis);
            
            if (tactic && tactic.units) {
                // Создаем отдельное действие для каждого юнита
                tactic.units.forEach(unit => {
                    actions.push({
                        type: 'tactical_action',
                        tactic: tactic.type,
                        target: target.unit,
                        unit_id: unit.id,
                        plan: tactic.plan,
                        priority: 'high'
                    });
                });
            }
        });
        
        return actions;
    }

    /**
     * Планирует тактику отступления всех юнитов в муравейник.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив действий по отступлению
     */
    planRetreatTactics(analysis) {
        const actions = [];
        const myUnits = analysis.units.myUnits;
        const anthill = analysis.units.anthill;
        
        if (!anthill) {
            return actions;
        }
        
        const retreatPlan = this.createRetreatPlan(myUnits, anthill, analysis);
        
        // Создаем отдельное действие для каждого юнита
        myUnits.forEach(unit => {
            actions.push({
                type: 'tactical_action',
                tactic: this.tactics.RETREAT,
                unit_id: unit.id,
                plan: retreatPlan,
                priority: 'critical'
            });
        });
        
        return actions;
    }

    /**
     * Планирует тактику удержания позиций без атаки.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив действий по удержанию позиций
     */
    planHoldTactics(analysis) {
        const actions = [];
        const combatUnits = analysis.units.myUnits.filter(u => 
            u.type === this.unitTypes.SOLDIER || u.type === this.unitTypes.SCOUT
        );
        
        if (combatUnits.length === 0) {
            return actions;
        }
        
        const holdingPositions = this.calculateHoldingPositions(combatUnits, analysis);
        
        // Создаем отдельное действие для каждого боевого юнита
        combatUnits.forEach(unit => {
            actions.push({
                type: 'tactical_action',
                tactic: this.tactics.DEFENSIVE,
                unit_id: unit.id,
                plan: {
                    type: 'hold_position',
                    position: holdingPositions[unit.id] || null
                },
                priority: 'medium'
            });
        });
        
        return actions;
    }

    /**
     * Выбирает оптимальную атакующую тактику на основе боевого превосходства.
     * @param {Object} target - Цель для атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект с тактикой атаки или null
     */
    selectAttackTactic(target, analysis) {
        const targetUnit = target.unit;
        const availableUnits = this.getAvailableAttackUnits(targetUnit, analysis);
        
        if (availableUnits.length === 0) {
            return null;
        }
        
        const combatAdvantage = this.calculateCombatAdvantage(availableUnits, [targetUnit]);
        
        if (combatAdvantage > 2.0) {
            return this.createDirectAssault(availableUnits, targetUnit, analysis);
        } else if (combatAdvantage > 1.2) {
            return this.createCoordinatedAttack(availableUnits, targetUnit, analysis);
        } else {
            return this.createHitAndRun(availableUnits, targetUnit, analysis);
        }
    }

    /**
     * Создаёт тактику прямого штурма при значительном превосходстве.
     * @param {Array} units - Массив атакующих юнитов
     * @param {Object} target - Цель атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект тактики прямого штурма
     */
    createDirectAssault(units, target, analysis) {
        return {
            type: this.tactics.AGGRESSIVE,
            units: units,
            plan: {
                type: 'direct_assault',
                target: target,
                approach: 'frontal',
                coordination: 'simultaneous'
            }
        };
    }

    /**
     * Создаёт тактику координированной атаки с основными силами и фланговыми манёврами.
     * @param {Array} units - Массив атакующих юнитов
     * @param {Object} target - Цель атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект тактики координированной атаки
     */
    createCoordinatedAttack(units, target, analysis) {
        const fighters = units.filter(u => u.type === this.unitTypes.SOLDIER);
        const scouts = units.filter(u => u.type === this.unitTypes.SCOUT);
        
        return {
            type: this.tactics.AGGRESSIVE,
            units: units,
            plan: {
                type: 'coordinated_attack',
                target: target,
                mainForce: fighters,
                flankers: scouts,
                coordination: 'sequential'
            }
        };
    }

    /**
     * Создаёт тактику "удари-отступи" для слабых сил или равных по силе.
     * @param {Array} units - Массив атакующих юнитов
     * @param {Object} target - Цель атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект тактики "удари-отступи"
     */
    createHitAndRun(units, target, analysis) {
        const fastUnits = units.filter(u => u.type === this.unitTypes.SCOUT);
        
        return {
            type: this.tactics.HIT_AND_RUN,
            units: fastUnits.length > 0 ? fastUnits : units,
            plan: {
                type: 'hit_and_run',
                target: target,
                approach: 'mobile',
                retreatPath: this.calculateRetreatPath(target, analysis)
            }
        };
    }

    /**
     * Создаёт организованный план отступления с маршрутами и прикрытием.
     * @param {Array} units - Массив отступающих юнитов
     * @param {Object} anthill - Муравейник (место назначения)
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Объект плана отступления
     */
    createRetreatPlan(units, anthill, analysis) {
        const retreatRoutes = this.calculateRetreatRoutes(units, anthill, analysis);
        
        return {
            type: 'organized_retreat',
            destination: anthill,
            routes: retreatRoutes,
            rearguard: this.selectRearguard(units),
            phases: this.calculateRetreatPhases(units, anthill)
        };
    }

    /**
     * Планирует нацеливание и распределение юнитов по целям.
     * @param {Object} analysis - Анализ состояния игры
     * @param {Object} strategy - Стратегия с целями
     * @returns {Array} Массив действий по нацеливанию
     */
    planTargeting(analysis, strategy) {
        const actions = [];
        const targets = strategy.combatStrategy.targets;
        
        targets.forEach(target => {
            const targetingActions = this.createTargetingAction(target, analysis);
            if (targetingActions) {
                actions.push(...targetingActions); // Разворачиваем массив действий
            }
        });
        
        return actions;
    }

    /**
     * Создаёт действие по нацеливанию на конкретную цель.
     * @param {Object} target - Цель для атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object|null} Объект действия по нацеливанию или null
     */
    createTargetingAction(target, analysis) {
        const assignedUnits = this.assignUnitsToTarget(target, analysis);
        
        if (assignedUnits.length === 0) {
            return null;
        }
        
        // Создаем отдельные действия для каждого назначенного юнита
        const actions = [];
        assignedUnits.forEach(unit => {
            actions.push({
                type: 'targeting_action',
                target: target.unit,
                unit_id: unit.id,
                priority: this.calculateTargetPriority(target, analysis),
                approach: this.determineApproach(target, [unit], analysis)
            });
        });
        
        return actions; // Возвращаем массив действий
    }

    /**
     * Назначает юниты для атаки конкретной цели.
     * @param {Object} target - Цель для атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив назначенных на цель юнитов
     */
    assignUnitsToTarget(target, analysis) {
        const availableUnits = this.getAvailableAttackUnits(target.unit, analysis);
        const requiredForce = this.calculateRequiredForce(target.unit);
        
        const assignedUnits = availableUnits.slice(0, requiredForce);
        return assignedUnits;
    }

    /**
     * Рассчитывает количество юнитов, необходимых для эффективной атаки цели.
     * @param {Object} targetUnit - Целевой юнит
     * @returns {number} Количество юнитов для атаки
     */
    calculateRequiredForce(targetUnit) {
        const targetStrength = this.getUnitStrength(targetUnit);
        
        if (targetStrength > 60) {
            return 3;
        } else if (targetStrength > 30) {
            return 2;
        } else {
            return 1;
        }
    }

    /**
     * Получает боевую мощь юнита.
     * @param {Object} unit - Юнит
     * @returns {number} Боевая мощь юнита
     */
    getUnitStrength(unit) {
        const unitStats = this.unitStats[unit.type];
        return unitStats ? unitStats.attack : 25;
    }

    /**
     * Вычисляет боевое превосходство союзников над противниками.
     * @param {Array} allies - Массив союзных юнитов
     * @param {Array} enemies - Массив вражеских юнитов
     * @returns {number} Коэффициент превосходства
     */
    calculateCombatAdvantage(allies, enemies) {
        const allyStrength = allies.reduce((sum, ally) => sum + this.getUnitStrength(ally), 0);
        const enemyStrength = enemies.reduce((sum, enemy) => sum + this.getUnitStrength(enemy), 0);
        
        return enemyStrength > 0 ? allyStrength / enemyStrength : 2.0;
    }

    /**
     * Определяет вражеские юниты, подходящие для наступательных операций.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив подходящих для атаки вражеских юнитов
     */
    identifyOffensiveTargets(analysis) {
        const enemyUnits = analysis.units.enemyUnits;
        const myUnits = analysis.units.myUnits;
        
        return enemyUnits.filter(enemy => {
            const nearbyAllies = myUnits.filter(ally => 
                this.calculateDistance(ally, enemy) <= 8
            );
            
            const advantage = this.calculateCombatAdvantage(nearbyAllies, [enemy]);
            return advantage > 1.0;
        });
    }

    /**
     * Определяет вражеские юниты, представляющие угрозу муравейнику.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив вражеских юнитов рядом с муравейником
     */
    identifyAnthillThreats(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }
        
        return analysis.units.enemyUnits.filter(enemy => 
            this.calculateDistance(anthill, enemy) <= 6
        );
    }

    /**
     * Получает список юнитов, способных защищать муравейник.
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив юнитов в радиусе защиты муравейника
     */
    getAnthillDefenders(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }
        
        return analysis.units.myUnits.filter(unit => 
            this.calculateDistance(anthill, unit) <= 8
        );
    }

    /**
     * Получает список юнитов, доступных для атаки конкретной цели.
     * @param {Object} target - Цель для атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив боеспособных и свободных юнитов
     */
    getAvailableAttackUnits(target, analysis) {
        const myUnits = analysis.units.myUnits;
        
        return myUnits.filter(unit => {
            const distance = this.calculateDistance(unit, target);
            const isCombatCapable = unit.type === this.unitTypes.SOLDIER || unit.type === this.unitTypes.SCOUT;
            const isNotBusy = !this.isUnitBusy(unit);
            
            return distance <= 10 && isCombatCapable && isNotBusy;
        });
    }

    /**
     * Проверяет, занят ли юнит активным боем.
     * @param {Object} unit - Юнит
     * @returns {boolean} true, если юнит в активном бою
     */
    isUnitBusy(unit) {
        return this.activeEngagements.has(unit.id);
    }

    /**
     * Вычисляет оптимальный центр формирования между муравейником и целью.
     * @param {Object} target - Цель атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Координаты центра формирования
     */
    calculateFormationCenter(target, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return target;
        }
        
        const midpoint = {
            x: Math.round((anthill.x + target.x) / 2),
            y: Math.round((anthill.y + target.y) / 2)
        };
        
        return midpoint;
    }

    /**
     * Вычисляет позицию острия клиновидного формирования.
     * @param {Object} target - Цель атаки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Object} Координаты острия клина
     */
    calculateWedgeTip(target, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return target;
        }
        
        const direction = {
            x: target.x - anthill.x,
            y: target.y - anthill.y
        };
        
        const normalizedDirection = this.normalizeDirection(direction);
        
        return {
            x: Math.round(anthill.x + normalizedDirection.x * 4),
            y: Math.round(anthill.y + normalizedDirection.y * 4)
        };
    }

    /**
     * Нормализует вектор направления до единичной длины.
     * @param {Object} direction - Вектор направления с компонентами x, y
     * @returns {Object} Нормализованный вектор
     */
    normalizeDirection(direction) {
        const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
        
        if (magnitude === 0) {
            return { x: 0, y: 0 };
        }
        
        return {
            x: direction.x / magnitude,
            y: direction.y / magnitude
        };
    }

    /**
     * Вычисляет путь отступления от цели в сторону муравейника.
     * @param {Object} target - Позиция, от которой отступать
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив точек пути отступления
     */
    calculateRetreatPath(target, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }
        
        const direction = {
            x: anthill.x - target.x,
            y: anthill.y - target.y
        };
        
        const normalizedDirection = this.normalizeDirection(direction);
        
        return [
            {
                x: Math.round(target.x + normalizedDirection.x * 2),
                y: Math.round(target.y + normalizedDirection.y * 2)
            },
            {
                x: Math.round(target.x + normalizedDirection.x * 4),
                y: Math.round(target.y + normalizedDirection.y * 4)
            }
        ];
    }

    /**
     * Рассчитывает безопасные маршруты отступления для каждого юнита.
     * @param {Array} units - Массив отступающих юнитов
     * @param {Object} anthill - Муравейник (место назначения)
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив маршрутов с назначенными юнитами
     */
    calculateRetreatRoutes(units, anthill, analysis) {
        const routes = [];
        
        units.forEach(unit => {
            const route = this.calculateSafestPath(unit, anthill, analysis);
            routes.push({
                unit: unit,
                path: route
            });
        });
        
        return routes;
    }

    /**
     * Находит наиболее безопасный путь от юнита к месту назначения.
     * @param {Object} unit - Исходный юнит
     * @param {Object} destination - Место назначения
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Наиболее безопасный путь
     */
    calculateSafestPath(unit, destination, analysis) {
        const threats = analysis.threats.threats;
        const directPath = this.calculateDirectPath(unit, destination);
        
        let safestPath = directPath;
        let minThreatLevel = this.calculatePathThreatLevel(directPath, threats);
        
        const alternativePaths = this.generateAlternativePaths(unit, destination);
        
        alternativePaths.forEach(path => {
            const threatLevel = this.calculatePathThreatLevel(path, threats);
            if (threatLevel < minThreatLevel) {
                safestPath = path;
                minThreatLevel = threatLevel;
            }
        });
        
        return safestPath;
    }

    /**
     * Вычисляет прямой путь между двумя точками.
     * @param {Object} start - Начальная точка
     * @param {Object} end - Конечная точка
     * @returns {Array} Массив точек прямого пути
     */
    calculateDirectPath(start, end) {
        const path = [];
        let current = { x: start.x, y: start.y };
        
        while (current.x !== end.x || current.y !== end.y) {
            const dx = Math.sign(end.x - current.x);
            const dy = Math.sign(end.y - current.y);
            
            current = {
                x: current.x + dx,
                y: current.y + dy
            };
            
            path.push({ x: current.x, y: current.y });
        }
        
        return path;
    }

    /**
     * Генерирует альтернативные пути с обходом потенциальных опасностей.
     * @param {Object} start - Начальная точка
     * @param {Object} end - Конечная точка
     * @returns {Array} Массив альтернативных маршрутов
     */
    generateAlternativePaths(start, end) {
        const paths = [];
        
        const detourPoint1 = {
            x: start.x + 2,
            y: start.y + 2
        };
        
        const detourPoint2 = {
            x: start.x - 2,
            y: start.y - 2
        };
        
        const path1 = [
            ...this.calculateDirectPath(start, detourPoint1),
            ...this.calculateDirectPath(detourPoint1, end)
        ];
        
        const path2 = [
            ...this.calculateDirectPath(start, detourPoint2),
            ...this.calculateDirectPath(detourPoint2, end)
        ];
        
        paths.push(path1, path2);
        
        return paths;
    }

    /**
     * Оценивает уровень угрозы на маршруте.
     * @param {Array} path - Массив точек маршрута
     * @param {Array} threats - Массив угроз
     * @returns {number} Общий уровень угрозы на маршруте
     */
    calculatePathThreatLevel(path, threats) {
        let threatLevel = 0;
        
        path.forEach(point => {
            threats.forEach(threat => {
                const distance = this.calculateDistance(point, threat.unit);
                if (distance <= 3) {
                    threatLevel += 1.0 / (distance + 1);
                }
            });
        });
        
        return threatLevel;
    }

    /**
     * Выбирает юниты для прикрытия отступления.
     * @param {Array} units - Массив всех отступающих юнитов
     * @returns {Array} Массив юнитов для прикрытия
     */
    selectRearguard(units) {
        const fighters = units.filter(u => u.type === 'fighter');
        const scouts = units.filter(u => u.type === 'scout');
        
        return [...fighters.slice(0, 2), ...scouts.slice(0, 1)];
    }

    /**
     * Рассчитывает фазы отступления для организованного отхода.
     * @param {Array} units - Массив отступающих юнитов
     * @param {Object} anthill - Муравейник (место назначения)
     * @returns {Array} Массив фаз отступления
     */
    calculateRetreatPhases(units, anthill) {
        const phases = [];
        const unitGroups = this.groupUnitsForRetreat(units);
        
        unitGroups.forEach((group, index) => {
            phases.push({
                phase: index + 1,
                units: group,
                timing: index * 2,
                destination: anthill
            });
        });
        
        return phases;
    }

    /**
     * Группирует юниты для поэтапного отступления.
     * @param {Array} units - Массив отступающих юнитов
     * @returns {Array} Массив групп юнитов
     */
    groupUnitsForRetreat(units) {
        const groups = [];
        const groupSize = 3;
        
        for (let i = 0; i < units.length; i += groupSize) {
            groups.push(units.slice(i, i + groupSize));
        }
        
        return groups;
    }

    /**
     * Вычисляет оборонительные позиции для удержания.
     * @param {Array} units - Массив обороняющих юнитов
     * @param {Object} analysis - Анализ состояния игры
     * @returns {Array} Массив оборонительных позиций
     */
    calculateHoldingPositions(units, analysis) {
        const positions = [];
        const anthill = analysis.units.anthill;
        
        if (!anthill) {
            return positions;
        }
        
        const defensiveRadius = 4;
        
        units.forEach((unit, index) => {
            const angle = (index * 2 * Math.PI) / units.length;
            const position = {
                x: Math.round(anthill.x + defensiveRadius * Math.cos(angle)),
                y: Math.round(anthill.y + defensiveRadius * Math.sin(angle))
            };
            
            positions.push({
                unit: unit,
                position: position
            });
        });
        
        return positions;
    }

    /**
     * Вычисляет приоритет цели на основе типа и расстояния от муравейника.
     * @param {Object} target - Цель для оценки
     * @param {Object} analysis - Анализ состояния игры
     * @returns {number} Приоритет цели
     */
    calculateTargetPriority(target, analysis) {
        let priority = 0;
        
        const targetUnit = target.unit;
        
        if (targetUnit.type === this.unitTypes.SOLDIER) {
            priority += 3;
        } else if (targetUnit.type === this.unitTypes.SCOUT) {
            priority += 2;
        } else {
            priority += 1;
        }
        
        const anthill = analysis.units.anthill;
        if (anthill) {
            const distance = this.calculateDistance(anthill, targetUnit);
            if (distance <= 5) {
                priority += 2;
            } else if (distance <= 10) {
                priority += 1;
            }
        }
        
        return priority;
    }

    /**
     * Определяет оптимальный подход к атаке на основе боевого превосходства.
     * @param {Object} target - Цель атаки
     * @param {Array} units - Массив атакующих юнитов
     * @param {Object} analysis - Анализ состояния игры
     * @returns {string} Тип подхода: 'direct', 'coordinated', или 'cautious'
     */
    determineApproach(target, units, analysis) {
        const combatAdvantage = this.calculateCombatAdvantage(units, [target.unit]);
        
        if (combatAdvantage > 2.0) {
            return 'direct';
        } else if (combatAdvantage > 1.2) {
            return 'coordinated';
        } else {
            return 'cautious';
        }
    }

    /**
     * Обновляет список активных боевых столкновений.
     * @param {Object} analysis - Анализ состояния игры
     */
    updateActiveEngagements(analysis) {
        const currentTime = Date.now();
        const engagementTimeout = 30000;
        
        for (const [unitId, engagement] of this.activeEngagements) {
            if (currentTime - engagement.timestamp > engagementTimeout) {
                this.activeEngagements.delete(unitId);
            }
        }
        
        const myUnits = analysis.units.myUnits;
        const enemyUnits = analysis.units.enemyUnits;
        
        myUnits.forEach(unit => {
            const nearbyEnemies = enemyUnits.filter(enemy => 
                this.calculateDistance(unit, enemy) <= 2
            );
            
            if (nearbyEnemies.length > 0) {
                this.activeEngagements.set(unit.id, {
                    unit: unit,
                    enemies: nearbyEnemies,
                    timestamp: currentTime
                });
            }
        });
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

module.exports = CombatManager;