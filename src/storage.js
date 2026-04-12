/**
 * DrawingStorage — IndexedDB persistence for drawings.
 */

const DB_NAME = 'kidraw-db';
const DB_VERSION = 1;
const STORE_NAME = 'drawings';

/** Open or create the IndexedDB database. */
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export class DrawingStorage {
    /** Save a drawing (upsert by id). */
    async saveDrawing(drawing) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put(drawing);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    /** Load a specific drawing by id. */
    async loadDrawing(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /** List all drawings (returns metadata + thumbnail, not full stroke data). */
    async listDrawings() {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const drawings = request.result.map(d => ({
                    id: d.id,
                    name: d.name,
                    thumbnail: d.thumbnail,
                    modifiedAt: d.modifiedAt,
                    createdAt: d.createdAt,
                }));
                // Sort by most recently modified
                drawings.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
                resolve(drawings);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /** Delete a drawing by id. */
    async deleteDrawing(id) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.delete(id);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
}
