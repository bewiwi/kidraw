/**
 * KiDraw — Main application module.
 * Wires together canvas, tools, input handling, history, storage, and UI.
 */
import { InfiniteCanvas } from './canvas.js';
import { TOOLS, getTool, getToolKeys } from './tools.js';
import { StrokeStabilizer } from './smoothing.js';
import { HistoryManager } from './history.js';
import { DrawingStorage } from './storage.js';
import { ColorPickerManager, PALETTE } from './colorpicker.js';
import { executeFloodFill } from './floodfill.js';

// ===== State =====
const state = {
    currentTool: 'brush',
    currentColor: '#e94560',
    currentSize: 12,
    currentOpacity: 1,
    drawingId: null,
    drawingName: 'Untitled Drawing',
    isDrawing: false,
    isPanning: false,
    spaceHeld: false,
    lastPanPos: null,
    autoSaveTimer: null,
    isDirtyForSave: false,
    previousTool: null,
};

// ===== Init modules =====
const canvasEl = document.getElementById('draw-canvas');
const infiniteCanvas = new InfiniteCanvas(canvasEl);
const stabilizer = new StrokeStabilizer(5);
const history = new HistoryManager(200);
const storage = new DrawingStorage();
const colorPicker = new ColorPickerManager();

// ===== Drawing input =====
function getBackgroundColor() {
    return infiniteCanvas.background === 'light-gray' ? '#f0f0f0' : '#ffffff';
}

function createStrokeData(x, y, pressure) {
    const tool = getTool(state.currentTool);
    return {
        id: 'stroke_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        tool: state.currentTool,
        toolDef: tool,
        color: state.currentTool === 'eraser' ? getBackgroundColor() : state.currentColor,
        size: state.currentSize,
        opacity: state.currentOpacity,
        points: [{ x, y, pressure }],
    };
}

function handleStrokeStart(worldX, worldY, pressure) {
    stabilizer.reset();
    const pt = stabilizer.addPoint({ x: worldX, y: worldY, pressure });

    const stroke = createStrokeData(pt.x, pt.y, pt.pressure);
    infiniteCanvas.currentStroke = stroke;
    infiniteCanvas.markDirty();

    // Create symmetry mirror strokes
    if (infiniteCanvas.symmetry.horizontal || infiniteCanvas.symmetry.vertical) {
        stroke._mirrorStrokes = createMirrorStrokes(stroke);
    }
}

function handleStrokePoint(worldX, worldY, pressure) {
    const pt = stabilizer.addPoint({ x: worldX, y: worldY, pressure });
    const stroke = infiniteCanvas.currentStroke;
    if (!stroke) return;

    stroke.points.push({ x: pt.x, y: pt.y, pressure: pt.pressure });

    // Update mirror strokes
    if (stroke._mirrorStrokes) {
        for (const ms of stroke._mirrorStrokes) {
            const mp = mirrorPoint(pt, ms._mirrorType);
            ms.points.push({ x: mp.x, y: mp.y, pressure: pt.pressure });
        }
    }

    infiniteCanvas.markDirty();
}

function handleStrokeEnd() {
    const stroke = infiniteCanvas.currentStroke;
    if (!stroke) return;

    infiniteCanvas.currentStroke = null;

    // Add main stroke
    infiniteCanvas.strokes.push(stroke);
    const strokesAdded = [stroke];

    // Add mirror strokes
    if (stroke._mirrorStrokes) {
        for (const ms of stroke._mirrorStrokes) {
            infiniteCanvas.strokes.push(ms);
            strokesAdded.push(ms);
        }
        delete stroke._mirrorStrokes;
    }

    history.push({ type: 'strokes', data: strokesAdded });
    infiniteCanvas.markDirty();
    state.isDirtyForSave = true;

    // Add color to recent
    if (state.currentTool !== 'eraser') {
        colorPicker.addToRecent();
        renderRecentColors();
    }
}

