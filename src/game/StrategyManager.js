const logger = require('../utils/Logger');

class StrategyManager {
    constructor() {
        this.phases = {
            EARLY: 'early',
            MID: 'mid',
            LATE: 'late',
            RECOVERY: 'recovery'
        };
        
        // Track unit counts over time for loss analysis
        this.unitCountHistory = [];
        this.maxHistoryLength = 10; // Keep last 10 turns
        this.recoveryModeTriggered = false;
        this.recoveryModeStartTurn = null;
    }

    determineStrategy(analysis, turnNumber) {
        // Update unit count history for loss tracking
        this.updateUnitCountHistory(analysis, turnNumber);
        
        // Check for recovery mode conditions
        const shouldEnterRecovery = this.shouldEnterRecoveryMode(analysis, turnNumber);
        const shouldExitRecovery = this.shouldExitRecoveryMode(analysis, turnNumber);
        
        let phase = analysis.gamePhase;
        
        // Override phase if recovery mode is needed
        if (shouldEnterRecovery && !this.recoveryModeTriggered) {
            this.recoveryModeTriggered = true;
            this.recoveryModeStartTurn = turnNumber;
            phase = this.phases.RECOVERY;
            logger.warn(`🚨 RECOVERY MODE ACTIVATED on turn ${turnNumber} - significant unit losses detected`);
        } else if (shouldExitRecovery && this.recoveryModeTriggered) {
            this.recoveryModeTriggered = false;
            this.recoveryModeStartTurn = null;
            phase = analysis.gamePhase; // Return to normal phase
            logger.info(`✅ Recovery mode deactivated on turn ${turnNumber} - army rebuilt`);
        } else if (this.recoveryModeTriggered) {
            phase = this.phases.RECOVERY; // Stay in recovery mode
        }
        
        const strategy = {
            name: this.getStrategyName(phase, analysis),
            phase,
            priorities: this.getPhasePriorities(phase, analysis),
            resourceStrategy: this.determineResourceStrategy(analysis, phase),
            combatStrategy: this.determineCombatStrategy(analysis, phase),
            adaptations: this.determineAdaptations(analysis),
            reasoning: [],
            recoveryMode: this.recoveryModeTriggered,
            recoveryStartTurn: this.recoveryModeStartTurn
        };
        
        // Add reasoning for phase selection
        strategy.reasoning.push({
            category: 'phase',
            decision: phase,
            details: `Turn ${turnNumber}, determining ${phase} phase strategy`
        });

        if (this.recoveryModeTriggered) {
            strategy.reasoning.push({
                category: 'recovery',
                decision: 'emergency_rebuild',
                details: `Recovery mode since turn ${this.recoveryModeStartTurn}, focusing on rebuilding army`
            });
        }

        logger.debug(`Strategy for turn ${turnNumber} (${phase} phase):`); //, strategy);
        return strategy;
    }
    
    getStrategyName(phase, analysis) {
        // Recovery mode takes priority
        if (phase === this.phases.RECOVERY) {
            return 'emergency_recovery';
        }
        
        // More aggressive strategy naming
        if (analysis.gameState?.enemies?.length > 0) {
            return 'aggressive_combat_' + phase;
        } else if (phase === 'mid' || phase === 'late') {
            return 'aggressive_exploration_' + phase;
        } else if (analysis.threats.immediateThreats.length > 2) {
            return 'defensive_' + phase;
        } else if (analysis.resources.highValue.length > 5) {
            return 'economic_' + phase;
        } else {
            return 'balanced_aggressive_' + phase;
        }
    }

    getPhasePriorities(phase, analysis) {
        let priorities = [];

        // Always prioritize finding and raiding enemy bases
        if (analysis.gameState?.discoveredEnemyAnthills?.length > 0) {
            priorities.push('raid_enemy_bases');
        }

        if (analysis.threats.immediateThreats.length > 0) {
            priorities.push('immediate_defense');
        }

        switch (phase) {
            case this.phases.EARLY:
                priorities.push('economic_expansion', 'aggressive_scouting', 'resource_mapping');
                break;
            case this.phases.MID:
                priorities.push('find_enemy_anthills', 'aggressive_expansion', 'territory_control');
                break;
            case this.phases.LATE:
                priorities.push('enemy_base_destruction', 'aggressive_raiding', 'optimization_dominance', 'high_value_resources');
                break;
            case this.phases.RECOVERY:
                priorities.push('emergency_economy', 'safe_resource_collection', 'defensive_reconstruction', 'unit_rebuild');
                break;
        }

        return priorities;
    }

    determineResourceStrategy(analysis, phase = null) {
        const actualPhase = phase || analysis.gamePhase;
        const { resources } = analysis;
        const priorities = this.getResourcePriorities(actualPhase, resources);
        
        const strategy = {
            priorities,
            assignments: this.assignResourceTargets(analysis),
            logistics: this.planLogistics(analysis),
            recoveryMode: actualPhase === this.phases.RECOVERY
        };
        
        // Recovery mode specific adjustments
        if (actualPhase === this.phases.RECOVERY) {
            strategy.maxCollectionDistance = 15; // Limit to close resources only
            strategy.allowedCollectors = ['worker']; // Only workers collect in recovery
            strategy.safetyPriority = 'critical'; // Prioritize safety over efficiency
        }
        
        return strategy;
    }

