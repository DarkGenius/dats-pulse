const logger = require('../utils/Logger');
const { 
    FOOD_TYPES, 
    UNIT_TYPES, 
    FOOD_TYPE_NAMES, 
    UNIT_TYPE_NAMES, 
    FOOD_CALORIES,
    COLLECTION_EFFICIENCY 
} = require('../constants/GameConstants');

class ResourceManager {
    constructor() {
        this.resourceValues = FOOD_CALORIES;
        this.collectionEfficiency = COLLECTION_EFFICIENCY;
        this.foodTypes = FOOD_TYPES;
        this.unitTypes = UNIT_TYPES;
        this.foodTypeNames = FOOD_TYPE_NAMES;
        this.unitTypeNames = UNIT_TYPE_NAMES;
        
        this.resourceAssignments = new Map();
        this.collectionHistory = [];
    }

    planResourceCollection(analysis, strategy) {
        const actions = [];
        const availableUnits = this.getAvailableUnits(analysis);
        const prioritizedResources = this.prioritizeResources(analysis, strategy);
        
        this.updateResourceAssignments(analysis);
        
        prioritizedResources.forEach(resourceInfo => {
            const assignment = this.assignUnitsToResource(
                resourceInfo,
                availableUnits,
                analysis,
                strategy
            );
            
            if (assignment) {
                actions.push(assignment);
                this.resourceAssignments.set(resourceInfo.resource.id, assignment);
            }
        });
        
        const logisticsActions = this.planLogistics(analysis, strategy);
        actions.push(...logisticsActions);
        
        return { actions };
    }

    getAvailableUnits(analysis) {
        return analysis.units.myUnits.filter(unit => 
            !this.isUnitAssigned(unit.id) && 
            !this.isUnitInCombat(unit, analysis)
        );
    }

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

    calculateResourcePriority(resource, analysis, strategy) {
        let priority = 1.0;
        const phase = strategy.phase;
        
        if (resource.type === this.foodTypes.NECTAR) {
            priority *= 3.0;
            
            const distance = this.calculateNearestDistance(resource, analysis);
            if (distance <= 6) {
                priority *= 2.0;
            }
        } else if (resource.type === this.foodTypes.BREAD) {
            priority *= 2.0;
            
            const distance = this.calculateNearestDistance(resource, analysis);
            if (distance <= 4) {
                priority *= 1.5;
            }
        } else if (resource.type === this.foodTypes.APPLE) {
            priority *= 1.0;
        }
        
        if (phase === 'early') {
            if (resource.type === this.foodTypes.BREAD) {
                priority *= 1.5;
            }
        } else if (phase === 'mid') {
            if (resource.type === this.foodTypes.NECTAR) {
                priority *= 1.3;
            }
        } else if (phase === 'late') {
            if (resource.type === this.foodTypes.NECTAR) {
                priority *= 1.8;
            }
        }
        
        const safety = this.calculateResourceSafety(resource, analysis);
        priority *= safety;
        
        return priority;
    }

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

    calculateCollectionEfficiency(resource, analysis) {
        const availableUnits = this.getAvailableUnits(analysis);
        const unitTypes = availableUnits.map(unit => unit.type);
        
        const efficiencies = unitTypes.map(type => 
            this.collectionEfficiency[resource.type]?.[type] || 0.5
        );
        
        return efficiencies.length > 0 ? Math.max(...efficiencies) : 0.5;
    }

    assignUnitsToResource(resourceInfo, availableUnits, analysis, strategy) {
        const resource = resourceInfo.resource;
        const bestUnits = this.selectBestUnitsForResource(resource, availableUnits, analysis);
        
        if (bestUnits.length === 0) {
            return null;
        }
        
        const assignment = {
            resource: resource,
            units: bestUnits,
            strategy: this.determineCollectionStrategy(resource, bestUnits, analysis),
            estimatedYield: this.calculateEstimatedYield(resource, bestUnits),
            safety: resourceInfo.priority
        };
        
        bestUnits.forEach(unit => {
            this.markUnitAsAssigned(unit.id, assignment);
        });
        
        return assignment;
    }

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

    calculateUnitResourceScore(unit, resource, analysis) {
        let score = 0;
        
        const efficiency = this.collectionEfficiency[resource.type]?.[unit.type] || 0.5;
        score += efficiency * 10;
        
        const distance = this.calculateDistance(unit, resource);
        score += Math.max(0, 10 - distance);
        
        const unitTypeName = this.unitTypeNames[unit.type];
        const cargo = this.getUnitCargoCapacity(unitTypeName);
        score += cargo * 0.5;
        
        const safety = this.calculateUnitSafety(unit, resource, analysis);
        score *= safety;
        
        return score;
    }

    getUnitCargoCapacity(unitType) {
        const capacities = {
            worker: 8,
            scout: 4,
            fighter: 2
        };
        return capacities[unitType] || 2;
    }

    calculateUnitSafety(unit, resource, analysis) {
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
    }

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

    isResourceAvailable(resourceId, analysis) {
        return analysis.resources.visible.some(resource => 
            resource.id === resourceId
        );
    }

    isUnitAssigned(unitId) {
        for (const assignment of this.resourceAssignments.values()) {
            if (assignment.units.some(unit => unit.id === unitId)) {
                return true;
            }
        }
        return false;
    }

    isUnitInCombat(unit, analysis) {
        const threats = analysis.threats.threats;
        return threats.some(threat => 
            this.calculateDistance(unit, threat.unit) <= 2
        );
    }

    markUnitAsAssigned(unitId, assignment) {
        assignment.timestamp = Date.now();
    }

    unmarkUnitAsAssigned(unitId) {
    }

    unitHasResources(unit) {
        return unit.cargo && unit.cargo > 0;
    }

    calculateUnitResourceValue(unit) {
        if (!unit.cargo || unit.cargo === 0) {
            return 0;
        }
        
        return unit.cargo * 15;
    }

    calculateDistance(pos1, pos2) {
        if (!pos1 || !pos2) return Infinity;
        
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        
        return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dx + dy));
    }
}

module.exports = ResourceManager;