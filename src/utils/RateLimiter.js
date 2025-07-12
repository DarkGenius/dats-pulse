const logger = require('./Logger');

/**
 * Rate limiter для ограничения частоты запросов к API.
 * Обеспечивает выполнение не более заданного количества запросов в секунду.
 */
class RateLimiter {
    /**
     * Создает новый экземпляр RateLimiter.
     * @param {number} maxRequestsPerSecond - Максимальное количество запросов в секунду
     * @param {string} name - Название для логирования
     */
    constructor(maxRequestsPerSecond = 3, name = 'API') {
        this.maxRequestsPerSecond = maxRequestsPerSecond;
        this.minInterval = Math.ceil(1000 / maxRequestsPerSecond); // Минимальный интервал между запросами в мс
        this.lastRequestTime = 0;
        this.requestQueue = [];
        this.name = name;
        
        logger.info(`RateLimiter initialized for ${name}: max ${maxRequestsPerSecond} requests/sec, min interval ${this.minInterval}ms`);
    }

    /**
     * Выполняет функцию с учетом ограничения частоты.
     * @param {Function} fn - Функция для выполнения
     * @returns {Promise} Результат выполнения функции
     */
    async execute(fn) {
        return new Promise((resolve, reject) => {
            const executeRequest = async () => {
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastRequestTime;
                
                if (timeSinceLastRequest < this.minInterval) {
                    const delay = this.minInterval - timeSinceLastRequest;
                    logger.debug(`${this.name} RateLimiter: Delaying request by ${delay}ms`);
                    
                    setTimeout(async () => {
                        try {
                            this.lastRequestTime = Date.now();
                            const result = await fn();
                            resolve(result);
                        } catch (error) {
                            reject(error);
                        }
                    }, delay);
                } else {
                    try {
                        this.lastRequestTime = now;
                        const result = await fn();
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }
            };

            executeRequest();
        });
    }

    /**
     * Сбрасывает таймер последнего запроса.
     */
    reset() {
        this.lastRequestTime = 0;
        logger.debug(`${this.name} RateLimiter: Reset`);
    }
}

module.exports = RateLimiter;