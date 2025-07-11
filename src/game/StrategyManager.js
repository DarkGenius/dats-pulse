const logger = require('../utils/Logger');

class StrategyManager {
    constructor() {
        this.phases = {
            EARLY: 'early',
            MID: 'mid',
            LATE: 'late'
        };
        
        this.optimalProportions = {
            early: {
                worker: 0.6,
                scout: 0.3,
                soldier: 0.1
            },
            mid: {
                worker: 0.5,
                scout: 0.25,
                soldier: 0.25
            },
            late: {
                worker: 0.3,
                scout: 0.35,
                soldier: 0.35
            }
        };
        
        this.economicTargets = {
            early: { caloriesPerTurn: 200, totalCalories: 4000 },
            mid: { caloriesPerTurn: 500, totalCalories: 15000 },
            late: { caloriesPerTurn: 800, totalCalories: 30000 }
        };
    }

    determineStrategy(analysis, turnNumber) {
        const phase = analysis.gamePhase;
        const strategy = {
            phase,
            priorities: this.getPhasePriorities(phase),
            unitProduction: this.determineUnitProduction(analysis),
            resourceStrategy: this.determineResourceStrategy(analysis),
            combatStrategy: this.determineCombatStrategy(analysis),
            adaptations: this.determineAdaptations(analysis)
        };

        logger.info(`Strategy for turn ${turnNumber} (${phase} phase):`, strategy);
        return strategy;
    }

    getPhasePriorities(phase) {
        const priorities = {
            early: [
                'economic_expansion',
                'resource_mapping',
                'basic_defense',
                'unit_production'
            ],
            mid: [
                'balanced_expansion',
                'territory_control',
                'threat_assessment',
                'resource_optimization'
            ],
            late: [
                'optimization_dominance',
                'high_value_resources',
                'competitor_suppression',
                'strategic_positioning'
            ]
        };

        return priorities[phase] || priorities.early;
    }

    determineUnitProduction(analysis) {
        const { gamePhase, units, threats, resources, economy } = analysis;
        const currentProportions = units.proportions;
        const optimalProportions = this.optimalProportions[gamePhase];
        
        const adaptedProportions = this.adaptProportions(
            optimalProportions,
            analysis
        );

        const nextUnitType = this.selectNextUnitType(
            currentProportions,
            adaptedProportions,
            analysis
        );

        return {
            optimalProportions: adaptedProportions,
            currentProportions,
            nextUnitType,
            reasoning: this.getProductionReasoning(nextUnitType, analysis)
        };
    }

    adaptProportions(baseProportions, analysis) {
        const adapted = { ...baseProportions };
        const threatLevel = analysis.threats.overallLevel;
        
        if (threatLevel > 0.7) {
            adapted.soldier = Math.min(0.5, adapted.soldier + 0.15);
            adapted.worker = Math.max(0.2, adapted.worker - 0.1);
            adapted.scout = Math.max(0.2, adapted.scout - 0.05);
        }

        if (analysis.resources.highValue.length > 3) {
            adapted.scout = Math.min(0.4, adapted.scout + 0.1);
            adapted.worker = Math.max(0.3, adapted.worker - 0.05);
            adapted.soldier = Math.max(0.2, adapted.soldier - 0.05);
        }

        if (analysis.economy.caloriesPerTurn < analysis.economy.targets.caloriesPerTurn * 0.8) {
            adapted.worker = Math.min(0.6, adapted.worker + 0.1);
            adapted.scout = Math.max(0.2, adapted.scout - 0.05);
            adapted.soldier = Math.max(0.15, adapted.soldier - 0.05);
        }

        return adapted;
    }

    selectNextUnitType(currentProportions, optimalProportions, analysis) {
        const deviations = {
            worker: optimalProportions.worker - currentProportions.worker,
            scout: optimalProportions.scout - currentProportions.scout,
            soldier: optimalProportions.soldier - currentProportions.soldier
        };

        const sortedDeviations = Object.entries(deviations)
            .sort((a, b) => b[1] - a[1]);

        const largestDeviation = sortedDeviations[0];
        const unitType = largestDeviation[0];

        if (this.shouldOverrideProduction(analysis)) {
            return this.getOverrideUnitType(analysis);
        }

        return unitType;
    }

    shouldOverrideProduction(analysis) {
        const nectarNearby = analysis.resources.byType.nectar.some(nectar => 
            this.calculateDistance(analysis.units.anthill, nectar) <= 7
        );
        
        const immediateThreats = analysis.threats.immediateThreats.length > 0;
        const lowThreat = analysis.threats.overallLevel < 0.3;

        return nectarNearby || immediateThreats || lowThreat;
    }

    getOverrideUnitType(analysis) {
        const nectarNearby = analysis.resources.byType.nectar.some(nectar => 
            this.calculateDistance(analysis.units.anthill, nectar) <= 7
        );
        
        if (nectarNearby) {
            return 'scout';
        }

        if (analysis.threats.immediateThreats.length > 0) {
            return 'soldier';
        }

        if (analysis.threats.overallLevel < 0.3) {
            return 'worker';
        }

        return 'worker';
    }

