import { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { saveImage, getImage, deleteImage, getAllImages, resizeImage, readImageAsBase64, generateImageId } from './imageStore';

const INIT_DATA = {
    cats: [
        {
            id: 1, name: '項目1', items: [
                { name: 'サンプルA', subItems: [], hasSubItems: false },
                { name: 'サンプルB', subItems: [], hasSubItems: false },
                { name: 'サンプルC', subItems: [], hasSubItems: false }
            ], hidden: false, weights: {}, emoji: '🎲', color: '#a855f7'
        },
        {
            id: 2, name: '項目2', items: [
                { name: 'サンプルX', subItems: [], hasSubItems: false },
                { name: 'サンプルY', subItems: [], hasSubItems: false },
                { name: 'サンプルZ', subItems: [], hasSubItems: false }
            ], hidden: false, weights: {}, emoji: '🎯', color: '#ec4899'
        }
    ],
    results: {},
    locked: {},
    history: [],
    favs: [],
    presets: [],
    selectedPresetId: null,
    dark: true,
    noRepeat: false,
    showHidden: false,
    showAnimation: false,
    autoLockOnSelect: true,
    showWeightIndicator: true,
    compactMode: false,
    showHistoryTime: true,
    showRestoreButton: true,
    resultFontSize: 'normal', // small, normal, large
    mainResultFontSize: 'normal',
    showHiddenControl: true, // Default to true so restored weights are visible
    resizeImages: true,      // Auto-resize uploaded images
    maxImageSize: 500,       // Max dimension for resized images (px)
    enableImageZoom: true,   // Enable click-to-zoom for result images
    keepAspectRatio: true,   // Keep original aspect ratio when resizing (false = 1:1)
    resultImageSize: 40,     // Result display image size (px)
    cloudPasskey: '',        // Passkey for cloud sync
    cloudWorkerUrl: '',      // Cloudflare Worker URL for R2 storage
    cloudApiKey: '',         // API key for Worker authentication
};

// Normalize sub-item to new format (migrate from string to object)
const normalizeSubItem = (subItem) => {
    if (typeof subItem === 'string') {
        return { name: subItem, imageId: null };
    }
    return {
        name: subItem.name || '',
        imageId: subItem.imageId || null
    };
};

// Get sub-item name (works with both old string format and new object format)
const getSubItemName = (subItem) => typeof subItem === 'string' ? subItem : subItem.name;

// Normalize item to new format (migrate from string to object)
const normalizeItem = (item) => {
    if (typeof item === 'string') {
        return { name: item, subItems: [], hasSubItems: false, imageId: null };
    }
    return {
        name: item.name || '',
        subItems: (item.subItems || []).map(normalizeSubItem),
        hasSubItems: item.hasSubItems ?? false,
        imageId: item.imageId || null
    };
};

// Get item name (works with both old string format and new object format)
const getItemName = (item) => typeof item === 'string' ? item : item.name;

// Migrate cat items to new format
const migrateCatItems = (cat) => {
    if (!cat.items) return { ...cat, items: [] };
    return {
        ...cat,
        items: cat.items.map(normalizeItem)
    };
};

// Helper function for weighted random selection (updated for new format)
const weightedRandom = (items, weights) => {
    const pool = [];
    items.forEach(item => {
        const itemName = getItemName(item);
        const w = weights[itemName] ?? 1;
        if (w > 0) {
            for (let i = 0; i < w; i++) pool.push(item);
        }
    });
    if (pool.length === 0) return items[0] || null;
    return pool[Math.floor(Math.random() * pool.length)];
};

function useLocalStorage(key, init) {
    const [val, setVal] = useState(() => {
        try {
            const item = localStorage.getItem(key);
            if (item) {
                const parsed = { ...init, ...JSON.parse(item) };
                // Migrate cat items to new format
                if (parsed.cats) {
                    parsed.cats = parsed.cats.map(migrateCatItems);
                }
                // Migrate preset cats as well
                if (parsed.presets) {
                    parsed.presets = parsed.presets.map(preset => ({
                        ...preset,
                        cats: preset.cats ? preset.cats.map(migrateCatItems) : []
                    }));
                }
                return parsed;
            }
            return init;
        } catch { return init; }
    });
    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(val));
    }, [key, val]);
    return [val, setVal];
}

