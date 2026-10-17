// Núcleo: iconos, utilidades, estado, historial (deshacer/rehacer) y sesión guardada en IndexedDB.
const P = (window.P = {});

P.ICONS = {
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  rotl: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  rotr: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  extract: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  split: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8 20 18M8.5 16 20 6"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  hash: '<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen: '<path d="m4 20 4-1L19.5 7.5a2.1 2.1 0 0 0-3-3L5 16l-1 4z"/>',
  sign: '<path d="M3 17c3 0 4-9 6-9s-2 9 1 9 3-4 5-4 1 4 3 4M3 21h18"/>',
  compress: '<path d="M4 7h16v4H4zM6 11v9h12v-9M10 15h4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  cursor: '<path d="M5 3l14 8-6 2-2 6z"/>',
  eraser: '<path d="M20 20H9l-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-7 8"/><path d="m8 10 6 6"/>',
  zoomin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
  zoomout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  open: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></g>',
  warn: '<path d="M12 4 2 20h20L12 4z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  shape: '<rect x="3" y="10" width="10" height="10" rx="1"/><circle cx="16" cy="8" r="5"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor" stroke="none"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" fill="currentColor" stroke="none"/>',
  triangle: '<path d="M12 4.5 20.5 19h-17z" fill="currentColor" stroke="none"/>',
  chev: '<path d="m6 9 6 6 6-6"/>'
};

