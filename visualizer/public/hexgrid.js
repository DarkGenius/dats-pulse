class HexGrid {
    constructor(canvas, cellSize = 20) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.cellSize = cellSize;
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.minZoom = 0.5;
        this.maxZoom = 3;
        
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const deltaX = e.clientX - this.lastMouseX;
                const deltaY = e.clientY - this.lastMouseY;
                
                this.offsetX += deltaX;
                this.offsetY += deltaY;
                
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
        
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = this.zoom * zoomFactor;
            
            if (newZoom >= this.minZoom && newZoom <= this.maxZoom) {
                this.zoom = newZoom;
            }
        });
    }
    
    // Конвертация hex координат в пиксели
    hexToPixel(q, r) {
        const size = this.cellSize * this.zoom;
        const x = size * (3/2 * q);
        const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
        
        return {
            x: x + this.canvas.width/2 + this.offsetX,
            y: y + this.canvas.height/2 + this.offsetY
        };
    }
    
    // Конвертация пикселей в hex координаты
    pixelToHex(x, y) {
        const size = this.cellSize * this.zoom;
        const relativeX = x - this.canvas.width/2 - this.offsetX;
        const relativeY = y - this.canvas.height/2 - this.offsetY;
        
        const q = (2/3 * relativeX) / size;
        const r = (-1/3 * relativeX + Math.sqrt(3)/3 * relativeY) / size;
        
        return this.roundHex(q, r);
    }
    
    roundHex(q, r) {
        const s = -q - r;
        let rq = Math.round(q);
        let rr = Math.round(r);
        let rs = Math.round(s);
        
        const qDiff = Math.abs(rq - q);
        const rDiff = Math.abs(rr - r);
        const sDiff = Math.abs(rs - s);
        
        if (qDiff > rDiff && qDiff > sDiff) {
            rq = -rr - rs;
        } else if (rDiff > sDiff) {
            rr = -rq - rs;
        }
        
        return { q: rq, r: rr };
    }
    
    // Рисование шестиугольника
    drawHex(q, r, style = {}) {
        const pixel = this.hexToPixel(q, r);
        const size = this.cellSize * this.zoom;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            const x = pixel.x + size * Math.cos(angle);
            const y = pixel.y + size * Math.sin(angle);
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.closePath();
        
        if (style.fill) {
            this.ctx.fillStyle = style.fill;
            this.ctx.fill();
        }
        
        if (style.stroke) {
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = style.strokeWidth || 1;
            this.ctx.stroke();
        }
    }
    
    // Рисование круга в hex ячейке
    drawCircle(q, r, radius, style = {}) {
        const pixel = this.hexToPixel(q, r);
        const scaledRadius = radius * this.zoom;
        
        this.ctx.beginPath();
        this.ctx.arc(pixel.x, pixel.y, scaledRadius, 0, 2 * Math.PI);
        
        if (style.fill) {
            this.ctx.fillStyle = style.fill;
            this.ctx.fill();
        }
        
        if (style.stroke) {
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = style.strokeWidth || 1;
            this.ctx.stroke();
        }
    }
    
    // Рисование прямоугольника в hex ячейке
    drawRect(q, r, width, height, style = {}) {
        const pixel = this.hexToPixel(q, r);
        const scaledWidth = width * this.zoom;
        const scaledHeight = height * this.zoom;
        
        if (style.fill) {
            this.ctx.fillStyle = style.fill;
            this.ctx.fillRect(
                pixel.x - scaledWidth/2,
                pixel.y - scaledHeight/2,
                scaledWidth,
                scaledHeight
            );
        }
        
        if (style.stroke) {
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = style.strokeWidth || 1;
            this.ctx.strokeRect(
                pixel.x - scaledWidth/2,
                pixel.y - scaledHeight/2,
                scaledWidth,
                scaledHeight
            );
        }
    }
    
    // Рисование линии между двумя hex ячейками
    drawLine(q1, r1, q2, r2, style = {}) {
        const pixel1 = this.hexToPixel(q1, r1);
        const pixel2 = this.hexToPixel(q2, r2);
        
        this.ctx.beginPath();
        this.ctx.moveTo(pixel1.x, pixel1.y);
        this.ctx.lineTo(pixel2.x, pixel2.y);
        
        if (style.stroke) {
            this.ctx.strokeStyle = style.stroke;
            this.ctx.lineWidth = style.strokeWidth || 1;
            if (style.dashArray) {
                this.ctx.setLineDash(style.dashArray);
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
        }
    }
    
    // Рисование текста в hex ячейке
    drawText(q, r, text, style = {}) {
        const pixel = this.hexToPixel(q, r);
        
        this.ctx.font = style.font || `${12 * this.zoom}px Arial`;
        this.ctx.fillStyle = style.color || '#ffffff';
        this.ctx.textAlign = style.align || 'center';
        this.ctx.textBaseline = style.baseline || 'middle';
        
        this.ctx.fillText(text, pixel.x, pixel.y);
    }
    
    // Очистка canvas
    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Расчет расстояния между hex ячейками
    distance(q1, r1, q2, r2) {
        return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs((q1 + r1) - (q2 + r2)));
    }
    
    // Получение видимых hex ячеек
    getVisibleHexes() {
        const viewBounds = this.getViewBounds();
        const hexes = [];
        
        for (let q = viewBounds.minQ; q <= viewBounds.maxQ; q++) {
            for (let r = viewBounds.minR; r <= viewBounds.maxR; r++) {
                const pixel = this.hexToPixel(q, r);
                if (pixel.x >= -this.cellSize && pixel.x <= this.canvas.width + this.cellSize &&
                    pixel.y >= -this.cellSize && pixel.y <= this.canvas.height + this.cellSize) {
                    hexes.push({ q, r });
                }
            }
        }
        
        return hexes;
    }
    
    getViewBounds() {
        const margin = 5;
        const topLeft = this.pixelToHex(0, 0);
        const bottomRight = this.pixelToHex(this.canvas.width, this.canvas.height);
        
        return {
            minQ: topLeft.q - margin,
            maxQ: bottomRight.q + margin,
            minR: topLeft.r - margin,
            maxR: bottomRight.r + margin
        };
    }
    
    // Центрирование на координатах
    centerOn(q, r) {
        const pixel = this.hexToPixel(q, r);
        this.offsetX = this.canvas.width/2 - pixel.x + this.offsetX;
        this.offsetY = this.canvas.height/2 - pixel.y + this.offsetY;
    }
    
    // Установка зума
    setZoom(newZoom) {
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    }
    
    // Получение hex под курсором
    getHexAtPoint(x, y) {
        return this.pixelToHex(x, y);
    }
}