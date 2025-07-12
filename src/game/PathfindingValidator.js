const logger = require('../utils/Logger');
const { UNIT_TYPES, UNIT_STATS } = require('../constants/GameConstants');

/**
 * Валидатор путей для проверки корректности движения юнитов
 * с учетом всех игровых ограничений
 */
class PathfindingValidator {
    constructor() {
        this.unitStats = UNIT_STATS;
    }

    /**
     * Проверяет и корректирует путь с учетом всех ограничений
     * @param {Object} unit - Юнит, который движется
     * @param {Array} path - Планируемый путь [{q, r}, ...]
     * @param {Object} gameState - Текущее состояние игры
     * @returns {Object} { validPath: Array, blocked: boolean, reason: string }
     */
    validateAndCorrectPath(unit, path, gameState) {
        if (!path || path.length === 0) {
            return { validPath: [], blocked: false, reason: 'No path' };
        }

        // Создаем карту занятых позиций
        const occupiedPositions = this.buildOccupiedPositionsMap(gameState, unit);
        
        // Проверяем каждый шаг пути
        const validPath = [];
        let currentPosition = { q: unit.q, r: unit.r };
        let remainingMovement = this.unitStats[unit.type]?.speed || 0;

        for (const nextPosition of path) {
            // Проверяем, что следующая позиция примыкает к текущей
            if (!this.isAdjacent(currentPosition, nextPosition)) {
                logger.warn(`Path validation: Non-adjacent move from ${JSON.stringify(currentPosition)} to ${JSON.stringify(nextPosition)}`);
                break;
            }

            // Проверяем стоимость движения (пока считаем все гексы = 1 ОП)
            const moveCost = 1; // TODO: получить реальную стоимость гекса
            if (remainingMovement < moveCost) {
                logger.debug(`Path validation: Not enough movement points. Remaining: ${remainingMovement}, Cost: ${moveCost}`);
                break;
            }

            // Проверяем занятость гекса
            const occupancyCheck = this.checkHexOccupancy(nextPosition, occupiedPositions, unit);
            if (occupancyCheck.blocked) {
                logger.debug(`Path validation: Hex blocked at ${JSON.stringify(nextPosition)}. Reason: ${occupancyCheck.reason}`);
                break;
            }

            // Гекс доступен, добавляем в валидный путь
            validPath.push(nextPosition);
            currentPosition = nextPosition;
            remainingMovement -= moveCost;
        }

        return {
            validPath,
            blocked: validPath.length === 0,
            reason: validPath.length === 0 ? 'Path completely blocked' : 'OK'
        };
    }

    /**
     * Создает карту занятых позиций
     * @param {Object} gameState - Состояние игры
     * @param {Object} movingUnit - Юнит, который движется (его позицию исключаем)
     * @returns {Map} Карта позиций -> информация о занятости
     */
    buildOccupiedPositionsMap(gameState, movingUnit) {
        const occupiedMap = new Map();

        // Добавляем дружественные юниты
        const myUnits = gameState.ants || gameState.myUnits || [];
        myUnits.forEach(unit => {
            // Пропускаем движущийся юнит
            if (unit.id === movingUnit.id) return;
            
            const key = `${unit.q},${unit.r}`;
            occupiedMap.set(key, {
                type: 'friendly',
                unitType: unit.type,
                unitId: unit.id
            });
        });

        // Добавляем вражеские юниты
        const enemyUnits = gameState.enemies || gameState.enemyUnits || [];
        enemyUnits.forEach(unit => {
            const key = `${unit.q},${unit.r}`;
            occupiedMap.set(key, {
                type: 'enemy',
                unitType: unit.type,
                unitId: unit.id
            });
        });

        return occupiedMap;
    }

    /**
     * Проверяет, можно ли зайти на гекс
     * @param {Object} position - Позиция {q, r}
     * @param {Map} occupiedPositions - Карта занятых позиций
     * @param {Object} movingUnit - Движущийся юнит
     * @returns {Object} { blocked: boolean, reason: string }
     */
    checkHexOccupancy(position, occupiedPositions, movingUnit) {
        const key = `${position.q},${position.r}`;
        const occupancy = occupiedPositions.get(key);

        if (!occupancy) {
            return { blocked: false, reason: 'Free' };
        }

        // Правило 1: Нельзя зайти на гекс с вражеским юнитом
        if (occupancy.type === 'enemy') {
            return { blocked: true, reason: 'Enemy unit' };
        }

        // Правило 2: Нельзя зайти на гекс с дружественным юнитом того же типа
        if (occupancy.type === 'friendly' && occupancy.unitType === movingUnit.type) {
            return { blocked: true, reason: `Friendly ${this.getUnitTypeName(occupancy.unitType)} unit` };
        }

        // Можно зайти на гекс с дружественным юнитом другого типа
        return { blocked: false, reason: 'Friendly unit of different type' };
    }

