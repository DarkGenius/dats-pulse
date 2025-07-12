const logger = require('../utils/Logger');

/**
 * A* Pathfinding implementation for hexagonal grid.
 * Finds optimal paths avoiding obstacles and blocked tiles.
 */
class AStarPathfinder {
    constructor() {
        // Hexagonal directions: [q, r] offsets
        this.directions = [
            [1, 0],   // East
            [1, -1],  // Northeast
            [0, -1],  // Northwest
            [-1, 0],  // West
            [-1, 1],  // Southwest
            [0, 1]    // Southeast
        ];
    }

    /**
     * Find the shortest path from start to goal using A* algorithm.
     * @param {Object} start - Starting position {q, r}
     * @param {Object} goal - Goal position {q, r}
     * @param {Function} isWalkable - Function to check if a tile is walkable
     * @param {number} maxDistance - Maximum search distance (default: 100)
     * @returns {Array|null} Array of positions from start to goal, or null if no path
     */
    findPath(start, goal, isWalkable, maxDistance = 100) {
        // Quick validation
        if (!start || !goal || !isWalkable) {
            return null;
        }

        // If start equals goal, return empty path
        if (start.q === goal.q && start.r === goal.r) {
            return [];
        }

        // If goal is not walkable, return null
        if (!isWalkable(goal)) {
            logger.debug(`Goal (${goal.q}, ${goal.r}) is not walkable`);
            return null;
        }

        const openSet = new Map();
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const startKey = this.getKey(start);
        const goalKey = this.getKey(goal);

        // Initialize start node
        gScore.set(startKey, 0);
        fScore.set(startKey, this.heuristic(start, goal));
        openSet.set(startKey, start);

        let nodesExplored = 0;
        const maxNodes = maxDistance * 6; // Approximate max nodes to explore

        while (openSet.size > 0) {
            // Prevent infinite loops
            nodesExplored++;
            if (nodesExplored > maxNodes) {
                logger.debug(`A* search exceeded max nodes (${maxNodes})`);
                return null;
            }

            // Find node with lowest fScore
            let current = null;
            let currentKey = null;
            let lowestF = Infinity;

            for (const [key, node] of openSet) {
                const f = fScore.get(key) || Infinity;
                if (f < lowestF) {
                    lowestF = f;
                    current = node;
                    currentKey = key;
                }
            }

            if (!current) break;

            // Check if we reached the goal
            if (currentKey === goalKey) {
                return this.reconstructPath(cameFrom, current);
            }

            // Move current from open to closed set
            openSet.delete(currentKey);
            closedSet.add(currentKey);

            // Check all neighbors
            for (const [dq, dr] of this.directions) {
                const neighbor = {
                    q: current.q + dq,
                    r: current.r + dr
                };
                const neighborKey = this.getKey(neighbor);

                // Skip if already evaluated
                if (closedSet.has(neighborKey)) {
                    continue;
                }

                // Skip if not walkable
                if (!isWalkable(neighbor)) {
                    continue;
                }

                // Calculate tentative gScore
                const tentativeGScore = (gScore.get(currentKey) || 0) + 1;

                // Skip if distance too far
                if (tentativeGScore > maxDistance) {
                    continue;
                }

                // Check if this path to neighbor is better
                const neighborGScore = gScore.get(neighborKey) || Infinity;
                
                if (tentativeGScore < neighborGScore) {
                    // This is a better path, record it
                    cameFrom.set(neighborKey, current);
                    gScore.set(neighborKey, tentativeGScore);
                    fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor, goal));

                    // Add neighbor to open set if not already there
                    if (!openSet.has(neighborKey)) {
                        openSet.set(neighborKey, neighbor);
                    }
                }
            }
        }

        // No path found
        logger.debug(`No path found from (${start.q}, ${start.r}) to (${goal.q}, ${goal.r})`);
        return null;
    }

    /**
     * Calculate heuristic distance for A* (using hexagonal distance).
     * @param {Object} a - Position {q, r}
     * @param {Object} b - Position {q, r}
     * @returns {number} Estimated distance
     */
    heuristic(a, b) {
        // Convert to cube coordinates for accurate hex distance
        const s1 = -a.q - a.r;
        const s2 = -b.q - b.r;
        
        return Math.max(
            Math.abs(a.q - b.q),
            Math.abs(a.r - b.r),
            Math.abs(s1 - s2)
        );
    }

    /**
     * Reconstruct path from cameFrom map.
     * @param {Map} cameFrom - Map of node origins
     * @param {Object} current - Goal node
     * @returns {Array} Path from start to goal
     */
    reconstructPath(cameFrom, current) {
        const path = [];
        
        while (current) {
            path.unshift({ q: current.q, r: current.r });
            const key = this.getKey(current);
            current = cameFrom.get(key);
        }

        // Remove the starting position
        if (path.length > 0) {
            path.shift();
        }

        return path;
    }

    /**
     * Get unique key for a position.
     * @param {Object} pos - Position {q, r}
     * @returns {string} Unique key
     */
    getKey(pos) {
        return `${pos.q},${pos.r}`;
    }

    /**
     * Find alternative path if direct path is blocked.
     * Tries multiple goal offsets to find a reachable position.
     * @param {Object} start - Starting position
     * @param {Object} goal - Original goal position
     * @param {Function} isWalkable - Function to check walkability
     * @param {number} maxDistance - Maximum search distance
     * @returns {Array|null} Path to goal or nearby position
     */
    findAlternativePath(start, goal, isWalkable, maxDistance = 100) {
        // First try direct path
        const directPath = this.findPath(start, goal, isWalkable, maxDistance);
        if (directPath) {
            return directPath;
        }

        // If direct path fails, try adjacent positions
        for (const [dq, dr] of this.directions) {
            const altGoal = {
                q: goal.q + dq,
                r: goal.r + dr
            };

            if (isWalkable(altGoal)) {
                const altPath = this.findPath(start, altGoal, isWalkable, maxDistance);
                if (altPath) {
                    logger.debug(`Found alternative path to (${altGoal.q}, ${altGoal.r}) instead of (${goal.q}, ${goal.r})`);
                    return altPath;
                }
            }
        }

        return null;
    }
}

module.exports = AStarPathfinder;