    getResourcePriorities(gamePhase, resources) {
        const priorities = [];
        
        const nearNectar = resources.distances.nectar?.filter(r => r.distance <= 6) || [];
        const nearBread = resources.distances.bread?.filter(r => r.distance <= 4) || [];
        const anyApples = resources.byType.apple || [];

        if (nearNectar.length > 0) {
            priorities.push({ 
                type: 'nectar', 
                priority: 'high', 
                reason: 'high_calories_close',
                count: nearNectar.length,
                avgDistance: nearNectar.reduce((sum, r) => sum + r.distance, 0) / nearNectar.length
            });
        }
        
        if (nearBread.length > 0) {
            priorities.push({ 
                type: 'bread', 
                priority: 'medium', 
                reason: 'medium_calories_close',
                count: nearBread.length,
                avgDistance: nearBread.reduce((sum, r) => sum + r.distance, 0) / nearBread.length
            });
        }
        
        if (anyApples.length > 0) {
            priorities.push({ 
                type: 'apple', 
                priority: 'low', 
                reason: 'low_calories_available',
                count: anyApples.length
            });
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
        
        if (resource.type === 'nectar' && unit.type === 3) { // scout
            suitability += 3;
        } else if (resource.type === 'bread' && unit.type === 1) { // worker
            suitability += 2;
        } else if (resource.type === 'apple') {
            suitability += 1;
        }

        if (unit.type === 1) { // worker
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
        const soldiers = myUnits.filter(u => u.type === 2); // soldier
        
        analysis.resources.highValue.forEach(resourceInfo => {
            const nearbySoldiers = soldiers.filter(soldier => 
                this.calculateDistance(soldier, resourceInfo.resource) <= 4
            );
            
            if (nearbySoldiers.length > 0) {
                routes.push({
                    resource: resourceInfo.resource,
                    guards: nearbySoldiers,
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

    determineCombatStrategy(analysis, phase = null) {
        const actualPhase = phase || analysis.gamePhase;
        const { threats, units } = analysis;
        
        const combatReadiness = this.calculateCombatReadiness(analysis);
        const strategy = this.selectCombatStrategy(combatReadiness, threats, actualPhase);
        
        const combatStrategy = {
            readiness: combatReadiness,
            strategy,
            formations: this.recommendFormations(analysis),
            targets: this.identifyTargets(analysis),
            recoveryMode: actualPhase === this.phases.RECOVERY
        };
        
        // Recovery mode specific adjustments
        if (actualPhase === this.phases.RECOVERY) {
            combatStrategy.stance = 'defensive';
            combatStrategy.engagement = 'avoid_unless_necessary';
            combatStrategy.maxPatrolDistance = 10; // Keep soldiers close to base
            combatStrategy.prioritizeDefense = true;
        }
        
        return combatStrategy;
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
                2: 70, // soldier
                3: 35, // scout
                1: 25  // worker
            };
            return strength + (unitStrength[unit.type] || 0);
        }, 0);
    }

    getReadinessRecommendation(readiness) {
        // Always be aggressive
        if (readiness > 0.5) {
            return 'attack';
        } else {
            // Even when outnumbered, fight strategically
            return 'guerrilla_attack';
        }
    }

    selectCombatStrategy(combatReadiness, threats, gamePhase) {
        // Always be aggressive - we're here to win
        const strategy = {
            stance: 'aggressive',
            tactics: ['hunt_enemies', 'find_enemy_bases', 'raid_enemy_territory'],
            priorities: ['destroy_enemy_anthills', 'eliminate_all_threats', 'total_domination']
        };

        if (threats.immediateThreats.length > 0) {
            strategy.tactics.unshift('immediate_offense');
            strategy.priorities.unshift('destroy_immediate_threats');
        }

        if (combatReadiness.ratio > 1.0) {
            strategy.tactics.push('total_war');
            strategy.priorities.push('annihilate_enemies');
        } else {
            // Even when outnumbered, be aggressive
            strategy.tactics.push('guerrilla_warfare');
            strategy.priorities.push('harass_and_retreat');
        }

        if (gamePhase === 'late') {
            strategy.tactics.push('scorched_earth');
            strategy.priorities.push('deny_all_resources');
        }

        return strategy;
    }

    recommendFormations(analysis) {
        const formations = [];
        const soldiers = analysis.units.myUnits.filter(u => u.type === 2); // soldier
        const scouts = analysis.units.myUnits.filter(u => u.type === 3); // scout
        
        if (soldiers.length >= 3 && scouts.length >= 2) {
            formations.push({
                type: 'trileaf',
                units: soldiers.slice(0, 3).concat(scouts.slice(0, 2)),
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
        
        if (enemy.type === 2) { // soldier
            priority += 3;
        } else if (enemy.type === 3) { // scout
            priority += 2;
        } else if (enemy.type === 1) { // worker
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
        
        if (enemy.type === 2) { // soldier
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
        const unitCounts = analysis.units.counts;
        const totalUnits = unitCounts.total;

        if (totalUnits === 0) return adaptations;

        const workerRatio = unitCounts.worker / totalUnits;
        const soldierRatio = unitCounts.soldier / totalUnits;

        if (workerRatio < 0.4 && analysis.threats.overallLevel < 0.5) {
            adaptations.push({
                type: 'economic_focus',
                action: 'prioritize_resource_gathering',
                reason: 'low_worker_ratio',
                details: `Worker ratio: ${(workerRatio * 100).toFixed(1)}%, Threat level: ${(analysis.threats.overallLevel * 100).toFixed(1)}%`
            });
        }

        if (soldierRatio < 0.25 && analysis.threats.overallLevel > 0.5) {
            adaptations.push({
                type: 'military_focus',
                action: 'prioritize_defense_and_attack',
                reason: 'low_soldier_ratio_under_threat',
                details: `Soldier ratio: ${(soldierRatio * 100).toFixed(1)}%, Threat level: ${(analysis.threats.overallLevel * 100).toFixed(1)}%`
            });
        }

        return adaptations;
    }

    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const q1 = pos1.q || 0;
        const r1 = pos1.r || 0;
        const s1 = -q1 - r1;
        
        const q2 = pos2.q || 0;
        const r2 = pos2.r || 0;
        const s2 = -q2 - r2;
        
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }
    
    /**
     * Updates the unit count history for loss tracking.
     * @param {Object} analysis - Game analysis
     * @param {number} turnNumber - Current turn
     */
    updateUnitCountHistory(analysis, turnNumber) {
        const unitCounts = analysis.units.counts;
        
        this.unitCountHistory.push({
            turn: turnNumber,
            total: unitCounts.total,
            workers: unitCounts.worker,
            soldiers: unitCounts.soldier,
            scouts: unitCounts.scout
        });
        
        // Maintain history size
        if (this.unitCountHistory.length > this.maxHistoryLength) {
            this.unitCountHistory.shift();
        }
    }
    
    /**
     * Determines if recovery mode should be entered based on unit losses.
     * @param {Object} analysis - Game analysis
     * @param {number} turnNumber - Current turn
     * @returns {boolean} True if recovery mode should be entered
     */
    shouldEnterRecoveryMode(analysis, turnNumber) {
        if (this.recoveryModeTriggered) return false; // Already in recovery
        if (this.unitCountHistory.length < 3) return false; // Not enough history
        if (turnNumber < 10) return false; // Don't trigger recovery in very early game
        
        const currentUnits = analysis.units.counts.total;
        const recentHistory = this.unitCountHistory.slice(-3); // Last 3 turns
        
        if (recentHistory.length < 3) return false;
        
        // Calculate unit loss over last 3 turns
        const startUnits = recentHistory[0].total;
        const lossRate = startUnits > 0 ? (startUnits - currentUnits) / startUnits : 0;
        
        // Recovery conditions (more conservative):
        // 1. Lost more than 40% of army in last 3 turns AND have at least 8 starting units
        // 2. Have fewer than 3 total units (extreme situation)
        // 3. Have no soldiers and enemies are present AND turn > 15
        const significantLoss = lossRate > 0.4 && startUnits >= 8;
        const extremelyLow = currentUnits < 3;
        const noSoldiers = analysis.units.counts.soldier === 0 && analysis.units.enemyUnits.length > 0 && turnNumber > 15;
        
        if (significantLoss || extremelyLow || noSoldiers) {
            logger.warn(`Recovery triggers: Loss=${(lossRate*100).toFixed(1)}%, Total=${currentUnits}, Soldiers=${analysis.units.counts.soldier}, Enemies=${analysis.units.enemyUnits.length}, Turn=${turnNumber}`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Determines if recovery mode should be exited.
     * @param {Object} analysis - Game analysis
     * @param {number} turnNumber - Current turn
     * @returns {boolean} True if recovery mode should be exited
     */
    shouldExitRecoveryMode(analysis, turnNumber) {
        if (!this.recoveryModeTriggered) return false; // Not in recovery
        
        const currentUnits = analysis.units.counts;
        const timeSinceRecovery = turnNumber - this.recoveryModeStartTurn;
        
        // Exit conditions:
        // 1. Have rebuilt to at least 8 total units
        // 2. Have at least 2 soldiers for defense
        // 3. Have been in recovery for at least 5 turns (prevent flip-flopping)
        const hasRebuiltArmy = currentUnits.total >= 8;
        const hasDefenders = currentUnits.soldier >= 2;
        const hasBeenInRecoveryLongEnough = timeSinceRecovery >= 5;
        
        if (hasRebuiltArmy && hasDefenders && hasBeenInRecoveryLongEnough) {
            logger.info(`Recovery exit: ${currentUnits.total} units, ${currentUnits.soldier} soldiers after ${timeSinceRecovery} turns`);
            return true;
        }
        
        return false;
    }
}

module.exports = StrategyManager;
