/**
 * InfiniteCanvas — Core rendering engine with camera transforms.
 * Handles pan/zoom, stroke rendering with pressure, and background patterns.
 */
export class InfiniteCanvas {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d', { willReadFrequently: true });
        
        // Caching system for completed strokes
        this.cacheCanvas = document.createElement('canvas');
        this.cacheCtx = this.cacheCanvas.getContext('2d');
        this.needsCacheRedraw = true;

        this.camera = { x: 0, y: 0, zoom: 1 };
        this.markDirty();
        this.strokes = [];
        this.currentStroke = null;
        this.background = 'white';
        this.symmetry = { horizontal: false, vertical: false };

        this.resize();
        this._resizeHandler = () => this.resize();
        window.addEventListener('resize', this._resizeHandler);
    }

    resize() {
        const container = this.canvas.parentElement;
        // Cap DPR at 2 to avoid huge canvas memory/compositing costs.
        // DPR 3 on 1920×1080 → 5760×3240 = 18.7MP → GPU can't composite in time.
        // DPR 2 → 3840×2160 = 8.3MP → visually identical on screen, fast.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = container.clientWidth * dpr;
        this.canvas.height = container.clientHeight * dpr;
        this.canvas.style.width = container.clientWidth + 'px';
        this.canvas.style.height = container.clientHeight + 'px';
        
        // Sync cache canvas size
        this.cacheCanvas.width = this.canvas.width;
        this.cacheCanvas.height = this.canvas.height;
        this.needsCacheRedraw = true;

        this.markDirty();
    }

    /** Convert screen coordinates to world coordinates. */
    screenToWorld(sx, sy) {
        const dpr = window.devicePixelRatio || 1;
        return {
            x: (sx * dpr - this.canvas.width / 2) / this.camera.zoom - this.camera.x,
            y: (sy * dpr - this.canvas.height / 2) / this.camera.zoom - this.camera.y,
        };
    }

    /** Pan camera by screen-space delta. */
    pan(dx, dy) {
        this.camera.x += dx / this.camera.zoom;
        this.camera.y += dy / this.camera.zoom;
        this.needsCacheRedraw = true;
        this.markDirty();
    }

    /** Zoom centered on a screen-space point. */
    zoom(factor, centerX, centerY) {
        const worldBefore = this.screenToWorld(centerX, centerY);
        this.camera.zoom = Math.max(0.05, Math.min(20, this.camera.zoom * factor));
        const worldAfter = this.screenToWorld(centerX, centerY);
        this.camera.x += worldAfter.x - worldBefore.x;
        this.camera.y += worldAfter.y - worldBefore.y;
        this.needsCacheRedraw = true;
        this.markDirty();
    }

    /** Set zoom to a specific value, centered on screen center. */
    setZoom(newZoom) {
        const cx = this.canvas.width / (2 * (window.devicePixelRatio || 1));
        const cy = this.canvas.height / (2 * (window.devicePixelRatio || 1));
        const factor = newZoom / this.camera.zoom;
        this.zoom(factor, cx, cy);
    }

    /** Calculate bounding box of all strokes and center+fit them on screen. */
    zoomToFit() {
        if (this.strokes.length === 0) {
            this.camera = { x: 0, y: 0, zoom: 1 };
            this.needsCacheRedraw = true;
            this.markDirty();
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const stroke of this.strokes) {
            for (const pt of stroke.points) {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        }

        const padding = 60;
        const contentW = maxX - minX + padding * 2;
        const contentH = maxY - minY + padding * 2;
        const dpr = window.devicePixelRatio || 1;
        const viewW = this.canvas.width / dpr;
        const viewH = this.canvas.height / dpr;

        const zoom = Math.min(viewW / contentW, viewH / contentH, 2);
        this.camera.zoom = zoom;
        this.camera.x = -(minX + maxX) / 2;
        this.camera.y = -(minY + maxY) / 2;
        this.needsCacheRedraw = true;
        this.markDirty();
    }

    /** Apply camera transform to the canvas context. */
    applyCamera() {
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(this.camera.x, this.camera.y);
    }

    /** Redraw the cache canvas with all completed strokes. */
    redrawCache() {
        const ctx = this.cacheCtx;
        const dpr = window.devicePixelRatio || 1;
        
        // Clear cache
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.cacheCanvas.width, this.cacheCanvas.height);
        
        // Apply camera to cache
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(this.cacheCanvas.width / 2, this.cacheCanvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(this.camera.x, this.camera.y);

        // View frustum culling for cache
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(this.canvas.width / dpr, this.canvas.height / dpr);
        const visMinX = Math.min(tl.x, br.x);
        const visMaxX = Math.max(tl.x, br.x);
        const visMinY = Math.min(tl.y, br.y);
        const visMaxY = Math.max(tl.y, br.y);

        for (const stroke of this.strokes) {
            if (this._strokeInView(stroke, visMinX, visMaxX, visMinY, visMaxY)) {
                this.renderStroke(stroke, ctx);
            }
        }

        this.needsCacheRedraw = false;
    }

    /** Add a single stroke to the cache canvas without redrawing everything. */
    addStrokeToCache(stroke) {
        if (this.needsCacheRedraw) {
            this.redrawCache();
            return;
        }

        const ctx = this.cacheCtx;
        ctx.save();
        // Apply camera to cache
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(this.cacheCanvas.width / 2, this.cacheCanvas.height / 2);
        ctx.scale(this.camera.zoom, this.camera.zoom);
        ctx.translate(this.camera.x, this.camera.y);

        this.renderStroke(stroke, ctx);

        ctx.restore();
    }

    /** Main render loop. */
    render() {
        if (!this.isDirty) return;
        this.isDirty = false;

        if (this.needsCacheRedraw) {
            this.redrawCache();
        }

        const ctx = this.ctx;

        // Reset global state to defaults
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

        // Clear and draw background
        const bgColor = this.background === 'light-gray' ? '#f0f0f0' : '#ffffff';
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Background pattern
        if (this.background === 'grid' || this.background === 'dots') {
            this.renderBackgroundPattern();
        }

        // Draw cached strokes (static layer)
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this.cacheCanvas, 0, 0);

        // Apply camera for dynamic elements
        this.applyCamera();

        // Draw symmetry axis lines
        if (this.symmetry.horizontal || this.symmetry.vertical) {
            this.renderSymmetryAxes();
        }

        // Draw current in-progress stroke (dynamic layer)
        if (this.currentStroke) {
            this.renderStroke(this.currentStroke, ctx);
        }
    }

    /** Compute bounding box from an array of points. */
    _computeBBox(pts) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        }
        return { minX, minY, maxX, maxY };
    }

    /** Check if a stroke's cached bounding box overlaps the visible area (O(1) per stroke). */
    _strokeInView(stroke, visMinX, visMaxX, visMinY, visMaxY) {
        const bbox = stroke._bbox;
        if (!bbox) return true; // No bbox (e.g. in-progress stroke) — render to be safe

        // AABB intersection test
        return !(bbox.maxX < visMinX || bbox.minX > visMaxX ||
                 bbox.maxY < visMinY || bbox.minY > visMaxY);
    }

    /** Render background grid or dot pattern in world space. */
    renderBackgroundPattern() {
        this.applyCamera();
        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const zoom = this.camera.zoom;

        // Calculate visible area in world space
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(this.canvas.width / dpr, this.canvas.height / dpr);

        // Adaptive grid spacing based on zoom
        let spacing = 40;
        if (zoom < 0.3) spacing = 200;
        else if (zoom < 0.7) spacing = 100;
        else if (zoom > 3) spacing = 20;

        const startX = Math.floor(tl.x / spacing) * spacing;
        const startY = Math.floor(tl.y / spacing) * spacing;
        const endX = Math.ceil(br.x / spacing) * spacing;
        const endY = Math.ceil(br.y / spacing) * spacing;

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.07)';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.lineWidth = 1 / zoom;

        if (this.background === 'grid') {
            ctx.beginPath();
            for (let x = startX; x <= endX; x += spacing) {
                ctx.moveTo(x, tl.y);
                ctx.lineTo(x, br.y);
            }
            for (let y = startY; y <= endY; y += spacing) {
                ctx.moveTo(tl.x, y);
                ctx.lineTo(br.x, y);
            }
            ctx.stroke();
        } else if (this.background === 'dots') {
            const dotR = 1.5 / zoom;
            ctx.beginPath();
            for (let x = startX; x <= endX; x += spacing) {
                for (let y = startY; y <= endY; y += spacing) {
                    ctx.arc(x, y, dotR, 0, Math.PI * 2);
                }
            }
            ctx.fill();
        }
    }

    /** Render dashed symmetry axis lines through the origin. */
    renderSymmetryAxes() {
        const ctx = this.ctx;
        const dpr = window.devicePixelRatio || 1;
        const tl = this.screenToWorld(0, 0);
        const br = this.screenToWorld(this.canvas.width / dpr, this.canvas.height / dpr);
        const zoom = this.camera.zoom;

        ctx.save();
        ctx.strokeStyle = 'rgba(124, 106, 239, 0.4)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([8 / zoom, 6 / zoom]);

        if (this.symmetry.horizontal) {
            ctx.beginPath();
            ctx.moveTo(0, tl.y);
            ctx.lineTo(0, br.y);
            ctx.stroke();
        }

        if (this.symmetry.vertical) {
            ctx.beginPath();
            ctx.moveTo(tl.x, 0);
            ctx.lineTo(br.x, 0);
            ctx.stroke();
        }

        ctx.restore();
    }

    /** Render a single stroke with pressure-variable width/opacity. */
    renderStroke(stroke, ctx) {
        if (stroke.type === 'image-fill') {
            if (!stroke._img) {
                stroke._img = new Image();
                stroke._img.src = stroke.patchData;
                stroke._img.onload = () => this.markDirty();
                return;
            }
            if (stroke._img.complete) {
                ctx.save();
                ctx.globalAlpha = 1.0;
                ctx.globalCompositeOperation = 'source-over';
                ctx.drawImage(stroke._img, stroke.worldX, stroke.worldY, stroke.worldW, stroke.worldH);
                ctx.restore();
            }
            return;
        }

        const pts = stroke.points;
        if (!pts || pts.length === 0) return;

        const tool = stroke.toolDef;
        if (!tool) return;

        ctx.save();
        ctx.lineCap = tool.lineCap || 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = tool.compositeOp || 'source-over';

        if (pts.length === 1) {
            // Single dot
            const p = pts[0];
            const size = this.getStrokeSize(stroke, p.pressure);
            const opacity = this.getStrokeOpacity(stroke, p.pressure);
            ctx.globalAlpha = opacity;
            ctx.fillStyle = stroke.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            return;
        }

        // Use cached interpolated points (computed once in handleStrokeEnd)
        // or compute on the fly for the current in-progress stroke
        const ptsToRender = stroke._cachedInterpolated || pts;

        ctx.strokeStyle = stroke.color;

        // Use precomputed size/opacity arrays (set in handleStrokeEnd) or compute on the fly
        const cachedSize = stroke._cachedSize;
        const cachedOpacity = stroke._cachedOpacity;

        const useCache = cachedSize && cachedOpacity;

        if (useCache) {
            for (let i = 1; i < ptsToRender.length; i++) {
                const prev = ptsToRender[i - 1];
                const curr = ptsToRender[i];
                ctx.lineWidth = cachedSize[i];
                ctx.globalAlpha = cachedOpacity[i];
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }
        } else {
            for (let i = 1; i < ptsToRender.length; i++) {
                const prev = ptsToRender[i - 1];
                const curr = ptsToRender[i];
                ctx.lineWidth = this.getStrokeSize(stroke, curr.pressure);
                ctx.globalAlpha = this.getStrokeOpacity(stroke, curr.pressure);
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                ctx.lineTo(curr.x, curr.y);
                ctx.stroke();
            }
        }

        ctx.restore();
    }

    /**
     * Interpolate additional points when consecutive samples are too far apart.
     * This prevents the dashed/dotted effect when drawing fast.
     */
    _interpolatePoints(pts) {
        const maxDist = 4; // Maximum distance between points in world coords
        const result = [pts[0]];

        for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1];
            const curr = pts[i];
            const dx = curr.x - prev.x;
            const dy = curr.y - prev.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > maxDist) {
                // Insert intermediate points
                const steps = Math.ceil(dist / maxDist);
                for (let s = 1; s < steps; s++) {
                    const t = s / steps;
                    result.push({
                        x: prev.x + dx * t,
                        y: prev.y + dy * t,
                        pressure: prev.pressure + (curr.pressure - prev.pressure) * t,
                    });
                }
            }

            result.push(curr);
        }

        return result;
    }

    /** Get effective stroke size based on pressure and tool config. */
    getStrokeSize(stroke, pressure) {
        const tool = stroke.toolDef;
        const p = Math.max(0, Math.min(1, pressure));
        const range = tool.sizeRange;
        const factor = range[0] + (range[1] - range[0]) * p;
        return stroke.size * factor;
    }

    /** Get effective opacity based on pressure and tool config. */
    getStrokeOpacity(stroke, pressure) {
        const tool = stroke.toolDef;
        const p = Math.max(0, Math.min(1, pressure));
        const range = tool.opacityRange;
        return (range[0] + (range[1] - range[0]) * p) * stroke.opacity;
    }

    /** Start the rendering loop. Uses requestAnimationFrame batching so multiple
     *  markDirty() calls within one frame produce only a single render. */
    startRenderLoop() {
        this._rafPending = false;
        this._scheduleRender();
    }

    /** Schedule a render on the next animation frame (debounced). */
    _scheduleRender() {
        if (this._rafPending) return;
        this._rafPending = true;
        requestAnimationFrame(() => {
            this._rafPending = false;
            this.render();
        });
    }

    /** Mark canvas as needing a redraw. */
    markDirty() {
        this.isDirty = true;
        this._scheduleRender();
    }

    /** Get pixel color at a screen position (for eyedropper). */
    getColorAtScreen(sx, sy) {
        const dpr = window.devicePixelRatio || 1;
        const px = Math.round(sx * dpr);
        const py = Math.round(sy * dpr);
        const pixel = this.ctx.getImageData(px, py, 1, 1).data;
        const r = pixel[0].toString(16).padStart(2, '0');
        const g = pixel[1].toString(16).padStart(2, '0');
        const b = pixel[2].toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    /** Export the drawing as a PNG blob. Renders only the content area without camera. */
    exportPNG() {
        return new Promise((resolve) => {
            if (this.strokes.length === 0) {
                resolve(null);
                return;
            }

            // Find bounding box
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const stroke of this.strokes) {
                for (const pt of stroke.points) {
                    const maxSize = stroke.size || 20;
                    minX = Math.min(minX, pt.x - maxSize);
                    minY = Math.min(minY, pt.y - maxSize);
                    maxX = Math.max(maxX, pt.x + maxSize);
                    maxY = Math.max(maxY, pt.y + maxSize);
                }
            }

            const padding = 30;
            const w = Math.ceil(maxX - minX + padding * 2);
            const h = Math.ceil(maxY - minY + padding * 2);

            const offCanvas = document.createElement('canvas');
            offCanvas.width = w;
            offCanvas.height = h;
            const offCtx = offCanvas.getContext('2d');
            offCtx.fillStyle = '#ffffff';
            offCtx.fillRect(0, 0, w, h);

            // Translate so content starts at padding
            offCtx.translate(-minX + padding, -minY + padding);

            for (const stroke of this.strokes) {
                this.renderStroke(stroke, offCtx);
            }

            offCanvas.toBlob((blob) => resolve(blob), 'image/png');
        });
    }

    /** Generate a small thumbnail of the current drawing. */
    generateThumbnail(maxSize = 200) {
        if (this.strokes.length === 0) return null;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const stroke of this.strokes) {
            for (const pt of stroke.points) {
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            }
        }

        const cw = maxX - minX || 1;
        const ch = maxY - minY || 1;
        const scale = Math.min(maxSize / cw, maxSize / ch, 1);
        const w = Math.ceil(cw * scale) + 20;
        const h = Math.ceil(ch * scale) + 20;

        const offCanvas = document.createElement('canvas');
        offCanvas.width = w;
        offCanvas.height = h;
        const offCtx = offCanvas.getContext('2d');
        offCtx.fillStyle = '#ffffff';
        offCtx.fillRect(0, 0, w, h);
        offCtx.translate(-minX * scale + 10, -minY * scale + 10);
        offCtx.scale(scale, scale);

        for (const stroke of this.strokes) {
            this.renderStroke(stroke, offCtx);
        }

        return offCanvas.toDataURL('image/png', 0.7);
    }
}