function createMirrorStrokes(original) {
    const mirrors = [];
    const sym = infiniteCanvas.symmetry;

    if (sym.horizontal) {
        const ms = { ...original, id: original.id + '_mh', points: [], _mirrorType: 'horizontal' };
        ms.toolDef = original.toolDef;
        for (const pt of original.points) {
            const mp = mirrorPoint(pt, 'horizontal');
            ms.points.push({ x: mp.x, y: mp.y, pressure: pt.pressure });
        }
        mirrors.push(ms);
    }

    if (sym.vertical) {
        const ms = { ...original, id: original.id + '_mv', points: [], _mirrorType: 'vertical' };
        ms.toolDef = original.toolDef;
        for (const pt of original.points) {
            const mp = mirrorPoint(pt, 'vertical');
            ms.points.push({ x: mp.x, y: mp.y, pressure: pt.pressure });
        }
        mirrors.push(ms);
    }

    if (sym.horizontal && sym.vertical) {
        const ms = { ...original, id: original.id + '_mhv', points: [], _mirrorType: 'both' };
        ms.toolDef = original.toolDef;
        for (const pt of original.points) {
            const mp = mirrorPoint(pt, 'both');
            ms.points.push({ x: mp.x, y: mp.y, pressure: pt.pressure });
        }
        mirrors.push(ms);
    }

    return mirrors;
}

function mirrorPoint(pt, type) {
    switch (type) {
        case 'horizontal': return { x: -pt.x, y: pt.y };
        case 'vertical': return { x: pt.x, y: -pt.y };
        case 'both': return { x: -pt.x, y: -pt.y };
        default: return { x: pt.x, y: pt.y };
    }
}

// ===== Pointer Events =====
canvasEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();

    // Middle mouse or right click → pan
    if (e.button === 1 || e.button === 2) {
        state.isPanning = true;
        state.lastPanPos = { x: e.clientX, y: e.clientY };
        canvasEl.setPointerCapture(e.pointerId);
        canvasEl.style.cursor = 'grabbing';
        return;
    }

    // Space held → pan
    if (state.spaceHeld) {
        state.isPanning = true;
        state.lastPanPos = { x: e.clientX, y: e.clientY };
        canvasEl.setPointerCapture(e.pointerId);
        canvasEl.style.cursor = 'grabbing';
        return;
    }

    // Eyedropper tool
    if (state.currentTool === 'eyedropper') {
        const color = infiniteCanvas.getColorAtScreen(e.clientX - canvasEl.getBoundingClientRect().left, e.clientY - canvasEl.getBoundingClientRect().top);
        state.currentColor = color;
        colorPicker.setFromHex(color);
        updateColorUI();
        // Switch back to previous tool
        if (state.previousTool) {
            selectTool(state.previousTool);
        }
        return;
    }

    // Fill tool
    if (state.currentTool === 'fill') {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvasEl.getBoundingClientRect();
        const screenX = Math.round((e.clientX - rect.left) * dpr);
        const screenY = Math.round((e.clientY - rect.top) * dpr);
        
        // Temporarily hide cursor preview so it doesn't get captured in flood fill
        cursorPreview.style.display = 'none';

        const fillResult = executeFloodFill(
            infiniteCanvas.ctx, 
            screenX, screenY, 
            infiniteCanvas.canvas.width, infiniteCanvas.canvas.height, 
            state.currentColor, state.currentOpacity
        );

        if (fillResult) {
            // Convert screen bounding box to world coordinates
            const tl = infiniteCanvas.screenToWorld(fillResult.screenBox.x / dpr, fillResult.screenBox.y / dpr);
            const br = infiniteCanvas.screenToWorld((fillResult.screenBox.x + fillResult.screenBox.width) / dpr, (fillResult.screenBox.y + fillResult.screenBox.height) / dpr);
            
            const fillStroke = {
                id: 'fill_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                tool: 'fill',
                type: 'image-fill',
                patchData: fillResult.dataURL,
                worldX: tl.x,
                worldY: tl.y,
                worldW: br.x - tl.x,
                worldH: br.y - tl.y
            };
            
            infiniteCanvas.strokes.push(fillStroke);
            history.push({ type: 'strokes', data: [fillStroke] });
            infiniteCanvas.markDirty();
            state.isDirtyForSave = true;
            
            colorPicker.addToRecent();
            renderRecentColors();
        }
        return;
    }

    // Drawing
    state.isDrawing = true;
    canvasEl.setPointerCapture(e.pointerId);
    const rect = canvasEl.getBoundingClientRect();
    const world = infiniteCanvas.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    handleStrokeStart(world.x, world.y, e.pressure || 0.5);
});