export default function RandomGenerator({ onSwitchApp }) {
    const [store, setStore] = useLocalStorage('randgen4', INIT_DATA);
    const [page, setPage] = useState('main');
    const [modal, setModal] = useState(null);
    const [spin, setSpin] = useState(false);
    const [msg, setMsg] = useState('');
    const [genCount, setGenCount] = useState(1);

    const [tempName, setTempName] = useState('');
    const [tempItems, setTempItems] = useState('');
    const [tempEmoji, setTempEmoji] = useState('🎲');
    const [tempColor, setTempColor] = useState('#a855f7');

    const [tempImageMode, setTempImageMode] = useState(false);
    const [tempImageStyle, setTempImageStyle] = useState('contain'); // contain, cover, original, square-contain
    const [tempCustomImageSize, setTempCustomImageSize] = useState(0); // 0 = default (global setting)
    const [tempPreset, setTempPreset] = useState('');
    const [tempImport, setTempImport] = useState('');
    const [tempNewItem, setTempNewItem] = useState('');
    const [lastGeneratedIds, setLastGeneratedIds] = useState([]);
    const [expandTextarea, setExpandTextarea] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const [dragId, setDragId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [selectModal, setSelectModal] = useState(null);
    const [itemMenu, setItemMenu] = useState(null);
    const [expandedItems, setExpandedItems] = useState({});
    const [imageCache, setImageCache] = useState({});
    const [zoomImage, setZoomImage] = useState(null); // { src, alt } for zoomed image modal
    const [cloudSaving, setCloudSaving] = useState(false); // Cloud save/load in progress
    const dragNode = useRef(null);
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);
    const touchStartPos = useRef(null);

    const toast = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1500); };

    const storageSize = () => {
        const b = new Blob([JSON.stringify(store)]).size;
        return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB';
    };

    // Load all images from IndexedDB on mount
    useEffect(() => {
        getAllImages().then(images => {
            setImageCache(images);
        }).catch(err => console.error('Failed to load images:', err));
    }, []);

    // Handle image upload for a candidate item
    const handleImageUpload = async (catId, itemName, file) => {
        try {
            const imageId = generateImageId(catId, itemName);
            let base64Data;

            if (store.resizeImages) {
                base64Data = await resizeImage(file, store.maxImageSize, store.keepAspectRatio);
            } else {
                base64Data = await readImageAsBase64(file);
            }

            await saveImage(imageId, base64Data);
            setImageCache(prev => ({ ...prev, [imageId]: base64Data }));

            // Update item with imageId
            update(s => ({
                cats: s.cats.map(c => {
                    if (c.id === catId) {
                        return {
                            ...c,
                            items: c.items.map(item => {
                                if (getItemName(item) === itemName) {
                                    return { ...normalizeItem(item), imageId };
                                }
                                return item;
                            })
                        };
                    }
                    return c;
                })
            }));

            toast('画像を保存しました');
        } catch (err) {
            console.error('Failed to upload image:', err);
            toast('画像の保存に失敗しました');
        }
    };

    // Delete image for a candidate item
    const handleImageDelete = async (catId, itemName) => {
        try {
            const imageId = generateImageId(catId, itemName);
            await deleteImage(imageId);
            setImageCache(prev => {
                const newCache = { ...prev };
                delete newCache[imageId];
                return newCache;
            });

            // Remove imageId from item
            update(s => ({
                cats: s.cats.map(c => {
                    if (c.id === catId) {
                        return {
                            ...c,
                            items: c.items.map(item => {
                                if (getItemName(item) === itemName) {
                                    return { ...normalizeItem(item), imageId: null };
                                }
                                return item;
                            })
                        };
                    }
                    return c;
                })
            }));

            toast('画像を削除しました');
        } catch (err) {
            console.error('Failed to delete image:', err);
            toast('画像の削除に失敗しました');
        }
    };

    // Bulk add images as image-only candidates
    const handleBulkImageAdd = async (catId, files) => {
        try {
            const cat = store.cats.find(c => c.id === catId);
            if (!cat) return;

            const existingNames = new Set(cat.items.map(item => getItemName(item)));
            const newItems = [];
            const newImageCache = {};
            let skipped = 0;

            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;

                // Use filename without extension as item name
                const itemName = file.name.replace(/\.[^/.]+$/, '');

                // Check for duplicates
                if (existingNames.has(itemName)) {
                    skipped++;
                    continue;
                }

                const imageId = generateImageId(catId, itemName);
                let base64Data;

                if (store.resizeImages) {
                    base64Data = await resizeImage(file, store.maxImageSize);
                } else {
                    base64Data = await readImageAsBase64(file);
                }

                await saveImage(imageId, base64Data);
                newImageCache[imageId] = base64Data;

                newItems.push({
                    name: itemName,
                    subItems: [],
                    hasSubItems: false,
                    imageId
                });

                existingNames.add(itemName);
            }

            if (newItems.length > 0) {
                setImageCache(prev => ({ ...prev, ...newImageCache }));
                update(s => ({
                    cats: s.cats.map(c => c.id === catId
                        ? { ...c, items: [...c.items, ...newItems] }
                        : c
                    )
                }));
            }

            if (skipped > 0) {
                toast(`${newItems.length} 件追加（${skipped} 件スキップ）`);
            } else if (newItems.length > 0) {
                toast(`${newItems.length} 件の画像を追加しました`);
            } else {
                toast('追加できる画像がありませんでした');
            }
        } catch (err) {
            console.error('Failed to bulk add images:', err);
            toast('画像の追加に失敗しました');
        }
    };

    const update = (fn) => setStore(prev => ({ ...prev, ...fn(prev) }));

    const visibleCats = store.showHidden ? store.cats : store.cats.filter(c => !c.hidden);

    const handleDragStart = (e, id) => {
        setDragId(id);
        dragNode.current = e.target;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragEnd = (e) => {
        e.target.style.opacity = '1';
        if (dragId !== null && dragOverId !== null && dragId !== dragOverId) {
            const cats = [...store.cats];
            const fromIdx = cats.findIndex(c => c.id === dragId);
            const toIdx = cats.findIndex(c => c.id === dragOverId);
            const [moved] = cats.splice(fromIdx, 1);
            cats.splice(toIdx, 0, moved);
            update(() => ({ cats }));
        }
        setDragId(null);
        setDragOverId(null);
    };

    const handleDragOver = (e, id) => {
        e.preventDefault();
        if (id !== dragOverId) setDragOverId(id);
    };

    const handleTouchStart = (id) => {
        setDragId(id);
    };

    const handleTouchMove = (e, cats) => {
        if (!dragId) return;
        const touch = e.touches[0];
        const elements = document.elementsFromPoint(touch.clientX, touch.clientY);
        const cardEl = elements.find(el => el.dataset?.catid);
        if (cardEl) {
            const overId = Number(cardEl.dataset.catid);
            if (overId !== dragOverId) setDragOverId(overId);
        }
    };

    const handleTouchEnd = () => {
        if (dragId !== null && dragOverId !== null && dragId !== dragOverId) {
            const cats = [...store.cats];
            const fromIdx = cats.findIndex(c => c.id === dragId);
            const toIdx = cats.findIndex(c => c.id === dragOverId);
            const [moved] = cats.splice(fromIdx, 1);
            cats.splice(toIdx, 0, moved);
            update(() => ({ cats }));
        }
        setDragId(null);
        setDragOverId(null);
    };

    const doGenerate = () => {
        const delay = store.showAnimation ? 300 : 0;
        if (delay > 0) setSpin(true);

        const runGeneration = () => {
            const allResults = [];
            for (let g = 0; g < genCount; g++) {
                const newRes = {};
                visibleCats.forEach(c => {
                    if (store.locked[c.id] && g === 0) {
                        newRes[c.id] = store.results[c.id] || '';
                    } else if (c.items.length > 0) {
                        const weights = c.weights || {};
                        let pool = c.items.filter(item => {
                            const itemName = getItemName(item);
                            return (weights[itemName] ?? 1) > 0;
                        });
                        if (pool.length === 0) {
                            newRes[c.id] = '';
                            return;
                        }
                        if (store.noRepeat && pool.length > 1) {
                            const last = g === 0 ? store.results[c.id] : allResults[g - 1]?.res[c.id];
                            if (last) {
                                // Extract main item name for comparison
                                const lastMainName = last.split(' → ')[0];
                                pool = pool.filter(item => getItemName(item) !== lastMainName);
                            }
                        }
                        const selectedItem = weightedRandom(pool, weights);
                        if (!selectedItem) {
                            newRes[c.id] = '';
                            return;
                        }

                        // Check if selected item has sub-items enabled
                        if (selectedItem.hasSubItems && selectedItem.subItems && selectedItem.subItems.length > 0) {
                            const subItem = selectedItem.subItems[Math.floor(Math.random() * selectedItem.subItems.length)];
                            newRes[c.id] = `${selectedItem.name} → ${getSubItemName(subItem)} `;
                        } else {
                            newRes[c.id] = selectedItem.name;
                        }
                    }
                });
                allResults.push({
                    id: Date.now() + g,
                    res: newRes,
                    names: Object.fromEntries(store.cats.map(c => [c.id, c.name])),
                    time: new Date().toLocaleString()
                });
            }
            const generatedIds = allResults.map(r => r.id);
            setLastGeneratedIds(generatedIds);
            update(s => ({
                results: allResults[0].res,
                locked: store.noRepeat ? {} : s.locked,
                history: [...allResults.map(r => ({ id: r.id, time: new Date().toLocaleString(), res: r.res, names: r.names })), ...s.history].slice(0, 100)
            }));

            if (genCount > 1) {
                setPage('history');
            }
            if (delay > 0) setSpin(false);
        };

        if (delay > 0) {
            setTimeout(runGeneration, delay);
        } else {
            runGeneration();
        }
    };

    const openEditModal = (cat) => {
        setTempName(cat.name);
        // Extract item names for textarea editing
        setTempItems(cat.items.map(item => getItemName(item)).join('\n'));
        setTempEmoji(cat.emoji || '🎲');
        setTempColor(cat.color || '#a855f7');
        setTempImageMode(cat.isImageMode || false);
        setTempImageStyle(cat.imageStyle || 'contain');
        setTempCustomImageSize(cat.customImageSize || 0);
        setModal({ type: 'edit', id: cat.id, hidden: cat.hidden });
    };

    const saveEditModal = () => {
        const id = modal.id;
        const newName = tempName.trim() || '項目';
        const newItemNames = tempItems.split('\n').map(s => s.trim()).filter(Boolean);

        // Preserve existing subItems for items that still exist
        update(s => {
            const oldCat = s.cats.find(c => c.id === id);
            const oldItemsMap = {};
            if (oldCat && oldCat.items) {
                oldCat.items.forEach(item => {
                    const name = getItemName(item);
                    oldItemsMap[name] = item;
                });
            }

            const newItems = newItemNames.map(name => {
                // If item existed before, preserve its subItems and hasSubItems
                if (oldItemsMap[name]) {
                    return { ...oldItemsMap[name], name };
                }
                // New item
                return { name, subItems: [], hasSubItems: true };
            });

            return {
                cats: s.cats.map(c => c.id === id ? { ...c, name: newName, items: newItems, emoji: tempEmoji, color: tempColor, isImageMode: tempImageMode, imageStyle: tempImageStyle, customImageSize: tempCustomImageSize } : c)
            };
        });
        setModal(null);
        toast('保存しました');
    };

    const deleteCat = () => {
        const id = modal.id;
        update(s => ({
            cats: s.cats.filter(c => c.id !== id),
            locked: Object.fromEntries(Object.entries(s.locked).filter(([k]) => Number(k) !== id)),
            results: Object.fromEntries(Object.entries(s.results).filter(([k]) => Number(k) !== id))
        }));
        setModal(null);
        toast('削除しました');
    };

    const toggleHidden = () => {
        const id = modal.id;
        update(s => ({
            cats: s.cats.map(c => c.id === id ? { ...c, hidden: !c.hidden } : c)
        }));
        setModal(m => ({ ...m, hidden: !m.hidden }));
        toast(modal.hidden ? '表示しました' : '非表示にしました');
    };

    const dupCat = () => {
        const cat = store.cats.find(c => c.id === modal.id);
        if (!cat) return;
        const newId = Math.max(...store.cats.map(c => c.id)) + 1;
        update(s => ({ cats: [...s.cats, { id: newId, name: cat.name + '(複製)', items: [...cat.items], hidden: false, weights: { ...cat.weights }, emoji: cat.emoji || '🎲', color: cat.color || '#a855f7', isImageMode: cat.isImageMode || false, imageStyle: cat.imageStyle || 'contain', customImageSize: cat.customImageSize || 0 }] }));
        setModal(null);
        toast('複製しました');
    };

    const addCat = () => {
        const emojis = ['🎲', '🎯', '⭐', '🔥', '💎', '🌟', '🌈', '🎀', '🍀', '⚡'];
        const colors = ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
        const newId = store.cats.length > 0 ? Math.max(...store.cats.map(c => c.id)) + 1 : 1;
        update(s => ({ cats: [...s.cats, { id: newId, name: `項目${newId}`, items: [], hidden: false, weights: {}, emoji: emojis[newId % emojis.length], color: colors[newId % colors.length], isImageMode: false, imageStyle: 'contain', customImageSize: 0 }] }));
    };

    const toggleLock = (id) => {
        update(s => ({ locked: { ...s.locked, [id]: !s.locked[id] } }));
    };

    const addFav = () => {
        if (Object.keys(store.results).length === 0) return;
        const entry = {
            id: Date.now(),
            res: { ...store.results },
            names: Object.fromEntries(store.cats.map(c => [c.id, c.name])),
            time: new Date().toLocaleString()
        };
        update(s => ({ favs: [entry, ...s.favs] }));
        toast('お気に入りに追加');
    };

    const restoreRes = (res) => {
        update(() => ({ results: res }));
        setPage('main');
        toast('復元しました');
    };

    const copyResult = () => {
        const txt = visibleCats.map(c => `${c.name}: ${store.results[c.id] || '---'} `).join('\n');
        navigator.clipboard.writeText(txt);
        toast('結果をコピーしました');
    };

    const doExportText = () => {
        const txt = store.cats.map(c => {
            const itemNames = c.items.map(item => getItemName(item));
            return `[${c.name}]${c.hidden ? ' (非表示)' : ''} \n${itemNames.join('\n')} `;
        }).join('\n\n');
        navigator.clipboard.writeText(txt);
        toast('コピーしました');
    };

    const doExportJSON = () => {
        const exportData = {
            cats: store.cats,
            presets: store.presets,
            results: store.results,
            locked: store.locked,
            favs: store.favs,
            settings: {
                dark: store.dark,
                noRepeat: store.noRepeat,
                showHidden: store.showHidden,
                showAnimation: store.showAnimation,
                showWeightIndicator: store.showWeightIndicator,
                compactMode: store.compactMode,
                showHistoryTime: store.showHistoryTime,
                showRestoreButton: store.showRestoreButton,
                resultFontSize: store.resultFontSize,
                mainResultFontSize: store.mainResultFontSize,
                showHiddenControl: store.showHiddenControl
            }
        };
        const str = JSON.stringify(exportData, null, 2);
        const blob = new Blob([str], { type: 'application/json' });
        navigator.clipboard.writeText(str);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'randgen-backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('バックアップを保存・コピーしました');
    };

    // Export data and images as a Zip file
    const doExportZip = async () => {
        try {
            const zip = new JSZip();

            // Collect all image IDs
            const imageIds = new Set();
            store.cats.forEach(cat => {
                cat.items.forEach(item => {
                    if (item.imageId) imageIds.add(item.imageId);
                    if (item.subItems) {
                        item.subItems.forEach(sub => {
                            if (typeof sub === 'object' && sub.imageId) {
                                imageIds.add(sub.imageId);
                            }
                        });
                    }
                });
            });

            // Add images to zip
            const imgFolder = zip.folder("images");
            let imageCount = 0;
            for (const id of imageIds) {
                if (imageCache[id]) {
                    // Convert base64 to blob/binary
                    const base64Data = imageCache[id].split(',')[1];
                    imgFolder.file(`${id}.jpg`, base64Data, { base64: true });
                    imageCount++;
                }
            }

            // Create data JSON (excluding base64 images to keep it light)
            const exportData = {
                cats: store.cats,
                presets: store.presets,
                results: store.results,
                locked: store.locked,
                favs: store.favs,
                settings: {
                    dark: store.dark,
                    noRepeat: store.noRepeat,
                    showHidden: store.showHidden,
                    showAnimation: store.showAnimation,
                    showWeightIndicator: store.showWeightIndicator,
                    compactMode: store.compactMode,
                    showHistoryTime: store.showHistoryTime,
                    showRestoreButton: store.showRestoreButton,
                    resultFontSize: store.resultFontSize,
                    mainResultFontSize: store.mainResultFontSize,
                    resizeImages: store.resizeImages,
                    maxImageSize: store.maxImageSize,
                    enableImageZoom: store.enableImageZoom,
                    keepAspectRatio: store.keepAspectRatio,
                    resultImageSize: store.resultImageSize
                },
                wordArranger: {
                    data: localStorage.getItem('wordArrangerData2') ? JSON.parse(localStorage.getItem('wordArrangerData2')) : null,
                    slots: localStorage.getItem('wordArrangerSlots2') ? JSON.parse(localStorage.getItem('wordArrangerSlots2')) : null
                }
            };

            zip.file("data.json", JSON.stringify(exportData, null, 2));

            // Generate zip file
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'randgen-backup.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast(`バックアップを保存しました (画像${imageCount}件)`);
        } catch (err) {
            console.error('Failed to export zip:', err);
            toast('エクスポートに失敗しました');
        }
    };

    // Cloud Save - Save data and images to Cloudflare R2
    const doCloudSave = async () => {
        if (!store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey) {
            toast('パスキー・Worker URL・APIキーを設定してください');
            return;
        }

        setCloudSaving(true);
        try {
            // Collect all image IDs and data
            const imageIds = new Set();
            store.cats.forEach(cat => {
                cat.items.forEach(item => {
                    if (item.imageId) imageIds.add(item.imageId);
                    if (item.subItems) {
                        item.subItems.forEach(sub => {
                            if (typeof sub === 'object' && sub.imageId) {
                                imageIds.add(sub.imageId);
                            }
                        });
                    }
                });
            });

            // Collect images from cache
            const images = {};
            for (const id of imageIds) {
                if (imageCache[id]) {
                    images[id] = imageCache[id];
                }
            }

            // Create backup data
            const backupData = {
                cats: store.cats,
                presets: store.presets,
                results: store.results,
                locked: store.locked,
                favs: store.favs,
                settings: {
                    dark: store.dark,
                    noRepeat: store.noRepeat,
                    showHidden: store.showHidden,
                    showAnimation: store.showAnimation,
                    showWeightIndicator: store.showWeightIndicator,
                    compactMode: store.compactMode,
                    showHistoryTime: store.showHistoryTime,
                    showRestoreButton: store.showRestoreButton,
                    resultFontSize: store.resultFontSize,
                    mainResultFontSize: store.mainResultFontSize,
                    resizeImages: store.resizeImages,
                    maxImageSize: store.maxImageSize,
                    enableImageZoom: store.enableImageZoom,
                    keepAspectRatio: store.keepAspectRatio,
                    resultImageSize: store.resultImageSize
                },
                images,
                wordArranger: {
                    data: localStorage.getItem('wordArrangerData2') ? JSON.parse(localStorage.getItem('wordArrangerData2')) : null,
                    slots: localStorage.getItem('wordArrangerSlots2') ? JSON.parse(localStorage.getItem('wordArrangerSlots2')) : null
                },
                savedAt: new Date().toISOString()
            };

            // Send to Cloudflare Worker
            const response = await fetch(`${store.cloudWorkerUrl}/api/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': store.cloudApiKey
                },
                body: JSON.stringify({
                    passkey: store.cloudPasskey,
                    data: backupData
                })
            });

            const result = await response.json();
            if (result.success) {
                toast(`☁️ クラウド保存完了 (画像${Object.keys(images).length}件)`);
            } else {
                throw new Error(result.error || 'Save failed');
            }
        } catch (err) {
            console.error('Cloud save failed:', err);
            toast('クラウド保存に失敗しました');
        } finally {
            setCloudSaving(false);
        }
    };

    // Cloud Load - Load data and images from Cloudflare R2
    const doCloudLoad = async () => {
        if (!store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey) {
            toast('パスキー・Worker URL・APIキーを設定してください');
            return;
        }

        setCloudSaving(true);
        try {
            const response = await fetch(`${store.cloudWorkerUrl}/api/load?passkey=${encodeURIComponent(store.cloudPasskey)}`, {
                headers: { 'X-API-Key': store.cloudApiKey }
            });
            const result = await response.json();

            if (!result.success) {
                if (response.status === 404) {
                    toast('このパスキーのデータが見つかりません');
                } else {
                    throw new Error(result.error || 'Load failed');
                }
                return;
            }

            const data = result.data;

            // Apply migration to cats
            const migratedCats = data.cats ? data.cats.map(c => migrateCatItems({ ...c, hidden: c.hidden || false })) : store.cats;

            // Import images
            let importedImages = 0;
            if (data.images && typeof data.images === 'object') {
                for (const [imageId, base64Data] of Object.entries(data.images)) {
                    try {
                        await saveImage(imageId, base64Data);
                        importedImages++;
                    } catch (e) {
                        console.error('Failed to import image:', imageId, e);
                    }
                }
            }

            // Update store
            update(() => ({
                cats: migratedCats,
                presets: data.presets || store.presets,
                ...(data.settings || {})
            }));

            // Restore Word Arranger data
            if (data.wordArranger) {
                if (data.wordArranger.data) {
                    localStorage.setItem('wordArrangerData2', JSON.stringify(data.wordArranger.data));
                }
                if (data.wordArranger.slots) {
                    localStorage.setItem('wordArrangerSlots2', JSON.stringify(data.wordArranger.slots));
                }
            }

            // Refresh image cache
            const allImages = await getAllImages();
            setImageCache(allImages);

            toast(`☁️ クラウドから復元完了 (画像${importedImages}件)`);
        } catch (err) {
            console.error('Cloud load failed:', err);
            toast('クラウド読み込みに失敗しました');
        } finally {
            setCloudSaving(false);
        }
    };

    const doImport = async () => {
        const txt = tempImport.trim();
        if (!txt) return;
        try {
            const json = JSON.parse(txt);
            if (json.cats) {
                // Apply migration to imported cats
                const migratedCats = json.cats.map(c => migrateCatItems({ ...c, hidden: c.hidden || false }));
                update(() => ({ cats: migratedCats, presets: json.presets || store.presets }));

                // Import images if present
                if (json.images && typeof json.images === 'object') {
                    const imageEntries = Object.entries(json.images);
                    let imported = 0;
                    for (const [imageId, base64Data] of imageEntries) {
                        try {
                            await saveImage(imageId, base64Data);
                            imported++;
                        } catch (e) {
                            console.error('Failed to import image:', imageId, e);
                        }
                    }
                    // Refresh image cache
                    const allImages = await getAllImages();
                    setImageCache(allImages);
                    if (imported > 0) {
                        toast(`インポート完了(画像${imported}件)`);
                    } else {
                        toast('インポート完了');
                    }
                } else {
                    toast('インポート完了');
                }

                setModal(null);
                setTempImport('');
                return;
            }
        } catch { }

        const blocks = txt.split(/\n\n+/);
        const newCats = blocks.map((block, idx) => {
            const lines = block.split('\n').filter(l => l.trim());
            if (lines.length === 0) return null;
            const headerMatch = lines[0].match(/^\[(.+?)\](\s*\(非表示\))?$/);
            const name = headerMatch ? headerMatch[1] : `項目${idx + 1}`;
            const hidden = headerMatch ? !!headerMatch[2] : false;
            const itemNames = headerMatch ? lines.slice(1) : lines;
            // Convert item names to new object format
            const items = itemNames.filter(Boolean).map(itemName => ({
                name: itemName.trim(),
                subItems: [],
                hasSubItems: false
            }));
            return { id: Date.now() + idx, name, items, hidden, weights: {}, emoji: '🎲', color: '#a855f7' };
        }).filter(Boolean);
        if (newCats.length > 0) {
            update(() => ({ cats: newCats }));
            setModal(null);
            setTempImport('');
            toast('インポート完了');
        }
    };

    // Import Zip file
    const handleZipImport = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const zip = await JSZip.loadAsync(file);

            // Read data.json
            const dataFile = zip.file("data.json");
            if (!dataFile) {
                toast('無効なバックアップファイルです (data.jsonが見つかりません)');
                return;
            }
            const jsonText = await dataFile.async("string");
            const json = JSON.parse(jsonText);

            if (json.cats) {
                // Apply migration
                const migratedCats = json.cats.map(c => migrateCatItems({ ...c, hidden: c.hidden || false }));

                // Import images form images/ folder
                const imgFolder = zip.folder("images");
                let importedImages = 0;
                const newImageCache = {};

                if (imgFolder) {
                    const imageFiles = [];
                    imgFolder.forEach((relativePath, file) => {
                        imageFiles.push({ path: relativePath, file });
                    });

                    for (const { path, file } of imageFiles) {
                        if (path.endsWith('.jpg') || path.endsWith('.png')) {
                            const imageId = path.replace(/\.[^/.]+$/, "");
                            const base64 = await file.async("base64");
                            const dataUrl = `data:image/jpeg;base64,${base64}`;
                            await saveImage(imageId, dataUrl);
                            newImageCache[imageId] = dataUrl;
                            importedImages++;
                        }
                    }
                }

                // Update store
                update(() => ({
                    cats: migratedCats,
                    presets: json.presets || store.presets
                }));

                // Restore Word Arranger data if present
                if (json.wordArranger) {
                    if (json.wordArranger.data) {
                        localStorage.setItem('wordArrangerData2', JSON.stringify(json.wordArranger.data));
                    }
                    if (json.wordArranger.slots) {
                        localStorage.setItem('wordArrangerSlots2', JSON.stringify(json.wordArranger.slots));
                    }
                }

                // Update image cache
                const allImages = await getAllImages(); // Refresh from DB
                setImageCache(allImages);



                setModal(null);
                setTempImport('');
                toast(`インポート完了 (画像${importedImages}件)`);
            } else {
                toast('データ形式が正しくありません');
            }
        } catch (err) {
            console.error('Failed to import zip:', err);
            toast('インポートに失敗しました');
        }
        e.target.value = ''; // Reset input
    };

    const savePreset = () => {
        if (!tempPreset.trim()) return;
        const snapshot = {
            id: Date.now(),
            name: tempPreset,
            cats: JSON.parse(JSON.stringify(store.cats)),
            results: { ...store.results },
            locked: { ...store.locked }
        };
        update(s => ({
            presets: [...s.presets, snapshot],
            selectedPresetId: snapshot.id
        }));
        setTempPreset('');
        toast('プリセット保存');
    };

    const loadPreset = (p) => {
        update(() => ({
            cats: JSON.parse(JSON.stringify(p.cats)),
            results: p.results ? { ...p.results } : {},
            locked: p.locked ? { ...p.locked } : {},
            selectedPresetId: p.id
        }));
        toast('読み込みました');
    };

    const delPreset = (id) => {
        update(s => ({ presets: s.presets.filter(p => p.id !== id) }));
    };

    const clearAll = (type) => {
        update(() => ({ [type]: [] }));
        toast('削除しました');
    };

    const dark = store.dark;
    const bg = dark ? 'min-h-screen bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 text-gray-100' : 'min-h-screen bg-gradient-to-br from-gray-50 via-purple-50 to-gray-100 text-gray-900';
    const cardCls = dark ? 'bg-slate-800/60 border border-slate-700/50 rounded-xl' : 'bg-white/80 border border-gray-200 rounded-xl shadow-sm';
    const btnCls = dark ? 'bg-slate-700/80 hover:bg-slate-600/80 rounded-lg px-3 py-1.5 text-sm transition' : 'bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-1.5 text-sm transition';
    const inputCls = dark ? 'w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500' : 'w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500';

    const hiddenCount = store.cats.filter(c => c.hidden).length;
    const displayCats = store.showHidden ? store.cats : visibleCats;

    return (
        <div className={bg + ' p-4'}>
            {msg && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-6 py-2 rounded-full shadow-lg z-50 text-sm">{msg}</div>}

            <div className="max-w-lg mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <h1 onClick={onSwitchApp} className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition select-none">ランダムジェネレーター</h1>
                    <button onClick={() => update(s => ({ dark: !s.dark }))} className={btnCls}>{dark ? '☀️' : '🌙'}</button>
                </div>

                <div className="flex flex-wrap gap-1 justify-center mb-3">
                    {[['main', '🎲'], ['history', '📜'], ['favs', '⭐'], ['presets', '📁'], ['settings', '⚙️']].map(([k, label]) => (
                        <button key={k} onClick={() => setPage(k)} className={`px-2 py-1 rounded-full text-xs transition ${page === k ? 'bg-purple-600 text-white' : btnCls}`}>{label}</button>
                    ))}
                </div>

                {page === 'main' && (
                    <>
                        {store.presets.length > 0 && (
                            <div className="mb-3 flex gap-2">
                                <select
                                    value={store.selectedPresetId || ''}
                                    onChange={(e) => {
                                        const id = Number(e.target.value);
                                        if (id) {
                                            const p = store.presets.find(p => p.id === id);
                                            if (p) loadPreset(p);
                                        }
                                    }}
                                    className={`flex-1 ${inputCls}`}
                                >
                                    <option value="">📁 プリセットを選択...</option>
                                    {store.presets.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <button onClick={() => setTempPreset('') || setPage('presets')} className="px-4 bg-purple-600 text-white rounded-lg whitespace-nowrap">
                                    ＋追加
                                </button>
                            </div>
                        )}
                        {hiddenCount > 0 && (
                            <div className="flex justify-end mb-2">
                                <button onClick={() => update(s => ({ showHidden: !s.showHidden }))} className={`text-xs ${btnCls}`}>
                                    {store.showHidden ? '🙈 非表示を隠す' : `👁 非表示を表示(${hiddenCount})`}
                                </button>
                            </div>
                        )}
                        <div className="space-y-3 mb-5">
                            {displayCats.map((cat) => (
                                <div
                                    key={cat.id}
                                    data-catid={cat.id}
                                    className={`${store.compactMode ? 'p-2' : 'p-3'} rounded-xl ${cat.hidden ? 'opacity-50' : ''} ${dragOverId === cat.id && dragId !== cat.id ? 'ring-2 ring-purple-500' : ''} ${dark ? 'bg-slate-800/60' : 'bg-white/80 shadow-sm'}`}
                                    style={{ borderLeft: `4px solid ${cat.color || '#a855f7'}` }}
                                    onDragOver={(e) => handleDragOver(e, cat.id)}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="text-gray-400 cursor-grab active:cursor-grabbing select-none"
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, cat.id)}
                                                onDragEnd={handleDragEnd}
                                                onTouchStart={() => handleTouchStart(cat.id)}
                                                onTouchMove={(e) => handleTouchMove(e, displayCats)}
                                                onTouchEnd={handleTouchEnd}
                                            >⠿</span>
                                            <span className="text-lg">{cat.emoji || '🎲'}</span>
                                            <span className="font-medium cursor-pointer hover:opacity-70" style={{ color: cat.color || '#a855f7' }} onClick={() => setSelectModal({ cat })}>{cat.name}</span>
                                            {cat.hidden && <span className="text-xs text-gray-500">(非表示)</span>}
                                            <span className="text-xs text-gray-500">{cat.items.length}件</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => toggleLock(cat.id)} className={`p-1 rounded text-xs ${store.locked[cat.id] ? 'bg-amber-500/30 text-amber-400' : btnCls}`}>{store.locked[cat.id] ? '🔒' : '🔓'}</button>
                                            <button onClick={() => { update(s => ({ cats: s.cats.filter(c => c.id !== cat.id) })); }} className={btnCls + ' p-1 text-red-400'}>🗑️</button>
                                            <button onClick={() => openEditModal(cat)} className={btnCls + ' p-1 text-gray-400'}>✏️</button>
                                        </div>
                                    </div>
                                    <div
                                        className={`min-h-[36px] flex items-center gap-2 rounded-lg px-2 py-1 ${dark ? 'bg-slate-900/60' : 'bg-gray-100'} ${spin ? 'animate-pulse' : ''} text-sm`}
                                    >
                                        {(() => {
                                            const resultText = store.results[cat.id] || '';
                                            if (!resultText) return <span className="text-gray-500 text-xs">---</span>;

                                            // Parse result to get main item and sub-item names
                                            const parts = resultText.split(' → ');
                                            const mainItemName = parts[0];
                                            const subItemName = parts[1] || null;

                                            // Find the main item
                                            const item = cat.items.find(i => getItemName(i) === mainItemName);

                                            // Determine which image to show (sub-item image takes priority)
                                            let imgSrc = null;
                                            let imgAlt = mainItemName;

                                            if (subItemName && item?.subItems) {
                                                const subItem = item.subItems.find(s => getSubItemName(s) === subItemName);
                                                const subImgId = typeof subItem === 'object' ? subItem?.imageId : null;
                                                if (subImgId && imageCache[subImgId]) {
                                                    imgSrc = imageCache[subImgId];
                                                    imgAlt = subItemName;
                                                }
                                            }

                                            // If no sub-item image, use main item image
                                            if (!imgSrc && item?.imageId && imageCache[item.imageId]) {
                                                imgSrc = imageCache[item.imageId];
                                            }

                                            // Image Mode Logic
                                            const isImageMode = cat.isImageMode;
                                            const imageStyle = cat.imageStyle || 'contain';
                                            const customSize = cat.customImageSize && cat.customImageSize > 0 ? cat.customImageSize : (store.resultImageSize || 40);

                                            let imgStyle = {};
                                            let containerStyle = isImageMode ? "flex flex-col items-center w-full" : "flex items-center w-full gap-2";
                                            let imgClass = `rounded shadow-sm border border-gray-100 flex-shrink-0 cursor-zoom-in ${isImageMode ? 'mb-1' : ''}`;

                                            if (isImageMode) {
                                                if (imageStyle === 'original') {
                                                    imgStyle = { width: '100%', height: 'auto', maxHeight: '400px', objectFit: 'contain' };
                                                } else if (imageStyle === 'square-contain') {
                                                    imgStyle = { width: '100%', height: 'auto', aspectRatio: '1/1', objectFit: 'fill' };
                                                } else { // contain, cover (fixed height 200px equivalent) or fallback
                                                    imgStyle = { width: '100%', height: '200px', objectFit: imageStyle, maxHeight: '400px' };
                                                }
                                            } else {
                                                // Normal mode - stretch image to fill square
                                                imgStyle = {
                                                    width: customSize,
                                                    height: customSize,
                                                    objectFit: 'fill'
                                                };
                                            }

                                            return (
                                                <div className={containerStyle}>
                                                    {imgSrc && (
                                                        <img
                                                            src={imgSrc}
                                                            alt="item"
                                                            style={imgStyle}
                                                            className={imgClass}
                                                            onClick={(e) => {
                                                                if (store.enableImageZoom) {
                                                                    e.stopPropagation();
                                                                    setZoomImage({ src: imgSrc, alt: imgAlt });
                                                                }
                                                            }}
                                                        />
                                                    )}
                                                    {!isImageMode && <span className="flex-1">{resultText}</span>}
                                                    {isImageMode && !imgSrc && <span className="flex-1 text-center font-bold text-lg py-4">{resultText}</span>}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ))}
                            <button onClick={addCat} className={`w-full py-3 mb-20 border-2 border-dashed ${dark ? 'border-slate-700 text-slate-500 hover:bg-slate-800' : 'border-gray-300 text-gray-400 hover:bg-gray-50'} rounded-xl transition flex items-center justify-center gap-2`}>
                                <span>＋ 項目を追加</span>
                            </button>
                        </div>

                        <div className={`fixed bottom-0 left-0 right-0 p-4 ${dark ? 'bg-slate-900/90 border-t border-slate-700' : 'bg-white/90 border-t border-gray-200'} backdrop-blur-md z-40`}>
                            <div className="max-w-lg mx-auto">
                                <div className="flex flex-col gap-3">
                                    <button onClick={doGenerate} disabled={spin} className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xl font-bold rounded-2xl shadow-lg hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50">
                                        {spin ? '...' : '🎲 生成'}
                                    </button>
                                    <div className="flex flex-wrap gap-2 justify-center items-center">
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setGenCount(Math.max(1, genCount - 1))} className={btnCls}>−</button>
                                            <span className="w-8 text-center text-sm">{genCount}回</span>
                                            <button onClick={() => setGenCount(Math.min(10, genCount + 1))} className={btnCls}>＋</button>
                                        </div>
                                        <button onClick={addFav} className={btnCls}>⭐ お気に入り</button>
                                        <button onClick={copyResult} className={btnCls}>📋 コピー</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 justify-center pb-48">
                            <button onClick={doExportText} className={btnCls}>📤コピー</button>
                            <button onClick={doExportJSON} className={btnCls}>💾JSON</button>
                            <button onClick={() => { setTempImport(''); setModal({ type: 'import' }); }} className={btnCls}>📥インポート</button>
                        </div>
                    </>
                )}

                {page === 'history' && (
                    <div className="space-y-2">
                        {store.history.length > 0 && (
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-500">{store.history.length}件</span>
                                <button onClick={() => clearAll('history')} className="text-sm text-red-400">全削除</button>
                            </div>
                        )}
                        {store.history.length === 0 && <p className="text-center text-gray-500 py-8">履歴なし</p>}
                        {store.history.map(h => {
                            const resultSize = store.resultFontSize === 'small' ? 'text-xs' : store.resultFontSize === 'large' ? 'text-base' : 'text-sm';
                            const isNew = lastGeneratedIds.includes(h.id);
                            return (
                                <div key={h.id} className={`${cardCls} p - 3 ${isNew ? 'ring-2 ring-purple-500 bg-purple-500/10' : ''} `}>
                                    {store.showHistoryTime && <div className="text-xs text-gray-500 mb-1">{h.time}</div>}
                                    {Object.entries(h.res).map(([id, val]) => {
                                        const cat = store.cats.find(c => c.id === Number(id));
                                        const color = cat?.color || '#a855f7';
                                        return val && (
                                            <div key={id} className={resultSize}>
                                                <span style={{ color }}>{h.names[id]}:</span> {val}
                                            </div>
                                        );
                                    })}
                                    {store.showRestoreButton && (
                                        <button onClick={() => restoreRes(h.res)} className="text-xs text-purple-400 mt-2">↩️復元</button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {page === 'favs' && (
                    <div className="space-y-2">
                        {store.favs.length > 0 && (
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-500">{store.favs.length}件</span>
                                <button onClick={() => clearAll('favs')} className="text-sm text-red-400">全削除</button>
                            </div>
                        )}
                        {store.favs.length === 0 && <p className="text-center text-gray-500 py-8">お気に入りなし</p>}
                        {store.favs.map(f => {
                            const resultSize = store.resultFontSize === 'small' ? 'text-xs' : store.resultFontSize === 'large' ? 'text-base' : 'text-sm';
                            return (
                                <div key={f.id} className={cardCls + ' p-3'}>
                                    {store.showHistoryTime && <div className="text-xs text-gray-500 mb-1">{f.time}</div>}
                                    {Object.entries(f.res).map(([id, val]) => {
                                        const cat = store.cats.find(c => c.id === Number(id));
                                        const color = cat?.color || '#a855f7';
                                        return val && (
                                            <div key={id} className={resultSize}>
                                                <span style={{ color }}>{f.names[id]}:</span> {val}
                                            </div>
                                        );
                                    })}
                                    <div className="flex gap-3 mt-2">
                                        {store.showRestoreButton && (
                                            <button onClick={() => restoreRes(f.res)} className="text-xs text-purple-400">↩️復元</button>
                                        )}
                                        <button onClick={() => update(s => ({ favs: s.favs.filter(x => x.id !== f.id) }))} className="text-xs text-red-400">🗑️削除</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {page === 'presets' && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <input type="text" value={tempPreset} onChange={e => setTempPreset(e.target.value)} placeholder="プリセット名" className={inputCls} />
                            <button onClick={savePreset} className="px-4 py-2 bg-purple-600 text-white rounded-lg shrink-0">保存</button>
                        </div>
                        {store.presets.length === 0 && <p className="text-center text-gray-500 py-8">プリセットなし</p>}
                        {store.presets.map(p => (
                            <div key={p.id} className={cardCls + ' p-3 flex justify-between items-center'}>
                                <div>
                                    <div className="font-medium">{p.name}</div>
                                    <div className="text-xs text-gray-500">{p.cats.length}項目</div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => update(s => {
                                        const idx = s.presets.findIndex(x => x.id === p.id);
                                        if (idx <= 0) return s;
                                        const newPresets = [...s.presets];
                                        [newPresets[idx - 1], newPresets[idx]] = [newPresets[idx], newPresets[idx - 1]];
                                        return { presets: newPresets };
                                    })} className="text-gray-400 hover:text-purple-600">↑</button>
                                    <button onClick={() => update(s => {
                                        const idx = s.presets.findIndex(x => x.id === p.id);
                                        if (idx < 0 || idx >= s.presets.length - 1) return s;
                                        const newPresets = [...s.presets];
                                        [newPresets[idx], newPresets[idx + 1]] = [newPresets[idx + 1], newPresets[idx]];
                                        return { presets: newPresets };
                                    })} className="text-gray-400 hover:text-purple-600">↓</button>
                                    <button onClick={() => loadPreset(p)} className="px-3 py-1 bg-purple-600/60 text-white rounded text-sm">読込</button>
                                    <button onClick={() => delPreset(p.id)} className="text-red-400 text-sm">🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {page === 'settings' && (
                    <div className="space-y-3 pb-48">
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-3">生成オプション</h3>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>連続重複を防ぐ</span>
                                    <p className="text-xs text-gray-500">同じ結果が連続しない</p>
                                </div>
                                <button onClick={() => update(s => ({ noRepeat: !s.noRepeat }))} className={`w-12 h-6 rounded-full transition ${store.noRepeat ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.noRepeat ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex justify-between items-center mb-3">
                                <span>非表示ボタン（カード）</span>
                                <button onClick={() => update(s => ({ showHiddenControl: !s.showHiddenControl }))} className={`${btnCls} ${store.showHiddenControl ? 'bg-purple-600 text-white' : ''}`}>
                                    {store.showHiddenControl ? '表示' : '非表示'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>生成アニメーション</span>
                                    <p className="text-xs text-gray-500">ONで0.3秒の演出あり</p>
                                </div>
                                <button onClick={() => update(s => ({ showAnimation: !s.showAnimation }))} className={`w-12 h-6 rounded-full transition ${store.showAnimation ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.showAnimation ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span>重み表示</span>
                                    <p className="text-xs text-gray-500">選択画面で重みを表示</p>
                                </div>
                                <button onClick={() => update(s => ({ showWeightIndicator: !s.showWeightIndicator }))} className={`w-12 h-6 rounded-full transition ${store.showWeightIndicator ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.showWeightIndicator ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-3">表示オプション</h3>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>ダークモード</span>
                                    <p className="text-xs text-gray-500">目に優しい暗い配色</p>
                                </div>
                                <button onClick={() => update(s => ({ dark: !s.dark }))} className={`w-12 h-6 rounded-full transition ${dark ? 'bg-purple-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${dark ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>コンパクトモード</span>
                                    <p className="text-xs text-gray-500">項目カードを小さく</p>
                                </div>
                                <button onClick={() => update(s => ({ compactMode: !s.compactMode }))} className={`w-12 h-6 rounded-full transition ${store.compactMode ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.compactMode ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>履歴に時間を表示</span>
                                    <p className="text-xs text-gray-500">生成日時を表示</p>
                                </div>
                                <button onClick={() => update(s => ({ showHistoryTime: !s.showHistoryTime }))} className={`w-12 h-6 rounded-full transition ${store.showHistoryTime ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.showHistoryTime ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>復元ボタンを表示</span>
                                    <p className="text-xs text-gray-500">履歴から復元可能に</p>
                                </div>
                                <button onClick={() => update(s => ({ showRestoreButton: !s.showRestoreButton }))} className={`w-12 h-6 rounded-full transition ${store.showRestoreButton ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.showRestoreButton ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span>結果の文字サイズ (履歴)</span>
                                    <p className="text-xs text-gray-500">履歴・お気に入りの表示</p>
                                </div>
                                <select
                                    value={store.resultFontSize}
                                    onChange={(e) => update(() => ({ resultFontSize: e.target.value }))}
                                    className={`${dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} border rounded-lg px-2 py-1 text-sm`}
                                >
                                    <option value="small">小</option>
                                    <option value="normal">中</option>
                                    <option value="large">大</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between mt-3">
                                <div>
                                    <span>結果の文字サイズ (メイン)</span>
                                    <p className="text-xs text-gray-500">生成結果の表示</p>
                                </div>
                                <select
                                    value={store.mainResultFontSize}
                                    onChange={(e) => update(() => ({ mainResultFontSize: e.target.value }))}
                                    className={`${dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} border rounded-lg px-2 py-1 text-sm`}
                                >
                                    <option value="small">小</option>
                                    <option value="normal">中</option>
                                    <option value="large">大</option>
                                </select>
                            </div>
                        </div>
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-3">画像オプション</h3>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>画像を自動リサイズ</span>
                                    <p className="text-xs text-gray-500">アップロード時に画像を縮小</p>
                                </div>
                                <button onClick={() => update(s => ({ resizeImages: !s.resizeImages }))} className={`w-12 h-6 rounded-full transition ${store.resizeImages ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.resizeImages ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            {store.resizeImages && (
                                <div className="flex items-center justify-between mb-3">
                                    <div>
                                        <span>最大サイズ</span>
                                        <p className="text-xs text-gray-500">リサイズ時の最大幅/高さ</p>
                                    </div>
                                    <select value={store.maxImageSize} onChange={e => update(s => ({ maxImageSize: Number(e.target.value) }))} className={`${dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} border rounded-lg px-2 py-1 text-sm`}>
                                        <option value={300}>300px</option>
                                        <option value={500}>500px</option>
                                        <option value={800}>800px</option>
                                        <option value={1000}>1000px</option>
                                    </select>
                                </div>
                            )}
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>アスペクト比を維持</span>
                                    <p className="text-xs text-gray-500">オフの場合は正方形(1:1)にカット</p>
                                </div>
                                <button onClick={() => update(s => ({ keepAspectRatio: !s.keepAspectRatio }))} className={`w-12 h-6 rounded-full transition ${store.keepAspectRatio ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.keepAspectRatio ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <span>結果の画像サイズ</span>
                                    <p className="text-xs text-gray-500">結果画面での画像の表示サイズ</p>
                                </div>
                                <select value={store.resultImageSize} onChange={e => update(s => ({ resultImageSize: Number(e.target.value) }))} className={`${dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} border rounded-lg px-2 py-1 text-sm`}>
                                    <option value={20}>極小 (20px)</option>
                                    <option value={40}>小 (40px)</option>
                                    <option value={80}>中 (80px)</option>
                                    <option value={120}>大 (120px)</option>
                                    <option value={200}>特大 (200px)</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span>画像クリックで拡大</span>
                                    <p className="text-xs text-gray-500">結果の画像をタップで拡大表示</p>
                                </div>
                                <button onClick={() => update(s => ({ enableImageZoom: !s.enableImageZoom }))} className={`w-12 h-6 rounded-full transition ${store.enableImageZoom ? 'bg-purple-600' : dark ? 'bg-slate-600' : 'bg-gray-300'}`}>
                                    <div className={`w-5 h-5 bg-white rounded-full shadow transform transition ${store.enableImageZoom ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>
                        </div>
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-3">☁️ クラウド設定</h3>
                            <div className="mb-3">
                                <label className="block text-xs text-gray-500 mb-1">Worker URL</label>
                                <input
                                    type="url"
                                    value={store.cloudWorkerUrl}
                                    onChange={(e) => update(() => ({ cloudWorkerUrl: e.target.value }))}
                                    placeholder="https://your-worker.workers.dev"
                                    className={inputCls + ' text-sm'}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="block text-xs text-gray-500 mb-1">パスキー</label>
                                <input
                                    type="text"
                                    value={store.cloudPasskey}
                                    onChange={(e) => update(() => ({ cloudPasskey: e.target.value }))}
                                    placeholder="あなただけのパスキー"
                                    className={inputCls + ' text-sm'}
                                />
                            </div>
                            <div className="mb-3">
                                <label className="block text-xs text-gray-500 mb-1">APIキー</label>
                                <input
                                    type="password"
                                    value={store.cloudApiKey}
                                    onChange={(e) => update(() => ({ cloudApiKey: e.target.value }))}
                                    placeholder="Worker認証用APIキー"
                                    className={inputCls + ' text-sm'}
                                />
                                <p className="text-xs text-gray-500 mt-1">※ 設定はブラウザに保存されます</p>
                            </div>
                        </div>
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-3">データ</h3>
                            <button onClick={doCloudSave} disabled={cloudSaving || !store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls} ${(!store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey) ? 'opacity-50 cursor-not-allowed' : ''}`}>☁️ クラウド保存 {cloudSaving && '...'}</button>
                            <button onClick={doCloudLoad} disabled={cloudSaving || !store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls} ${(!store.cloudPasskey || !store.cloudWorkerUrl || !store.cloudApiKey) ? 'opacity-50 cursor-not-allowed' : ''}`}>📥 クラウド読み込み {cloudSaving && '...'}</button>
                            <hr className={`my-3 ${dark ? 'border-slate-600' : 'border-gray-200'}`} />
                            <button onClick={doExportJSON} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls}`}>💾 JSONバックアップ (画像なし)</button>
                            <button onClick={doExportZip} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls}`}>🗄️ Zipバックアップ (画像含む)</button>

                            <button onClick={() => { setTempImport(''); setModal({ type: 'import' }); }} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls}`}>📥 インポート (テキスト/Zip)</button>
                            <button onClick={() => { setStore(INIT_DATA); toast('リセット完了'); }} className={`w-full text-left p-2 rounded-lg text-red-400 ${btnCls}`}>🗑️ 全データリセット</button>
                        </div>
                        <div className={cardCls + ' p-4'}>
                            <h3 className="font-semibold mb-2">統計</h3>
                            <div className="text-sm text-gray-500 space-y-1">
                                <div>項目数: {store.cats.length} ({hiddenCount}件非表示)</div>
                                <div>総候補数: {store.cats.reduce((a, c) => a + c.items.length, 0)}</div>
                                <div>履歴: {store.history.length}件</div>
                                <div>お気に入り: {store.favs.length}件</div>
                                <div>プリセット: {store.presets.length}件</div>
                            </div>
                        </div>
                    </div>
                )}

                {modal?.type === 'edit' && (() => {
                    const emojiOptions = ['🎲', '🎯', '⭐', '🔥', '💎', '🌟', '🌈', '🎀', '🍀', '⚡', '🎮', '🎵', '🎨', '🍕', '🍜', '🎂', '☕', '🏠', '🚗', '✈️', '🌙', '☀️', '❤️', '💜', '💙', '💚', '💛', '🧡', '👧', '👦', '👩', '👨', '👶', '👋', '👍', '👎', '✋', '✌️', '👌', '🤞', '💪', '👀', '💋', '😀', '🤣', '😍', '🤩', '🤔', '😱', '🏀', '⚽', '🏈', '🎾', '🏓', '🎳', '🚴', '🏃'];
                    const colorOptions = ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

                    return (
                        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2" onClick={() => setModal(null)}>
                            <div className={`${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'} rounded-2xl p-4 w-full max-w-md shadow-xl max-h-[90vh] overflow-auto relative`} onClick={e => e.stopPropagation()}>
                                <button onClick={() => setModal(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700">×</button>
                                <h3 className="text-base font-bold mb-3 pr-6">項目を編集</h3>
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">項目名</label>
                                    <div className="flex gap-2 items-center">
                                        <span className="text-xl">{tempEmoji}</span>
                                        <input type="text" value={tempName} onChange={e => setTempName(e.target.value)} className={inputCls + ' text-sm py-1'} style={{ color: tempColor }} />
                                    </div>
                                </div>
                                <div className="mb-2 p-2 bg-gray-50 dark:bg-slate-800 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-gray-500">画像モード設定</label>
                                        <button
                                            onClick={() => setTempImageMode(!tempImageMode)}
                                            className={`text-xs px-2 py-0.5 rounded ${tempImageMode ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-300'}`}
                                        >
                                            {tempImageMode ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    {tempImageMode && (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex gap-2">
                                                {[
                                                    { val: 'contain', label: '全体' },
                                                    { val: 'cover', label: '埋め' },
                                                    { val: 'original', label: '原寸' },
                                                    { val: 'square-contain', label: '正方形全体' }
                                                ].map(opt => (
                                                    <button
                                                        key={opt.val}
                                                        onClick={() => setTempImageStyle(opt.val)}
                                                        className={`flex-1 text-xs py-1 rounded border ${tempImageStyle === opt.val ? 'bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-300' : 'border-gray-200 dark:border-slate-600 text-gray-500'}`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {!tempImageMode && (
                                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                                            <div className="flex justify-between items-center mb-1">
                                                <label className="text-xs text-gray-500">画像サイズ (通常モード)</label>
                                                <span className="text-xs font-mono">{tempCustomImageSize > 0 ? `${tempCustomImageSize}px` : 'デフォルト'}</span>
                                            </div>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="300"
                                                    step="10"
                                                    value={tempCustomImageSize}
                                                    onChange={(e) => setTempCustomImageSize(Number(e.target.value))}
                                                    className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                                                />
                                                <button onClick={() => setTempCustomImageSize(0)} className="text-xs text-blue-400 hover:text-blue-300">リセット</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="mb-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="text-xs text-gray-500">候補（1行に1つ）</label>
                                        <button onClick={() => setExpandTextarea(!expandTextarea)} className={btnCls + ' text-xs py-0.5 px-2'}>
                                            {expandTextarea ? '▲ 縮小' : '▼ 全て表示'}
                                        </button>
                                    </div>
                                    <textarea value={tempItems} onChange={e => setTempItems(e.target.value)} rows={expandTextarea ? 20 : 6} className={inputCls + ' resize-none font-mono text-xs'} spellCheck={false} />
                                    <div className="text-xs text-gray-500 mt-0.5">{tempItems.split('\n').filter(s => s.trim()).length}件</div>
                                </div>
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">絵文字</label>
                                    <div className="flex flex-wrap gap-0.5">
                                        {emojiOptions.map(e => (
                                            <button key={e} onClick={() => setTempEmoji(e)} className={`w-7 h-7 text-base rounded ${tempEmoji === e ? 'bg-purple-600 ring-1 ring-purple-400' : dark ? 'bg-slate-800 hover:bg-slate-700' : 'bg-gray-100 hover:bg-gray-200'}`}>{e}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">色</label>
                                    <div className="flex flex-wrap gap-1">
                                        {colorOptions.map(c => (
                                            <button key={c} onClick={() => setTempColor(c)} className={`w-6 h-6 rounded-full ${tempColor === c ? 'ring-2 ring-white ring-offset-1 ring-offset-slate-900' : ''}`} style={{ backgroundColor: c }} />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1 mb-3">
                                    <button onClick={toggleHidden} className={btnCls + ' text-xs py-1 px-2'}>{modal.hidden ? '👁 表示' : '🙈 非表示'}</button>
                                    <button onClick={dupCat} className={btnCls + ' text-xs py-1 px-2'}>📋 複製</button>
                                    <button onClick={deleteCat} className={`${btnCls} text-red-400 text-xs py-1 px-2`}>🗑️ 削除</button>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={saveEditModal} className="px-3 py-1 bg-purple-600 text-white rounded-lg text-xs">保存</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {modal?.type === 'import' && (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setModal(null)}>
                        <div className={`${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'} rounded-2xl p-5 w-full max-w-md shadow-xl`} onClick={e => e.stopPropagation()}>
                            <h3 className="text-lg font-bold mb-4">インポート</h3>
                            <p className="text-sm text-gray-500 mb-2">テキスト形式またはJSON/Zip</p>

                            <div className="mb-4">
                                <label
                                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed transition cursor-pointer ${isDragging ? 'bg-purple-100 border-purple-500 dark:bg-purple-900/40 dark:border-purple-500' : (dark ? 'bg-slate-800 border-slate-600 hover:bg-slate-700' : 'bg-gray-50 border-gray-300 hover:bg-gray-100')}`}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsDragging(false);
                                        const file = e.dataTransfer.files[0];
                                        if (file && file.name.endsWith('.zip')) {
                                            handleZipImport({ target: { files: [file] } });
                                            setModal(null);
                                        } else {
                                            toast('Zipファイルのみ対応しています');
                                        }
                                    }}
                                >
                                    <span className="text-2xl">📦</span>
                                    <div className="text-center">
                                        <span className="font-medium text-sm">Zipファイルを読み込む</span>
                                        <p className="text-xs text-gray-500 mt-0.5">ドラッグ＆ドロップまたはクリック</p>
                                    </div>
                                    <input type="file" accept=".zip" onChange={(e) => {
                                        handleZipImport(e);
                                        setModal(null);
                                    }} className="hidden" />
                                </label>
                            </div>

                            <p className="text-xs text-gray-500 mb-1">またはテキスト/JSONを貼り付け:</p>
                            <textarea value={tempImport} onChange={e => setTempImport(e.target.value)} rows={5} placeholder={"[項目1]\n候補A\n候補B..."} className={inputCls + ' resize-none font-mono text-sm mb-3'} spellCheck={false} />

                            <div className="flex justify-end gap-2">
                                <button onClick={() => setModal(null)} className={btnCls}>キャンセル</button>
                                <button onClick={doImport} className="px-4 py-2 bg-purple-600 text-white rounded-lg">インポート</button>
                            </div>
                        </div>
                    </div>
                )}

                {selectModal && (() => {
                    const cat = store.cats.find(c => c.id === selectModal.cat.id) || selectModal.cat;
                    const weights = cat.weights || {};

                    const updateWeight = (itemName, delta) => {
                        const currentWeight = weights[itemName] ?? 1;
                        const newWeight = Math.max(0, Math.min(5, currentWeight + delta));
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? { ...c, weights: { ...c.weights, [itemName]: newWeight } }
                                : c
                            )
                        }));
                    };

                    const toggleSubItems = (idx) => {
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => i === idx
                                        ? { ...item, hasSubItems: !item.hasSubItems }
                                        : item)
                                }
                                : c
                            )
                        }));
                    };

                    // Reorder sub-items via drag and drop
                    const reorderSubItem = (itemIdx, fromIdx, toIdx) => {
                        if (fromIdx === toIdx) return;
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => {
                                        if (i !== itemIdx) return item;
                                        const newSubItems = [...item.subItems];
                                        const [moved] = newSubItems.splice(fromIdx, 1);
                                        newSubItems.splice(toIdx, 0, moved);
                                        return { ...item, subItems: newSubItems };
                                    })
                                }
                                : c
                            )
                        }));
                    };

                    const addSubItem = (idx, subItemName) => {
                        if (!subItemName.trim()) return;
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => i === idx
                                        ? { ...item, subItems: [...(item.subItems || []), { name: subItemName.trim(), imageId: null }] }
                                        : item)
                                }
                                : c
                            )
                        }));
                    };

                    const removeSubItem = (itemIdx, subItemIdx) => {
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => i === itemIdx
                                        ? { ...item, subItems: item.subItems.filter((_, si) => si !== subItemIdx) }
                                        : item)
                                }
                                : c
                            )
                        }));
                    };

                    const updateSubItem = (itemIdx, subItemIdx, newValue) => {
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => i === itemIdx
                                        ? {
                                            ...item, subItems: item.subItems.map((sub, si) => si === subItemIdx
                                                ? { ...normalizeSubItem(sub), name: newValue }
                                                : sub)
                                        }
                                        : item)
                                }
                                : c
                            )
                        }));
                    };

                    // Handle sub-item image upload
                    const handleSubImageUpload = async (itemIdx, subItemIdx, file) => {
                        try {
                            const item = cat.items[itemIdx];
                            const subItem = item.subItems[subItemIdx];
                            const subItemName = getSubItemName(subItem);
                            const imageId = generateImageId(cat.id, `${getItemName(item)}_sub_${subItemName} `);
                            let base64Data;

                            if (store.resizeImages) {
                                base64Data = await resizeImage(file, store.maxImageSize, store.keepAspectRatio);
                            } else {
                                base64Data = await readImageAsBase64(file);
                            }

                            await saveImage(imageId, base64Data);
                            setImageCache(prev => ({ ...prev, [imageId]: base64Data }));

                            update(s => ({
                                cats: s.cats.map(c => c.id === cat.id
                                    ? {
                                        ...c, items: c.items.map((it, i) => i === itemIdx
                                            ? {
                                                ...it, subItems: it.subItems.map((sub, si) => si === subItemIdx
                                                    ? { ...normalizeSubItem(sub), imageId }
                                                    : sub)
                                            }
                                            : it)
                                    }
                                    : c
                                )
                            }));

                            toast('画像を保存しました');
                        } catch (err) {
                            console.error('Failed to upload sub-item image:', err);
                            toast('画像の保存に失敗しました');
                        }
                    };

                    // Delete sub-item image
                    const handleSubImageDelete = async (itemIdx, subItemIdx) => {
                        try {
                            const item = cat.items[itemIdx];
                            const subItem = item.subItems[subItemIdx];
                            const subItemName = getSubItemName(subItem);
                            const imageId = generateImageId(cat.id, `${getItemName(item)}_sub_${subItemName} `);
                            await deleteImage(imageId);
                            setImageCache(prev => {
                                const newCache = { ...prev };
                                delete newCache[imageId];
                                return newCache;
                            });

                            update(s => ({
                                cats: s.cats.map(c => c.id === cat.id
                                    ? {
                                        ...c, items: c.items.map((it, i) => i === itemIdx
                                            ? {
                                                ...it, subItems: it.subItems.map((sub, si) => si === subItemIdx
                                                    ? { ...normalizeSubItem(sub), imageId: null }
                                                    : sub)
                                            }
                                            : it)
                                    }
                                    : c
                                )
                            }));

                            toast('画像を削除しました');
                        } catch (err) {
                            console.error('Failed to delete sub-item image:', err);
                            toast('画像の削除に失敗しました');
                        }
                    };

                    return (
                        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                            <div className={`${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'} rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[80vh] flex flex-col relative`}>
                                <button onClick={() => setSelectModal(null)} className="absolute top-3 right-3 text-gray-400 hover:text-white w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700">×</button>
                                <h3 className="text-lg font-bold mb-2 pr-6">「{cat.name}」の編集</h3>

                                {/* Image Mode Settings at the top */}
                                <div className={`mb-3 p-2 rounded-lg ${dark ? 'bg-slate-800' : 'bg-gray-50'}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-gray-500">画像モード設定</label>
                                        <button
                                            onClick={() => {
                                                update(s => ({
                                                    cats: s.cats.map(c => c.id === cat.id
                                                        ? { ...c, isImageMode: !c.isImageMode }
                                                        : c
                                                    )
                                                }));
                                            }}
                                            className={`text-xs px-2 py-0.5 rounded ${cat.isImageMode ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-700 dark:bg-slate-600 dark:text-gray-300'}`}
                                        >
                                            {cat.isImageMode ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                    {cat.isImageMode && (
                                        <div className="flex gap-2 mb-2">
                                            {[
                                                { val: 'contain', label: '全体' },
                                                { val: 'cover', label: '埋め' },
                                                { val: 'original', label: '原寸' },
                                                { val: 'square-contain', label: '正方形' }
                                            ].map(opt => (
                                                <button
                                                    key={opt.val}
                                                    onClick={() => {
                                                        update(s => ({
                                                            cats: s.cats.map(c => c.id === cat.id
                                                                ? { ...c, imageStyle: opt.val }
                                                                : c
                                                            )
                                                        }));
                                                    }}
                                                    className={`flex-1 text-xs py-1 rounded border ${(cat.imageStyle || 'contain') === opt.val ? 'bg-purple-100 border-purple-400 text-purple-700 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-300' : 'border-gray-200 dark:border-slate-600 text-gray-500'}`}
                                                >
                                                    {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {!cat.isImageMode && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs text-gray-500">画像サイズ</label>
                                            <select
                                                value={cat.customImageSize || 0}
                                                onChange={(e) => {
                                                    update(s => ({
                                                        cats: s.cats.map(c => c.id === cat.id
                                                            ? { ...c, customImageSize: Number(e.target.value) }
                                                            : c
                                                        )
                                                    }));
                                                }}
                                                className={`text-xs px-2 py-1 rounded ${dark ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-300'} border`}
                                            >
                                                <option value={0}>デフォルト</option>
                                                <option value={40}>40px</option>
                                                <option value={80}>80px</option>
                                                <option value={120}>120px</option>
                                                <option value={200}>200px</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                <p className="text-sm text-gray-500 mb-2">候補の編集・サブ項目の追加ができます</p>
                                <div className="overflow-y-auto flex-1 space-y-2">
                                    {cat.items.map((item, idx) => {
                                        const itemName = getItemName(item);
                                        const w = weights[itemName] ?? 1;
                                        const currentResult = store.results[cat.id] || '';
                                        const isLocked = currentResult.startsWith(itemName);
                                        const isExpanded = expandedItems[idx];
                                        const hasSubItemsEnabled = item.hasSubItems;
                                        const subItems = item.subItems || [];

                                        return (
                                            <div key={idx} className={`rounded-lg p-2 ${isLocked ? 'ring-2 ring-purple-500 bg-purple-500/10' : ''} ${dark ? 'bg-slate-800/50' : 'bg-gray-50'}`}>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex flex-col flex-1 min-w-0">
                                                        <div className="flex items-center gap-1">
                                                            <input
                                                                type="text"
                                                                value={itemName}
                                                                onChange={(e) => {
                                                                    const newName = e.target.value;
                                                                    update(s => ({
                                                                        cats: s.cats.map(c => c.id === cat.id
                                                                            ? { ...c, items: c.items.map((old, i) => i === idx ? { ...old, name: newName } : old) }
                                                                            : c
                                                                        )
                                                                    }));
                                                                }}
                                                                className={`bg-transparent border-b border-gray-300 focus:border-purple-500 outline-none px-1 py-1 transition flex-1 text-sm ${dark ? 'border-gray-600' : ''}`}
                                                            />
                                                            {subItems.length > 0 && (
                                                                <span className="text-xs text-gray-500">({subItems.length})</span>
                                                            )}
                                                        </div>
                                                        {store.showWeightIndicator && (
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <span className="text-xs text-gray-500">重み:</span>
                                                                <button onClick={() => updateWeight(itemName, -1)} className={`px-2 py-0.5 text-xs rounded ${dark ? 'bg-gray-700' : 'bg-gray-200'} hover:opacity-80`}>-</button>
                                                                <span className={`text-xs font-bold w-4 text-center ${w === 0 ? 'text-red-400' : ''}`}>{w}</span>
                                                                <button onClick={() => updateWeight(itemName, 1)} className={`px-2 py-0.5 text-xs rounded ${dark ? 'bg-gray-700' : 'bg-gray-200'} hover:opacity-80`}>+</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex shrink-0 gap-1">
                                                        <button
                                                            onClick={() => setExpandedItems(prev => ({ ...prev, [idx]: !prev[idx] }))}
                                                            className={`p-1 rounded text-xs ${isExpanded ? 'bg-purple-500/30 text-purple-400' : 'text-gray-400'}`}
                                                            title="サブ項目"
                                                        >
                                                            {isExpanded ? '▼' : '▶'}
                                                        </button>
                                                        <button
                                                            onClick={() => toggleSubItems(idx)}
                                                            className={`p-1 rounded text-xs ${hasSubItemsEnabled ? 'bg-green-500/30 text-green-400' : 'text-gray-400'}`}
                                                            title={hasSubItemsEnabled ? 'サブ項目オン' : 'サブ項目オフ'}
                                                        >
                                                            {hasSubItemsEnabled ? '✓' : '○'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                update(s => ({
                                                                    results: { ...s.results, [cat.id]: itemName },
                                                                    locked: { ...s.locked, [cat.id]: true }
                                                                }));
                                                            }}
                                                            className={`p-1 rounded text-xs ${isLocked ? 'text-purple-500' : 'text-gray-400'}`}
                                                            title="固定"
                                                        >
                                                            {isLocked ? '🔒' : '🔓'}
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                update(s => ({
                                                                    cats: s.cats.map(c => c.id === cat.id ? { ...c, items: c.items.filter((_, i) => i !== idx) } : c)
                                                                }));
                                                            }}
                                                            className="p-1 text-red-400 rounded text-xs"
                                                            title="削除"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Sub-items section */}
                                                {isExpanded && (
                                                    <div className={`mt-2 pl-3 border-l-2 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
                                                        {/* Image upload section */}
                                                        <div className="mb-3">
                                                            <span className="text-xs text-gray-500 block mb-1">画像</span>
                                                            {item.imageId && imageCache[item.imageId] ? (
                                                                <div className="relative inline-block">
                                                                    <img
                                                                        src={imageCache[item.imageId]}
                                                                        alt={itemName}
                                                                        className="max-w-[120px] max-h-[80px] rounded border border-gray-600 object-cover"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleImageDelete(cat.id, itemName)}
                                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                                                                        title="画像を削除"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <label
                                                                    className={`inline-flex flex-col items-center gap-1 text-xs px-3 py-2 rounded cursor-pointer border-2 border-dashed transition ${dark ? 'bg-slate-700 hover:bg-slate-600 border-slate-500' : 'bg-gray-200 hover:bg-gray-300 border-gray-400'}`}
                                                                    onDragOver={(e) => {
                                                                        e.preventDefault();
                                                                        e.currentTarget.classList.add('ring-2', 'ring-purple-500');
                                                                    }}
                                                                    onDragLeave={(e) => {
                                                                        e.currentTarget.classList.remove('ring-2', 'ring-purple-500');
                                                                    }}
                                                                    onDrop={(e) => {
                                                                        e.preventDefault();
                                                                        e.currentTarget.classList.remove('ring-2', 'ring-purple-500');
                                                                        const file = e.dataTransfer.files[0];
                                                                        if (file && file.type.startsWith('image/')) {
                                                                            handleImageUpload(cat.id, itemName, file);
                                                                        }
                                                                    }}
                                                                >
                                                                    <span>📷 画像を追加</span>
                                                                    <span className="text-[10px] text-gray-400">クリックまたはドラッグ&ドロップ</span>
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        className="hidden"
                                                                        onChange={(e) => {
                                                                            const file = e.target.files[0];
                                                                            if (file) {
                                                                                handleImageUpload(cat.id, itemName, file);
                                                                            }
                                                                            e.target.value = '';
                                                                        }}
                                                                    />
                                                                </label>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-xs text-gray-500">サブ項目</span>
                                                            <button
                                                                onClick={() => toggleSubItems(idx)}
                                                                className={`text-xs px-2 py-0.5 rounded ${hasSubItemsEnabled ? 'bg-green-500 text-white' : dark ? 'bg-gray-700' : 'bg-gray-200'}`}
                                                            >
                                                                {hasSubItemsEnabled ? 'オン' : 'オフ'}
                                                            </button>
                                                        </div>
                                                        {subItems.map((subItem, subIdx) => {
                                                            const subItemName = getSubItemName(subItem);
                                                            const subImageId = typeof subItem === 'object' ? subItem.imageId : null;
                                                            const subImgSrc = subImageId && imageCache[subImageId];

                                                            return (
                                                                <div
                                                                    key={subIdx}
                                                                    className="flex items-start gap-1 mb-2"
                                                                    draggable
                                                                    onDragStart={(e) => {
                                                                        e.dataTransfer.setData('subItemIdx', subIdx.toString());
                                                                        e.dataTransfer.setData('itemIdx', idx.toString());
                                                                        e.currentTarget.classList.add('opacity-50');
                                                                    }}
                                                                    onDragEnd={(e) => {
                                                                        e.currentTarget.classList.remove('opacity-50');
                                                                    }}
                                                                    onDragOver={(e) => {
                                                                        e.preventDefault();
                                                                        e.currentTarget.classList.add('ring-1', 'ring-purple-500', 'rounded');
                                                                    }}
                                                                    onDragLeave={(e) => {
                                                                        e.currentTarget.classList.remove('ring-1', 'ring-purple-500', 'rounded');
                                                                    }}
                                                                    onDrop={(e) => {
                                                                        e.preventDefault();
                                                                        e.currentTarget.classList.remove('ring-1', 'ring-purple-500', 'rounded');
                                                                        const fromIdx = parseInt(e.dataTransfer.getData('subItemIdx'));
                                                                        const fromItemIdx = parseInt(e.dataTransfer.getData('itemIdx'));
                                                                        if (fromItemIdx === idx && !isNaN(fromIdx)) {
                                                                            reorderSubItem(idx, fromIdx, subIdx);
                                                                        }
                                                                    }}
                                                                >
                                                                    <span className="text-gray-400 text-xs mt-1 cursor-move" title="ドラッグで並び替え">⋮⋮</span>
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="text"
                                                                                value={subItemName}
                                                                                onChange={(e) => updateSubItem(idx, subIdx, e.target.value)}
                                                                                className={`flex-1 bg-transparent border-b text-xs px-1 py-0.5 ${dark ? 'border-gray-600' : 'border-gray-300'} focus:border-purple-500 outline-none`}
                                                                            />
                                                                            <button
                                                                                onClick={() => removeSubItem(idx, subIdx)}
                                                                                className="text-red-400 text-xs p-0.5"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                        {/* Sub-item image */}
                                                                        <div className="mt-1 flex items-center gap-2">
                                                                            {subImgSrc ? (
                                                                                <div className="relative inline-block">
                                                                                    <img src={subImgSrc} alt={subItemName} className="h-8 w-8 rounded object-cover" />
                                                                                    <button
                                                                                        onClick={() => handleSubImageDelete(idx, subIdx)}
                                                                                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-3 h-3 text-[8px] flex items-center justify-center"
                                                                                    >✕</button>
                                                                                </div>
                                                                            ) : (
                                                                                <label className={`text-[10px] px-1 py-0.5 rounded cursor-pointer ${dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-200 hover:bg-gray-300'}`}>
                                                                                    📷
                                                                                    <input
                                                                                        type="file"
                                                                                        accept="image/*"
                                                                                        className="hidden"
                                                                                        onChange={(e) => {
                                                                                            const file = e.target.files[0];
                                                                                            if (file) handleSubImageUpload(idx, subIdx, file);
                                                                                            e.target.value = '';
                                                                                        }}
                                                                                    />
                                                                                </label>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                        <div className="flex gap-1 mt-1">
                                                            <input
                                                                type="text"
                                                                placeholder="サブ項目を追加..."
                                                                className={`flex-1 text-xs px-2 py-1 rounded ${dark ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-300'} border`}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter' && e.target.value.trim()) {
                                                                        addSubItem(idx, e.target.value);
                                                                        e.target.value = '';
                                                                    }
                                                                }}
                                                            />
                                                            <button
                                                                onClick={(e) => {
                                                                    const input = e.target.previousElementSibling;
                                                                    if (input.value.trim()) {
                                                                        addSubItem(idx, input.value);
                                                                        input.value = '';
                                                                    }
                                                                }}
                                                                className="text-xs px-2 py-1 bg-purple-600 text-white rounded"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-700">
                                    <input
                                        type="text"
                                        value={tempNewItem}
                                        onChange={e => setTempNewItem(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && tempNewItem.trim()) {
                                                update(s => ({
                                                    cats: s.cats.map(c => c.id === cat.id
                                                        ? { ...c, items: [...c.items, { name: tempNewItem.trim(), subItems: [], hasSubItems: true }] }
                                                        : c
                                                    )
                                                }));
                                                setTempNewItem('');
                                            }
                                        }}
                                        placeholder="新しい候補を追加..."
                                        className={`flex-1 ${inputCls}`}
                                    />
                                    <button
                                        onClick={() => {
                                            if (tempNewItem.trim()) {
                                                update(s => ({
                                                    cats: s.cats.map(c => c.id === cat.id
                                                        ? { ...c, items: [...c.items, { name: tempNewItem.trim(), subItems: [], hasSubItems: true }] }
                                                        : c
                                                    )
                                                }));
                                                setTempNewItem('');
                                            }
                                        }}
                                        className="px-4 py-2 bg-purple-600 text-white rounded-lg shrink-0"
                                    >
                                        追加
                                    </button>
                                </div>

                                {/* Bulk image upload section */}
                                <label
                                    className={`mt-3 flex flex-col items-center gap-1 p-3 rounded-lg border-2 border-dashed cursor-pointer transition ${dark ? 'bg-slate-800/50 border-slate-500 hover:bg-slate-700/50' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.add('ring-2', 'ring-purple-500');
                                    }}
                                    onDragLeave={(e) => {
                                        e.currentTarget.classList.remove('ring-2', 'ring-purple-500');
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.classList.remove('ring-2', 'ring-purple-500');
                                        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
                                        if (files.length > 0) {
                                            handleBulkImageAdd(cat.id, files);
                                        }
                                    }}
                                >
                                    <span className="text-sm">🖼️ 画像を一括追加</span>
                                    <span className="text-xs text-gray-400">複数選択またはドラッグ&ドロップ（重複はスキップ）</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                            const files = Array.from(e.target.files);
                                            if (files.length > 0) {
                                                handleBulkImageAdd(cat.id, files);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                </label>
                                <div className="flex justify-between mt-4 pt-3 border-t border-gray-600">
                                    <button
                                        onClick={() => {
                                            update(s => ({
                                                results: { ...s.results, [cat.id]: '' },
                                                locked: { ...s.locked, [cat.id]: false }
                                            }));
                                            setSelectModal(null);
                                            toast('選択を解除しました');
                                        }}
                                        className={`text-sm ${btnCls} text-red-400`}
                                    >
                                        🔓 選択解除
                                    </button>
                                    <button onClick={() => setSelectModal(null)} className={btnCls}>閉じる</button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="text-center text-xs text-gray-500 mt-6">ストレージ: {storageSize()}</div>

                {/* Image zoom modal */}
                {zoomImage && (
                    <div
                        className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"
                        onClick={() => setZoomImage(null)}
                    >
                        <div className="relative max-w-full max-h-full">
                            <img
                                src={zoomImage.src}
                                alt={zoomImage.alt}
                                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                            />
                            <button
                                onClick={() => setZoomImage(null)}
                                className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/70"
                            >
                                ✕
                            </button>
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white text-sm px-3 py-1 rounded">
                                {zoomImage.alt}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
