// Lectura de PDF con pdf.js: abrir archivos, miniaturas perezosas y utilidades de página.
(() => {
  const S = P.state;
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  P.libsReady = () => !!(window.pdfjsLib && window.PDFLib);

  const isPdf = (f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf';

  // pdf.js puede transferir el buffer al worker, por eso se le pasa una copia.
  // isEvalSupported: false evita ejecutar código generado a partir de las fuentes del PDF.
  const openDoc = (bytes) => pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;

  P.addSource = async (name, bytes) => {
    const doc = await openDoc(bytes);
    const used = new Set([...S.sources.values()].map((s) => s.color));
    const color = P.FILE_COLORS.find((c) => !used.has(c)) || P.FILE_COLORS[S.sources.size % P.FILE_COLORS.length];
    const src = { id: P.uid('f'), name, bytes, size: bytes.byteLength, color, doc, pageCount: doc.numPages };
    S.sources.set(src.id, src);
    return src;
  };

  P.loadFiles = async (fileList) => {
    const files = [...fileList];
    const pdfs = files.filter(isPdf);
    if (!pdfs.length) { P.toast('Elige archivos PDF.'); return; }
    if (!P.libsReady()) { P.toast('No se pudo cargar el lector de PDF. Revisa la conexión y recarga la página.'); return; }
    const added = [];
    const errors = [];
    for (const f of pdfs) {
      P.toast(`Abriendo ${f.name}…`, null, null, 60000);
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        added.push(await P.addSource(f.name, bytes));
      } catch (e) {
        errors.push(e && e.name === 'PasswordException'
          ? `${f.name} está protegido con contraseña. Quítale la contraseña y vuelve a cargarlo.`
          : `No se pudo abrir ${f.name}. Puede que el archivo esté dañado.`);
      }
    }
    if (added.length) {
      P.commit(() => added.forEach((src) => { for (let i = 0; i < src.pageCount; i++) S.pages.push(P.newPage(src.id, i)); }));
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    }
    if (errors.length) P.toast(errors.join(' '), null, null, 7000);
    else if (added.length) {
      const n = added.reduce((a, s) => a + s.pageCount, 0);
      P.toast(`Se añadieron ${P.plural(n, 'página', 'páginas')} de ${P.plural(added.length, 'archivo', 'archivos')}.`, 'Deshacer', P.undo);
    }
  };

  // Recupera la sesión guardada (archivos y páginas) tras cerrar la app.
  P.restoreSession = async ({ data, files, assets }) => {
    for (const f of files) {
      if (!data.sources.includes(f.id) || S.sources.has(f.id)) continue;
      try {
        const doc = await openDoc(f.bytes);
        S.sources.set(f.id, { id: f.id, name: f.name, bytes: f.bytes, size: f.size, color: f.color, doc, pageCount: doc.numPages });
        P.session.markStored([f.id]);
      } catch (e) { /* archivo ilegible: se omiten sus páginas */ }
    }
    const usedAssets = new Set(data.pages.flatMap((p) => p.annots || []).filter((a) => a.type === 'image').map((a) => a.asset));
    for (const a of assets || []) {
      if (!usedAssets.has(a.id) || S.assets.has(a.id)) continue;
      const blob = new Blob([a.bytes], { type: a.type === 'png' ? 'image/png' : 'image/jpeg' });
      S.assets.set(a.id, { id: a.id, type: a.type, bytes: a.bytes, w: a.w, h: a.h, url: URL.createObjectURL(blob) });
      P.session.markAssetsStored([a.id]);
    }
    S.pages = data.pages.filter((p) => S.sources.has(p.src));
    S.pages.forEach((p) => { p.annots = (p.annots || []).filter((a) => a.type !== 'image' || S.assets.has(a.asset)); });
    S.fx = data.fx || { wm: null, num: null };
    P.nextPageId = Math.max(data.nextPageId || 1, ...S.pages.map((p) => Number(p.id.slice(1)) + 1));
    S.sel.clear();
    P.resetHistory();
    P.changed();
  };

  P.closeAll = async () => {
    S.sources.forEach((s) => { try { s.doc.destroy(); } catch (e) { /* ignorar */ } });
    S.sources.clear();
    S.assets.forEach((a) => URL.revokeObjectURL(a.url));
    S.assets.clear();
    S.pages = [];
    S.sel.clear();
    S.fx = { wm: null, num: null };
    thumbs.forEach((t) => URL.revokeObjectURL(t.url));
    thumbs.clear();
    P.resetHistory();
    await P.session.clear();
    P.changed();
  };

  // Imagen insertada desde el dispositivo. Se pasa por un lienzo: así se aplica la orientación EXIF
  // de las fotos (el PDF la ignoraría), se limita a 2000 px y queda en PNG o JPEG, los formatos de pdf-lib.
  P.addImageAsset = async (file) => {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); throw new Error('Sin memoria para la imagen'); }
    const jpg = /jpe?g|heic|heif/i.test(file.type) || /\.(jpe?g|heic|heif)$/i.test(file.name);
    if (jpg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise((r) => canvas.toBlob(r, jpg ? 'image/jpeg' : 'image/png', 0.88));
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new Error('Sin memoria para la imagen');
    const asset = { id: P.uid('i'), type: jpg ? 'jpg' : 'png', bytes: new Uint8Array(await blob.arrayBuffer()), w, h, url: URL.createObjectURL(blob) };
    S.assets.set(asset.id, asset);
    return asset;
  };

  P.getPage = (p) => S.sources.get(p.src).doc.getPage(p.index + 1);
  // Giro total con el que se ve la página: el suyo propio (/Rotate) más el que añade el usuario.
  P.totalRot = (page, p) => (((page.rotate + p.rot) % 360) + 360) % 360;

  // ---------- Miniaturas (cola con 2 trabajos a la vez; se guardan como JPEG) ----------
  const thumbs = new Map(); // `${src}:${index}` -> { url, w, h, rot } (w y h ya incluyen el /Rotate propio)
  const queue = [];
  const queued = new Set();
  const listeners = new Set();
  let active = 0;
  P.thumbKey = (p) => `${p.src}:${p.index}`;
  P.thumbInfo = (p) => thumbs.get(P.thumbKey(p));
  P.onThumb = (fn) => listeners.add(fn);
  P.requestThumb = (p) => {
    const key = P.thumbKey(p);
    if (thumbs.has(key) || queued.has(key) || !S.sources.has(p.src)) return;
    queued.add(key);
    queue.push({ src: p.src, index: p.index, key });
    pump();
  };
  const pump = () => {
    while (active < 2 && queue.length) {
      const job = queue.shift();
      active++;
      renderThumb(job).catch((e) => console.warn('Miniatura', e)).finally(() => { active--; queued.delete(job.key); pump(); });
    }
  };
  async function renderThumb({ src, index, key }) {
    const s = S.sources.get(src);
    if (!s) return;
    const page = await s.doc.getPage(index + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 520 / Math.max(vp1.width, vp1.height));
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    canvas.width = 0; // libera la memoria del lienzo en Safari
    canvas.height = 0;
    page.cleanup();
    if (!blob) return;
    thumbs.set(key, { url: URL.createObjectURL(blob), w: vp1.width, h: vp1.height, rot: page.rotate });
    listeners.forEach((fn) => fn(key));
  }

  // Convierte márgenes {t,r,b,l} del marco sin girar al marco girado `deg` grados (sentido horario).
  P.rotInsets = (c, deg) => {
    switch (((deg % 360) + 360) % 360) {
      case 90: return { t: c.l, r: c.t, b: c.r, l: c.b };
      case 180: return { t: c.b, r: c.l, b: c.t, l: c.r };
      case 270: return { t: c.r, r: c.b, b: c.l, l: c.t };
      default: return { ...c };
    }
  };

  // HTML de una hoja dentro de una caja con proporción carta: respeta la proporción real,
  // el giro del usuario y el recorte. `extra` se dibuja encima (marca de agua, número).
  const BOX = 8.5 / 11;
  P.sheetHTML = (p, extra = '') => {
    const info = P.thumbInfo(p);
    const w = info ? info.w : 612;
    const h = info ? info.h : 792;
    const r = ((p.rot % 360) + 360) % 360;
    const dw = r % 180 ? h : w;
    const dh = r % 180 ? w : h;
    const a = dw / dh;
    const size = a <= BOX ? `height:100%;width:${((a / BOX) * 100).toFixed(2)}%` : `width:100%;height:${((BOX / a) * 100).toFixed(2)}%`;
    const src = S.sources.get(p.src);
    let img = '<span class="ph"></span>';
    if (info) {
      let clip = '';
      if (p.crop) {
        const c = P.rotInsets(p.crop, info.rot);
        clip = `clip-path: inset(${c.t}% ${c.r}% ${c.b}% ${c.l}%);`;
      }
      img = `<img src="${info.url}" alt="" style="width:${((w / dw) * 100).toFixed(2)}%;height:${((h / dh) * 100).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${r}deg);${clip}">`;
    }
    return `<span class="sheet" style="${size}">${img}<span class="stripe" style="background:${src ? src.color : '#8e97a8'}"></span>${extra}</span>`;
  };
})();
