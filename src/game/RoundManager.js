const logger = require('../utils/Logger');

/**
 * Управляет жизненным циклом раундов игры.
 * Отслеживает активные и предстоящие раунды, обеспечивает автоматическую регистрацию и ожидание новых раундов.
 */
class RoundManager {
    /**
     * Инициализирует менеджер раундов с API-клиентом.
     * @param {Object} apiClient - Клиент для взаимодействия с API игры
     */
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.currentRound = null;
        this.nextRound = null;
        this.roundsData = null;
        this.lastRoundsCheck = 0;
        this.checkInterval = 30000; // 30 секунд
    }

    /**
     * Проверяет текущие и предстоящие раунды через API.
     * @returns {Promise<Object|null>} Объект с информацией о раундах или null при ошибке
     */
    async checkRounds() {
        try {
            this.roundsData = await this.apiClient.getRounds();
            this.lastRoundsCheck = Date.now();
            
            const now = new Date(this.roundsData.now);
            
            // Найти текущий активный раунд
            this.currentRound = this.roundsData.rounds.find(round => round.status === 'active');
            
            // Найти следующий раунд
            this.nextRound = this.roundsData.rounds
                .filter(round => round.status === 'pending')
                .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))[0];
            
            logger.info(`Rounds check: Current=${this.currentRound?.name || 'none'}, Next=${this.nextRound?.name || 'none'}`);
            
            return {
                currentRound: this.currentRound,
                nextRound: this.nextRound,
                serverTime: now
            };
            
        } catch (error) {
            logger.error('Error checking rounds:', error);
            return null;
        }
    }

    /**
     * Ожидает начала следующего раунда с периодическими проверками.
     * @returns {Promise<Object|null>} Активный раунд когда он становится доступным
     */
    async waitForNextRound() {
        if (!this.nextRound) {
            await this.checkRounds();
        }

        if (!this.nextRound) {
            logger.warn('No upcoming rounds found');
            return null;
        }

        const now = new Date(this.roundsData.now);
        const startTime = new Date(this.nextRound.startAt);
        const waitTime = startTime.getTime() - now.getTime();

        if (waitTime <= 0) {
            logger.info('Next round should have started, checking status...');
            await this.checkRounds();
            return this.currentRound;
        }

        logger.info(`Waiting for round "${this.nextRound.name}" to start in ${Math.ceil(waitTime / 1000)} seconds`);
        logger.info(`Round starts at: ${this.nextRound.startAt}`);

        return new Promise((resolve) => {
            const checkInterval = setInterval(async () => {
                const result = await this.checkRounds();
                
                if (result && result.currentRound) {
                    clearInterval(checkInterval);
                    logger.info(`Round "${result.currentRound.name}" is now active!`);
                    resolve(result.currentRound);
                } else if (result && result.nextRound) {
                    const now = new Date(result.serverTime);
                    const startTime = new Date(result.nextRound.startAt);
                    const remainingTime = startTime.getTime() - now.getTime();
                    
                    if (remainingTime <= 0) {
                        logger.info('Round should have started, but not yet active. Waiting...');
                    } else {
                        logger.info(`Waiting for round "${result.nextRound.name}" - ${Math.ceil(remainingTime / 1000)} seconds remaining`);
                    }
                }
            }, 10000); // Проверяем каждые 10 секунд
        });
    }

    /**
     * Вычисляет время до начала следующего раунда с коррекцией на время клиента.
     * @returns {Object|null} Объект с информацией о времени или null если нет предстоящих раундов
     */
    getTimeUntilNextRound() {
        if (!this.nextRound || !this.roundsData) {
            return null;
        }

        // Используем текущее время клиента для более точного отсчета
        const now = new Date();
        const serverTime = new Date(this.roundsData.now);
        const timeDiff = Date.now() - this.lastRoundsCheck;
        const adjustedServerTime = new Date(serverTime.getTime() + timeDiff);
        
        const startTime = new Date(this.nextRound.startAt);
        const timeUntilStart = startTime.getTime() - adjustedServerTime.getTime();

        if (timeUntilStart <= 0) {
            return null;
        }

        return {
            milliseconds: timeUntilStart,
            seconds: Math.ceil(timeUntilStart / 1000),
            minutes: Math.ceil(timeUntilStart / 60000),
            roundName: this.nextRound.name,
            startAt: this.nextRound.startAt
        };
    }

    /**
     * Получает полный статус текущего состояния раундов.
     * @returns {Object} Объект с информацией о текущем и следующем раундах
     */
    getCurrentRoundStatus() {
        return {
            current: this.currentRound,
            next: this.nextRound,
            waitingForNext: !this.currentRound && !!this.nextRound,
            timeUntilNext: this.getTimeUntilNextRound()
        };
    }

    /**
     * Проверяет, активен ли в данный момент какой-либо раунд.
     * @returns {boolean} true, если есть активный раунд
     */
    isRoundActive() {
        return !!this.currentRound;
    }

    /**
     * Определяет, нужно ли обновить информацию о раундах.
     * @returns {boolean} true, если прошло больше 30 секунд с последней проверки
     */
    shouldRefreshRounds() {
        return Date.now() - this.lastRoundsCheck > this.checkInterval;
    }

    /**
     * Пытается зарегистрироваться на текущий активный раунд.
     * @param {string} teamName - Название команды
     * @returns {Promise<boolean>} true, если регистрация прошла успешно
     */
    async tryRegisterForCurrentRound(teamName) {
        if (!this.currentRound) {
            logger.warn('No current round active for registration');
            return null;
        }

        try {
            const registrationInfo = await this.apiClient.register(teamName);
            logger.info(`Successfully registered for round: ${this.currentRound.name}`);
            return registrationInfo;
        } catch (error) {
            logger.error('Registration failed:', error);
            
            // Проверяем, не закрылось ли лобби
            if (error.message.includes('lobby ended') || error.message.includes('too late')) {
                logger.info('Lobby closed, will wait for next round');
                this.currentRound = null; // Сбрасываем текущий раунд
                return null;
            }
            
            throw error;
        }
    }

    /**
     * Форматирует оставшееся время в читаемом виде.
     * @param {Object} timeInfo - Объект с информацией о времени
     * @returns {string} Отформатированная строка времени
     */
    formatTimeRemaining(timeInfo) {
        if (!timeInfo) return 'Unknown';
        
        const totalSeconds = timeInfo.seconds;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Получает краткую сводку о текущем состоянии раундов.
     * @returns {Object} Объект с сообщением о статусе и дополнительной информацией
     */
    getRoundSummary() {
        const status = this.getCurrentRoundStatus();
        
        if (status.current) {
            return {
                status: 'active',
                message: `Playing in round: ${status.current.name}`,
                roundName: status.current.name
            };
        } else if (status.waitingForNext) {
            const timeStr = this.formatTimeRemaining(status.timeUntilNext);
            return {
                status: 'waiting',
                message: `Waiting for round: ${status.next.name}`,
                countdown: timeStr,
                roundName: status.next.name,
                startAt: status.next.startAt
            };
        } else {
            return {
                status: 'no_rounds',
                message: 'No active or upcoming rounds found'
            };
        }
    }
}

module.exports = RoundManager;