class LogManager {
    constructor(containerId, maxMessages = 100) {
        this.container = document.getElementById(containerId);
        this.maxMessages = maxMessages;
        this.autoScrollEnabled = true;
        
        // Настройка чекбокса автопрокрутки
        this.setupAutoScrollCheckbox();
    }

    setupAutoScrollCheckbox() {
        const checkbox = document.getElementById('auto-scroll-log');
        if (checkbox) {
            checkbox.checked = this.autoScrollEnabled;
            checkbox.addEventListener('change', (e) => {
                this.autoScrollEnabled = e.target.checked;
                if (this.autoScrollEnabled && this.container) {
                    // Если включили автопрокрутку, сразу прокручиваем вниз
                    this.container.scrollTop = this.container.scrollHeight;
                }
            });
        }
    }

    addMessage(text, type = 'system') {
        if (!this.container) return;

        const timestamp = new Date().toLocaleTimeString();
        const messageElement = document.createElement('div');
        messageElement.className = `log-message ${type}`;
        
        // Добавляем иконки для разных типов событий
        let icon = '';
        switch (type) {
            case 'enemy':
                icon = '👹';
                break;
            case 'combat':
                icon = '⚔️';
                break;
            case 'damage':
                icon = '💥';
                break;
            case 'death':
                icon = '💀';
                break;
            case 'victory':
                icon = '🏆';
                break;
            case 'resource':
                icon = '🍯';
                break;
            case 'strategy':
                icon = '🧠';
                break;
            case 'warning':
                icon = '⚠️';
                break;
            case 'error':
                icon = '❌';
                break;
            case 'success':
                icon = '✅';
                break;
            default:
                icon = 'ℹ️';
        }
        
        messageElement.innerHTML = `<span class="timestamp">${timestamp}</span> ${icon} ${text}`;

        this.container.appendChild(messageElement);

        if (this.container.children.length > this.maxMessages) {
            this.container.removeChild(this.container.firstChild);
        }

        // Прокручиваем только если включена автопрокрутка
        if (this.autoScrollEnabled) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }
    
    // Специализированные методы для разных типов событий
    addEnemyEvent(text) {
        this.addMessage(text, 'enemy');
    }
    
    addCombatEvent(text) {
        this.addMessage(text, 'combat');
    }
    
    addDamageEvent(text) {
        this.addMessage(text, 'damage');
    }
    
    addDeathEvent(text) {
        this.addMessage(text, 'death');
    }
    
    addResourceEvent(text) {
        this.addMessage(text, 'resource');
    }
    
    addStrategyEvent(text) {
        this.addMessage(text, 'strategy');
    }

    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
