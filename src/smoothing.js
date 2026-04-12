/**
 * StrokeStabilizer — Weighted moving-average filter for smooth brush input.
 */
export class StrokeStabilizer {
    constructor(strength = 5) {
        this.strength = strength;
        this.buffer = [];
    }

    /** Set stabilizer strength (1 = raw, 20 = very smooth). */
    setStrength(s) {
        this.strength = Math.max(1, Math.min(20, Math.round(s)));
    }

    /**
     * Add a raw input point and return a stabilized point.
     * Uses a weighted moving average where recent points have more weight.
     */
    addPoint(point) {
        this.buffer.push(point);
        if (this.buffer.length > this.strength) {
            this.buffer.shift();
        }

        let totalWeight = 0;
        let sx = 0, sy = 0, sp = 0;

        for (let i = 0; i < this.buffer.length; i++) {
            const weight = i + 1; // More recent = more weight
            sx += this.buffer[i].x * weight;
            sy += this.buffer[i].y * weight;
            sp += this.buffer[i].pressure * weight;
            totalWeight += weight;
        }

        return {
            x: sx / totalWeight,
            y: sy / totalWeight,
            pressure: sp / totalWeight,
        };
    }

    /** Reset the buffer (call at stroke start). */
    reset() {
        this.buffer = [];
    }
}
