# KiDraw — Improved Tools & Fill Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Make brush/pencil/marker tools visually distinct and implement a vector-anchored screen-space flood fill tool.

**Architecture:** Modifies the existing canvas render loop to support shadows/multiply blending. For the fill tool, captures canvas pixel data during click, runs BFS flood fill, extracts bounding box as a Data URL patch, and saves it as a new "fill-stroke" object in the history stack perfectly translated into world coordinates.

**Tech Stack:** Vanilla JS, Canvas 2D API, ImageData.

---

### Task 1: Differentiate Pencil and Brush Rendering

**Files:**
- Modify: `src/tools.js`
- Modify: `src/canvas.js`

**Step 1: Update tool definitions**
Modify `TOOLS.pencil` and `TOOLS.brush` in `src/tools.js` to reflect their new behaviors.

```javascript
// src/tools.js
export const TOOLS = {
    pencil: {
        name: 'Pencil',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="10" x2="3" y2="24"/><path d="M20 7l-3-3L5 16l-2 6 6-2L21 8z"/></svg>`,
        shortcut: 'P',
        minSize: 1,
        maxSize: 10,
        defaultSize: 3,
        lineCap: 'round',
        compositeOp: 'source-over',
        opacityRange: [0.2, 1.0], // Highly dependent on pressure
        sizeRange: [0.9, 1.0],    // Almost no size change
    },
    brush: {
        name: 'Brush',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 3a3 3 0 0 0-3 3c0 2-3 5-7 7-1 .5-2 1.5-2 3 0 2.5 2 4 4 4 1.5 0 3-1 4-2 3-3 6-8 7-10a3 3 0 0 0-3-5z"/></svg>`,
        shortcut: 'B',
        minSize: 5,
        maxSize: 100,
        defaultSize: 15,
        lineCap: 'round',
        compositeOp: 'source-over',
        opacityRange: [0.8, 1.0], // Mostly opaque
        sizeRange: [0.2, 1.0],    // Vastly changes size on pressure
        useShadow: true,          // Flag to trigger shadow blur
    },
//...
```

**Step 2: Add shadow blur rendering for Brush**
In `src/canvas.js`, update `renderStroke()` to apply shadow if `tool.useShadow` is true.

```javascript
        // Inside renderStroke(stroke) before drawing loop:
        if (tool.useShadow) {
            ctx.shadowBlur = stroke.size * 0.4;
            ctx.shadowColor = stroke.color;
        } else {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';
        }
```

**Step 3: Commit**
```bash
git add src/tools.js src/canvas.js
git commit -m "feat: make pencil and brush visually distinct"
```

---

### Task 2: Implement Marker Blending

**Files:**
- Modify: `src/tools.js`

**Step 1: Update Marker definition**
Modify `TOOLS.marker` in `src/tools.js` to use `square` lineCap and `multiply` blending.

```javascript
    marker: {
        name: 'Marker',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3l6 6-11 11H4v-6L15 3z"/><path d="M10 14l-2 2"/></svg>`,
        shortcut: 'M',
        minSize: 5,
        maxSize: 60,
        defaultSize: 20,
        lineCap: 'square',
        compositeOp: 'multiply',
        opacityRange: [0.75, 0.75], // Fixed opacity
        sizeRange: [1.0, 1.0],      // Fixed size
    },
```

**Step 2: Commit**
```bash
git add src/tools.js
git commit -m "feat: implement multiply blending for marker tool"
```

---

### Task 3: Fill Tool UI Definition

**Files:**
- Modify: `src/tools.js`

**Step 1: Add Fill tool to TOOLS**
Append the `fill` tool. It is special and shouldn't trigger normal stroke rendering.

```javascript
    fill: {
        name: 'Fill',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11h-14a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2z" /><path d="M12 11v-4a2 2 0 0 1 2 -2h2" /><path d="M13 15v4" /></svg>`,
        shortcut: 'F',
        minSize: 1,
        maxSize: 1,
        defaultSize: 1,
        isAction: true, // Special flag to identify immediate action tools
    },
```

**Step 2: Commit**
```bash
git add src/tools.js
git commit -m "feat: add fill tool to UI and toolset"
```

---

### Task 4: Screen-space Flood Fill Engine

**Files:**
- Create: `src/floodfill.js`

**Step 1: Create the BFS Flood Fill algorithm**
Write an optimized Uint32Array based flood fill algorithm that extracts an image patch Data URL.

```javascript
// src/floodfill.js
// Function: executeFloodFill(ctx, startX, startY, width, height, fillColorHex, fillOpacity)
// 1. ctx.getImageData()
// 2. Tolerance-based BFS
// 3. Mark filled pixels
// 4. Calculate bounding box (minX, minY, maxX, maxY)
// 5. Draw filled pixels perfectly to an offscreen canvas of bounding box size
// 6. Return { dataURL, screenBox: { x, y, width, height } }
// If filled area is 0, return null.
```

**Step 2: Commit**
```bash
git add src/floodfill.js
git commit -m "feat: implement bfs flood fill rendering engine"
```

---

### Task 5: Fill Vector Anchoring & Rendering

**Files:**
- Modify: `src/app.js`
- Modify: `src/canvas.js`

**Step 1: Handle pointerdown for fill in app.js**
When the user clicks, intercept it if `currentTool === 'fill'`.

```javascript
// src/app.js
import { executeFloodFill } from './floodfill.js';

// Inside pointerdown handler:
    if (state.currentTool === 'fill') {
        const dpr = window.devicePixelRatio || 1;
        const screenX = Math.round((e.clientX - rect.left) * dpr);
        const screenY = Math.round((e.clientY - rect.top) * dpr);
        
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
                id: 'fill_' + Date.now(),
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
        }
        return;
    }
```

**Step 2: Handle rendering of image-fill patch**
Modify `src/canvas.js` `renderStroke()` to draw `image-fill` types.

```javascript
    renderStroke(stroke) {
        if (stroke.type === 'image-fill') {
            if (!stroke._img) {
                stroke._img = new Image();
                stroke._img.src = stroke.patchData;
                stroke._img.onload = () => this.markDirty();
                return;
            }
            if (stroke._img.complete) {
                this.ctx.drawImage(stroke._img, stroke.worldX, stroke.worldY, stroke.worldW, stroke.worldH);
            }
            return;
        }
        // ... rest of normal rendering
```

**Step 3: Commit**
```bash
git add src/app.js src/canvas.js
git commit -m "feat: complete flood fill vector anchoring and rendering"
```
