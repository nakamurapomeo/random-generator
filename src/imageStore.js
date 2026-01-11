// IndexedDB-based image storage for candidate images
// Using IndexedDB to avoid localStorage 5MB limit

const DB_NAME = 'RandomGeneratorImages';
const DB_VERSION = 1;
const STORE_NAME = 'images';

let dbPromise = null;

const openDB = () => {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });

    return dbPromise;
};

/**
 * Save an image to IndexedDB
 * @param {string} id - Unique identifier for the image (e.g., "catId_itemName")
 * @param {string} base64Data - Base64 encoded image data
 * @returns {Promise<void>}
 */
export const saveImage = async (id, base64Data) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ id, data: base64Data, updatedAt: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get an image from IndexedDB
 * @param {string} id - Unique identifier for the image
 * @returns {Promise<string|null>} - Base64 encoded image data or null if not found
 */
export const getImage = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result?.data || null);
        request.onerror = () => reject(request.error);
    });
};

/**
 * Delete an image from IndexedDB
 * @param {string} id - Unique identifier for the image
 * @returns {Promise<void>}
 */
export const deleteImage = async (id) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
};

/**
 * Get all images from IndexedDB (for preloading/caching)
 * @returns {Promise<Object>} - Object with id as key and base64Data as value
 */
export const getAllImages = async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const images = {};
            request.result.forEach(item => {
                images[item.id] = item.data;
            });
            resolve(images);
        };
        request.onerror = () => reject(request.error);
    });
};

/**
 * Resize an image to the specified max dimension
 * @param {File} file - The image file to resize
 * @param {number} maxSize - Maximum width/height in pixels
 * @returns {Promise<string>} - Base64 encoded resized image
 */
export const resizeImage = (file, maxSize = 500) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;

                // Calculate new dimensions
                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                // Create canvas and draw resized image
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to base64 (JPEG for better compression)
                const base64 = canvas.toDataURL('image/jpeg', 0.85);
                resolve(base64);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

/**
 * Read an image file as base64 without resizing
 * @param {File} file - The image file
 * @returns {Promise<string>} - Base64 encoded image
 */
export const readImageAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
};

/**
 * Generate a unique image ID for a category item
 * @param {number} catId - Category ID
 * @param {string} itemName - Item name
 * @returns {string}
 */
export const generateImageId = (catId, itemName) => {
    return `${catId}_${itemName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '_')}`;
};
