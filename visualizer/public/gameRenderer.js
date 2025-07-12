class GameRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.hexGrid = new HexGrid(canvas, 25);
        
        this.gameState = null;
        this.analysis = null;
        this.followUnits = false;
        this.showVisionRange = false;
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
            if (this.gameState && this.gameState.home) {
                this.hexGrid.centerOn(this.gameState.home.q, this.gameState.home.r);
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
    }
    
    updateGameState(gameState, analysis) {
        this.gameState = gameState;
        this.analysis = analysis;
        
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
            this.hexGrid.drawHex(hex.q, hex.r, {
                stroke: this.colors.grid,
                strokeWidth: 1
            });
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
        if (!this.gameState.home) return;
        
        const home = this.gameState.home;
        
        // Рисуем основание муравейника
        this.hexGrid.drawHex(home.q, home.r, {
            fill: this.colors.anthill,
            stroke: '#ffffff',
            strokeWidth: 3
        });
        
        // Рисуем символ дома
        this.hexGrid.drawText(home.q, home.r, '🏠', {
            font: `${16 * this.hexGrid.zoom}px Arial`
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
                this.drawUnit(enemy, true);
            });
        }
    }
    
    drawUnit(unit, isEnemy) {
        const unitType = isEnemy ? 'enemy' : this.unitTypes[unit.type];
        if (!unitType) return;
        
        const color = this.colors[unitType];
        const size = this.getUnitSize(unit.type);
        
        // Рисуем тело юнита
        this.hexGrid.drawCircle(unit.q, unit.r, size, {
            fill: color,
            stroke: '#ffffff',
            strokeWidth: 2
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
        
        this.analysis.threats.threats.forEach(threat => {
            const enemy = threat.unit;
            const pixel = this.hexGrid.hexToPixel(enemy.q, enemy.r);
            
            // Рисуем индикатор уровня угрозы
            const threatColor = threat.threatLevel > 2 ? this.colors.threatHigh :
                               threat.threatLevel > 1 ? this.colors.threatMedium :
                               this.colors.threatLow;
            
            this.ctx.strokeStyle = threatColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(
                pixel.x - 15 * this.hexGrid.zoom,
                pixel.y - 15 * this.hexGrid.zoom,
                30 * this.hexGrid.zoom,
                30 * this.hexGrid.zoom
            );
        });
    }
    
    showTooltip(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const hex = this.hexGrid.getHexAtPoint(x, y);
        const tooltipInfo = this.getTooltipInfo(hex.q, hex.r);
        
        // Удаляем старый tooltip
        const oldTooltip = document.querySelector('.tooltip');
        if (oldTooltip) {
            oldTooltip.remove();
        }
        
        if (tooltipInfo) {
            const tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            tooltip.innerHTML = tooltipInfo;
            tooltip.style.left = (event.clientX + 10) + 'px';
            tooltip.style.top = (event.clientY - 10) + 'px';
            
            document.body.appendChild(tooltip);
            
            setTimeout(() => {
                if (tooltip.parentNode) {
                    tooltip.remove();
                }
            }, 3000);
        }
    }
    
    getTooltipInfo(q, r) {
        if (!this.gameState) return null;
        
        const info = [];
        info.push(`Hex: ${q}, ${r}`);
        
        // Проверяем юнитов
        if (this.gameState.ants) {
            const unit = this.gameState.ants.find(ant => ant.q === q && ant.r === r);
            if (unit) {
                const unitType = this.unitTypes[unit.type] || 'unknown';
                info.push(`Unit: ${unitType}`);
                if (unit.health) info.push(`Health: ${unit.health}`);
                if (unit.cargo) info.push(`Cargo: ${unit.cargo}`);
            }
        }
        
        // Проверяем врагов
        if (this.gameState.enemies) {
            const enemy = this.gameState.enemies.find(e => e.q === q && e.r === r);
            if (enemy) {
                info.push(`Enemy unit`);
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
        if (this.gameState.home && this.gameState.home.q === q && this.gameState.home.r === r) {
            info.push(`Anthill`);
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
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }
}