    getProductionReasoning(unitType, analysis) {
        const reasons = [];
        
        if (unitType === 'scout') {
            if (analysis.resources.byType.nectar.length > 0) {
                reasons.push('nectar_collection');
            }
            if (analysis.territory.expansion.length > 0) {
                reasons.push('territory_expansion');
            }
        } else if (unitType === 'soldier') {
            if (analysis.threats.immediateThreats.length > 0) {
                reasons.push('immediate_defense');
            }
            if (analysis.threats.overallLevel > 0.5) {
                reasons.push('threat_response');
            }
        } else if (unitType === 'worker') {
            if (analysis.economy.caloriesPerTurn < analysis.economy.targets.caloriesPerTurn) {
                reasons.push('economic_growth');
            }
            if (analysis.resources.byType.bread.length > 0) {
                reasons.push('resource_collection');
            }
        }

        return reasons;
    }

    determineResourceStrategy(analysis) {
        const { gamePhase, resources } = analysis;
        const priorities = this.getResourcePriorities(gamePhase, resources);
        
        return {
            priorities,
            assignments: this.assignResourceTargets(analysis),
            logistics: this.planLogistics(analysis)
        };
    }

    getResourcePriorities(gamePhase, resources) {
        const priorities = [];
        
        const nearNectar = resources.distances.nectar?.filter(r => r.distance <= 6) || [];
        const nearBread = resources.distances.bread?.filter(r => r.distance <= 4) || [];
        const anyApples = resources.byType.apple || [];

        if (nearNectar.length > 0) {
            priorities.push({ type: 'nectar', priority: 'high', reason: 'high_calories_close' });
        }
        
        if (nearBread.length > 0) {
            priorities.push({ type: 'bread', priority: 'medium', reason: 'medium_calories_close' });
        }
        
        if (anyApples.length > 0) {
            priorities.push({ type: 'apple', priority: 'low', reason: 'low_calories_available' });
        }

        return priorities.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        });
    }

    assignResourceTargets(analysis) {
        const assignments = [];
        const availableUnits = [...analysis.units.myUnits];
        const sortedResources = analysis.resources.highValue;

        sortedResources.forEach(resourceInfo => {
            const bestUnit = this.findBestUnitForResource(
                resourceInfo.resource,
                availableUnits
            );
            
            if (bestUnit) {
                assignments.push({
                    unit: bestUnit,
                    resource: resourceInfo.resource,
                    distance: resourceInfo.distance,
                    priority: resourceInfo.priority
                });
                
                const unitIndex = availableUnits.indexOf(bestUnit);
                if (unitIndex > -1) {
                    availableUnits.splice(unitIndex, 1);
                }
            }
        });

        return assignments;
    }

    findBestUnitForResource(resource, availableUnits) {
        if (availableUnits.length === 0) return null;

        const unitsWithDistance = availableUnits.map(unit => ({
            unit,
            distance: this.calculateDistance(unit, resource),
            suitability: this.calculateUnitSuitability(unit, resource)
        }));

        unitsWithDistance.sort((a, b) => {
            return (b.suitability - a.suitability) || (a.distance - b.distance);
        });

        return unitsWithDistance[0].unit;
    }

    calculateUnitSuitability(unit, resource) {
        let suitability = 0;
        
        if (resource.type === 'nectar' && unit.type === 'scout') {
            suitability += 3;
        } else if (resource.type === 'bread' && unit.type === 'worker') {
            suitability += 2;
        } else if (resource.type === 'apple') {
            suitability += 1;
        }

        if (unit.type === 'worker') {
            suitability += 1;
        }

        return suitability;
    }

    planLogistics(analysis) {
        const logistics = {
            convoyFormation: this.shouldFormConvoys(analysis),
            protectedRoutes: this.identifyProtectedRoutes(analysis),
            distribution: this.calculateOptimalDistribution(analysis)
        };

        return logistics;
    }

    shouldFormConvoys(analysis) {
        const longDistanceResources = analysis.resources.highValue.filter(r => r.distance > 6);
        const threatLevel = analysis.threats.overallLevel;
        
        return longDistanceResources.length > 0 && threatLevel > 0.3;
    }

    identifyProtectedRoutes(analysis) {
        const routes = [];
        const myUnits = analysis.units.myUnits;
        const fighters = myUnits.filter(u => u.type === 'fighter');
        
        analysis.resources.highValue.forEach(resourceInfo => {
            const nearbyFighters = fighters.filter(fighter => 
                this.calculateDistance(fighter, resourceInfo.resource) <= 4
            );
            
            if (nearbyFighters.length > 0) {
                routes.push({
                    resource: resourceInfo.resource,
                    guards: nearbyFighters,
                    safety: 'protected'
                });
            }
        });

        return routes;
    }

    calculateOptimalDistribution(analysis) {
        const totalUnits = analysis.units.counts.total;
        
        return {
            onRoute: Math.ceil(totalUnits * 0.2),
            collecting: Math.ceil(totalUnits * 0.6),
            returning: Math.ceil(totalUnits * 0.2)
        };
    }

    determineCombatStrategy(analysis) {
        const { gamePhase, threats, units } = analysis;
        
        const combatReadiness = this.calculateCombatReadiness(analysis);
        const strategy = this.selectCombatStrategy(combatReadiness, threats, gamePhase);
        
        return {
            readiness: combatReadiness,
            strategy,
            formations: this.recommendFormations(analysis),
            targets: this.identifyTargets(analysis)
        };
    }

    calculateCombatReadiness(analysis) {
        const myForces = this.calculateForceStrength(analysis.units.myUnits);
        const enemyForces = this.calculateForceStrength(analysis.units.enemyUnits);
        
        const readiness = enemyForces > 0 ? (myForces * 1.5) / enemyForces : 2.0;
        
        return {
            myForces,
            enemyForces,
            ratio: readiness,
            recommendation: this.getReadinessRecommendation(readiness)
        };
    }

    calculateForceStrength(units) {
        return units.reduce((strength, unit) => {
            const unitStrength = {
                fighter: 70,
                scout: 35,
                worker: 25
            };
            return strength + (unitStrength[unit.type] || 0);
        }, 0);
    }

    getReadinessRecommendation(readiness) {
        if (readiness > 1.8) {
            return 'attack';
        } else if (readiness < 0.6) {
            return 'retreat';
        } else {
            return 'hold';
        }
    }

    selectCombatStrategy(combatReadiness, threats, gamePhase) {
        const strategy = {
            stance: combatReadiness.recommendation,
            tactics: [],
            priorities: []
        };

        if (threats.immediateThreats.length > 0) {
            strategy.tactics.push('immediate_defense');
            strategy.priorities.push('protect_anthill');
        }

        if (combatReadiness.ratio > 1.5) {
            strategy.tactics.push('aggressive_expansion');
            strategy.priorities.push('eliminate_threats');
        }

        if (gamePhase === 'late') {
            strategy.tactics.push('resource_denial');
            strategy.priorities.push('control_high_value_resources');
        }

        return strategy;
    }

    recommendFormations(analysis) {
        const formations = [];
        const fighters = analysis.units.myUnits.filter(u => u.type === 'fighter');
        const scouts = analysis.units.myUnits.filter(u => u.type === 'scout');
        
        if (fighters.length >= 3 && scouts.length >= 2) {
            formations.push({
                type: 'trileaf',
                units: fighters.slice(0, 3).concat(scouts.slice(0, 2)),
                purpose: 'attack'
            });
        }

        if (analysis.threats.immediateThreats.length > 0) {
            formations.push({
                type: 'concentric_defense',
                units: analysis.units.myUnits,
                purpose: 'defense'
            });
        }

        return formations;
    }

    identifyTargets(analysis) {
        const targets = [];
        
        analysis.units.enemyUnits.forEach(enemy => {
            const priority = this.calculateTargetPriority(enemy, analysis);
            targets.push({
                unit: enemy,
                priority,
                reasoning: this.getTargetReasoning(enemy, analysis)
            });
        });

        return targets.sort((a, b) => b.priority - a.priority);
    }

    calculateTargetPriority(enemy, analysis) {
        let priority = 0;
        
        if (enemy.type === 'fighter') {
            priority += 3;
        } else if (enemy.type === 'scout') {
            priority += 2;
        } else if (enemy.type === 'worker') {
            priority += 1;
        }

        const distanceToAnthill = this.calculateDistance(analysis.units.anthill, enemy);
        if (distanceToAnthill <= 5) {
            priority += 2;
        } else if (distanceToAnthill <= 10) {
            priority += 1;
        }

        return priority;
    }

    getTargetReasoning(enemy, analysis) {
        const reasons = [];
        
        if (enemy.type === 'fighter') {
            reasons.push('high_threat_unit');
        }
        
        const distanceToAnthill = this.calculateDistance(analysis.units.anthill, enemy);
        if (distanceToAnthill <= 5) {
            reasons.push('close_to_anthill');
        }

        return reasons;
    }

    determineAdaptations(analysis) {
        const adaptations = [];
        
        if (analysis.economy.caloriesPerTurn < analysis.economy.targets.caloriesPerTurn * 0.8) {
            adaptations.push({
                type: 'economic_focus',
                action: 'increase_workers',
                reason: 'below_economic_targets'
            });
        }

        if (analysis.threats.overallLevel > 0.7) {
            adaptations.push({
                type: 'military_focus',
                action: 'increase_fighters',
                reason: 'high_threat_level'
            });
        }

        if (analysis.units.counts.total > 30 && analysis.threats.overallLevel < 0.3) {
            adaptations.push({
                type: 'expansion_focus',
                action: 'increase_scouts',
                reason: 'safe_expansion_opportunity'
            });
        }

        return adaptations;
    }

    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        
        return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
    }
}

module.exports = StrategyManager;