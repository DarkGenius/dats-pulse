const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    UNIT_STATS 
} = require('../constants/GameConstants');

class UnitManager {
    constructor() {
        this.unitStats = UNIT_STATS;
        this.foodTypes = FOOD_TYPES;
        this.unitTypes = UNIT_TYPES;
        this.foodTypeNames = FOOD_TYPE_NAMES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        
        this.movementQueue = [];
        this.unitAssignments = new Map();
    }

    planUnitActions(analysis, strategy) {
        const moves = [];
        const myUnits = analysis.units.myUnits;
        
        this.clearOldAssignments();
        
        myUnits.forEach(unit => {
            const unitAction = this.planUnitAction(unit, analysis, strategy);
            if (unitAction) {
                moves.push(unitAction);
                this.unitAssignments.set(unit.id, unitAction);
            }
        });

        return { moves };
    }

    planUnitAction(unit, analysis, strategy) {
        const existingAssignment = this.unitAssignments.get(unit.id);
        
        if (existingAssignment && this.shouldContinueAssignment(existingAssignment, analysis)) {
            return this.continueAssignment(unit, existingAssignment, analysis);
        }

        const newAssignment = this.assignNewTask(unit, analysis, strategy);
        return newAssignment;
    }

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

    continueAssignment(unit, assignment, analysis) {
        const target = assignment.target;
        const path = this.findPath(unit, target, analysis);
        
        if (path && path.length > 0) {
            return {
                unit_id: unit.id,
                move: path[0],
                assignment: assignment
            };
        }
        
        return null;
    }

    assignNewTask(unit, analysis, strategy) {
        const taskPriority = this.getTaskPriority(unit, analysis, strategy);
        
        for (const task of taskPriority) {
            const action = this.executeTask(unit, task, analysis, strategy);
            if (action) {
                return action;
            }
        }
        
        return this.defaultBehavior(unit, analysis);
    }

    getTaskPriority(unit, analysis, strategy) {
        const tasks = [];
        const phase = strategy.phase;
        
        if (analysis.threats.immediateThreats.length > 0) {
            tasks.push('immediate_defense');
        }
        
        const unitTypeName = this.unitTypeNames[unit.type];
        if (unitTypeName === 'scout') {
            tasks.push('nectar_collection', 'exploration', 'resource_scouting');
        } else if (unitTypeName === 'soldier') {
            tasks.push('combat', 'convoy_protection', 'territory_defense');
        } else if (unitTypeName === 'worker') {
            tasks.push('bread_collection', 'apple_collection', 'construction');
        }
        
        if (phase === 'early') {
            tasks.push('resource_collection', 'exploration');
        } else if (phase === 'mid') {
            tasks.push('territory_control', 'resource_optimization');
        } else if (phase === 'late') {
            tasks.push('high_value_resources', 'enemy_disruption');
        }
        
        return tasks;
    }

    executeTask(unit, task, analysis, strategy) {
        switch (task) {
            case 'immediate_defense':
                return this.defendAnthill(unit, analysis);
            case 'nectar_collection':
                return this.collectNectar(unit, analysis);
            case 'bread_collection':
                return this.collectBread(unit, analysis);
            case 'apple_collection':
                return this.collectApples(unit, analysis);
            case 'exploration':
                return this.exploreMap(unit, analysis);
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
                    move: path[0],
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

    collectNectar(unit, analysis) {
        const nectarResources = analysis.resources.byType.nectar;
        if (nectarResources.length === 0) {
            return null;
        }

        const nearestNectar = this.findNearestResource(unit, nectarResources);
        if (nearestNectar) {
            const path = this.findPath(unit, nearestNectar, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'resource_collection',
                        target: nearestNectar,
                        resource_type: this.foodTypes.NECTAR,
                        priority: 'high'
                    }
                };
            }
        }
        
        return null;
    }