canvasEl.addEventListener('pointermove', (e) => {
    e.preventDefault();

    // Update cursor preview
    updateCursorPreview(e.clientX, e.clientY);

    if (state.isPanning) {
        const dx = e.clientX - state.lastPanPos.x;
        const dy = e.clientY - state.lastPanPos.y;
        infiniteCanvas.pan(dx, dy);
        state.lastPanPos = { x: e.clientX, y: e.clientY };
        updateZoomDisplay();
        return;
    }

    if (state.isDrawing) {
        // Process coalesced events for smoother input
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ce of events) {
            const rect = canvasEl.getBoundingClientRect();
            const world = infiniteCanvas.screenToWorld(ce.clientX - rect.left, ce.clientY - rect.top);
            handleStrokePoint(world.x, world.y, ce.pressure || 0.5);
        }
    }
});

canvasEl.addEventListener('pointerup', (e) => {
    if (state.isPanning) {
        state.isPanning = false;
        state.lastPanPos = null;
        canvasEl.style.cursor = getCursor();
        return;
    }
    if (state.isDrawing) {
        state.isDrawing = false;
        handleStrokeEnd();
    }
});

canvasEl.addEventListener('pointerleave', (e) => {
    if (state.isDrawing) {
        state.isDrawing = false;
        handleStrokeEnd();
    }
    hideCursorPreview();
});

// Prevent context menu
canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

// Wheel → zoom
canvasEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const rect = canvasEl.getBoundingClientRect();
    infiniteCanvas.zoom(factor, e.clientX - rect.left, e.clientY - rect.top);
    updateZoomDisplay();
}, { passive: false });

// Touch gestures for pinch zoom
let touchDist = null;
canvasEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        state.isPanning = true;
        state.lastPanPos = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    }
}, { passive: false });

canvasEl.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && touchDist !== null) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const newDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const center = {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };

        // Zoom
        const factor = newDist / touchDist;
        const rect = canvasEl.getBoundingClientRect();
        infiniteCanvas.zoom(factor, center.x - rect.left, center.y - rect.top);
        touchDist = newDist;

        // Pan
        if (state.lastPanPos) {
            const dx = center.x - state.lastPanPos.x;
            const dy = center.y - state.lastPanPos.y;
            infiniteCanvas.pan(dx, dy);
        }
        state.lastPanPos = center;
        updateZoomDisplay();
    }
}, { passive: false });

canvasEl.addEventListener('touchend', () => {
    touchDist = null;
    state.isPanning = false;
    state.lastPanPos = null;
});

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
    // Don't capture when typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code === 'Space' && !state.isDrawing) {
        e.preventDefault();
        state.spaceHeld = true;
        canvasEl.style.cursor = 'grab';
        return;
    }

    if (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        doRedo();
        return;
    }

    if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doUndo();
        return;
    }

    if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doRedo();
        return;
    }

    if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        saveDrawing();
        return;
    }

    // Tool shortcuts
    const toolKeys = getToolKeys();
    for (const tk of toolKeys) {
        const tool = getTool(tk);
        if (e.key.toUpperCase() === tool.shortcut) {
            selectTool(tk);
            return;
        }
    }

    // Brush size
    if (e.key === '[') {
        state.currentSize = Math.max(1, state.currentSize - 2);
        updateSizeUI();
    }
    if (e.key === ']') {
        state.currentSize = Math.min(100, state.currentSize + 2);
        updateSizeUI();
    }

    // Fullscreen
    if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
        state.spaceHeld = false;
        canvasEl.style.cursor = getCursor();
    }
});

