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
     * @param {Object} soldier - Soldier unit
     * @param {Object} anthill - Anthill position
     * @param {Object} analysis - Game state analysis
     * @returns {Object|null} Patrol point or null
     */
    getPatrolPoint(soldier, anthill, analysis) {
        const gameState = analysis.gameState;
        const turn = gameState.turnNo || 0;
        
        // AGGRESSIVE SCOUTING: Early game - send soldiers to explore for enemy bases
        if (turn < 100) {
            // Send soldiers to explore in different directions from base
            const explorationRadius = 20 + (turn / 5); // Gradually expand search
            const directions = [
                { q: 1, r: 0 },   // East
                { q: 0, r: 1 },   // Southeast  
                { q: -1, r: 1 },  // Southwest
                { q: -1, r: 0 },  // West
                { q: 0, r: -1 },  // Northwest
                { q: 1, r: -1 }   // Northeast
            ];
            
            // Choose direction based on soldier ID for consistent exploration
            const dirIndex = Math.abs(soldier.id.charCodeAt(0)) % directions.length;
            const direction = directions[dirIndex];
            
            return {
                q: anthill.q + Math.round(explorationRadius * direction.q),
                r: anthill.r + Math.round(explorationRadius * direction.r)
            };
        }
        
        // DEFENSIVE PATROL: Later game - patrol defensively around base
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