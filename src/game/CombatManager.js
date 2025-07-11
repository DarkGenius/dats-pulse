const logger = require('../utils/Logger');
const { 
    UNIT_TYPES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');

class CombatManager {
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

    planFormations(analysis, strategy) {
        const actions = [];
        const combatReadiness = strategy.combatStrategy.readiness;
        
        if (combatReadiness.recommendation === 'attack') {
            const offensiveFormation = this.planOffensiveFormation(analysis);
            if (offensiveFormation) {
                actions.push(offensiveFormation);
            }
        } else if (combatReadiness.recommendation === 'hold') {
            const defensiveFormation = this.planDefensiveFormation(analysis);
            if (defensiveFormation) {
                actions.push(defensiveFormation);
            }
        }
        
        const immediateThreats = analysis.threats.immediateThreats;
        if (immediateThreats.length > 0) {
            const emergencyFormation = this.planEmergencyFormation(analysis);
            if (emergencyFormation) {
                actions.push(emergencyFormation);
            }
        }
        
        return actions;
    }

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

    planDefensiveFormation(analysis) {
        const allCombatUnits = analysis.units.myUnits.filter(u => 
            u.type === this.unitTypes.SOLDIER || u.type === this.unitTypes.SCOUT
        );
        
        if (allCombatUnits.length >= 4) {
            return this.createConcentricFormation(allCombatUnits, analysis);
        }
        
        return this.createDefensiveRing(allCombatUnits, analysis);
    }

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

    calculateRingPosition(center, radius, unitIndex) {
        const angle = (unitIndex * 2 * Math.PI) / 8;
        return {
            x: Math.round(center.x + radius * Math.cos(angle)),
            y: Math.round(center.y + radius * Math.sin(angle))
        };
    }

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

    planAttackTactics(analysis, strategy) {
        const actions = [];
        const targets = strategy.combatStrategy.targets;
        
        targets.forEach(target => {
            const tactic = this.selectAttackTactic(target, analysis);
            
            if (tactic) {
                actions.push({
                    type: 'tactical_action',
                    tactic: tactic.type,
                    target: target.unit,
                    units: tactic.units,
                    plan: tactic.plan,
                    priority: 'high'
                });
            }
        });
        
        return actions;
    }

    planRetreatTactics(analysis) {
        const actions = [];
        const myUnits = analysis.units.myUnits;
        const anthill = analysis.units.anthill;
        
        if (!anthill) {
            return actions;
        }
        
        const retreatPlan = this.createRetreatPlan(myUnits, anthill, analysis);
        
        actions.push({
            type: 'tactical_action',
            tactic: this.tactics.RETREAT,
            units: myUnits,
            plan: retreatPlan,
            priority: 'critical'
        });
        
        return actions;
    }

    planHoldTactics(analysis) {
        const actions = [];
        const combatUnits = analysis.units.myUnits.filter(u => 
            u.type === this.unitTypes.SOLDIER || u.type === this.unitTypes.SCOUT
        );
        
        if (combatUnits.length === 0) {
            return actions;
        }
        
        const holdingPositions = this.calculateHoldingPositions(combatUnits, analysis);
        
        actions.push({
            type: 'tactical_action',
            tactic: this.tactics.DEFENSIVE,
            units: combatUnits,
            plan: {
                type: 'hold_position',
                positions: holdingPositions
            },
            priority: 'medium'
        });
        
        return actions;
    }

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

    planTargeting(analysis, strategy) {
        const actions = [];
        const targets = strategy.combatStrategy.targets;
        
        targets.forEach(target => {
            const targetingAction = this.createTargetingAction(target, analysis);
            if (targetingAction) {
                actions.push(targetingAction);
            }
        });
        
        return actions;
    }

    createTargetingAction(target, analysis) {
        const assignedUnits = this.assignUnitsToTarget(target, analysis);
        
        if (assignedUnits.length === 0) {
            return null;
        }
        
        return {
            type: 'targeting_action',
            target: target.unit,
            units: assignedUnits,
            priority: this.calculateTargetPriority(target, analysis),
            approach: this.determineApproach(target, assignedUnits, analysis)
        };
    }

    assignUnitsToTarget(target, analysis) {
        const availableUnits = this.getAvailableAttackUnits(target.unit, analysis);
        const requiredForce = this.calculateRequiredForce(target.unit);
        
        const assignedUnits = availableUnits.slice(0, requiredForce);
        return assignedUnits;
    }

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

    getUnitStrength(unit) {
        const unitStats = this.unitStats[unit.type];
        return unitStats ? unitStats.attack : 25;
    }

    calculateCombatAdvantage(allies, enemies) {
        const allyStrength = allies.reduce((sum, ally) => sum + this.getUnitStrength(ally), 0);
        const enemyStrength = enemies.reduce((sum, enemy) => sum + this.getUnitStrength(enemy), 0);
        
        return enemyStrength > 0 ? allyStrength / enemyStrength : 2.0;
    }

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

    identifyAnthillThreats(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }
        
        return analysis.units.enemyUnits.filter(enemy => 
            this.calculateDistance(anthill, enemy) <= 6
        );
    }

    getAnthillDefenders(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }
        
        return analysis.units.myUnits.filter(unit => 
            this.calculateDistance(anthill, unit) <= 8
        );
    }

    getAvailableAttackUnits(target, analysis) {
        const myUnits = analysis.units.myUnits;
        
        return myUnits.filter(unit => {
            const distance = this.calculateDistance(unit, target);
            const isCombatCapable = unit.type === this.unitTypes.SOLDIER || unit.type === this.unitTypes.SCOUT;
            const isNotBusy = !this.isUnitBusy(unit);
            
            return distance <= 10 && isCombatCapable && isNotBusy;
        });
    }

    isUnitBusy(unit) {
        return this.activeEngagements.has(unit.id);
    }

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

    selectRearguard(units) {
        const fighters = units.filter(u => u.type === 'fighter');
        const scouts = units.filter(u => u.type === 'scout');
        
        return [...fighters.slice(0, 2), ...scouts.slice(0, 1)];
    }

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

    groupUnitsForRetreat(units) {
        const groups = [];
        const groupSize = 3;
        
        for (let i = 0; i < units.length; i += groupSize) {
            groups.push(units.slice(i, i + groupSize));
        }
        
        return groups;
    }

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

    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        
        return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
    }
}

module.exports = CombatManager;