// ===== Undo / Redo =====
function doUndo() {
    const action = history.undo();
    if (!action) return;
    if (action.type === 'strokes') {
        // Remove the strokes that were added
        for (const s of action.data) {
            const idx = infiniteCanvas.strokes.indexOf(s);
            if (idx !== -1) infiniteCanvas.strokes.splice(idx, 1);
        }
    } else if (action.type === 'clear') {
        // Restore the strokes
        infiniteCanvas.strokes = action.data.slice();
    }
    infiniteCanvas.markDirty();
    state.isDirtyForSave = true;
}

function doRedo() {
    const action = history.redo();
    if (!action) return;
    if (action.type === 'strokes') {
        for (const s of action.data) {
            infiniteCanvas.strokes.push(s);
        }
    } else if (action.type === 'clear') {
        infiniteCanvas.strokes = [];
    }
    infiniteCanvas.markDirty();
    state.isDirtyForSave = true;
}

history.onUpdate = () => {
    document.getElementById('btn-undo').disabled = !history.canUndo;
    document.getElementById('btn-redo').disabled = !history.canRedo;
};

// ===== Tool Selection =====
function selectTool(toolKey) {
    if (toolKey === 'eyedropper' && state.currentTool !== 'eyedropper') {
        state.previousTool = state.currentTool;
    }
    state.currentTool = toolKey;

    // Update size to tool default if switching
    const tool = getTool(toolKey);
    if (!tool.isSpecial) {
        // Keep current size but clamp to tool range
        state.currentSize = Math.max(tool.minSize, Math.min(tool.maxSize, state.currentSize));
        const slider = document.getElementById('size-slider');
        slider.min = tool.minSize;
        slider.max = tool.maxSize;
        updateSizeUI();
    }

    // Update button states
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tool === toolKey);
    });

    canvasEl.style.cursor = getCursor();
}

function getCursor() {
    if (state.spaceHeld) return 'grab';
    const tool = getTool(state.currentTool);
    if (tool.isSpecial) return 'crosshair';
    return 'none'; // We show cursor preview instead
}

// ===== Cursor Preview =====
const cursorPreview = document.getElementById('cursor-preview');

function updateCursorPreview(clientX, clientY) {
    const tool = getTool(state.currentTool);
    if (tool.isSpecial || state.spaceHeld || state.isPanning) {
        hideCursorPreview();
        return;
    }

    const size = state.currentSize * infiniteCanvas.camera.zoom;
    const displaySize = Math.max(4, size);

    cursorPreview.style.display = 'block';
    cursorPreview.style.width = displaySize + 'px';
    cursorPreview.style.height = displaySize + 'px';
    cursorPreview.style.left = clientX + 'px';
    cursorPreview.style.top = clientY + 'px';

    if (state.currentTool === 'eraser') {
        cursorPreview.style.borderColor = 'rgba(255, 255, 255, 0.6)';
    } else {
        cursorPreview.style.borderColor = 'rgba(124, 106, 239, 0.6)';
    }
}

function hideCursorPreview() {
    cursorPreview.style.display = 'none';
}

// ===== UI Updates =====
function updateSizeUI() {
    const slider = document.getElementById('size-slider');
    slider.value = state.currentSize;
    document.getElementById('size-value').textContent = state.currentSize;

    // Update preview circle
    const preview = document.getElementById('size-preview');
    const maxPreviewSize = 30;
    const minPreviewSize = 3;
    const ratio = state.currentSize / 100;
    const displaySize = minPreviewSize + ratio * (maxPreviewSize - minPreviewSize);
    preview.style.width = displaySize + 'px';
    preview.style.height = displaySize + 'px';
}

function updateZoomDisplay() {
    document.getElementById('zoom-level').textContent = Math.round(infiniteCanvas.camera.zoom * 100) + '%';
}

function updateColorUI() {
    // Update quick palette active state
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.dataset.color === state.currentColor);
    });

    // Update color picker panel if open
    syncColorPickerUI();
}

