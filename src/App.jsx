import React, { useState, useEffect, useRef } from 'react';

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
};

// Normalize item to new format (migrate from string to object)
const normalizeItem = (item) => {
    if (typeof item === 'string') {
        return { name: item, subItems: [], hasSubItems: false };
    }
    return {
        name: item.name || '',
        subItems: item.subItems || [],
        hasSubItems: item.hasSubItems ?? false
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

export default function App() {
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
    const [tempPreset, setTempPreset] = useState('');
    const [tempImport, setTempImport] = useState('');
    const [tempNewItem, setTempNewItem] = useState('');
    const [lastGeneratedIds, setLastGeneratedIds] = useState([]);
    const [expandTextarea, setExpandTextarea] = useState(false);

    const [dragId, setDragId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [selectModal, setSelectModal] = useState(null);
    const [itemMenu, setItemMenu] = useState(null);
    const [expandedItems, setExpandedItems] = useState({});
    const dragNode = useRef(null);
    const longPressTimer = useRef(null);
    const isLongPress = useRef(false);
    const touchStartPos = useRef(null);

    const toast = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1500); };

    const storageSize = () => {
        const b = new Blob([JSON.stringify(store)]).size;
        return b < 1024 ? b + ' B' : (b / 1024).toFixed(1) + ' KB';
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
                            newRes[c.id] = `${selectedItem.name} → ${subItem}`;
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
                return { name, subItems: [], hasSubItems: false };
            });

            return {
                cats: s.cats.map(c => c.id === id ? { ...c, name: newName, items: newItems, emoji: tempEmoji, color: tempColor } : c)
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
        update(s => ({ cats: [...s.cats, { id: newId, name: cat.name + '(複製)', items: [...cat.items], hidden: false, weights: { ...cat.weights }, emoji: cat.emoji || '🎲', color: cat.color || '#a855f7' }] }));
        setModal(null);
        toast('複製しました');
    };

    const addCat = () => {
        const emojis = ['🎲', '🎯', '⭐', '🔥', '💎', '🌟', '🌈', '🎀', '🍀', '⚡'];
        const colors = ['#a855f7', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#06b6d4'];
        const newId = store.cats.length > 0 ? Math.max(...store.cats.map(c => c.id)) + 1 : 1;
        update(s => ({ cats: [...s.cats, { id: newId, name: `項目${newId}`, items: [], hidden: false, weights: {}, emoji: emojis[newId % emojis.length], color: colors[newId % colors.length] }] }));
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
        const txt = visibleCats.map(c => `${c.name}: ${store.results[c.id] || '---'}`).join('\n');
        navigator.clipboard.writeText(txt);
        toast('結果をコピーしました');
    };

    const doExportText = () => {
        const txt = store.cats.map(c => {
            const itemNames = c.items.map(item => getItemName(item));
            return `[${c.name}]${c.hidden ? ' (非表示)' : ''}\n${itemNames.join('\n')}`;
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

    const doImport = () => {
        const txt = tempImport.trim();
        if (!txt) return;
        try {
            const json = JSON.parse(txt);
            if (json.cats) {
                // Apply migration to imported cats
                const migratedCats = json.cats.map(c => migrateCatItems({ ...c, hidden: c.hidden || false }));
                update(() => ({ cats: migratedCats, presets: json.presets || store.presets }));
                setModal(null);
                setTempImport('');
                toast('インポート完了');
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
                    <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">ランダムジェネレーター</h1>
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
                                    {store.showHidden ? '🙈 非表示を隠す' : `👁 非表示を表示 (${hiddenCount})`}
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
                                            <span className="font-medium" style={{ color: cat.color || '#a855f7' }}>{cat.name}</span>
                                            {cat.hidden && <span className="text-xs text-gray-500">(非表示)</span>}
                                            <span className="text-xs text-gray-500">{cat.items.length}件</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <button onClick={() => toggleLock(cat.id)} className={`p-1 rounded text-xs ${store.locked[cat.id] ? 'bg-amber-500/30 text-amber-400' : btnCls}`}>{store.locked[cat.id] ? '🔒' : '🔓'}</button>
                                            <button onClick={() => { if (confirm('削除しますか？')) update(s => ({ cats: s.cats.filter(c => c.id !== cat.id) })); }} className={btnCls + ' p-1 text-red-400'}>🗑️</button>
                                            <button onClick={() => openEditModal(cat)} className={btnCls + ' p-1 text-gray-400'}>✏️</button>
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => cat.items.length > 0 && setSelectModal({ cat })}
                                        className={`min-h-[36px] flex items-center justify-center rounded-lg px-2 py-1 ${dark ? 'bg-slate-900/60' : 'bg-gray-100'} ${spin ? 'animate-pulse' : ''} ${cat.items.length > 0 ? 'cursor-pointer hover:ring-2 hover:ring-purple-500/50 transition' : ''} text-sm`}
                                        title={cat.items.length > 0 ? 'クリックして候補を選択' : ''}
                                    >
                                        {store.results[cat.id] || <span className="text-gray-500 text-xs">---</span>}
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

                        <div className="flex flex-wrap gap-2 justify-center pb-20">
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
                                <div key={h.id} className={`${cardCls} p-3 ${isNew ? 'ring-2 ring-purple-500 bg-purple-500/10' : ''}`}>
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
                    <div className="space-y-3 pb-20">
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
                            <h3 className="font-semibold mb-3">データ</h3>
                            <button onClick={doExportJSON} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls}`}>💾 JSONバックアップ</button>
                            <button onClick={() => { setTempImport(''); setModal({ type: 'import' }); }} className={`w-full text-left p-2 rounded-lg mb-2 ${btnCls}`}>📥 インポート</button>
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
                            <div className={`${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'} rounded-2xl p-4 w-full max-w-md shadow-xl max-h-[90vh] overflow-auto`} onClick={e => e.stopPropagation()}>
                                <h3 className="text-base font-bold mb-3">項目を編集</h3>
                                <div className="mb-2">
                                    <label className="block text-xs text-gray-500 mb-1">項目名</label>
                                    <div className="flex gap-2 items-center">
                                        <span className="text-xl">{tempEmoji}</span>
                                        <input type="text" value={tempName} onChange={e => setTempName(e.target.value)} className={inputCls + ' text-sm py-1'} style={{ color: tempColor }} />
                                    </div>
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
                                    <button onClick={() => setModal(null)} className={btnCls + ' text-xs py-1'}>キャンセル</button>
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
                            <p className="text-sm text-gray-500 mb-2">テキスト形式またはJSON</p>
                            <textarea value={tempImport} onChange={e => setTempImport(e.target.value)} rows={8} placeholder={"[項目1]\n候補A\n候補B\n\n[項目2]\n候補X\n候補Y"} className={inputCls + ' resize-none font-mono text-sm mb-3'} spellCheck={false} />
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

                    const addSubItem = (idx, subItemName) => {
                        if (!subItemName.trim()) return;
                        update(s => ({
                            cats: s.cats.map(c => c.id === cat.id
                                ? {
                                    ...c, items: c.items.map((item, i) => i === idx
                                        ? { ...item, subItems: [...(item.subItems || []), subItemName.trim()] }
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
                                        ? { ...item, subItems: item.subItems.map((sub, si) => si === subItemIdx ? newValue : sub) }
                                        : item)
                                }
                                : c
                            )
                        }));
                    };

                    return (
                        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                            <div className={`${dark ? 'bg-slate-900 text-white' : 'bg-white text-gray-900'} rounded-2xl p-5 w-full max-w-md shadow-xl max-h-[80vh] flex flex-col relative`}>
                                <h3 className="text-lg font-bold mb-2">「{cat.name}」の編集</h3>
                                <p className="text-sm text-gray-500 mb-3">候補の編集・サブ項目の追加ができます</p>
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
                                                                if (confirm('削除しますか？')) {
                                                                    update(s => ({
                                                                        cats: s.cats.map(c => c.id === cat.id ? { ...c, items: c.items.filter((_, i) => i !== idx) } : c)
                                                                    }));
                                                                }
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
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className="text-xs text-gray-500">サブ項目</span>
                                                            <button
                                                                onClick={() => toggleSubItems(idx)}
                                                                className={`text-xs px-2 py-0.5 rounded ${hasSubItemsEnabled ? 'bg-green-500 text-white' : dark ? 'bg-gray-700' : 'bg-gray-200'}`}
                                                            >
                                                                {hasSubItemsEnabled ? 'オン' : 'オフ'}
                                                            </button>
                                                        </div>
                                                        {subItems.map((subItem, subIdx) => (
                                                            <div key={subIdx} className="flex items-center gap-1 mb-1">
                                                                <span className="text-gray-400 text-xs">└</span>
                                                                <input
                                                                    type="text"
                                                                    value={subItem}
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
                                                        ))}
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
                                                        ? { ...c, items: [...c.items, { name: tempNewItem.trim(), subItems: [], hasSubItems: false }] }
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
                                                        ? { ...c, items: [...c.items, { name: tempNewItem.trim(), subItems: [], hasSubItems: false }] }
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
            </div>
        </div >
    );
}
