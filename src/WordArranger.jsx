import React, { useState, useEffect, useRef, useCallback } from 'react';

const COLOR_OPTIONS = [
    { value: '#6B7280', label: '灰' },
    { value: '#EF4444', label: '赤' },
    { value: '#F97316', label: '橙' },
    { value: '#FBBF24', label: '黄' },
    { value: '#34D399', label: '緑' },
    { value: '#60A5FA', label: '青' },
    { value: '#8B5CF6', label: '紫' },
    { value: '#EC4899', label: '桃' },
    { value: '#06B6D4', label: '水' },
    { value: '#FFFFFF', label: '白' },
];

const SIZE_OPTIONS = [6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 56, 64, 72];

const DEFAULT_WORDS = ['日本', '東京', '大阪', '京都', '北海道', '沖縄', '富士山', '桜', '紅葉', '温泉', 'ラーメン', '寿司', '天ぷら', 'うどん', 'そば', '焼肉', 'カレー', 'オムライス', '唐揚げ', 'おにぎり', '犬', '猫', '鳥', 'うさぎ', 'ハムスター', '金魚', 'カメ', 'パンダ', 'ライオン', 'ゾウ', '春', '夏', '秋', '冬', '晴れ', '雨', '雪', '風', '雷', '虹', 'サッカー', '野球', 'バスケ', 'テニス', '水泳', 'スキー', 'ゴルフ', 'ボクシング', '柔道', '相撲', '音楽', '映画', 'ゲーム', '読書', '旅行', '料理', '写真', '絵画', 'ダンス', '将棋', '赤', '青', '緑', '黄', '紫', 'オレンジ', 'ピンク', '白', '黒', 'グレー', '月曜', '火曜', '水曜', '木曜', '金曜', '土曜', '日曜', '朝', '昼', '夜', '学校', '会社', '病院', '公園', '駅', '空港', '図書館', '美術館', 'コンビニ', 'スーパー', '電車', 'バス', '車', '自転車', '飛行機', '船', 'タクシー', 'バイク', '新幹線', 'ロケット', '友達', '家族', '先生', '医者', 'シェフ', 'アーティスト', 'エンジニア', 'デザイナー', '作家', '俳優'];

const getContrastColor = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#1a1a2e' : '#ffffff';
};

