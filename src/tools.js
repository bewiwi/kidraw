/**
 * Tool definitions — each tool has rendering parameters and pressure mappings.
 */
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
        opacityRange: [0.2, 1.0], // Changes heavily based on pressure (shading)
        sizeRange: [0.9, 1.0], // Minimal size change
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
        opacityRange: [0.8, 1.0], // Stays mostly opaque
        sizeRange: [0.2, 1.0], // Huge variation in size based on pressure
        useShadow: true, // Use soft shadow blur effect
    },
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
        sizeRange: [1.0, 1.0], // Fixed size
    },
    eraser: {
        name: 'Eraser',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20H7L3 16c-1-1-1-3 0-4l9-9c1-1 3-1 4 0l7 7c1 1 1 3 0 4l-6 6"/><line x1="6" y1="20" x2="18" y2="20"/></svg>`,
        shortcut: 'E',
        minSize: 5,
        maxSize: 100,
        defaultSize: 20,
        lineCap: 'round',
        compositeOp: 'source-over',
        opacityRange: [1.0, 1.0],
        sizeRange: [0.5, 1.0],
    },
    eyedropper: {
        name: 'Eyedropper',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22l1-1h3l9-9"/><path d="M16 4l4 4"/><circle cx="18" cy="6" r="3"/></svg>`,
        shortcut: 'I',
        minSize: 1,
        maxSize: 1,
        defaultSize: 1,
        isSpecial: true,
    },
    fill: {
        name: 'Fill',
        icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11h-14a2 2 0 0 0 -2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2 -2v-2a2 2 0 0 0 -2 -2z" /><path d="M12 11v-4a2 2 0 0 1 2 -2h2" /><path d="M13 15v4" /></svg>`,
        shortcut: 'F',
        minSize: 1,
        maxSize: 1,
        defaultSize: 1,
        isAction: true,
    },
};

/** Get tool definition by key. */
export function getTool(toolKey) {
    return TOOLS[toolKey] || TOOLS.brush;
}

/** Get all tool keys. */
export function getToolKeys() {
    return Object.keys(TOOLS);
}
