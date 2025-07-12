class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hexGrid = new HexGrid(canvas, 25, this.render.bind(this));
        
        this.gameState = null;
        this.analysis = null;
        this.unitAssignments = {};
        this.followUnits = false;
        this.showVisionRange = true;
        this.showMovementPaths = true;
        
        this.colors = {
            grid: '#333333',
            background: '#111111',
            
            // Units
            worker: '#4a90e2',
            scout: '#7ed321',
            soldier: '#d0021b',
            enemy: '#ff4444',
            
            // Resources
            nectar: '#f5a623',
            bread: '#bd10e0',
            apple: '#50e3c2',
            
            // Special
            anthill: '#ff6b35',
            vision: 'rgba(0, 255, 136, 0.1)',
            visionBorder: 'rgba(0, 255, 136, 0.3)',
            movementPath: '#00ff88',
            
            // Threats
            threatLow: '#4caf50',
            threatMedium: '#ff9800',
            threatHigh: '#f44336'
        };
        
        this.unitTypes = {
            1: 'worker',
            2: 'soldier',
            3: 'scout'
        };
        
        this.resourceTypes = {
            1: 'apple',
            2: 'bread',
            3: 'nectar'
        };
        
        this.hexTypes = {
            1: { name: 'anthill', moveCost: 1, color: '#8B4513' },
            2: { name: 'empty', moveCost: 1, color: '#333333' },
            3: { name: 'mud', moveCost: 2, color: '#654321' },
            4: { name: 'acid', moveCost: 1, color: '#90EE90', damage: 20 },
            5: { name: 'rocks', moveCost: Infinity, color: '#696969' }
        };
        
        this.lastUnitPositions = new Map();
        this.animationFrame = null;
        
        this.setupControls();
    }
    
    setupControls() {
        document.getElementById('zoomIn').addEventListener('click', () => {
            this.hexGrid.setZoom(this.hexGrid.zoom * 1.2);
            this.render();
        });
        
        document.getElementById('zoomOut').addEventListener('click', () => {
            this.hexGrid.setZoom(this.hexGrid.zoom / 1.2);
            this.render();
        });
        
        document.getElementById('centerView').addEventListener('click', () => {
            if (this.gameState && this.gameState.home && Array.isArray(this.gameState.home) && this.gameState.home.length > 0) {
                const home = this.gameState.home[0];
                this.hexGrid.centerOn(home.q, home.r);
                this.render();
            }
        });
        
        document.getElementById('followUnits').addEventListener('click', () => {
            this.followUnits = !this.followUnits;
            document.getElementById('followUnits').textContent = 
                this.followUnits ? 'Stop Following' : 'Follow Units';
        });
        
        // Tooltip
        this.canvas.addEventListener('mousemove', (e) => {
            this.showTooltip(e);
        });
        
        // Hide tooltip when mouse leaves canvas
        this.canvas.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }
    
    updateGameState(gameState, analysis, unitAssignments) {
        console.log('GameRenderer: Received game state update', {
            turn: gameState?.turnNo,
            ants: gameState?.ants?.length || 0,
            enemies: gameState?.enemies?.length || 0,
            food: gameState?.food?.length || 0,
            home: gameState?.home,
            map: gameState?.map?.length || 0,
            assignments: unitAssignments ? Object.keys(unitAssignments).length : 0
        });
        
        // Отладочная информация о типах гексов
        if (gameState?.map && gameState.map.length > 0) {
            const hexTypeCounts = {};
            gameState.map.forEach(hex => {
                const key = `type${hex.type}_cost${hex.cost}`;
                hexTypeCounts[key] = (hexTypeCounts[key] || 0) + 1;
            });
            console.log('Hex type distribution:', hexTypeCounts);
        }
        
        this.gameState = gameState;
        this.analysis = analysis;
        this.unitAssignments = unitAssignments || {};
        
        if (this.followUnits && gameState.ants && gameState.ants.length > 0) {
            // Центрируем на центре масс наших юнитов
            const centerQ = gameState.ants.reduce((sum, ant) => sum + ant.q, 0) / gameState.ants.length;
            const centerR = gameState.ants.reduce((sum, ant) => sum + ant.r, 0) / gameState.ants.length;
            this.hexGrid.centerOn(Math.round(centerQ), Math.round(centerR));
        }
        
        this.render();
    }
    
    render() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        this.animationFrame = requestAnimationFrame(() => {
            this.hexGrid.clear();
            
            if (!this.gameState) {
                this.drawNoData();
                return;
            }
            
            this.drawGrid();
            this.drawVisionAreas();
            this.drawResources();
            this.drawAnthill();
            this.drawUnits();
            this.drawMovementPaths();
            this.drawThreatIndicators();
        });
    }
    
    drawNoData() {
        this.ctx.fillStyle = '#666666';
        this.ctx.font = '24px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
            'Waiting for game data...',
            this.canvas.width / 2,
            this.canvas.height / 2
        );
    }
    
    drawGrid() {
        const visibleHexes = this.hexGrid.getVisibleHexes();
        
        visibleHexes.forEach(hex => {
            // Получаем информацию о типе гекса из карты (если есть)
            const hexType = this.getHexType(hex.q, hex.r);
            
            if (hexType && hexType !== 2) { // 2 = empty, не рисуем фон для пустых
                const hexInfo = this.hexTypes[hexType];
                if (hexInfo) {
                    // Рисуем фон для специальных типов гексов
                    this.hexGrid.drawHex(hex.q, hex.r, {
                        fill: hexInfo.color + '40', // Прозрачность 25%
                        stroke: hexInfo.color,
                        strokeWidth: 1
                    });
                } else {
                    // Обычный гекс
                    this.hexGrid.drawHex(hex.q, hex.r, {
                        stroke: this.colors.grid,
                        strokeWidth: 1
                    });
                }
            } else {
                // Обычный гекс
                this.hexGrid.drawHex(hex.q, hex.r, {
                    stroke: this.colors.grid,
                    strokeWidth: 1
                });
            }
        });
    }
    
    drawVisionAreas() {
        if (!this.showVisionRange || !this.gameState.ants) return;
        
        this.gameState.ants.forEach(ant => {
            const vision = this.getUnitVision(ant.type);
            
            // Рисуем область видимости
            for (let dq = -vision; dq <= vision; dq++) {
                for (let dr = -vision; dr <= vision; dr++) {
                    if (this.hexGrid.distance(0, 0, dq, dr) <= vision) {
                        this.hexGrid.drawHex(ant.q + dq, ant.r + dr, {
                            fill: this.colors.vision,
                            stroke: this.colors.visionBorder,
                            strokeWidth: 1
                        });
                    }
                }
            }
        });
    }
    
    drawResources() {
        if (!this.gameState.food) return;
        
        this.gameState.food.forEach(resource => {
            const resourceType = this.resourceTypes[resource.type];
            if (!resourceType) return;
            
            const color = this.colors[resourceType];
            const size = this.getResourceSize(resource.type);
            
            this.hexGrid.drawCircle(resource.q, resource.r, size, {
                fill: color,
                stroke: '#ffffff',
                strokeWidth: 1
            });
            
            // Показываем количество калорий
            const calories = this.getResourceCalories(resource.type);
            if (calories > 0) {
                this.hexGrid.drawText(resource.q, resource.r, calories.toString(), {
                    font: `${8 * this.hexGrid.zoom}px Arial`,
                    color: '#ffffff'
                });
            }
        });
    }
    
    drawAnthill() {
        if (!this.gameState.home || !Array.isArray(this.gameState.home) || this.gameState.home.length === 0) return;

        this.gameState.home.forEach((homeHex, index) => {
            // Рисуем основание муравейника
            this.hexGrid.drawHex(homeHex.q, homeHex.r, {
                fill: this.colors.anthill,
                stroke: '#ffffff',
                strokeWidth: 3
            });

            // Рисуем символ дома только на центральном гексе (предполагаем, что он первый)
            if (index === 0) {
                this.hexGrid.drawText(homeHex.q, homeHex.r, '🏠', {
                    font: `${16 * this.hexGrid.zoom}px Arial`
                });
            }
        });
    }
    
    drawUnits() {
        // Рисуем наших юнитов
        if (this.gameState.ants) {
            this.gameState.ants.forEach(ant => {
                this.drawUnit(ant, false);
            });
        }
        
        // Рисуем вражеских юнитов
        if (this.gameState.enemies) {
            this.gameState.enemies.forEach(enemy => {
                if (enemy.type === 0) {
                    // Вражеский муравейник
                    this.drawEnemyAnthill(enemy);
                } else {
                    this.drawUnit(enemy, true);
                }
            });
        }
    }
    
    drawUnit(unit, isEnemy) {
        const unitType = isEnemy ? 'enemy' : this.unitTypes[unit.type];
        if (!unitType) return;
        
        const color = this.colors[unitType];
        const size = this.getUnitSize(unit.type);
        
        // Для врагов добавляем дополнительные эффекты
        if (isEnemy) {
            // Рисуем красное свечение вокруг врага
            this.hexGrid.drawCircle(unit.q, unit.r, size + 4, {
                fill: 'rgba(255, 0, 0, 0.2)',
                stroke: 'rgba(255, 0, 0, 0.6)',
                strokeWidth: 2
            });
            
            // Рисуем иконку типа врага
            const pixel = this.hexGrid.hexToPixel(unit.q, unit.r);
            this.ctx.save();
            this.ctx.font = 'bold 10px Arial';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            const enemyIcon = {
                1: 'W', // Worker
                2: 'S', // Soldier
                3: 'R'  // Scout (Raider)
            };
            this.ctx.fillText(enemyIcon[unit.type] || '?', pixel.x, pixel.y);
            this.ctx.restore();
        }
        
        // Рисуем тело юнита
        this.hexGrid.drawCircle(unit.q, unit.r, size, {
            fill: color,
            stroke: isEnemy ? '#ff0000' : '#ffffff',
            strokeWidth: isEnemy ? 3 : 2
        });
        
        // Рисуем направление (если есть)
        if (unit.direction !== undefined) {
            this.drawUnitDirection(unit, color);
        }
        
        // Рисуем индикатор здоровья
        if (unit.health !== undefined) {
            this.drawHealthBar(unit);
        }
        
        // Рисуем груз (если есть)
        if (unit.cargo && unit.cargo > 0) {
            this.drawCargoIndicator(unit);
        }
    }
    
    drawUnitDirection(unit, color) {
        const angle = (unit.direction || 0) * Math.PI / 3;
        const size = this.getUnitSize(unit.type);
        const pixel = this.hexGrid.hexToPixel(unit.q, unit.r);
        
        const endX = pixel.x + Math.cos(angle) * size * 0.7;
        const endY = pixel.y + Math.sin(angle) * size * 0.7;
        
        this.ctx.beginPath();
        this.ctx.moveTo(pixel.x, pixel.y);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    drawHealthBar(unit) {
        const pixel = this.hexGrid.hexToPixel(unit.q, unit.r);
        const barWidth = 20 * this.hexGrid.zoom;
        const barHeight = 3 * this.hexGrid.zoom;
        const yOffset = -15 * this.hexGrid.zoom;
        
        const maxHealth = this.getUnitMaxHealth(unit.type);
        const healthPercent = unit.health / maxHealth;
        
        // Фон полосы здоровья
        this.ctx.fillStyle = '#333333';
        this.ctx.fillRect(
            pixel.x - barWidth/2,
            pixel.y + yOffset,
            barWidth,
            barHeight
        );
        
        // Полоса здоровья
        const healthColor = healthPercent > 0.6 ? '#4caf50' : 
                           healthPercent > 0.3 ? '#ff9800' : '#f44336';
        this.ctx.fillStyle = healthColor;
        this.ctx.fillRect(
            pixel.x - barWidth/2,
            pixel.y + yOffset,
            barWidth * healthPercent,
            barHeight
        );
    }
    
    drawEnemyAnthill(anthill) {
        // Рисуем вражеский муравейник с особым выделением
        const size = 30;
        
        // Рисуем красный пульсирующий круг
        const time = Date.now() / 1000;
        const pulse = Math.sin(time * 2) * 0.3 + 0.7;
        
        this.hexGrid.drawCircle(anthill.q, anthill.r, size * pulse, {
            fill: 'rgba(255, 0, 0, 0.3)',
            stroke: '#ff0000',
            strokeWidth: 4
        });
        
        // Рисуем центральную часть
        this.hexGrid.drawCircle(anthill.q, anthill.r, size * 0.6, {
            fill: '#8b0000',
            stroke: '#ff0000',
            strokeWidth: 2
        });
        
        // Рисуем знак опасности
        const pixel = this.hexGrid.hexToPixel(anthill.q, anthill.r);
        this.ctx.save();
        this.ctx.font = 'bold 20px Arial';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('!', pixel.x, pixel.y);
        this.ctx.restore();
        
        // Добавляем в лог об обнаружении вражеского муравейника
        if (!this.reportedEnemyAnthills) {
            this.reportedEnemyAnthills = new Set();
        }
        const anthillKey = `${anthill.q},${anthill.r}`;
        if (!this.reportedEnemyAnthills.has(anthillKey)) {
            this.reportedEnemyAnthills.add(anthillKey);
            // Отправляем событие для логирования
            if (window.gameVisualizer) {
                window.gameVisualizer.logManager.addMessage(
                    `Enemy anthill discovered at (${anthill.q}, ${anthill.r})!`, 
                    'enemy'
                );
            }
        }
    }
    
    drawCargoIndicator(unit) {
        const pixel = this.hexGrid.hexToPixel(unit.q, unit.r);
        const size = 6 * this.hexGrid.zoom;
        const yOffset = 12 * this.hexGrid.zoom;
        
        this.ctx.fillStyle = '#ffeb3b';
        this.ctx.beginPath();
        this.ctx.arc(pixel.x, pixel.y + yOffset, size, 0, 2 * Math.PI);
        this.ctx.fill();
        
        this.ctx.fillStyle = '#000000';
        this.ctx.font = `${8 * this.hexGrid.zoom}px Arial`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(unit.cargo.toString(), pixel.x, pixel.y + yOffset);
    }
    
    drawMovementPaths() {
        if (!this.showMovementPaths || !this.gameState.ants) return;
        
        this.gameState.ants.forEach(ant => {
            const lastPos = this.lastUnitPositions.get(ant.id);
            if (lastPos && (lastPos.q !== ant.q || lastPos.r !== ant.r)) {
                this.hexGrid.drawLine(lastPos.q, lastPos.r, ant.q, ant.r, {
                    stroke: this.colors.movementPath,
                    strokeWidth: 2,
                    dashArray: [5, 5]
                });
            }
            
            this.lastUnitPositions.set(ant.id, { q: ant.q, r: ant.r });
        });
    }
    
    drawThreatIndicators() {
        if (!this.analysis || !this.analysis.threats) return;
        
        // Рисуем линии угрозы от врагов к нашему муравейнику
        const anthill = this.analysis.units?.anthill;
        if (!anthill) return;
        
        this.analysis.threats.threats.forEach(threat => {
            const enemy = threat.unit;
            
            // Рисуем линию от врага к муравейнику
            if (threat.distanceToAnthill < 10) {
                const alpha = 1 - (threat.distanceToAnthill / 10);
                this.ctx.save();
                this.ctx.globalAlpha = alpha * 0.5;
                
                this.hexGrid.drawLine(enemy.q, enemy.r, anthill.q, anthill.r, {
                    stroke: '#ff0000',
                    strokeWidth: 2,
                    dashArray: [3, 3]
                });
                
                this.ctx.restore();
            }
            
            // Рисуем пульсирующий круг вокруг непосредственных угроз
            if (threat.distanceToAnthill <= 5) {
                const time = Date.now() / 1000;
                const pulse = Math.sin(time * 4) * 0.5 + 0.5;
                const radius = (20 + pulse * 10) * this.hexGrid.zoom;
                
                this.hexGrid.drawCircle(enemy.q, enemy.r, radius, {
                    fill: 'rgba(255, 0, 0, 0.1)',
                    stroke: 'rgba(255, 0, 0, 0.8)',
                    strokeWidth: 2
                });
            }
        });
    }
    
    showTooltip(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const hex = this.hexGrid.getHexAtPoint(x, y);
        const tooltipInfo = this.getTooltipInfo(hex.q, hex.r);
        
        // Удаляем старый tooltip
        this.hideTooltip();
        
        if (tooltipInfo) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerHTML = tooltipInfo;
            tooltip.style.left = (event.clientX + 10) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            
            document.body.appendChild(tooltip);
            
            // Store timeout ID for cleanup
            this.tooltipTimeout = setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 3000);
        }
    }
    
    hideTooltip() {
        // Remove any existing tooltip
        const oldTooltip = document.querySelector('.tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }
        
        // Clear any pending timeout
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            this.tooltipTimeout = null;
        }
    }
    
    getTooltipInfo(q, r) {
        if (!this.gameState) return null;
        
        const info = [];
        info.push(`<strong>Coordinates:</strong> (${q}, ${r})`);
        
        // Добавляем информацию о типе гекса
        const hexType = this.getHexType(q, r);
        const hexInfo = this.hexTypes[hexType];
        
        // Получаем реальную информацию о гексе из API
        let realHexInfo = null;
        if (this.gameState && this.gameState.map && Array.isArray(this.gameState.map)) {
            realHexInfo = this.gameState.map.find(hex => hex.q === q && hex.r === r);
        }
        
        if (hexInfo) {
            info.push(`<strong>Hex Type:</strong> ${hexInfo.name}`);
            
            // Показываем реальную стоимость из API, если доступна
            if (realHexInfo && realHexInfo.cost !== undefined) {
                if (realHexInfo.cost >= 100) {
                    info.push(`Move Cost: Impassable (${realHexInfo.cost})`);
                } else {
                    info.push(`Move Cost: ${realHexInfo.cost} MP`);
                }
            } else if (hexInfo.moveCost === Infinity) {
                info.push(`Move Cost: Impassable`);
            } else {
                info.push(`Move Cost: ${hexInfo.moveCost} MP`);
            }
            
            if (hexInfo.damage) {
                info.push(`<span style="color: #ff6666;">Damage: ${hexInfo.damage}</span>`);
            }
            
            // Показываем тип из API для отладки
            if (realHexInfo && realHexInfo.type !== undefined) {
                info.push(`<span style="color: #888888;">API Type: ${realHexInfo.type}</span>`);
            }
        }
        
        // Проверяем юнитов
        if (this.gameState.ants) {
            const unit = this.gameState.ants.find(ant => ant.q === q && ant.r === r);
            if (unit) {
                const unitType = this.unitTypes[unit.type] || 'unknown';
                info.push(`<strong>My Unit: ${unitType}</strong>`);
                if (unit.health) info.push(`Health: ${unit.health}`);
                if (unit.cargo) info.push(`Cargo: ${unit.cargo}`);
                
                // Добавляем информацию о назначении
                const assignment = this.unitAssignments[unit.id];
                if (assignment) {
                    info.push(`<hr>`);
                    info.push(`<strong>Assignment:</strong>`);
                    info.push(`Type: ${assignment.type}`);
                    info.push(`Priority: ${assignment.priority}`);
                    if (assignment.target) {
                        if (assignment.target.q !== undefined) {
                            info.push(`Target: (${assignment.target.q}, ${assignment.target.r})`);
                        }
                    }
                    if (assignment.resource_type) {
                        info.push(`Resource: ${this.resourceTypes[assignment.resource_type] || assignment.resource_type}`);
                    }
                }
            }
        }
        
        // Проверяем врагов
        if (this.gameState.enemies) {
            const enemy = this.gameState.enemies.find(e => e.q === q && e.r === r);
            if (enemy) {
                info.push(`Enemy Unit`);
                if (enemy.health) info.push(`Health: ${enemy.health}`);
            }
        }
        
        // Проверяем ресурсы
        if (this.gameState.food) {
            const resource = this.gameState.food.find(f => f.q === q && f.r === r);
            if (resource) {
                const resourceType = this.resourceTypes[resource.type] || 'unknown';
                const calories = this.getResourceCalories(resource.type);
                info.push(`Resource: ${resourceType} (${calories} cal)`);
            }
        }
        
        // Проверяем муравейник
        if (this.gameState.home && Array.isArray(this.gameState.home)) {
            const isAnthill = this.gameState.home.some(homeHex => homeHex.q === q && homeHex.r === r);
            if (isAnthill) {
                info.push(`<strong>Our Anthill</strong>`);
            }
        }
        
        // Подсчитываем количество юнитов и ресурсов на гексе
        if (info.length > 1) {
            info.push(`<hr style="margin: 5px 0;">`);
            
            // Количество наших юнитов
            const myUnitsCount = this.gameState.ants ? 
                this.gameState.ants.filter(ant => ant.q === q && ant.r === r).length : 0;
            
            // Количество вражеских юнитов
            const enemyUnitsCount = this.gameState.enemies ? 
                this.gameState.enemies.filter(enemy => enemy.q === q && enemy.r === r).length : 0;
            
            // Количество ресурсов
            const resourcesCount = this.gameState.food ? 
                this.gameState.food.filter(food => food.q === q && food.r === r).length : 0;
            
            info.push(`<strong>Summary:</strong>`);
            if (myUnitsCount > 0) info.push(`Our units: ${myUnitsCount}`);
            if (enemyUnitsCount > 0) info.push(`Enemy units: ${enemyUnitsCount}`);
            if (resourcesCount > 0) info.push(`Resources: ${resourcesCount}`);
        }
        
        return info.length > 1 ? info.join('<br>') : null;
    }
    
    getUnitVision(unitType) {
        const visionMap = { 1: 2, 2: 2, 3: 4 }; // worker, soldier, scout
        return visionMap[unitType] || 2;
    }
    
    getUnitSize(unitType) {
        const sizeMap = { 1: 8, 2: 10, 3: 6 }; // worker, soldier, scout
        return sizeMap[unitType] || 8;
    }
    
    getUnitMaxHealth(unitType) {
        const healthMap = { 1: 120, 2: 180, 3: 100 }; // worker, soldier, scout
        return healthMap[unitType] || 100;
    }
    
    getResourceSize(resourceType) {
        const sizeMap = { 1: 4, 2: 6, 3: 8 }; // apple, bread, nectar
        return sizeMap[resourceType] || 4;
    }
    
    getResourceCalories(resourceType) {
        const caloriesMap = { 1: 10, 2: 25, 3: 60 }; // apple, bread, nectar
        return caloriesMap[resourceType] || 0;
    }
    
    getHexType(q, r) {
        // Сначала проверяем, является ли этот гекс муравейником
        if (this.gameState && this.gameState.home && Array.isArray(this.gameState.home)) {
            const isAnthill = this.gameState.home.some(homeHex => homeHex.q === q && homeHex.r === r);
            if (isAnthill) return 1; // anthill
        }
        
        // Проверяем информацию о типах гексов из поля map
        if (this.gameState && this.gameState.map && Array.isArray(this.gameState.map)) {
            const hexInfo = this.gameState.map.find(hex => hex.q === q && hex.r === r);
            if (hexInfo && hexInfo.type !== undefined) {
                // API может использовать другую нумерацию типов, нужно их правильно сопоставить
                return this.mapApiTypeToDisplayType(hexInfo.type, hexInfo.cost);
            }
        }
        
        return 2; // По умолчанию empty, если информация не найдена
    }
    
    mapApiTypeToDisplayType(apiType, cost) {
        // Более точное сопоставление типов на основе анализа API данных
        // API Type 1: Anthill areas (но мы их проверяем отдельно)
        // API Type 2: Empty/normal terrain
        // API Type 3: Mud (cost 2)
        // API Type 4: Acid (cost 1, but deals damage) 
        // API Type 5: Water/obstacles (high cost)
        
        // Проверяем сначала стоимость движения
        if (cost >= 30) {
            return 5; // rocks/water - impassable или очень дорогие
        }
        
        // Затем проверяем тип из API
        switch (apiType) {
            case 1:
                // API Type 1 - может быть специальная местность вокруг муравейника
                return cost === 1 ? 2 : 3; // empty если дешево, иначе mud
            case 2:
                // API Type 2 - обычная местность  
                return 2; // empty
            case 3:
                // API Type 3 - грязь
                return 3; // mud
            case 4:
                // API Type 4 - кислота
                return 4; // acid
            case 5:
                // API Type 5 - препятствия
                return cost > 10 ? 5 : 3; // rocks если дорого, иначе mud
            default:
                // Неизвестный тип - определяем по стоимости
                if (cost >= 10) {
                    return 5; // rocks
                } else if (cost === 2) {
                    return 3; // mud  
                } else {
                    return 2; // empty
                }
        }
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }
}