/**
 * Screen-space flood fill algorithm for the Paint Bucket tool.
 * Extracts the filled region into an offscreen canvas (Data URL patch).
 */

export function executeFloodFill(ctx, startX, startY, canvasWidth, canvasHeight, fillColorHex, fillOpacity) {
    // 1. Get image data from context
    const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
    const data = imageData.data;
    
    // Convert hex to RGBA
    const { r: fillR, g: fillG, b: fillB } = hexToRgb(fillColorHex);
    const fillA = Math.round(fillOpacity * 255);

    // Get target color (the color we are clicking on to fill)
    const startPos = (startY * canvasWidth + startX) * 4;
    const targetR = data[startPos];
    const targetG = data[startPos + 1];
    const targetB = data[startPos + 2];
    const targetA = data[startPos + 3];

    // If target color is the same as fill color, do nothing
    if (colorMatch({ r: targetR, g: targetG, b: targetB, a: targetA }, 
                   { r: fillR, g: fillG, b: fillB, a: fillA }, 0)) {
        return null;
    }

    // BFS Queue and visited map
    const queueX = new Int16Array(canvasWidth * canvasHeight);
    const queueY = new Int16Array(canvasWidth * canvasHeight);
    let qHead = 0;
    let qTail = 0;
    
    queueX[qTail] = startX;
    queueY[qTail] = startY;
    qTail++;

    const visited = new Uint8Array(canvasWidth * canvasHeight);
    visited[startY * canvasWidth + startX] = 1;

    // Bounding box for the filled patch
    let minX = startX, minY = startY, maxX = startX, maxY = startY;

    // Output buffer for the patch (same size as canvas initially, we copy relevant part later)
    // We only store the *new* filled pixels here.
    const patchData = new Uint8Array(canvasWidth * canvasHeight * 4);
    let filledPixelsCount = 0;

    const tolerance = 30; // Tolerance for anti-aliasing

    while (qHead < qTail) {
        const x = queueX[qHead];
        const y = queueY[qHead];
        qHead++;
        const pos = (y * canvasWidth + x) * 4;

        // Mark as filled in patch
        patchData[pos] = fillR;
        patchData[pos + 1] = fillG;
        patchData[pos + 2] = fillB;
        patchData[pos + 3] = fillA;
        filledPixelsCount++;

        // Update bounding box
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Check neighbors
        const neighbors = [
            [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
        ];

        for (const [nx, ny] of neighbors) {
            if (nx >= 0 && nx < canvasWidth && ny >= 0 && ny < canvasHeight) {
                const nIndex = ny * canvasWidth + nx;
                if (!visited[nIndex]) {
                    const nPos = nIndex * 4;
                    const cR = data[nPos];
                    const cG = data[nPos + 1];
                    const cB = data[nPos + 2];
                    const cA = data[nPos + 3];

                    if (colorMatch({ r: targetR, g: targetG, b: targetB, a: targetA },
                                   { r: cR, g: cG, b: cB, a: cA }, tolerance)) {
                        visited[nIndex] = 1;
                        queueX[qTail] = nx;
                        queueY[qTail] = ny;
                        qTail++;
                    }
                }
            }
        }
    }

    if (filledPixelsCount === 0) return null;

    // Crop the patch to the bounding box
    const patchW = maxX - minX + 1;
    const patchH = maxY - minY + 1;
    
    // Create an offscreen canvas to hold only the bounding box filled area
    const offCanvas = document.createElement('canvas');
    offCanvas.width = patchW;
    offCanvas.height = patchH;
    const offCtx = offCanvas.getContext('2d');
    
    // Create ImageData for the cropped patch
    const croppedImgData = offCtx.createImageData(patchW, patchH);
    for (let y = 0; y < patchH; y++) {
        for (let x = 0; x < patchW; x++) {
            const srcPos = ((minY + y) * canvasWidth + (minX + x)) * 4;
            const destPos = (y * patchW + x) * 4;
            // Only copy pixels we actually filled
            if (patchData[srcPos + 3] > 0) {
                croppedImgData.data[destPos] = patchData[srcPos];
                croppedImgData.data[destPos + 1] = patchData[srcPos + 1];
                croppedImgData.data[destPos + 2] = patchData[srcPos + 2];
                croppedImgData.data[destPos + 3] = patchData[srcPos + 3];
            }
        }
    }
    
    offCtx.putImageData(croppedImgData, 0, 0);

    return {
        dataURL: offCanvas.toDataURL('image/png'),
        screenBox: {
            x: minX,
            y: minY,
            width: patchW,
            height: patchH
        }
    };
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function colorMatch(c1, c2, tolerance) {
    return Math.abs(c1.r - c2.r) <= tolerance &&
           Math.abs(c1.g - c2.g) <= tolerance &&
           Math.abs(c1.b - c2.b) <= tolerance &&
           Math.abs(c1.a - c2.a) <= tolerance;
}