function syncColorPickerUI() {
    document.getElementById('hue-slider').value = colorPicker.hue;
    document.getElementById('hue-input').value = colorPicker.hue;
    document.getElementById('sat-slider').value = colorPicker.saturation;
    document.getElementById('sat-input').value = colorPicker.saturation;
    document.getElementById('light-slider').value = colorPicker.lightness;
    document.getElementById('light-input').value = colorPicker.lightness;
    document.getElementById('alpha-slider').value = colorPicker.alpha;
    document.getElementById('alpha-input').value = colorPicker.alpha;
    document.getElementById('hex-input').value = colorPicker.hex.replace('#', '').toUpperCase();

    document.getElementById('color-preview-new').style.background = colorPicker.hex;
}

// ===== Build UI =====
function buildToolButtons() {
    const container = document.getElementById('tool-buttons');
    container.innerHTML = '';
    for (const key of getToolKeys()) {
        const tool = TOOLS[key];
        const btn = document.createElement('button');
        btn.className = 'tool-btn' + (key === state.currentTool ? ' active' : '');
        btn.dataset.tool = key;
        btn.title = `${tool.name} (${tool.shortcut})`;
        btn.innerHTML = tool.icon;
        btn.addEventListener('click', () => selectTool(key));
        container.appendChild(btn);
    }
}

function buildQuickPalette() {
    const container = document.getElementById('quick-palette');
    container.innerHTML = '';

    for (const color of PALETTE) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = color;
        if (color === state.currentColor) swatch.classList.add('active');
        swatch.addEventListener('click', () => {
            state.currentColor = color;
            state.currentOpacity = 1;
            colorPicker.setFromHex(color);
            updateColorUI();
        });
        container.appendChild(swatch);
    }
}

function renderRecentColors() {
    // Remove existing recent row
    const existing = document.getElementById('recent-colors');
    if (existing) existing.remove();

    if (colorPicker.recentColors.length === 0) return;

    const container = document.createElement('div');
    container.id = 'recent-colors';
    container.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 0 8px; margin-bottom: 4px;';

    for (const color of colorPicker.recentColors) {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.dataset.color = color;
        swatch.style.background = color;
        swatch.title = color + ' (recent)';
        if (color === state.currentColor) swatch.classList.add('active');
        swatch.addEventListener('click', () => {
            state.currentColor = color;
            colorPicker.setFromHex(color);
            updateColorUI();
        });
        container.appendChild(swatch);
    }

    const palette = document.getElementById('quick-palette');
    palette.parentNode.insertBefore(container, palette);
}

// ===== Color Picker Panel =====
function initColorPicker() {
    colorPicker.setFromHex(state.currentColor);

    const wheelCanvas = document.getElementById('color-wheel');
    colorPicker.initWheel(wheelCanvas);

    colorPicker.onChange = (hex, alpha) => {
        state.currentColor = hex;
        state.currentOpacity = alpha;
        syncColorPickerUI();
        updateColorUI();
    };

    // HSL sliders
    for (const [id, prop] of [['hue-slider', 'hue'], ['sat-slider', 'saturation'], ['light-slider', 'lightness'], ['alpha-slider', 'alpha']]) {
        const slider = document.getElementById(id);
        const input = document.getElementById(id.replace('-slider', '-input'));

        slider.addEventListener('input', () => {
            const val = parseInt(slider.value);
            if (prop === 'alpha') {
                colorPicker.alpha = val;
                state.currentOpacity = val / 100;
            } else {
                colorPicker[prop] = val;
            }
            colorPicker.renderWheel();
            state.currentColor = colorPicker.hex;
            syncColorPickerUI();
            updateColorUI();
        });

        input.addEventListener('change', () => {
            const val = parseInt(input.value) || 0;
            slider.value = val;
            slider.dispatchEvent(new Event('input'));
        });
    }

    // Hex input
    document.getElementById('hex-input').addEventListener('change', (e) => {
        let hex = e.target.value.replace('#', '');
        if (hex.length === 3 || hex.length === 6) {
            colorPicker.setFromHex(hex);
            state.currentColor = colorPicker.hex;
            colorPicker.renderWheel();
            syncColorPickerUI();
            updateColorUI();
        }
    });

    // Open/close
    document.getElementById('btn-more-colors').addEventListener('click', () => {
        const panel = document.getElementById('color-picker-panel');
        const isOpen = !panel.classList.contains('hidden');
        if (isOpen) {
            panel.classList.add('hidden');
        } else {
            colorPicker.previousColor = state.currentColor;
            document.getElementById('color-preview-old').style.background = state.currentColor;
            document.getElementById('color-preview-new').style.background = state.currentColor;
            colorPicker.setFromHex(state.currentColor);
            colorPicker.renderWheel();
            syncColorPickerUI();
            panel.classList.remove('hidden');
        }
    });

    document.getElementById('btn-close-colorpicker').addEventListener('click', () => {
        document.getElementById('color-picker-panel').classList.add('hidden');
    });

    // Make panel draggable
    makeDraggable(document.getElementById('color-picker-panel'));
}