export default function WordArranger({ onSwitchApp }) {
    const [words, setWords] = useState([]);
    const [defaultSize, setDefaultSize] = useState(24);
    const [defaultColor, setDefaultColor] = useState('#6B7280');
    const [newWord, setNewWord] = useState('');
    const [importText, setImportText] = useState('');
    const [showImport, setShowImport] = useState(false);
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const [bulkEditText, setBulkEditText] = useState('');
    const [toast, setToast] = useState('');
    const [bgColor, setBgColor] = useState('#1a1a2e');
    const [showSettings, setShowSettings] = useState(false);
    const [showEditPanel, setShowEditPanel] = useState(false);
    const [editFilter, setEditFilter] = useState('all');
    const [packMode, setPackMode] = useState(true);
    const [savedSlots, setSavedSlots] = useState([]);
    const [searchText, setSearchText] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(null);
    const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
    const [saveName, setSaveName] = useState('');
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [showStats, setShowStats] = useState(false);
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const previewRef = useRef(null);

    useEffect(() => {
        try {
            const slots = localStorage.getItem('wordArrangerSlots2');
            if (slots) {
                const parsed = JSON.parse(slots);
                if (Array.isArray(parsed)) {
                    setSavedSlots(parsed);
                } else {
                    // Migration from object to array
                    const migrated = Object.entries(parsed).map(([name, data]) => ({ name, ...data }));
                    setSavedSlots(migrated);
                }
            }
            const saved = localStorage.getItem('wordArrangerData2');
            if (saved) {
                const d = JSON.parse(saved);
                if (d.words && d.words.length > 0) { setWords(d.words); }
                else { setWords(DEFAULT_WORDS.map(w => ({ text: w, size: 24, color: '#6B7280' }))); }
                if (d.defaultSize) setDefaultSize(d.defaultSize);
                if (d.defaultColor) setDefaultColor(d.defaultColor);
                if (d.bgColor) setBgColor(d.bgColor);
                if (d.packMode !== undefined) setPackMode(d.packMode);
            } else {
                setWords(DEFAULT_WORDS.map(w => ({ text: w, size: 24, color: '#6B7280' })));
            }
        } catch (e) {
            setWords(DEFAULT_WORDS.map(w => ({ text: w, size: 24, color: '#6B7280' })));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('wordArrangerData2', JSON.stringify({ words, defaultSize, defaultColor, bgColor, packMode }));
    }, [words, defaultSize, defaultColor, bgColor, packMode]);

    useEffect(() => {
        localStorage.setItem('wordArrangerSlots2', JSON.stringify(savedSlots));
    }, [savedSlots]);

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2000); };
    const addWord = () => { if (newWord.trim()) { setWords([...words, { text: newWord.trim(), size: defaultSize, color: defaultColor }]); setNewWord(''); } };
    const deleteWord = (i) => { setWords(words.filter((_, idx) => idx !== i)); setSelectedIdx(null); };
    const updateWord = (i, key, val) => { const nw = [...words]; nw[i] = { ...nw[i], [key]: val }; setWords(nw); };

    const handleWordClick = (idx, e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const pr = previewRef.current.getBoundingClientRect();
        let x = rect.left - pr.left;
        let y = rect.bottom - pr.top + 4;
        if (x + 180 > pr.width) x = pr.width - 185;
        if (x < 0) x = 5;
        setPopupPos({ x, y });
        setSelectedIdx(idx);
    };

    const shuffleWithinSize = () => {
        const grouped = {};
        words.forEach(w => { if (!grouped[w.size]) grouped[w.size] = []; grouped[w.size].push({ ...w }); });
        Object.keys(grouped).forEach(s => grouped[s].sort(() => Math.random() - 0.5));
        const sizes = [...new Set(words.map(w => w.size))].sort((a, b) => b - a);
        const result = [];
        sizes.forEach(s => grouped[s].forEach(w => result.push(w)));
        setWords(result);
    };

    const sortBySize = (order) => { setWords([...words].sort((a, b) => order === 'asc' ? a.size - b.size : b.size - a.size)); };
    const duplicateWord = (i) => { const nw = [...words]; nw.splice(i + 1, 0, { ...words[i] }); setWords(nw); };
    const openBulkEdit = () => { setBulkEditText(words.map(w => w.text).join('\n')); setShowBulkEdit(true); };
    const saveBulkEdit = () => { const lines = bulkEditText.split('\n').filter(l => l.trim()); setWords(lines.map((t, i) => ({ text: t.trim(), size: words[i]?.size || defaultSize, color: words[i]?.color || defaultColor }))); setShowBulkEdit(false); };

    const doSaveSlot = () => {
        const name = saveName.trim();
        if (!name) return;

        // Check if exists
        const existsIdx = savedSlots.findIndex(s => s.name === name);
        const newData = { name, words, defaultSize, defaultColor, bgColor, packMode };

        if (existsIdx >= 0) {
            const newSlots = [...savedSlots];
            newSlots[existsIdx] = newData;
            setSavedSlots(newSlots);
        } else {
            setSavedSlots([...savedSlots, newData]);
        }

        showToast('保存しました');
        setSaveName('');
        setShowSaveModal(false);
    };

    const loadFromSlot = (name) => {
        if (!name) return;
        const d = savedSlots.find(s => s.name === name);
        if (!d) return;
        if (d.words) setWords(d.words);
        if (d.defaultSize) setDefaultSize(d.defaultSize);
        if (d.defaultColor) setDefaultColor(d.defaultColor);
        if (d.bgColor) setBgColor(d.bgColor);
        if (d.packMode !== undefined) setPackMode(d.packMode);
        showToast('読込完了');
    };

    const deleteSlot = (name) => {
        setSavedSlots(savedSlots.filter(s => s.name !== name));
    };

    const moveSlot = (name, dir) => {
        const idx = savedSlots.findIndex(s => s.name === name);
        if (idx < 0) return;

        const newSlots = [...savedSlots];
        if (dir === -1 && idx > 0) {
            [newSlots[idx], newSlots[idx - 1]] = [newSlots[idx - 1], newSlots[idx]];
        } else if (dir === 1 && idx < newSlots.length - 1) {
            [newSlots[idx], newSlots[idx + 1]] = [newSlots[idx + 1], newSlots[idx]];
        } else {
            return;
        }
        setSavedSlots(newSlots);
    };
    const importWords = (text) => { let items = text.includes('\n') ? text.split('\n') : text.includes(',') ? text.split(',') : [text]; const filtered = items.map(w => w.trim()).filter(w => w); if (filtered.length > 0) { setWords([...words, ...filtered.map(t => ({ text: t, size: defaultSize, color: defaultColor }))]); showToast(filtered.length + '個追加'); setImportText(''); setShowImport(false); } };
    const exportJSON = () => { const json = JSON.stringify({ words, defaultSize, defaultColor, bgColor, packMode }, null, 2); navigator.clipboard.writeText(json); const blob = new Blob([json], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'word-arranger.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast('JSON保存完了'); };
    const importJSON = (jsonStr) => { try { const d = JSON.parse(jsonStr); if (d.words) setWords(d.words); if (d.defaultSize) setDefaultSize(d.defaultSize); if (d.defaultColor) setDefaultColor(d.defaultColor); if (d.bgColor) setBgColor(d.bgColor); if (d.packMode !== undefined) setPackMode(d.packMode); showToast('インポート完了'); setShowImport(false); setImportText(''); } catch (e) { showToast('JSON形式エラー'); } };
    const handleFileImport = (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (ev) => { file.name.endsWith('.json') ? importJSON(ev.target.result) : importWords(ev.target.result); }; reader.readAsText(file); e.target.value = ''; };

    const saveAsImage = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = 1080; canvas.height = 1920;
        ctx.fillStyle = bgColor; ctx.fillRect(0, 0, 1080, 1920);
        const sorted = packMode ? [...words].sort((a, b) => b.size - a.size) : words;
        let x = 20, y = 20, lineHeight = 0;
        sorted.forEach(word => {
            ctx.font = 'bold ' + word.size + 'px sans-serif';
            const ww = ctx.measureText(word.text).width + word.size * 0.4;
            const wh = word.size * 1.2;
            if (x + ww > 1060 && x !== 20) { x = 20; y += lineHeight + 4; lineHeight = 0; }
            lineHeight = Math.max(lineHeight, wh);
            ctx.fillStyle = word.color || '#6B7280';
            ctx.beginPath(); ctx.roundRect(x, y, ww, wh, 3); ctx.fill();
            ctx.fillStyle = getContrastColor(word.color || '#6B7280');
            ctx.textBaseline = 'middle';
            ctx.fillText(word.text, x + word.size * 0.2, y + wh / 2);
            x += ww + 4;
        });
        canvas.toBlob(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'word-arranger.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); showToast('画像保存完了'); }, 'image/png');
    }, [words, bgColor, packMode]);

    const clearAll = () => { setWords([]); setSelectedIdx(null); };
    const applyDefaultToAll = () => { setWords(words.map(w => ({ ...w, size: defaultSize, color: defaultColor }))); };
    const getFilteredWords = () => { let f = words.map((w, i) => ({ ...w, oi: i })); if (editFilter !== 'all') f = f.filter(w => w.size === parseInt(editFilter)); if (searchText) f = f.filter(w => w.text.includes(searchText)); return f; };
    const bulkChangeSize = (ns) => { const ids = getFilteredWords().map(w => w.oi); setWords(words.map((w, i) => ids.includes(i) ? { ...w, size: ns } : w)); };
    const bulkChangeColor = (nc) => { const ids = getFilteredWords().map(w => w.oi); setWords(words.map((w, i) => ids.includes(i) ? { ...w, color: nc } : w)); };
    const getStats = () => { const sc = {}, cc = {}; words.forEach(w => { sc[w.size] = (sc[w.size] || 0) + 1; cc[w.color || '#6B7280'] = (cc[w.color || '#6B7280'] || 0) + 1; }); return { sc, cc }; };
    const displayWords = packMode ? [...words].sort((a, b) => b.size - a.size) : words;

    return (
        <div className="min-h-screen text-white p-1" style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
            <canvas ref={canvasRef} className="hidden" />
            <input ref={fileInputRef} type="file" accept=".json,.txt,.csv" onChange={handleFileImport} className="hidden" />
            {toast && <div className="fixed top-2 left-1/2 -translate-x-1/2 bg-green-500 text-white px-3 py-1 rounded shadow-lg z-50 text-xs">{toast}</div>}

            {showSaveModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSaveModal(false)}>
                    <div className="bg-gray-800 rounded-xl p-4 w-full max-w-xs" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold mb-3 text-sm">💾 名前を付けて保存</h3>
                        <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="保存名..." className="w-full bg-white/10 rounded px-3 py-2 text-sm outline-none mb-3" autoFocus onKeyDown={e => e.key === 'Enter' && doSaveSlot()} />
                        <div className="flex gap-2">
                            <button onClick={doSaveSlot} className="flex-1 bg-green-500 hover:bg-green-600 py-2 rounded font-bold text-sm">保存</button>
                            <button onClick={() => setShowSaveModal(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded font-bold text-sm">×</button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkEdit && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2">
                    <div className="bg-gray-800 rounded-xl p-3 w-full max-w-md max-h-[90vh] flex flex-col">
                        <h3 className="font-bold mb-2 text-sm">📝 一括編集</h3>
                        <textarea value={bulkEditText} onChange={e => setBulkEditText(e.target.value)} className="flex-1 bg-white/10 rounded px-2 py-1 text-sm outline-none resize-none min-h-48" />
                        <div className="flex gap-2 mt-2">
                            <button onClick={saveBulkEdit} className="flex-1 bg-green-500 hover:bg-green-600 px-3 py-1 rounded font-bold text-sm">保存</button>
                            <button onClick={() => setShowBulkEdit(false)} className="flex-1 bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded font-bold text-sm">×</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="max-w-full mx-auto">
                <div className="flex items-center justify-between mb-1 gap-1 flex-wrap">
                    <div className="flex items-center gap-1 flex-wrap">
                        <h1 onClick={onSwitchApp} className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-400 to-purple-400 cursor-pointer hover:opacity-80 transition select-none">📝WordArr</h1>
                        <select onChange={e => e.target.value && loadFromSlot(e.target.value)} className="bg-gray-700 text-xs rounded px-1 py-0.5" defaultValue="">
                            <option value="">📂読込</option>
                            {savedSlots.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                        <button onClick={() => setShowSaveModal(true)} className="bg-indigo-500 hover:bg-indigo-600 text-xs px-1.5 py-0.5 rounded">💾保存</button>
                    </div>
                    <div className="flex gap-1">
                        <button onClick={shuffleWithinSize} className="bg-amber-500 hover:bg-amber-600 text-xs px-1.5 py-0.5 rounded">🎲</button>
                        <button onClick={() => setShowStats(!showStats)} className={"text-xs px-1.5 py-0.5 rounded " + (showStats ? "bg-cyan-500" : "bg-white/20")}>📊</button>
                        <button onClick={() => setShowEditPanel(!showEditPanel)} className={"text-xs px-1.5 py-0.5 rounded " + (showEditPanel ? "bg-purple-500" : "bg-white/20")}>✏️</button>
                        <button onClick={() => setShowSettings(!showSettings)} className={"text-xs px-1.5 py-0.5 rounded " + (showSettings ? "bg-purple-500" : "bg-white/20")}>⚙️</button>
                    </div>
                </div>

                <div ref={previewRef} className="rounded-lg p-1 mb-1 min-h-16 relative" style={{ backgroundColor: bgColor }} onClick={() => setSelectedIdx(null)}>
                    <div className="flex flex-wrap items-baseline" style={{ gap: '2px' }}>
                        {displayWords.map((word, di) => {
                            const ai = words.findIndex(w => w === word) >= 0 ? words.indexOf(word) : di;
                            const bgc = word.color || '#6B7280';
                            const isSelected = selectedIdx === ai;
                            return (
                                <span key={di} className={"rounded cursor-pointer hover:opacity-80 " + (isSelected ? "ring-2 ring-yellow-400" : "")}
                                    style={{ backgroundColor: bgc, fontSize: word.size + 'px', color: getContrastColor(bgc), fontWeight: 'bold', whiteSpace: 'nowrap', padding: Math.max(1, word.size * 0.05) + 'px ' + (word.size * 0.15) + 'px', lineHeight: 1.1 }}
                                    onClick={e => handleWordClick(ai, e)}>{word.text}</span>
                            );
                        })}
                        {words.length === 0 && <p className="text-gray-400 text-xs w-full text-center py-2">単語を追加</p>}
                    </div>
                    {selectedIdx !== null && words[selectedIdx] && (
                        <div className="absolute bg-gray-900 rounded-lg p-2 shadow-xl border border-purple-400 z-20" style={{ left: popupPos.x + 'px', top: popupPos.y + 'px', minWidth: '170px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => setSelectedIdx(null)} className="absolute top-1 right-1 text-gray-400 hover:text-white text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-gray-700">×</button>
                            <div className="text-xs text-gray-400 mb-1 pr-5">「{words[selectedIdx].text}」</div>
                            <div className="flex gap-1 mb-1">
                                <select value={words[selectedIdx].size} onChange={e => updateWord(selectedIdx, 'size', Number(e.target.value))} className="flex-1 text-xs rounded px-1 py-1 bg-gray-700">
                                    {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}px</option>)}
                                </select>
                                <select value={words[selectedIdx].color || '#6B7280'} onChange={e => updateWord(selectedIdx, 'color', e.target.value)} className="text-xs rounded px-1 py-1" style={{ backgroundColor: words[selectedIdx].color || '#6B7280', color: getContrastColor(words[selectedIdx].color || '#6B7280') }}>
                                    {COLOR_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ backgroundColor: o.value, color: getContrastColor(o.value) }}>{o.label}</option>)}
                                </select>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => duplicateWord(selectedIdx)} className="flex-1 bg-blue-500 hover:bg-blue-600 px-1 py-0.5 rounded text-xs">📋</button>
                                <button onClick={() => deleteWord(selectedIdx)} className="flex-1 bg-red-500 hover:bg-red-600 px-1 py-0.5 rounded text-xs">🗑</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-wrap gap-1 mb-1 items-center">
                    <input type="text" value={newWord} onChange={e => setNewWord(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWord()} placeholder="追加..." className="flex-1 min-w-20 bg-white/10 rounded px-2 py-0.5 text-xs outline-none" />
                    <button onClick={addWord} className="bg-purple-500 hover:bg-purple-600 px-2 py-0.5 rounded text-xs">+</button>
                    <button onClick={openBulkEdit} className="bg-yellow-600 hover:bg-yellow-700 px-2 py-0.5 rounded text-xs">一括</button>
                    <button onClick={() => setShowImport(!showImport)} className="bg-green-600 hover:bg-green-700 px-2 py-0.5 rounded text-xs">📥</button>
                    <button onClick={clearAll} className="bg-red-600 hover:bg-red-700 px-2 py-0.5 rounded text-xs">🗑</button>
                    <span className="text-xs text-gray-400">{words.length}</span>
                </div>

                {showStats && words.length > 0 && (
                    <div className="bg-white/10 rounded-lg p-2 mb-1">
                        <div className="flex gap-4 flex-wrap">
                            <div className="flex-1 min-w-32">
                                <div className="text-xs text-gray-400 mb-1">サイズ別</div>
                                <div className="flex flex-wrap gap-1">
                                    {Object.entries(getStats().sc).sort((a, b) => Number(b[0]) - Number(a[0])).map(([size, count]) => (
                                        <button key={size} onClick={() => { setEditFilter(size); setShowEditPanel(true); }} className="bg-white/10 hover:bg-white/20 rounded px-1.5 py-0.5 text-xs">{size}px: <span className="font-bold">{count}</span></button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex-1 min-w-32">
                                <div className="text-xs text-gray-400 mb-1">色別</div>
                                <div className="flex flex-wrap gap-1">
                                    {Object.entries(getStats().cc).map(([color, count]) => (
                                        <span key={color} className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ backgroundColor: color, color: getContrastColor(color) }}>{count}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showEditPanel && (
                    <div className="bg-white/10 rounded-lg p-2 mb-1 max-h-72 overflow-hidden flex flex-col">
                        <div className="flex gap-1 mb-1 flex-wrap items-center">
                            <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="検索..." className="bg-gray-700 text-xs rounded px-1 py-0.5 w-14" />
                            <select value={editFilter} onChange={e => setEditFilter(e.target.value)} className="bg-gray-700 text-xs rounded px-1 py-0.5">
                                <option value="all">全</option>
                                {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <button onClick={() => sortBySize('desc')} className="bg-orange-500 hover:bg-orange-600 px-1 py-0.5 rounded text-xs">大→小</button>
                            <button onClick={() => sortBySize('asc')} className="bg-teal-500 hover:bg-teal-600 px-1 py-0.5 rounded text-xs">小→大</button>
                            <select onChange={e => e.target.value && bulkChangeSize(Number(e.target.value))} className="bg-gray-700 text-xs rounded px-1 py-0.5" defaultValue="">
                                <option value="" disabled>一括px</option>
                                {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select onChange={e => e.target.value && bulkChangeColor(e.target.value)} className="bg-gray-700 text-xs rounded px-1 py-0.5" defaultValue="">
                                <option value="" disabled>一括色</option>
                                {COLOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <span className="text-xs text-gray-400 ml-auto">{getFilteredWords().length}</span>
                        </div>
                        <div className="overflow-y-auto flex-1 space-y-0.5">
                            {getFilteredWords().map(item => (
                                <div key={item.oi} className="flex items-center gap-1 bg-white/5 rounded px-1 py-0.5">
                                    <input type="text" value={item.text} onChange={e => updateWord(item.oi, 'text', e.target.value)} className="flex-1 bg-transparent text-xs outline-none min-w-0" />
                                    <select value={item.size} onChange={e => updateWord(item.oi, 'size', Number(e.target.value))} className="text-xs rounded px-1 py-0.5 bg-gray-700 w-12">
                                        {SIZE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    <select value={item.color || '#6B7280'} onChange={e => updateWord(item.oi, 'color', e.target.value)} className="text-xs rounded px-1 py-0.5 w-10" style={{ backgroundColor: item.color || '#6B7280', color: getContrastColor(item.color || '#6B7280') }}>
                                        {COLOR_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ backgroundColor: o.value, color: getContrastColor(o.value) }}>{o.label}</option>)}
                                    </select>
                                    <button onClick={() => duplicateWord(item.oi)} className="text-blue-400 hover:text-blue-300 text-xs">📋</button>
                                    <button onClick={() => deleteWord(item.oi)} className="text-red-400 hover:text-red-300 text-xs">×</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {showSettings && (
                    <div className="bg-white/10 rounded-lg p-2 mb-1">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <label className="text-xs">詰め</label>
                                <button onClick={() => setPackMode(!packMode)} className={"px-2 py-0.5 rounded text-xs " + (packMode ? "bg-green-500" : "bg-gray-500")}>{packMode ? "ON" : "OFF"}</button>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-xs">デフォルト: {defaultSize}px</label>
                                    <div className="flex gap-1">
                                        <select value={defaultColor} onChange={e => setDefaultColor(e.target.value)} className="text-xs rounded px-1 py-0.5" style={{ backgroundColor: defaultColor, color: getContrastColor(defaultColor) }}>
                                            {COLOR_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ backgroundColor: o.value, color: getContrastColor(o.value) }}>{o.label}</option>)}
                                        </select>
                                        <button onClick={applyDefaultToAll} className="text-xs bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded">全適用</button>
                                    </div>
                                </div>
                                <input type="range" min="6" max="72" value={defaultSize} onChange={e => setDefaultSize(Number(e.target.value))} className="w-full h-1" />
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs">背景</label>
                                <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} className="w-6 h-5 rounded cursor-pointer" />
                            </div>
                            {savedSlots.length > 0 && (
                                <div>
                                    <label className="text-xs block mb-1">保存データ管理</label>
                                    <div className="flex flex-wrap gap-1">
                                        {savedSlots.map(slot => (
                                            <div key={slot.name} className="flex items-center bg-white/10 rounded px-1 py-0.5 gap-1">
                                                <span className="text-xs mr-auto cursor-pointer hover:text-blue-300" onClick={() => loadFromSlot(slot.name)}>{slot.name}</span>
                                                <div className="flex flex-col gap-0.5">
                                                    <button onClick={() => moveSlot(slot.name, -1)} className="text-[8px] leading-3 bg-gray-600 hover:bg-gray-500 px-1 rounded">▲</button>
                                                    <button onClick={() => moveSlot(slot.name, 1)} className="text-[8px] leading-3 bg-gray-600 hover:bg-gray-500 px-1 rounded">▼</button>
                                                </div>
                                                <button onClick={() => deleteSlot(slot.name)} className="text-red-400 hover:text-red-300 text-xs px-1">×</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="flex gap-1 pt-2 border-t border-white/20">
                                <button onClick={saveAsImage} className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 px-2 py-1.5 rounded font-bold text-xs">📷画像保存</button>
                                <button onClick={exportJSON} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 px-2 py-1.5 rounded font-bold text-xs">💾JSON出力</button>
                            </div>
                        </div>
                    </div>
                )}

                {showImport && (
                    <div className="bg-white/10 rounded-lg p-2 mb-1">
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="単語 or JSON..." className="w-full bg-white/10 rounded px-2 py-1 text-xs outline-none h-16 resize-none mb-1" />
                        <div className="flex gap-1 flex-wrap">
                            <button onClick={() => importWords(importText)} className="bg-blue-500 hover:bg-blue-600 px-2 py-0.5 rounded text-xs">単語</button>
                            <button onClick={() => importJSON(importText)} className="bg-green-500 hover:bg-green-600 px-2 py-0.5 rounded text-xs">JSON</button>
                            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="bg-orange-500 hover:bg-orange-600 px-2 py-0.5 rounded text-xs">ファイル</button>
                            <button onClick={() => setShowImport(false)} className="bg-gray-500 hover:bg-gray-600 px-2 py-0.5 rounded text-xs">閉</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
