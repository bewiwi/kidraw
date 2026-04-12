# KiDraw — Improved Tools & Fill Design

## Overview
This design addresses two current limitations in the KiDraw application:
1. Making the core drawing tools (Pencil, Brush, Marker) visually distinct using native canvas rendering properties.
2. Implementing a new "Fill" (Paint Bucket) tool that functions properly within our vector-based infinite canvas architecture.

## 1. Distinct Tool Rendering Profiles

### Pencil (Crayon)
* **Goal**: Simulate a graphite or hard colored pencil.
* **Rendering**: Thin, hard edge (`lineCap: 'round'`).
* **Pressure mapping**: Pressure strongly affects opacity (shading) but minimally affects size.

### Brush (Pinceau)
* **Goal**: Simulate a soft, thick paint brush.
* **Rendering**: Soft edges to look "wet". We will leverage `shadowBlur` and `shadowColor` matching the stroke color to create a soft bloom around the path.
* **Pressure mapping**: Pressure strongly affects the width of the stroke (fine point to thick brush), while opacity remains mostly constant.

### Marker (Feutre)
* **Goal**: Simulate an alcohol-based flat marker.
* **Rendering**: Flat, wide tip (`lineCap: 'square'`).
* **Blending**: `globalCompositeOperation = 'multiply'`. When drawing over existing strokes or itself, the colors will progressively darken and mix, simulating layered marker ink.
* **Pressure mapping**: Fixed size regardless of pressure (simulating a rigid nib).

## 2. Fill Tool (Pot de Peinture)

### Technical Challenge
Standard flood fill algorithms operate on finite pixel structures. Our application relies on an infinite coordinate space where strokes are rebuilt every frame.

### The Solution: Screen-Space Raster Flood Fill with Vector Anchoring
1. **Screen Capture**: When the Fill tool is clicked, we capture the pixel data (`getImageData`) of the currently visible screen space viewport.
2. **Flood Fill Execution**: Run a standard flood fill algorithm (checking 4-way neighboring pixels against a color/alpha tolerance) starting from the click coordinate.
3. **Patch Generation**: 
   * Calculate the bounding box of the colored area.
   * Draw the filled pixels onto an invisible, minimal-sized off-screen canvas.
4. **Vector Anchoring**:
   * Convert the screen-space bounding box back to **world coordinates**.
   * Export the off-screen canvas as a PNG Data URL.
   * Create a new stroke object of type `image-fill` containing the Data URL and its world dimensions/position.
5. **Rendering Pipeline**: During the `InfiniteCanvas.render()` loop, image-fill strokes are drawn using `ctx.drawImage()` at their anchored world position. This allows the fill to perfectly scale and pan natively along with the rest of the vector lines, while being fully compatible with the Undo/Redo stack.

## UI Considerations
* **New Tool Button**: Add a paint bucket button (`<button class="tool-btn" data-tool="fill">`) with an appropriate SVG icon.
* **Shortcut**: Map to the `F` key.
* **Cursor**: Set the cursor to an appropriate bucket or crosshair icon when the fill tool is selected.
