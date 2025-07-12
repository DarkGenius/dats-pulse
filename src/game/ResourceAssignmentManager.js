const logger = require('../utils/Logger');

/**
 * Централизованная система управления назначениями ресурсов.
 * Предотвращает конфликты, когда несколько юнитов назначаются на один ресурс.
 * Обеспечивает автоматическое переназначение при потере юнитов.
 */
class ResourceAssignmentManager {
    constructor() {
        // Map: resourceKey -> { unitId, resourceInfo, assignedAt, priority }
        this.resourceReservations = new Map();
        
        // Map: unitId -> { resourceKey, assignment }
        this.unitAssignments = new Map();
        
        // Set of units that died and need cleanup
        this.deadUnits = new Set();
        
        // Timeout for stale assignments (10 turns)
        this.assignmentTimeout = 10 * 60 * 1000; // 10 minutes in ms
    }

    /**
     * Создает уникальный ключ для ресурса на основе его координат
     * @param {Object} resource - Ресурс с координатами q, r
     * @returns {string} Уникальный ключ ресурса
     */
    getResourceKey(resource) {
        return `${resource.q}_${resource.r}_${resource.type}`;
    }

    /**
     * Резервирует ресурс для конкретного юнита
     * @param {string} unitId - ID юнита
     * @param {Object} resource - Ресурс для резервирования
     * @param {number} priority - Приоритет назначения (выше = важнее)
     * @param {Object} assignmentInfo - Дополнительная информация о назначении
     * @returns {boolean} true, если ресурс успешно зарезервирован
     */
    reserveResource(unitId, resource, priority, assignmentInfo = {}) {
        const resourceKey = this.getResourceKey(resource);
        const existingReservation = this.resourceReservations.get(resourceKey);
        
        // Проверяем, есть ли уже резервирование этого ресурса
        if (existingReservation) {
            // Если приоритет нового назначения выше, то заменяем
            if (priority > existingReservation.priority) {
                logger.info(`🔄 Unit ${unitId} taking over resource at (${resource.q}, ${resource.r}) from unit ${existingReservation.unitId} (priority ${priority} > ${existingReservation.priority})`);
                
                // Освобождаем предыдущее назначение
                this.releaseUnitAssignment(existingReservation.unitId);
            } else {
                logger.debug(`❌ Unit ${unitId} cannot reserve resource at (${resource.q}, ${resource.r}) - already reserved by unit ${existingReservation.unitId} with higher priority`);
                return false;
            }
        }
        
        // Освобождаем предыдущее назначение юнита, если оно было
        this.releaseUnitAssignment(unitId);
        
        // Создаем новое резервирование
        const reservation = {
            unitId,
            resourceInfo: resource,
            assignedAt: Date.now(),
            priority,
            assignmentInfo
        };
        
        this.resourceReservations.set(resourceKey, reservation);
        this.unitAssignments.set(unitId, {
            resourceKey,
            assignment: {
                type: 'resource_collection',
                target: resource,
                priority,
                ...assignmentInfo
            }
        });
        
        logger.info(`✅ Unit ${unitId} reserved resource at (${resource.q}, ${resource.r}) with priority ${priority}`);
        return true;
    }

    /**
     * Освобождает резервирование ресурса для юнита
     * @param {string} unitId - ID юнита
     */
    releaseUnitAssignment(unitId) {
        const unitAssignment = this.unitAssignments.get(unitId);
        if (unitAssignment) {
            const reservation = this.resourceReservations.get(unitAssignment.resourceKey);
            if (reservation && reservation.unitId === unitId) {
                this.resourceReservations.delete(unitAssignment.resourceKey);
                logger.debug(`🔓 Released resource reservation for unit ${unitId}`);
            }
            this.unitAssignments.delete(unitId);
        }
    }

    /**
     * Проверяет, зарезервирован ли ресурс
     * @param {Object} resource - Ресурс для проверки
     * @returns {boolean} true, если ресурс зарезервирован
     */
    isResourceReserved(resource) {
        const resourceKey = this.getResourceKey(resource);
        return this.resourceReservations.has(resourceKey);
    }

    /**
     * Получает ID юнита, который зарезервировал ресурс
     * @param {Object} resource - Ресурс
     * @returns {string|null} ID юнита или null
     */
    getResourceReserver(resource) {
        const resourceKey = this.getResourceKey(resource);
        const reservation = this.resourceReservations.get(resourceKey);
        return reservation ? reservation.unitId : null;
    }

    /**
     * Получает назначение для юнита
     * @param {string} unitId - ID юнита
     * @returns {Object|null} Назначение юнита или null
     */
    getUnitAssignment(unitId) {
        const unitAssignment = this.unitAssignments.get(unitId);
        return unitAssignment ? unitAssignment.assignment : null;
    }

    /**
     * Получает список всех доступных (незарезервированных) ресурсов
     * @param {Array} resources - Список всех ресурсов
     * @returns {Array} Список доступных ресурсов
     */
    getAvailableResources(resources) {
        return resources.filter(resource => !this.isResourceReserved(resource));
    }