P.icon = (name, size = 20, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P.ICONS[name] || ''}</svg>`;

P.$ = (id) => document.getElementById(id);
P.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
P.plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
P.mb = (bytes) => {
  const v = bytes / (1024 * 1024);
  return v >= 0.1
    ? v.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-CO') + ' KB';
};
P.uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
P.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
P.isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

// Colores para distinguir los archivos de origen (difieren también en luminosidad).
P.FILE_COLORS = ['#2457d6', '#0b8a7a', '#b45f06', '#7a3fc4', '#c2185b', '#00838f', '#6b7a00', '#6d4c41'];

// Herramientas del panel. Girar, extraer, recortar y eliminar no están aquí:
// aparecen en la barra de acciones al seleccionar páginas. Texto, dibujo, formas, firma
// e imagen están dentro del editor, al que se entra con «Anotar».
P.TOOLS = [
  { group: 'Organizar', items: [
    { id: 'order', icon: 'layers', label: 'Unir y ordenar', short: 'Ordenar' },
    { id: 'split', icon: 'split', label: 'Dividir', short: 'Dividir' }
  ] },
  { group: 'Editar', items: [
    { id: 'annotate', icon: 'pen', label: 'Anotar', short: 'Anotar', title: 'Texto, dibujo, formas, firma e imagen' },
    { id: 'watermark', icon: 'drop', label: 'Marca de agua', short: 'Marca' },
    { id: 'numbers', icon: 'hash', label: 'Números de página', short: 'Números' }
  ] },
  { group: 'Archivo', items: [
    { id: 'compress', icon: 'compress', label: 'Comprimir', short: 'Comprimir' },
    { id: 'clear', icon: 'trash', label: 'Cerrar todo', short: 'Cerrar' }
  ] }
];

// Acciones rápidas sobre las páginas seleccionadas.
P.ACTIONS = [
  { id: 'rotl', icon: 'rotl', label: 'Rotar izq.', aria: 'Rotar a la izquierda' },
  { id: 'rotr', icon: 'rotr', label: 'Rotar der.', aria: 'Rotar a la derecha' },
  { id: 'extract', icon: 'extract', label: 'Extraer' },
  { id: 'crop', icon: 'crop', label: 'Recortar' },
  { id: 'delete', icon: 'trash', label: 'Eliminar', danger: true }
];

// ---------- Estado ----------
// sources: id -> { id, name, bytes (Uint8Array), size, color, doc (pdf.js), pageCount }
// pages:   [{ id, src, index (0-based), rot (giro añadido por el usuario), crop {t,r,b,l} en % o null, annots [] }]
// assets:  id -> { id, type ('png'|'jpg'), bytes, w, h, url }  imágenes insertadas (fuera del historial)
const S = (P.state = {
  sources: new Map(),
  assets: new Map(),
  pages: [],
  sel: new Set(),
  fx: { wm: null, num: null },
  mode: 'grid',
  thumb: 150,
  showNum: true,
  showSrc: true,
  showFx: true,
  fileColors: true,
  fit: 'width',
  rail: false,
  sheetOpen: false,
  extractMode: 'one'
});
P.nextPageId = 1;
P.newPage = (src, index) => ({ id: 'p' + P.nextPageId++, src, index, rot: 0, crop: null, annots: [] });
P.pageById = (id) => S.pages.find((p) => p.id === id);
P.selPages = () => S.pages.filter((p) => S.sel.has(p.id));

// Preferencias de vista recordadas en este dispositivo.
const PREF_KEYS = ['mode', 'thumb', 'showNum', 'showSrc', 'showFx', 'fileColors', 'fit', 'rail'];
try {
  const saved = JSON.parse(localStorage.getItem('editpdf-prefs') || '{}');
  PREF_KEYS.forEach((k) => { if (k in saved) S[k] = saved[k]; });
} catch (e) { /* sin almacenamiento: valores por defecto */ }
P.savePrefs = () => {
  try { localStorage.setItem('editpdf-prefs', JSON.stringify(Object.fromEntries(PREF_KEYS.map((k) => [k, S[k]])))); } catch (e) { /* ignorar */ }
};

// ---------- Historial ----------
const hist = { past: [], future: [] };
const snap = () => JSON.stringify({ pages: S.pages, fx: S.fx });
const restore = (json) => { const o = JSON.parse(json); S.pages = o.pages; S.fx = o.fx; };
const pruneSel = () => { const ids = new Set(S.pages.map((p) => p.id)); [...S.sel].forEach((id) => { if (!ids.has(id)) S.sel.delete(id); }); };
P.canUndo = () => hist.past.length > 0;
P.canRedo = () => hist.future.length > 0;
P.commit = (fn) => {
  hist.past.push(snap());
  if (hist.past.length > 80) hist.past.shift();
  hist.future = [];
  fn();
  pruneSel();
  P.changed();
};
P.undo = () => {
  if (!hist.past.length) return;
  hist.future.push(snap());
  restore(hist.past.pop());
  pruneSel();
  P.changed();
};
P.redo = () => {
  if (!hist.future.length) return;
  hist.past.push(snap());
  restore(hist.future.pop());
  pruneSel();
  P.changed();
};
P.resetHistory = () => { hist.past = []; hist.future = []; };
// Se llama tras cualquier cambio del documento: repinta y guarda la sesión.
P.changed = () => {
  if (P.render) P.render();
  if (P.editorRefresh) P.editorRefresh();
  P.session.saveSoon();
};

// ---------- Avisos ----------
P.toast = (msg, actionLabel, actionFn, ms = 4200) => {
  const t = P.$('toast');
  t.innerHTML = `<span>${P.esc(msg)}</span>` + (actionLabel ? `<button type="button">${P.esc(actionLabel)}</button>` : '');
  if (actionLabel) t.querySelector('button').onclick = () => { t.classList.remove('show'); actionFn(); };
  t.classList.add('show');
  clearTimeout(P.toastTimer);
  P.toastTimer = setTimeout(() => t.classList.remove('show'), ms);
};

// ---------- Sesión en IndexedDB (para no perder el trabajo si iOS cierra la app) ----------
P.session = (() => {
  let dbp = null;
  let timer = null;
  let warned = false;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Sin IndexedDB')); return; }
      const req = indexedDB.open('editpdf', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  };
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const result = fn(t.objectStore(store));
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  const fail = (e) => {
    console.warn('No se pudo guardar la sesión:', e);
    if (!warned) { warned = true; P.toast('No se pudo guardar el trabajo en este dispositivo (puede faltar espacio).'); }
  };
  // PDF e imágenes que ya están en IndexedDB: al guardar se añaden los que se usan y se borran los que sobran.
  const stored = new Set();
  const storedAssets = new Set();
  const syncStore = async (store, saved, used, record) => {
    for (const id of used) {
      if (saved.has(id)) continue;
      const rec = record(id);
      if (!rec) continue;
      await tx(store, 'readwrite', (st) => st.put(rec));
      saved.add(id);
    }
    for (const id of [...saved]) {
      if (used.has(id)) continue;
      await tx(store, 'readwrite', (st) => st.delete(id));
      saved.delete(id);
    }
  };
  P.usedAssets = () => new Set(S.pages.flatMap((p) => p.annots).filter((a) => a.type === 'image').map((a) => a.asset));
  const sync = async () => {
    const used = new Set(S.pages.map((p) => p.src));
    await syncStore('files', stored, used, (id) => {
      const s = S.sources.get(id);
      return s && { id: s.id, name: s.name, bytes: s.bytes, size: s.size, color: s.color };
    });
    await syncStore('assets', storedAssets, P.usedAssets(), (id) => {
      const a = S.assets.get(id);
      return a && { id: a.id, type: a.type, bytes: a.bytes, w: a.w, h: a.h };
    });
    const data = { pages: S.pages, fx: S.fx, nextPageId: P.nextPageId, sources: [...used] };
    await tx('meta', 'readwrite', (st) => st.put(data, 'session'));
  };
  return {
    markStored: (ids) => ids.forEach((id) => stored.add(id)),
    markAssetsStored: (ids) => ids.forEach((id) => storedAssets.add(id)),
    saveSoon() {
      clearTimeout(timer);
      timer = setTimeout(() => { sync().catch(fail); }, 600);
    },
    async load() {
      try {
        const data = await tx('meta', 'readonly', (st) => st.get('session'));
        if (!data || !data.pages || !data.pages.length) return null;
        const files = await tx('files', 'readonly', (st) => st.getAll());
        const assets = await tx('assets', 'readonly', (st) => st.getAll());
        return { data, files: files || [], assets: assets || [] };
      } catch (e) { return null; }
    },
    async clear() {
      clearTimeout(timer);
      stored.clear();
      storedAssets.clear();
      try {
        await tx('files', 'readwrite', (st) => st.clear());
        await tx('assets', 'readwrite', (st) => st.clear());
        await tx('meta', 'readwrite', (st) => st.clear());
      } catch (e) { /* ignorar */ }
    }
  };
})();