// ===== Save / Load =====
async function saveDrawing() {
    const drawing = {
        id: state.drawingId || 'drawing_' + Date.now(),
        name: state.drawingName,
        createdAt: state.drawingId ? undefined : Date.now(),
        modifiedAt: Date.now(),
        background: infiniteCanvas.background,
        camera: { ...infiniteCanvas.camera },
        thumbnail: infiniteCanvas.generateThumbnail(),
        strokes: infiniteCanvas.strokes.map(s => ({
            id: s.id,
            tool: s.tool,
            color: s.color,
            size: s.size,
            opacity: s.opacity,
            points: s.points,
        })),
    };

    if (!state.drawingId) {
        state.drawingId = drawing.id;
    }

    // Preserve createdAt from existing drawing
    if (drawing.createdAt === undefined) {
        const existing = await storage.loadDrawing(drawing.id);
        drawing.createdAt = existing ? existing.createdAt : Date.now();
    }

    await storage.saveDrawing(drawing);
    state.isDirtyForSave = false;
    
    // Actually download the image to the computer too! (MS Paint style)
    exportPNG(true);
    
    showToast('Saved to Computer & Gallery!');
}

async function loadDrawing(id) {
    const drawing = await storage.loadDrawing(id);
    if (!drawing) return;

    state.drawingId = drawing.id;
    state.drawingName = drawing.name || 'Untitled Drawing';
    document.getElementById('drawing-title').value = state.drawingName;

    infiniteCanvas.background = drawing.background || 'white';
    infiniteCanvas.camera = drawing.camera || { x: 0, y: 0, zoom: 1 };

    // Reconstruct strokes with tool definitions
    infiniteCanvas.strokes = (drawing.strokes || []).map(s => ({
        ...s,
        toolDef: getTool(s.tool),
    }));

    history.clear();
    infiniteCanvas.markDirty();
    updateZoomDisplay();
    updateBackgroundUI();
    state.isDirtyForSave = false;
}

function newDrawing() {
    state.drawingId = null;
    state.drawingName = 'Untitled Drawing';
    document.getElementById('drawing-title').value = state.drawingName;
    infiniteCanvas.strokes = [];
    infiniteCanvas.camera = { x: 0, y: 0, zoom: 1 };
    infiniteCanvas.background = 'white';
    history.clear();
    infiniteCanvas.markDirty();
    updateZoomDisplay();
    updateBackgroundUI();
    state.isDirtyForSave = false;
}

// Auto-save every 30 seconds
function startAutoSave() {
    setInterval(async () => {
        if (state.isDirtyForSave && infiniteCanvas.strokes.length > 0) {
            await saveDrawing();
        }
    }, 30000);
}

// Save before page unload
window.addEventListener('beforeunload', () => {
    if (state.isDirtyForSave && infiniteCanvas.strokes.length > 0) {
        // Synchronous save attempt
        saveDrawing();
    }
});

// ===== Export PNG =====
async function exportPNG(silent = false) {
    const blob = await infiniteCanvas.exportPNG();
    if (!blob) {
        if (!silent) showToast('Nothing to export!');
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.drawingName || 'drawing') + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (!silent) showToast('Exported!');
}