    /**
     * Обновляет состояние назначений на основе текущего состояния игры
     * @param {Object} analysis - Анализ состояния игры
     */
    updateAssignments(analysis) {
        const currentTime = Date.now();
        const aliveUnitIds = new Set(analysis.units.myUnits.map(unit => unit.id));
        const availableResourceKeys = new Set(
            analysis.resources.visible.map(resource => this.getResourceKey(resource))
        );

        // Найти мертвых юнитов и освободить их резервирования
        for (const [unitId, unitAssignment] of this.unitAssignments) {
            if (!aliveUnitIds.has(unitId)) {
                logger.warn(`💀 Unit ${unitId} is dead, releasing its resource reservation`);
                this.releaseUnitAssignment(unitId);
                this.deadUnits.add(unitId);
            }
        }

        // Найти исчезнувшие ресурсы и освободить их резервирования
        for (const [resourceKey, reservation] of this.resourceReservations) {
            if (!availableResourceKeys.has(resourceKey)) {
                logger.warn(`🚫 Resource at ${resourceKey} no longer available, releasing reservation for unit ${reservation.unitId}`);
                this.releaseUnitAssignment(reservation.unitId);
            }
        }

        // Очистить устаревшие назначения
        for (const [resourceKey, reservation] of this.resourceReservations) {
            if (currentTime - reservation.assignedAt > this.assignmentTimeout) {
                logger.warn(`⏰ Assignment for unit ${reservation.unitId} has timed out, releasing resource ${resourceKey}`);
                this.releaseUnitAssignment(reservation.unitId);
            }
        }

        // Логируем статистику
        this.logAssignmentStats();
    }

    /**
     * Попытка переназначить освободившиеся ресурсы юнитам с менее приоритетными задачами
     * @param {Array} availableUnits - Доступные юниты для переназначения
     * @param {Array} availableResources - Доступные ресурсы
     * @param {Function} priorityCalculator - Функция расчета приоритета ресурса для юнита
     */
    reassignOrphanedResources(availableUnits, availableResources, priorityCalculator) {
        const unassignedUnits = availableUnits.filter(unit => !this.getUnitAssignment(unit.id));
        const availableResourcesList = this.getAvailableResources(availableResources);

        if (unassignedUnits.length === 0 || availableResourcesList.length === 0) {
            return;
        }

        // Сортируем ресурсы по приоритету
        const resourcePriorities = availableResourcesList.map(resource => ({
            resource,
            bestUnit: null,
            bestPriority: 0
        }));

        // Для каждого ресурса находим лучшего доступного юнита
        resourcePriorities.forEach(resInfo => {
            unassignedUnits.forEach(unit => {
                const priority = priorityCalculator(unit, resInfo.resource);
                if (priority > resInfo.bestPriority) {
                    resInfo.bestPriority = priority;
                    resInfo.bestUnit = unit;
                }
            });
        });

        // Сортируем по убыванию приоритета и назначаем
        resourcePriorities
            .filter(resInfo => resInfo.bestUnit !== null)
            .sort((a, b) => b.bestPriority - a.bestPriority)
            .forEach(resInfo => {
                if (this.reserveResource(resInfo.bestUnit.id, resInfo.resource, resInfo.bestPriority)) {
                    logger.info(`🔄 Reassigned unit ${resInfo.bestUnit.id} to resource at (${resInfo.resource.q}, ${resInfo.resource.r})`);
                }
            });
    }

    /**
     * Логирует статистику назначений для отладки
     */
    logAssignmentStats() {
        const reservationCount = this.resourceReservations.size;
        const assignmentCount = this.unitAssignments.size;
        
        if (reservationCount > 0 || assignmentCount > 0) {
            logger.debug(`📊 Resource assignments: ${assignmentCount} units assigned to ${reservationCount} resources`);
            
            // Детальная информация для отладки
            if (logger.level === 'DEBUG') {
                for (const [resourceKey, reservation] of this.resourceReservations) {
                    logger.debug(`  🎯 Resource ${resourceKey} -> Unit ${reservation.unitId} (priority: ${reservation.priority})`);
                }
            }
        }
    }

    /**
     * Получает список всех зарезервированных ресурсов для отладки
     * @returns {Array} Список зарезервированных ресурсов
     */
    getReservedResources() {
        return Array.from(this.resourceReservations.entries()).map(([resourceKey, reservation]) => ({
            resourceKey,
            unitId: reservation.unitId,
            priority: reservation.priority,
            assignedAt: reservation.assignedAt
        }));
    }

    /**
     * Очищает все назначения (для сброса состояния)
     */
    clearAllAssignments() {
        this.resourceReservations.clear();
        this.unitAssignments.clear();
        this.deadUnits.clear();
        logger.info('🧹 Cleared all resource assignments');
    }
}

module.exports = ResourceAssignmentManager;