    collectBread(unit, analysis) {
        const breadResources = analysis.resources.byType.bread;
        if (breadResources.length === 0) {
            return null;
        }

        const nearestBread = this.findNearestResource(unit, breadResources);
        if (nearestBread) {
            const path = this.findPath(unit, nearestBread, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
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

    collectApples(unit, analysis) {
        const appleResources = analysis.resources.byType.apple;
        if (appleResources.length === 0) {
            return null;
        }

        const nearestApple = this.findNearestResource(unit, appleResources);
        if (nearestApple) {
            const path = this.findPath(unit, nearestApple, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
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
                move: path[0],
                assignment: {
                    type: 'exploration',
                    target: bestTarget,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

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
                move: path[0],
                assignment: {
                    type: 'combat',
                    target: bestTarget.unit,
                    priority: 'high'
                }
            };
        }
        
        return null;
    }

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
                move: path[0],
                assignment: {
                    type: 'convoy_protection',
                    target: workerToProtect,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

    defendTerritory(unit, analysis) {
        const territoryThreats = analysis.threats.nearbyThreats;
        if (territoryThreats.length === 0) {
            return null;
        }

        const patrolPoints = this.generatePatrolPoints(analysis);
        const nearestPatrolPoint = this.findNearestPosition(unit, patrolPoints);
        
        if (nearestPatrolPoint) {
            const path = this.findPath(unit, nearestPatrolPoint, analysis);
            
            if (path && path.length > 0) {
                return {
                    unit_id: unit.id,
                    move: path[0],
                    assignment: {
                        type: 'territory_defense',
                        target: nearestPatrolPoint,
                        priority: 'medium'
                    }
                };
            }
        }
        
        return null;
    }

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
                move: path[0],
                assignment: {
                    type: 'resource_scouting',
                    target: bestTarget,
                    priority: 'medium'
                }
            };
        }
        
        return null;
    }

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
                move: path[0],
                assignment: {
                    type: 'patrol',
                    target: randomNearbyPoint,
                    priority: 'low'
                }
            };
        }
        
        return null;
    }

    findPath(unit, target, analysis) {
        if (!unit || !target) {
            return null;
        }

        const directPath = this.calculateDirectPath(unit, target);
        
        if (directPath.length === 0) {
            return null;
        }

        const safetyCheckedPath = this.verifySafety(directPath, analysis);
        return safetyCheckedPath;
    }

    calculateDirectPath(start, end) {
        const dq = end.q - start.q;
        const dr = end.r - start.r;
        
        if (Math.abs(dq) === 0 && Math.abs(dr) === 0) {
            return [];
        }

        const stepQ = dq !== 0 ? Math.sign(dq) : 0;
        const stepR = dr !== 0 ? Math.sign(dr) : 0;
        
        return [{ q: start.q + stepQ, r: start.r + stepR }];
    }

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

    generateExplorationTargets(unit, analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const targets = [];
        const vision = this.unitStats[unit.type].vision;
        
        for (let radius = vision; radius <= vision * 3; radius += vision) {
            const ringTargets = this.generateRingPositions(anthill, radius);
            targets.push(...ringTargets);
        }

        return targets.filter(target => 
            !this.isPositionExplored(target, analysis)
        );
    }

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

    generatePatrolPoints(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const patrolRadius = 8;
        return this.generateRingPositions(anthill, patrolRadius);
    }

    identifyUnexploredAreas(analysis) {
        const anthill = analysis.units.anthill;
        if (!anthill) {
            return [];
        }

        const unexplored = [];
        const searchRadius = 15;

        for (let q = anthill.q - searchRadius; q <= anthill.q + searchRadius; q++) {
            for (let r = anthill.r - searchRadius; r <= anthill.r + searchRadius; r++) {
                const point = { q, r };
                if (!this.isPositionExplored(point, analysis)) {
                    unexplored.push(point);
                }
            }
        }

        return unexplored;
    }

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

    getResourceValue(resource) {
        const { FOOD_CALORIES } = require('../constants/GameConstants');
        return FOOD_CALORIES[resource.type] || 0;
    }

    getRandomNearbyPoint(center, radius) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * radius;
        
        return {
            q: Math.round(center.q + Math.cos(angle) * distance),
            r: Math.round(center.r + Math.sin(angle) * distance)
        };
    }

    isResourceStillAvailable(resource, analysis) {
        return analysis.resources.visible.some(r => 
            r.q === resource.q && r.r === resource.r && r.type === resource.type
        );
    }

    isTargetStillValid(target, analysis) {
        return analysis.units.enemyUnits.some(enemy => 
            enemy.q === target.q && enemy.r === target.r
        );
    }

    isAreaExplored(target, analysis) {
        return false;
    }

    isPositionExplored(position, analysis) {
        return false;
    }

    canEngageThreat(unit, threat, analysis) {
        const unitStrength = this.unitStats[unit.type].attack;
        const threatStrength = this.unitStats[threat.unit.type]?.attack || 50;
        
        return unitStrength >= threatStrength * 0.7;
    }

    isWorkerVulnerable(worker, analysis) {
        const nearbyThreats = analysis.threats.threats.filter(threat => 
            this.calculateDistance(worker, threat.unit) <= 5
        );
        
        const nearbyAllies = analysis.units.myUnits.filter(ally => 
            ally.type === this.unitTypes.SOLDIER && this.calculateDistance(worker, ally) <= 3
        );
        
        return nearbyThreats.length > 0 && nearbyAllies.length === 0;
    }

    clearOldAssignments() {
        const currentTime = Date.now();
        const maxAge = 30000;
        
        for (const [unitId, assignment] of this.unitAssignments) {
            if (currentTime - assignment.timestamp > maxAge) {
                this.unitAssignments.delete(unitId);
            }
        }
    }

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
}

module.exports = UnitManager;