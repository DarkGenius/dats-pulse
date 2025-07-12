const logger = require('../utils/Logger');
const { 
    UNIT_TYPES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');
const AStarPathfinder = require('./AStarPathfinder');
const PathfindingValidator = require('./PathfindingValidator');

/**
 * Simple combat manager that implements "see enemy, attack" logic.
 * Replaces complex formation-based system with working combat behavior.
 */
class CombatManager {
    constructor() {
        this.unitTypes = UNIT_TYPES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        this.unitStats = UNIT_STATS;
        this.pathfinder = new AStarPathfinder();
        this.pathValidator = new PathfindingValidator();
    }
    
    /**
     * Plans combat actions - simplified to just return movement commands.
     * @param {Object} analysis - Game state analysis
     * @param {Object} strategy - Game strategy
     * @returns {Object} Object with actions array and moves array
     */
    planCombatActions(analysis, strategy) {
        const actions = [];
        const moves = [];
        
        // Simple "see enemy, attack" logic
        const combatMoves = this.planSimpleCombatMoves(analysis);
        moves.push(...combatMoves);
        
        return { actions, moves };
    }
    
    /**
     * Plans simple combat moves: "see enemy - attack".
     * @param {Object} analysis - Game state analysis
     * @returns {Array} Array of movement commands for combat units
     */
    planSimpleCombatMoves(analysis) {
        const moves = [];
        const myUnits = analysis.units.myUnits;
        const enemyUnits = analysis.units.enemyUnits;
        const anthill = analysis.units.anthill;
        
        // Get all soldiers
        const soldiers = myUnits.filter(unit => unit.type === this.unitTypes.SOLDIER);
        
        if (soldiers.length === 0 || enemyUnits.length === 0) {
            return moves;
        }
        
        // Priority 1: Defend anthill from immediate threats
        if (anthill) {
            const anthillThreats = enemyUnits.filter(enemy => 
                this.calculateDistance(anthill, enemy) <= 8
            );
            
            if (anthillThreats.length > 0) {
                // Sort threats by distance to anthill
                anthillThreats.sort((a, b) => 
                    this.calculateDistance(anthill, a) - this.calculateDistance(anthill, b)
                );
                
                // Assign available soldiers to defend
                soldiers.forEach(soldier => {
                    if (anthillThreats.length > 0) {
                        const target = anthillThreats[0];
                        const path = this.findPath(soldier, target, analysis);
                        
                        if (path && path.length > 0) {
                            moves.push({
                                unit_id: soldier.id,
                                path: path,
                                assignment: {
                                    type: 'defend_anthill',
                                    target: target,
                                    priority: 'critical'
                                }
                            });
                            logger.info(`Soldier ${soldier.id} defending anthill from enemy at (${target.q}, ${target.r})`);
                        }
                    }
                });
                
                return moves; // All soldiers defend if anthill is threatened
            }
        }
        
        // Priority 2: Handle wounded soldiers first (retreat if health < 30%)
        const woundedSoldiers = soldiers.filter(soldier => 
            soldier.health && soldier.health < (this.unitStats.SOLDIER?.health * 0.3 || 30)
        );
        
        woundedSoldiers.forEach(soldier => {
            if (anthill) {
                const path = this.findPath(soldier, anthill, analysis);
                if (path && path.length > 0) {
                    moves.push({
                        unit_id: soldier.id,
                        path: path,
                        assignment: {
                            type: 'retreat_wounded',
                            target: anthill,
                            priority: 'high'
                        }
                    });
                    logger.info(`Wounded soldier ${soldier.id} retreating to base (health: ${soldier.health})`);
                }
            }
        });
        
        // Priority 3: Attack enemies with healthy soldiers (focus fire)
        const healthySoldiers = soldiers.filter(soldier => 
            !woundedSoldiers.includes(soldier)
        );
        
        if (healthySoldiers.length > 0) {
            const nearbyEnemies = enemyUnits.filter(enemy => 
                healthySoldiers.some(soldier => this.calculateDistance(soldier, enemy) <= 20)
            );
            
            if (nearbyEnemies.length > 0) {
                // FOCUS FIRE: All soldiers target the same enemy (highest priority)
                const priorityTarget = this.selectPriorityTarget(nearbyEnemies, anthill);
                
                healthySoldiers.forEach(soldier => {
                    if (this.calculateDistance(soldier, priorityTarget) <= 20) {
                        const path = this.findPath(soldier, priorityTarget, analysis);
                        
                        if (path && path.length > 0) {
                            moves.push({
                                unit_id: soldier.id,
                                path: path,
                                assignment: {
                                    type: 'focus_fire',
                                    target: priorityTarget,
                                    priority: 'high'
                                }
                            });
                            logger.info(`Soldier ${soldier.id} focusing fire on priority target at (${priorityTarget.q}, ${priorityTarget.r})`);
                        }
                    }
                });
            }
        }
        
        // Priority 4: Patrol for soldiers without combat tasks
        healthySoldiers.forEach(soldier => {
            // Check if this soldier already has a combat assignment
            const hasAssignment = moves.some(move => move.unit_id === soldier.id);
            
            if (!hasAssignment && anthill) {
                // No enemies visible - patrol around anthill
                const patrolPoint = this.getPatrolPoint(soldier, anthill, analysis);
                if (patrolPoint) {
                    const path = this.findPath(soldier, patrolPoint, analysis);
                    
                    if (path && path.length > 0) {
                        moves.push({
                            unit_id: soldier.id,
                            path: path,
                            assignment: {
                                type: 'patrol',
                                target: patrolPoint,
                                priority: 'low'
                            }
                        });
                    }
                }
            }
        });
        
        return moves;
    }
    
    /**
     * Gets a patrol point for a soldier around the anthill.
     * Enhanced with strategic positioning and bottleneck control.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Anthill position
     * @param {Object} analysis - Game state analysis
     * @returns {Object|null} Patrol point or null
     */
    getPatrolPoint(soldier, anthill, analysis) {
        const gameState = analysis.gameState;
        const turn = gameState.turnNo || 0;
        const enemyUnits = analysis.units.enemyUnits || [];
        const discoveredEnemyAnthills = gameState.discoveredEnemyAnthills || [];
        
        // STRATEGIC INTELLIGENCE: If we know enemy positions, patrol strategically
        if (discoveredEnemyAnthills.length > 0) {
            return this.getStrategicPatrolPoint(soldier, anthill, discoveredEnemyAnthills[0], analysis);
        }
        
        // AGGRESSIVE RECONNAISSANCE: Early to mid game - active enemy searching
        if (turn < 150) {
            return this.getAggressiveReconPoint(soldier, anthill, turn, analysis);
        }
        
        // BOTTLENECK CONTROL: Look for strategic terrain features
        const bottleneckPoint = this.findStrategicBottleneck(soldier, anthill, analysis);
        if (bottleneckPoint) {
            logger.debug(`Soldier ${soldier.id} moving to control bottleneck at (${bottleneckPoint.q}, ${bottleneckPoint.r})`);
            return bottleneckPoint;
        }
        
        // ADAPTIVE PATROL: React to recent enemy sightings
        if (enemyUnits.length > 0) {
            return this.getAdaptivePatrolPoint(soldier, anthill, enemyUnits, analysis);
        }
        
        // DEFENSIVE PATROL: Default defensive ring around base
        return this.getDefensivePatrolPoint(soldier, anthill, analysis);
    }
    
    /**
     * Strategic patrol when enemy base location is known.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Our anthill
     * @param {Object} enemyAnthill - Known enemy anthill
     * @param {Object} analysis - Game state analysis
     * @returns {Object} Strategic patrol position
     */
    getStrategicPatrolPoint(soldier, anthill, enemyAnthill, analysis) {
        // Calculate vector from our base to enemy base
        const threatVector = {
            q: enemyAnthill.q - anthill.q,
            r: enemyAnthill.r - anthill.r
        };
        
        const threatDistance = this.calculateDistance(anthill, enemyAnthill);
        const normalizedThreat = {
            q: threatVector.q / threatDistance,
            r: threatVector.r / threatDistance
        };
        
        // Position soldiers between our base and enemy base
        const interceptDistance = Math.min(25, threatDistance * 0.4);
        const interceptPoint = {
            q: Math.round(anthill.q + normalizedThreat.q * interceptDistance),
            r: Math.round(anthill.r + normalizedThreat.r * interceptDistance)
        };
        
        // Add some spread to avoid clustering
        const spreadRadius = 5;
        const soldierHash = Math.abs(soldier.id.charCodeAt(0)) % 8;
        const spreadAngle = (soldierHash / 8) * Math.PI * 2;
        
        return {
            q: interceptPoint.q + Math.round(Math.cos(spreadAngle) * spreadRadius),
            r: interceptPoint.r + Math.round(Math.sin(spreadAngle) * spreadRadius)
        };
    }
    
    /**
     * Aggressive reconnaissance patrol for early-mid game.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Our anthill
     * @param {number} turn - Current turn number
     * @param {Object} analysis - Game state analysis
     * @returns {Object} Reconnaissance patrol position
     */
    getAggressiveReconPoint(soldier, anthill, turn, analysis) {
        // Expand search radius over time
        const baseRadius = 20;
        const expansionRate = 0.3;
        const maxRadius = 45;
        const currentRadius = Math.min(maxRadius, baseRadius + turn * expansionRate);
        
        // Define priority directions (likely enemy spawn areas)
        const priorityDirections = [
            { q: 1, r: 0, priority: 3 },    // East - high priority
            { q: -1, r: 0, priority: 3 },   // West - high priority
            { q: 0, r: 1, priority: 2 },    // Southeast - medium
            { q: -1, r: 1, priority: 2 },   // Southwest - medium
            { q: 0, r: -1, priority: 1 },   // Northwest - low
            { q: 1, r: -1, priority: 1 }    // Northeast - low
        ];
        
        // Choose direction based on soldier ID and priority weighting
        const soldierIndex = Math.abs(soldier.id.charCodeAt(0)) % priorityDirections.length;
        let directionIndex = soldierIndex;
        
        // Bias toward high-priority directions
        const random = Math.random();
        if (random < 0.6) { // 60% chance to pick high priority direction
            const highPriorityDirs = priorityDirections
                .map((dir, idx) => ({ ...dir, index: idx }))
                .filter(dir => dir.priority >= 3);
            if (highPriorityDirs.length > 0) {
                directionIndex = highPriorityDirs[soldier.id.charCodeAt(1) % highPriorityDirs.length].index;
            }
        }
        
        const direction = priorityDirections[directionIndex];
        
        // Add some randomness to avoid predictable patterns
        const randomOffset = (Math.random() - 0.5) * 0.4; // ±20% radius variation
        const effectiveRadius = currentRadius * (1 + randomOffset);
        
        logger.debug(`Soldier ${soldier.id} aggressive recon to radius ${effectiveRadius.toFixed(1)} in direction (${direction.q}, ${direction.r}) priority ${direction.priority}`);
        
        return {
            q: Math.round(anthill.q + direction.q * effectiveRadius),
            r: Math.round(anthill.r + direction.r * effectiveRadius)
        };
    }
    
    /**
     * Finds strategic bottlenecks or terrain features to control.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Our anthill
     * @param {Object} analysis - Game state analysis
     * @returns {Object|null} Bottleneck position or null
     */
    findStrategicBottleneck(soldier, anthill, analysis) {
        // For now, this is a placeholder. In a real implementation, this would:
        // 1. Analyze the map data for narrow passages
        // 2. Find bridge-like structures or chokepoints
        // 3. Identify resource-rich areas that need protection
        
        // Simple implementation: patrol resource clusters
        const resources = analysis.resources.visible || [];
        if (resources.length === 0) return null;
        
        // Find resource clusters worth defending
        const resourceClusters = this.findResourceClusters(resources);
        if (resourceClusters.length === 0) return null;
        
        // Choose the most valuable cluster within reasonable distance
        const maxDefenseDistance = 30;
        const viableClusters = resourceClusters.filter(cluster => 
            this.calculateDistance(anthill, cluster.center) <= maxDefenseDistance
        );
        
        if (viableClusters.length === 0) return null;
        
        // Sort by value and pick the best one
        viableClusters.sort((a, b) => b.totalValue - a.totalValue);
        const targetCluster = viableClusters[0];
        
        // Position soldier near but not on top of the cluster
        const offsetDistance = 3;
        const angle = Math.atan2(targetCluster.center.r - anthill.r, targetCluster.center.q - anthill.q);
        
        return {
            q: Math.round(targetCluster.center.q + Math.cos(angle + Math.PI) * offsetDistance),
            r: Math.round(targetCluster.center.r + Math.sin(angle + Math.PI) * offsetDistance)
        };
    }
    
    /**
     * Adaptive patrol that reacts to enemy positions.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Our anthill
     * @param {Array} enemies - Enemy units
     * @param {Object} analysis - Game state analysis
     * @returns {Object} Adaptive patrol position
     */
    getAdaptivePatrolPoint(soldier, anthill, enemies, analysis) {
        // Find the average enemy position to determine threat direction
        const avgEnemyPos = {
            q: enemies.reduce((sum, enemy) => sum + enemy.q, 0) / enemies.length,
            r: enemies.reduce((sum, enemy) => sum + enemy.r, 0) / enemies.length
        };
        
        // Calculate interception vector
        const threatVector = {
            q: avgEnemyPos.q - anthill.q,
            r: avgEnemyPos.r - anthill.r
        };
        
        const threatDistance = Math.sqrt(threatVector.q * threatVector.q + threatVector.r * threatVector.r);
        if (threatDistance === 0) return this.getDefensivePatrolPoint(soldier, anthill, analysis);
        
        const normalizedThreat = {
            q: threatVector.q / threatDistance,
            r: threatVector.r / threatDistance
        };
        
        // Position soldier to intercept threat
        const interceptDistance = Math.min(20, threatDistance * 0.6);
        const baseInterceptPoint = {
            q: anthill.q + normalizedThreat.q * interceptDistance,
            r: anthill.r + normalizedThreat.r * interceptDistance
        };
        
        // Add soldier-specific offset to avoid clustering
        const soldierOffset = Math.abs(soldier.id.charCodeAt(0)) % 6;
        const offsetAngle = (soldierOffset / 6) * Math.PI * 2;
        const offsetRadius = 4;
        
        logger.debug(`Soldier ${soldier.id} adaptive patrol: intercepting threat from (${avgEnemyPos.q.toFixed(1)}, ${avgEnemyPos.r.toFixed(1)})`);
        
        return {
            q: Math.round(baseInterceptPoint.q + Math.cos(offsetAngle) * offsetRadius),
            r: Math.round(baseInterceptPoint.r + Math.sin(offsetAngle) * offsetRadius)
        };
    }
    
    /**
     * Default defensive patrol around the base.
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Our anthill
     * @param {Object} analysis - Game state analysis
     * @returns {Object} Defensive patrol position
     */
    getDefensivePatrolPoint(soldier, anthill, analysis) {
        const patrolRadius = 15;
        const currentDistance = this.calculateDistance(soldier, anthill);
        
        // Add randomness to make patrol less predictable
        const randomOffset = (Math.random() - 0.5) * Math.PI / 2; // ±45 degrees random
        
        if (currentDistance < 10) {
            // Move outward to patrol perimeter
            const angle = Math.atan2(soldier.r - anthill.r, soldier.q - anthill.q) + randomOffset;
            return {
                q: anthill.q + Math.round(patrolRadius * Math.cos(angle)),
                r: anthill.r + Math.round(patrolRadius * Math.sin(angle))
            };
        }
        
        // Continue patrol with random movement
        const angleOffset = (Math.PI / 3) + randomOffset; // 60 degrees + random
        const currentAngle = Math.atan2(soldier.r - anthill.r, soldier.q - anthill.q);
        const newAngle = currentAngle + angleOffset;
        
        return {
            q: anthill.q + Math.round(patrolRadius * Math.cos(newAngle)),
            r: anthill.r + Math.round(patrolRadius * Math.sin(newAngle))
        };
    }
    
    /**
     * Finds clusters of resources that are worth defending.
     * @param {Array} resources - All visible resources
     * @returns {Array} Array of resource clusters with centers and values
     */
    findResourceClusters(resources) {
        const clusters = [];
        const visited = new Set();
        const clusterRadius = 5;
        
        resources.forEach((resource, index) => {
            if (visited.has(index)) return;
            
            const cluster = {
                resources: [resource],
                center: { q: resource.q, r: resource.r },
                totalValue: this.getResourceValue(resource)
            };
            
            visited.add(index);
            
            // Find nearby resources to add to cluster
            resources.forEach((otherResource, otherIndex) => {
                if (visited.has(otherIndex)) return;
                
                const distance = this.calculateDistance(resource, otherResource);
                if (distance <= clusterRadius) {
                    cluster.resources.push(otherResource);
                    cluster.totalValue += this.getResourceValue(otherResource);
                    visited.add(otherIndex);
                }
            });
            
            if (cluster.resources.length > 1) {
                // Recalculate center as average position
                cluster.center.q = cluster.resources.reduce((sum, r) => sum + r.q, 0) / cluster.resources.length;
                cluster.center.r = cluster.resources.reduce((sum, r) => sum + r.r, 0) / cluster.resources.length;
                clusters.push(cluster);
            }
        });
        
        return clusters;
    }
    
    /**
     * Gets the caloric value of a resource.
     * @param {Object} resource - Resource object
     * @returns {number} Caloric value
     */
    getResourceValue(resource) {
        const { FOOD_CALORIES } = require('../constants/GameConstants');
        return FOOD_CALORIES[resource.type] || 0;
    }
    
    /**
     * Finds path from unit to target using A* pathfinding.
     * @param {Object} unit - Source unit
     * @param {Object} target - Target position
     * @param {Object} analysis - Game state analysis
     * @returns {Array|null} Path array or null
     */
    findPath(unit, target, analysis) {
        if (!unit || !target) {
            return null;
        }
        
        // Create walkability check function
        const isWalkable = (pos) => {
            return this.pathValidator.validatePosition(pos, analysis.gameState);
        };
        
        // Use A* pathfinding
        let path = this.pathfinder.findPath(unit, target, isWalkable, 50);
        
        // If no path found, try alternative
        if (!path || path.length === 0) {
            path = this.pathfinder.findAlternativePath(unit, target, isWalkable, 50);
        }
        
        return path;
    }
    
    /**
     * Selects the highest priority enemy target for focus fire.
     * @param {Array} enemies - Array of enemy units
     * @param {Object} anthill - Our anthill position
     * @returns {Object} Highest priority enemy target
     */
    selectPriorityTarget(enemies, anthill) {
        if (enemies.length === 1) return enemies[0];
        
        // Priority 1: Closest to anthill (most dangerous)
        // Priority 2: Lowest health (easiest to kill)
        // Priority 3: Highest threat type (soldiers > scouts > workers)
        
        let bestTarget = null;
        let bestScore = -1;
        
        enemies.forEach(enemy => {
            let score = 0;
            
            // Closer to anthill = higher priority
            const distanceToBase = anthill ? this.calculateDistance(enemy, anthill) : 50;
            score += Math.max(0, 50 - distanceToBase) * 3;
            
            // Lower health = easier target
            const health = enemy.health || 100;
            score += Math.max(0, 100 - health) * 2;
            
            // Higher threat unit types
            if (enemy.type === this.unitTypes.SOLDIER) {
                score += 50; // Soldiers are high priority
            } else if (enemy.type === this.unitTypes.SCOUT) {
                score += 20; // Scouts medium priority
            } else {
                score += 10; // Workers low priority
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestTarget = enemy;
            }
        });
        
        return bestTarget || enemies[0];
    }
    
    /**
     * Calculates hexagonal distance between two positions.
     * @param {Object} pos1 - First position
     * @param {Object} pos2 - Second position
     * @returns {number} Distance in hexes
     */
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
}

module.exports = CombatManager;