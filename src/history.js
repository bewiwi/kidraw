/**
 * HistoryManager — Stroke-level undo/redo stack.
 */
export class HistoryManager {
    constructor(maxSize = 200) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = maxSize;
        this.onUpdate = null;
    }

    /** Push a new action onto the undo stack. Clears the redo stack. */
    push(action) {
        this.undoStack.push(action);
        this.redoStack = [];
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
        this._notify();
    }

    /** Undo the last action. Returns the action or null. */
    undo() {
        if (this.undoStack.length === 0) return null;
        const action = this.undoStack.pop();
        this.redoStack.push(action);
        this._notify();
        return action;
    }

    /** Redo the last undone action. Returns the action or null. */
    redo() {
        if (this.redoStack.length === 0) return null;
        const action = this.redoStack.pop();
        this.undoStack.push(action);
        this._notify();
        return action;
    }

    /** Clear all history. */
    clear() {
        this.undoStack = [];
        this.redoStack = [];
        this._notify();
    }

    get canUndo() { return this.undoStack.length > 0; }
    get canRedo() { return this.redoStack.length > 0; }

    _notify() {
        if (this.onUpdate) this.onUpdate();
    }
}
