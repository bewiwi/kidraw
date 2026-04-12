# KiDraw — Kid Drawing App Design

## Overview

A web-based drawing application designed for kids aged 5-8, focused on freehand artistic drawing. Built with vanilla HTML/CSS/JS and the Canvas 2D API. Supports pressure-sensitive input from a Huion drawing tablet via the Pointer Events API.

## Target User

- Kids aged 5-8
- Freehand/artistic drawing focus
- Uses a Huion drawing tablet (pressure-sensitive)
- Runs in a web browser (no install)

## Architecture

### Tech Stack
- Pure vanilla HTML/CSS/JS — zero dependencies
- Canvas 2D API for rendering
- Pointer Events API for pressure sensitivity
- IndexedDB for local storage of drawings

### File Structure
```
kidraw/
├── index.html
├── style.css
├── src/
│   ├── app.js          # Main app init, event wiring
│   ├── canvas.js       # Infinite canvas rendering + camera
│   ├── tools.js        # Tool definitions (brush, pencil, eraser...)
│   ├── history.js      # Undo/redo stack
│   ├── storage.js      # Save/load to IndexedDB
│   ├── colorpicker.js  # Palette + advanced color wheel
│   └── ui.js           # Toolbar, panels, UI interactions
```

### Data Model

Each drawing is a list of strokes:

```js
{
  id: "drawing_1712918400000",
  name: "My Drawing",
  createdAt: 1712918400000,
  modifiedAt: 1712918500000,
  background: "white",
  camera: { x: 0, y: 0, zoom: 1 },
  strokes: [
    {
      id: "stroke_1",
      tool: "brush",
      color: "#e74c3c",
      size: 12,
      opacity: 1,
      points: [
        { x: 100, y: 200, pressure: 0.5 },
        { x: 102, y: 203, pressure: 0.7 },
      ]
    }
  ]
}
```

### Infinite Canvas

The canvas element fills the viewport. A virtual camera (offsetX, offsetY, zoom) transforms all coordinates via `ctx.setTransform()`. Pan with middle-mouse or two-finger drag. Zoom with scroll wheel or pinch gesture.

### Rendering

- `requestAnimationFrame` loop, only redraws when dirty flag is set
- Catmull-Rom spline interpolation between points for smooth curves
- Camera transform applied before drawing all strokes

## Tools

| Tool | Description | Pressure Effect |
|------|------------|----------------|
| Pencil | Hard-edged, consistent line | Pressure → opacity |
| Brush | Soft-edged, smooth stroke | Pressure → size + opacity |
| Marker | Semi-transparent, flat tip feel | Pressure → size |
| Eraser | Removes by drawing with background color | Pressure → size |
| Eyedropper | Pick a color from the canvas | N/A |

### Brush Stabilization

A smoothing algorithm (moving average on last N points) removes hand shakiness. Adjustable from 0 (raw input) to high (very smooth, slight lag). Default at medium. Critical for kids' drawing quality.

### Symmetry Mode

Toggle horizontal and/or vertical mirror axis. Everything drawn is mirrored in real-time. Great for butterflies, faces, mandalas. Shows the mirror axis line on canvas when active.

## UI Layout

```
┌─────────────────────────────────────────────────┐
│ [Gallery] [Title]           [Undo][Redo] [Save]  │  ← Top bar
├──────┬──────────────────────────────────────────┤
│      │                                          │
│ 🖊  │                                          │
│ 🖌  │                                          │
│ 🖍  │         INFINITE CANVAS                  │
│ 🧹  │                                          │
│ 💧  │                                          │
│ ──── │                                          │
│[size]│                                          │
│ ──── │                                          │
│🎨🎨 │                                          │
│🎨🎨 │                                          │
│[more]│                                          │
├──────┴──────────────────────────────────────────┤
│            [Zoom -] 100% [Zoom +]  [Symmetry]   │  ← Bottom bar
└─────────────────────────────────────────────────┘
```

- Left sidebar: Tools, size slider, quick color palette, "more colors" button
- Top bar: Gallery button, drawing title (editable), undo/redo, save
- Bottom bar: Zoom controls, symmetry toggle, stabilization slider
- Maximized canvas area
- Collapsible sidebar for more drawing space

## Color Picker

### Quick Palette
24 curated vibrant colors in the sidebar (2 columns of swatches). Includes a "recently used" row that updates dynamically.

### Advanced Picker
Floating panel with:
- Color wheel (hue ring + saturation/brightness triangle)
- HSL sliders
- Hex input field
- Opacity slider

## Key Features

### Core
- Pressure-sensitive freehand drawing
- Infinite canvas with pan/zoom
- Multiple tools (pencil, brush, marker, eraser, eyedropper)
- Precise color picker (palette + advanced)
- Brush size control
- Undo/Redo (Ctrl+Z / Ctrl+Shift+Z)
- Save locally + continue drawing (IndexedDB)

### Enhanced
- Brush stabilization/smoothing
- Symmetry mode (horizontal/vertical mirror)
- Export as PNG
- Gallery view with thumbnails
- Background options (white, gray, grid, dotted)
- Fullscreen mode
- Keyboard shortcuts ([ ] for size, E for eraser, B for brush)
- Clear canvas with confirmation
- Auto-save (periodic)
- Zoom to fit

## Technical Details

- Rendering: Canvas 2D with requestAnimationFrame (dirty-flag optimization)
- Pressure: PointerEvent.pressure from Pointer Events API (Huion compatible)
- Infinite canvas: Camera transform via ctx.setTransform()
- Undo/Redo: Stroke-level history stack, capped at ~200 actions
- Storage: IndexedDB for large drawing data
- Smoothing: Catmull-Rom spline interpolation + moving-average stabilizer
- No dependencies: Pure vanilla JS
