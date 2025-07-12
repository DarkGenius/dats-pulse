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
        
        // Priority 2: Attack nearest enemies
        soldiers.forEach(soldier => {
            // Find enemies within reasonable distance (20 hexes)
            const nearbyEnemies = enemyUnits.filter(enemy => 
                this.calculateDistance(soldier, enemy) <= 20
            );
            
            if (nearbyEnemies.length > 0) {
                // Sort by distance
                nearbyEnemies.sort((a, b) => 
                    this.calculateDistance(soldier, a) - this.calculateDistance(soldier, b)
                );
                
                const target = nearbyEnemies[0];
                const path = this.findPath(soldier, target, analysis);
                
                if (path && path.length > 0) {
                    moves.push({
                        unit_id: soldier.id,
                        path: path,
                        assignment: {
                            type: 'attack_enemy',
                            target: target,
                            priority: 'high'
                        }
                    });
                    logger.info(`Soldier ${soldier.id} attacking enemy at (${target.q}, ${target.r})`);
                }
            } else if (anthill) {
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
        // Patrol in a circle around anthill at distance 8-10
        const patrolRadius = 10;
        const currentDistance = this.calculateDistance(soldier, anthill);
        
        // If too close, move away
        if (currentDistance < 8) {
            const angle = Math.atan2(soldier.r - anthill.r, soldier.q - anthill.q);
            return {
                q: anthill.q + Math.round(patrolRadius * Math.cos(angle)),
                r: anthill.r + Math.round(patrolRadius * Math.sin(angle))
            };
        }
        
        // If at good distance, patrol around
        const angleOffset = Math.PI / 4; // 45 degrees
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