    /**
     * Проверяет, примыкают ли две позиции друг к другу
     * @param {Object} pos1 - Первая позиция {q, r}
     * @param {Object} pos2 - Вторая позиция {q, r}
     * @returns {boolean} true если позиции примыкают
     */
    isAdjacent(pos1, pos2) {
        // В гексагональной сетке есть 6 направлений
        const directions = [
            { q: 1, r: 0 },   // Восток
            { q: 1, r: -1 },  // Северо-восток
            { q: 0, r: -1 },  // Северо-запад
            { q: -1, r: 0 },  // Запад
            { q: -1, r: 1 },  // Юго-запад
            { q: 0, r: 1 }    // Юго-восток
        ];

        for (const dir of directions) {
            if (pos1.q + dir.q === pos2.q && pos1.r + dir.r === pos2.r) {
                return true;
            }
        }

        return false;
    }

    /**
     * Находит альтернативный путь, обходя заблокированные гексы
     * @param {Object} unit - Юнит
     * @param {Object} target - Целевая позиция
     * @param {Object} gameState - Состояние игры
     * @returns {Array|null} Альтернативный путь или null
     */
    findAlternativePath(unit, target, gameState) {
        const occupiedPositions = this.buildOccupiedPositionsMap(gameState, unit);
        
        // Получаем все возможные следующие шаги
        const adjacentHexes = this.getAdjacentHexes(unit);
        
        // Фильтруем доступные гексы
        const availableHexes = adjacentHexes.filter(hex => {
            const check = this.checkHexOccupancy(hex, occupiedPositions, unit);
            return !check.blocked;
        });

        if (availableHexes.length === 0) {
            logger.debug('No available hexes for movement');
            return null;
        }

        // Выбираем гекс, который ближе всего к цели
        const bestHex = availableHexes.reduce((best, hex) => {
            const bestDistance = this.calculateDistance(best, target);
            const hexDistance = this.calculateDistance(hex, target);
            return hexDistance < bestDistance ? hex : best;
        });

        return [bestHex];
    }

    /**
     * Получает все примыкающие гексы
     * @param {Object} position - Позиция {q, r}
     * @returns {Array} Массив примыкающих позиций
     */
    getAdjacentHexes(position) {
        const directions = [
            { q: 1, r: 0 },   // Восток
            { q: 1, r: -1 },  // Северо-восток
            { q: 0, r: -1 },  // Северо-запад
            { q: -1, r: 0 },  // Запад
            { q: -1, r: 1 },  // Юго-запад
            { q: 0, r: 1 }    // Юго-восток
        ];

        return directions.map(dir => ({
            q: position.q + dir.q,
            r: position.r + dir.r
        }));
    }

    /**
     * Вычисляет расстояние между двумя гексами
     * @param {Object} pos1 - Первая позиция
     * @param {Object} pos2 - Вторая позиция
     * @returns {number} Расстояние в гексах
     */
    calculateDistance(pos1, pos2) {
        const q1 = pos1.q || 0;
        const r1 = pos1.r || 0;
        const s1 = -q1 - r1;
        
        const q2 = pos2.q || 0;
        const r2 = pos2.r || 0;
        const s2 = -q2 - r2;
        
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
    }

    /**
     * Получает название типа юнита
     * @param {number} type - Тип юнита
     * @returns {string} Название типа
     */
    getUnitTypeName(type) {
        switch(type) {
            case UNIT_TYPES.WORKER: return 'worker';
            case UNIT_TYPES.SOLDIER: return 'soldier';
            case UNIT_TYPES.SCOUT: return 'scout';
            case UNIT_TYPES.ANTHILL: return 'anthill';
            default: return 'unknown';
        }
    }
}

module.exports = PathfindingValidator;