// ===== Gallery =====
async function openGallery() {
    const overlay = document.getElementById('gallery-overlay');
    const grid = document.getElementById('gallery-grid');

    const drawings = await storage.listDrawings();
    grid.innerHTML = '';

    // "New Drawing" card
    const newCard = document.createElement('div');
    newCard.className = 'gallery-card gallery-card--new';
    newCard.innerHTML = `
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>New Drawing</span>
    `;
    newCard.addEventListener('click', () => {
        newDrawing();
        overlay.classList.add('hidden');
    });
    grid.appendChild(newCard);

    // Existing drawings
    for (const d of drawings) {
        const card = document.createElement('div');
        card.className = 'gallery-card';

        const thumb = document.createElement('div');
        thumb.className = 'gallery-card-thumb';
        if (d.thumbnail) {
            thumb.style.backgroundImage = `url(${d.thumbnail})`;
        }

        const info = document.createElement('div');
        info.className = 'gallery-card-info';

        const name = document.createElement('div');
        name.className = 'gallery-card-name';
        name.textContent = d.name || 'Untitled';

        const date = document.createElement('div');
        date.className = 'gallery-card-date';
        date.textContent = d.modifiedAt ? new Date(d.modifiedAt).toLocaleDateString() : '';

        info.appendChild(name);
        info.appendChild(date);

        const actions = document.createElement('div');
        actions.className = 'gallery-card-actions';

        const delBtn = document.createElement('button');
        delBtn.className = 'gallery-card-delete';
        delBtn.innerHTML = '🗑';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this drawing?')) {
                await storage.deleteDrawing(d.id);
                card.remove();
                showToast('Deleted');
            }
        });
        actions.appendChild(delBtn);

        card.appendChild(thumb);
        card.appendChild(info);
        card.appendChild(actions);

        card.addEventListener('click', () => {
            loadDrawing(d.id);
            overlay.classList.add('hidden');
        });

        grid.appendChild(card);
    }

    overlay.classList.remove('hidden');
}

// ===== Clear Canvas =====
function clearCanvas() {
    const overlay = document.getElementById('modal-overlay');
    const content = document.getElementById('modal-content');

    content.innerHTML = `
        <h3>Clear Canvas?</h3>
        <p>This will remove all strokes. You can undo this action.</p>
        <div class="modal-actions">
            <button class="modal-btn modal-btn--cancel" id="modal-cancel">Cancel</button>
            <button class="modal-btn modal-btn--danger" id="modal-confirm">Clear</button>
        </div>
    `;

    overlay.classList.remove('hidden');

    document.getElementById('modal-cancel').addEventListener('click', () => {
        overlay.classList.add('hidden');
    });

    document.getElementById('modal-confirm').addEventListener('click', () => {
        const oldStrokes = infiniteCanvas.strokes.slice();
        infiniteCanvas.strokes = [];
        history.push({ type: 'clear', data: oldStrokes });
        infiniteCanvas.markDirty();
        state.isDirtyForSave = true;
        overlay.classList.add('hidden');
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.add('hidden');
    });
}

// ===== Background =====
const BACKGROUNDS = ['white', 'light-gray', 'grid', 'dots'];
let bgIndex = 0;

function cycleBackground() {
    bgIndex = (bgIndex + 1) % BACKGROUNDS.length;
    infiniteCanvas.background = BACKGROUNDS[bgIndex];
    infiniteCanvas.markDirty();
    state.isDirtyForSave = true;
    updateBackgroundUI();
    showToast(`Background: ${BACKGROUNDS[bgIndex]}`);
}

function updateBackgroundUI() {
    const idx = BACKGROUNDS.indexOf(infiniteCanvas.background);
    if (idx !== -1) bgIndex = idx;
    document.getElementById('btn-background').classList.toggle('active', bgIndex > 0);
}

// ===== Symmetry =====
function toggleSymmetryH() {
    infiniteCanvas.symmetry.horizontal = !infiniteCanvas.symmetry.horizontal;
    document.getElementById('btn-symmetry-h').classList.toggle('active', infiniteCanvas.symmetry.horizontal);
    infiniteCanvas.markDirty();
}

