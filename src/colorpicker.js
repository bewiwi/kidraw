/**
 * ColorPicker — Quick palette + advanced HSL color picker with wheel.
 */

/** Curated palette of 24 vibrant colors. */
export const PALETTE = [
    '#e94560', '#f25c54', '#f4845f', '#f7b267',
    '#f7d76e', '#ffeaa7', '#55efc4', '#2ecc71',
    '#1abc9c', '#6dc9a0', '#74b9ff', '#3498db',
    '#2980b9', '#a29bfe', '#6c5ce7', '#e84393',
    '#fd79a8', '#fab1a0', '#ffffff', '#dfe6e9',
    '#b2bec3', '#636e72', '#2d3436', '#1a1a2e',
];

/**
 * ColorPickerManager — manages the color picker UI.
 */
export class ColorPickerManager {
    constructor() {
        this.hue = 0;
        this.saturation = 100;
        this.lightness = 50;
        this.alpha = 100;
        this.recentColors = [];
        this.maxRecent = 6;
        this.onChange = null;
        this.previousColor = '#000000';
        this._wheelDragging = false;
        this._squareDragging = false;
    }

    /** Get the current color as a hex string. */
    get hex() {
        return hslToHex(this.hue, this.saturation, this.lightness);
    }

    /** Get current color as CSS rgba. */
    get rgba() {
        const hex = this.hex;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${this.alpha / 100})`;
    }

    /** Set color from hex string. */
    setFromHex(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length !== 6) return;

        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;

        const [h, s, l] = rgbToHsl(r, g, b);
        this.hue = h;
        this.saturation = s;
        this.lightness = l;
        this._notifyChange();
    }

    /** Set HSL values directly. */
    setHSL(h, s, l) {
        this.hue = h;
        this.saturation = s;
        this.lightness = l;
        this._notifyChange();
    }

    /** Add current color to recent list. */
    addToRecent() {
        const color = this.hex;
        this.recentColors = this.recentColors.filter(c => c !== color);
        this.recentColors.unshift(color);
        if (this.recentColors.length > this.maxRecent) {
            this.recentColors.pop();
        }
    }

    /** Initialize the color wheel canvas. */
    initWheel(wheelCanvas) {
        this.wheelCanvas = wheelCanvas;
        this.wheelCtx = wheelCanvas.getContext('2d');
        this.renderWheel();

        // Mouse/pointer events for wheel + square
        wheelCanvas.addEventListener('pointerdown', (e) => this._handleWheelPointerDown(e));
        wheelCanvas.addEventListener('pointermove', (e) => this._handleWheelPointerMove(e));
        wheelCanvas.addEventListener('pointerup', () => this._handleWheelPointerUp());
        wheelCanvas.addEventListener('pointerleave', () => this._handleWheelPointerUp());
    }

    /** Render the color wheel (hue ring + SL square). */
    renderWheel() {
        const ctx = this.wheelCtx;
        const w = this.wheelCanvas.width;
        const h = this.wheelCanvas.height;
        const cx = w / 2;
        const cy = h / 2;
        const outerR = Math.min(cx, cy) - 4;
        const innerR = outerR - 20;

        ctx.clearRect(0, 0, w, h);

        // Draw hue ring
        for (let angle = 0; angle < 360; angle += 1) {
            const startAngle = (angle - 1) * Math.PI / 180;
            const endAngle = (angle + 1) * Math.PI / 180;
            ctx.beginPath();
            ctx.arc(cx, cy, outerR, startAngle, endAngle);
            ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
            ctx.fill();
        }

        // Draw SL square inside the ring
        const sqSize = innerR * 1.2;
        const sqHalf = sqSize / 2;
        const sqX = cx - sqHalf;
        const sqY = cy - sqHalf;
        this._squareRect = { x: sqX, y: sqY, size: sqSize };

        // Saturation gradient (left to right: gray to full color)
        const satGrad = ctx.createLinearGradient(sqX, sqY, sqX + sqSize, sqY);
        satGrad.addColorStop(0, `hsl(${this.hue}, 0%, 50%)`);
        satGrad.addColorStop(1, `hsl(${this.hue}, 100%, 50%)`);
        ctx.fillStyle = satGrad;
        ctx.fillRect(sqX, sqY, sqSize, sqSize);

        // Lightness gradient (top to bottom: white to black)
        const lightGrad = ctx.createLinearGradient(sqX, sqY, sqX, sqY + sqSize);
        lightGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        lightGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
        lightGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        lightGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = lightGrad;
        ctx.fillRect(sqX, sqY, sqSize, sqSize);

        // Hue indicator on the ring
        const hueAngle = this.hue * Math.PI / 180;
        const hueR = (outerR + innerR) / 2;
        const hueX = cx + Math.cos(hueAngle) * hueR;
        const hueY = cy + Math.sin(hueAngle) * hueR;
        ctx.beginPath();
        ctx.arc(hueX, hueY, 8, 0, Math.PI * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = `hsl(${this.hue}, 100%, 50%)`;
        ctx.fill();

        // SL indicator in the square
        const slX = sqX + (this.saturation / 100) * sqSize;
        const slY = sqY + (1 - this.lightness / 100) * sqSize;
        ctx.beginPath();
        ctx.arc(slX, slY, 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = this.hex;
        ctx.fill();
    }

    _getWheelPos(e) {
        const rect = this.wheelCanvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }

    _isInRing(x, y) {
        const cx = this.wheelCanvas.width / 2;
        const cy = this.wheelCanvas.height / 2;
        const outerR = Math.min(cx, cy) - 4;
        const innerR = outerR - 20;
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        return dist >= innerR && dist <= outerR;
    }

    _isInSquare(x, y) {
        if (!this._squareRect) return false;
        const sq = this._squareRect;
        return x >= sq.x && x <= sq.x + sq.size && y >= sq.y && y <= sq.y + sq.size;
    }

    _handleWheelPointerDown(e) {
        const { x, y } = this._getWheelPos(e);
        this.wheelCanvas.setPointerCapture(e.pointerId);

        if (this._isInRing(x, y)) {
            this._wheelDragging = true;
            this._updateHueFromPos(x, y);
        } else if (this._isInSquare(x, y)) {
            this._squareDragging = true;
            this._updateSLFromPos(x, y);
        }
    }

    _handleWheelPointerMove(e) {
        const { x, y } = this._getWheelPos(e);
        if (this._wheelDragging) {
            this._updateHueFromPos(x, y);
        } else if (this._squareDragging) {
            this._updateSLFromPos(x, y);
        }
    }

    _handleWheelPointerUp() {
        this._wheelDragging = false;
        this._squareDragging = false;
    }

    _updateHueFromPos(x, y) {
        const cx = this.wheelCanvas.width / 2;
        const cy = this.wheelCanvas.height / 2;
        let angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
        if (angle < 0) angle += 360;
        this.hue = Math.round(angle);
        this.renderWheel();
        this._notifyChange();
    }

    _updateSLFromPos(x, y) {
        const sq = this._squareRect;
        const s = Math.max(0, Math.min(100, ((x - sq.x) / sq.size) * 100));
        const l = Math.max(0, Math.min(100, (1 - (y - sq.y) / sq.size) * 100));
        this.saturation = Math.round(s);
        this.lightness = Math.round(l);
        this.renderWheel();
        this._notifyChange();
    }

    _notifyChange() {
        if (this.onChange) this.onChange(this.hex, this.alpha / 100);
    }
}

/* --- Color conversion utilities --- */

export function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

export function rgbToHsl(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
    };
}
