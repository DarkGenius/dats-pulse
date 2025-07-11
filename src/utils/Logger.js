class Logger {
    constructor() {
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3
        };
        this.currentLevel = this.levels.INFO;
    }

    setLevel(level) {
        this.currentLevel = this.levels[level.toUpperCase()] || this.levels.INFO;
    }

    debug(...args) {
        if (this.currentLevel <= this.levels.DEBUG) {
            console.log(`[DEBUG ${this.timestamp()}]`, ...args);
        }
    }

    info(...args) {
        if (this.currentLevel <= this.levels.INFO) {
            console.log(`[INFO ${this.timestamp()}]`, ...args);
        }
    }

    warn(...args) {
        if (this.currentLevel <= this.levels.WARN) {
            console.warn(`[WARN ${this.timestamp()}]`, ...args);
        }
    }

    error(...args) {
        if (this.currentLevel <= this.levels.ERROR) {
            console.error(`[ERROR ${this.timestamp()}]`, ...args);
        }
    }

    timestamp() {
        return new Date().toISOString();
    }
}

module.exports = new Logger();