function toggleSymmetryV() {
    infiniteCanvas.symmetry.vertical = !infiniteCanvas.symmetry.vertical;
    document.getElementById('btn-symmetry-v').classList.toggle('active', infiniteCanvas.symmetry.vertical);
    infiniteCanvas.markDirty();
}

// ===== Fullscreen =====
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen();
    }
}

// ===== Toast =====
function showToast(message, duration = 1500) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

// ===== Draggable Panels =====
function makeDraggable(panel) {
    const header = panel.querySelector('.panel-header');
    if (!header) return;

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.panel-close')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        header.setPointerCapture(e.pointerId);
    });

    header.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        panel.style.left = (startLeft + dx) + 'px';
        panel.style.top = (startTop + dy) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    header.addEventListener('pointerup', () => {
        isDragging = false;
    });
}

// ===== Wire Up Top Bar =====
function wireTopBar() {
    document.getElementById('btn-undo').addEventListener('click', doUndo);
    document.getElementById('btn-redo').addEventListener('click', doRedo);
    document.getElementById('btn-save').addEventListener('click', saveDrawing);
    document.getElementById('btn-clear').addEventListener('click', clearCanvas);
    document.getElementById('btn-gallery').addEventListener('click', openGallery);

    document.getElementById('drawing-title').addEventListener('change', (e) => {
        state.drawingName = e.target.value || 'Untitled Drawing';
        state.isDirtyForSave = true;
    });
}

// ===== Wire Up Sidebar =====
function wireSidebar() {
    const sizeSlider = document.getElementById('size-slider');
    sizeSlider.addEventListener('input', () => {
        state.currentSize = parseInt(sizeSlider.value);
        updateSizeUI();
    });
}

// ===== Wire Up Bottom Bar =====
function wireBottomBar() {
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        infiniteCanvas.setZoom(infiniteCanvas.camera.zoom * 1.2);
        updateZoomDisplay();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        infiniteCanvas.setZoom(infiniteCanvas.camera.zoom * 0.8);
        updateZoomDisplay();
    });
    document.getElementById('btn-zoom-fit').addEventListener('click', () => {
        infiniteCanvas.zoomToFit();
        updateZoomDisplay();
    });

    document.getElementById('btn-symmetry-h').addEventListener('click', toggleSymmetryH);
    document.getElementById('btn-symmetry-v').addEventListener('click', toggleSymmetryV);

    document.getElementById('btn-background').addEventListener('click', cycleBackground);

    document.getElementById('stabilizer-slider').addEventListener('input', (e) => {
        stabilizer.setStrength(parseInt(e.target.value));
    });

    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

    // Shortcuts panel
    document.getElementById('btn-shortcuts').addEventListener('click', () => {
        const panel = document.getElementById('shortcuts-panel');
        panel.classList.toggle('hidden');
    });
    document.getElementById('btn-close-shortcuts').addEventListener('click', () => {
        document.getElementById('shortcuts-panel').classList.add('hidden');
    });

    // Gallery overlay close
    document.getElementById('btn-close-gallery').addEventListener('click', () => {
        document.getElementById('gallery-overlay').classList.add('hidden');
    });
    document.getElementById('gallery-overlay').addEventListener('click', (e) => {
        if (e.target.id === 'gallery-overlay') {
            document.getElementById('gallery-overlay').classList.add('hidden');
        }
    });
}

// ===== Init =====
function init() {
    buildToolButtons();
    buildQuickPalette();
    updateSizeUI();
    updateZoomDisplay();

    wireTopBar();
    wireSidebar();
    wireBottomBar();
    initColorPicker();

    // Make shortcuts panel draggable
    makeDraggable(document.getElementById('shortcuts-panel'));

    // Check for last drawing to restore
    tryRestoreLastDrawing();

    infiniteCanvas.startRenderLoop();
    startAutoSave();

    canvasEl.style.cursor = getCursor();
}

async function tryRestoreLastDrawing() {
    try {
        const drawings = await storage.listDrawings();
        if (drawings.length > 0) {
            // Load most recent
            await loadDrawing(drawings[0].id);
        }
    } catch (e) {
        console.warn('Failed to restore last drawing:', e);
    }
}

// Go!
init();
