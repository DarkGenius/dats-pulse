# Константы игры DatsPulse

## Типы юнитов (числовые)
```javascript
const UNIT_TYPES = {
    WORKER: 1,   // Рабочий
    SOLDIER: 2,  // Солдат  
    SCOUT: 3     // Разведчик
};
```

## Типы еды (числовые)
```javascript
const FOOD_TYPES = {
    APPLE: 1,    // Яблоко (10 калорий)
    BREAD: 2,    // Хлеб (25 калорий)
    NECTAR: 3    // Нектар (60 калорий)
};
```

## Статистики юнитов
```javascript
const UNIT_STATS = {
    [UNIT_TYPES.WORKER]: {
        speed: 3,
        vision: 2,
        health: 120,
        attack: 25,
        cargo: 8
    },
    [UNIT_TYPES.SOLDIER]: {
        speed: 4,
        vision: 2,
        health: 180,
        attack: 70,
        cargo: 2
    },
    [UNIT_TYPES.SCOUT]: {
        speed: 7,
        vision: 4,
        health: 100,
        attack: 35,
        cargo: 4
    }
};
```

## Использование в коде

### Проверка типа юнита
```javascript
if (unit.type === UNIT_TYPES.WORKER) {
    // Логика для рабочего
} else if (unit.type === UNIT_TYPES.SCOUT) {
    // Логика для разведчика
}
```

### Фильтрация юнитов
```javascript
const workers = units.filter(u => u.type === UNIT_TYPES.WORKER);
const soldiers = units.filter(u => u.type === UNIT_TYPES.SOLDIER);
```

### Проверка типа еды
```javascript
if (food.type === FOOD_TYPES.NECTAR) {
    // Приоритетный сбор нектара
} else if (food.type === FOOD_TYPES.BREAD) {
    // Сбор хлеба
}
```

### Фильтрация ресурсов
```javascript
const nectarSources = food.filter(f => f.type === FOOD_TYPES.NECTAR);
const breadSources = food.filter(f => f.type === FOOD_TYPES.BREAD);
```

### Получение читаемых имен
```javascript
const unitName = UNIT_TYPE_NAMES[unit.type]; // 'worker', 'soldier', 'scout'
const foodName = FOOD_TYPE_NAMES[food.type]; // 'apple', 'bread', 'nectar'
```

## Важные моменты

1. **Все типы в API - числовые**: Не используйте строковые сравнения
2. **Константы централизованы**: Все в `src/constants/GameConstants.js`
3. **Обратные маппинги**: Для отладки и логирования используйте `*_NAMES` объекты
4. **Статистики**: Используйте `UNIT_STATS[type]` для получения характеристик юнита