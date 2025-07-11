// Типы еды
const FOOD_TYPES = {
    APPLE: 1,
    BREAD: 2,
    NECTAR: 3
};

// Типы юнитов
const UNIT_TYPES = {
    WORKER: 1,
    SOLDIER: 2,
    SCOUT: 3
};

// Обратное отображение для читаемости
const FOOD_TYPE_NAMES = {
    [FOOD_TYPES.APPLE]: 'apple',
    [FOOD_TYPES.BREAD]: 'bread',
    [FOOD_TYPES.NECTAR]: 'nectar'
};

const UNIT_TYPE_NAMES = {
    [UNIT_TYPES.WORKER]: 'worker',
    [UNIT_TYPES.SOLDIER]: 'soldier',
    [UNIT_TYPES.SCOUT]: 'scout'
};

// Калорийность еды
const FOOD_CALORIES = {
    [FOOD_TYPES.APPLE]: 10,
    [FOOD_TYPES.BREAD]: 25,
    [FOOD_TYPES.NECTAR]: 60
};

// Статистики юнитов
const UNIT_STATS = {
    [UNIT_TYPES.SCOUT]: {
        speed: 7,
        vision: 4,
        health: 100,
        attack: 35,
        cargo: 4
    },
    [UNIT_TYPES.SOLDIER]: {
        speed: 4,
        vision: 2,
        health: 180,
        attack: 70,
        cargo: 2
    },
    [UNIT_TYPES.WORKER]: {
        speed: 3,
        vision: 2,
        health: 120,
        attack: 25,
        cargo: 8
    }
};

// Эффективность сбора ресурсов
const COLLECTION_EFFICIENCY = {
    [FOOD_TYPES.NECTAR]: {
        [UNIT_TYPES.SCOUT]: 1.0,
        [UNIT_TYPES.WORKER]: 0.8,
        [UNIT_TYPES.SOLDIER]: 0.6
    },
    [FOOD_TYPES.BREAD]: {
        [UNIT_TYPES.WORKER]: 1.0,
        [UNIT_TYPES.SCOUT]: 0.8,
        [UNIT_TYPES.SOLDIER]: 0.6
    },
    [FOOD_TYPES.APPLE]: {
        [UNIT_TYPES.WORKER]: 1.0,
        [UNIT_TYPES.SCOUT]: 0.9,
        [UNIT_TYPES.SOLDIER]: 0.7
    }
};

module.exports = {
    FOOD_TYPES,
    UNIT_TYPES,
    FOOD_TYPE_NAMES,
    UNIT_TYPE_NAMES,
    FOOD_CALORIES,
    UNIT_STATS,
    COLLECTION_EFFICIENCY
};