// Editor de una página: la página real (pdf.js) y encima una capa SVG con las anotaciones.
// Las anotaciones se guardan en el espacio de usuario del PDF (puntos), así siguen en su sitio
// aunque la página se gire o se recorte, y export.js las dibuja tal cual con pdf-lib.
// Tipos: stroke {pts}, sign {strokes}, text {x, y, text, size, rot}, image {asset, cx, cy, w, h, rot}.
(() => {
  const { $, icon, esc } = P;
  const S = P.state;
  const COLORS = [['#1b2130', 'Negro'], ['#d62839', 'Rojo'], ['#2457d6', 'Azul'], ['#0b8a7a', 'Verde']];
  const TOOLS = [['select', 'cursor', 'Seleccionar'], ['text', 'text', 'Texto'], ['draw', 'pen', 'Dibujo'], ['sign', 'sign', 'Firma'], ['image', 'image', 'Imagen'], ['erase', 'eraser', 'Borrar']];
  const ACCENT = '#d62839';
  const E = { id: null, tool: 'draw', color: '#2457d6', width: 3, finger: false, zoom: 1, selected: -1, vp: null, R: 0, renderedKey: '', task: null, drag: null };
  let live = null; // trazo en curso
  let raf = 0;
  let sig = null; // trazos de la firma en coordenadas del panel (400 × 160)
  try { sig = JSON.parse(localStorage.getItem('editpdf-firma') || 'null'); } catch (e) { sig = null; }

  const page = () => P.pageById(E.id);
  const index = () => S.pages.findIndex((p) => p.id === E.id);
  const r2 = (v) => Math.round(v * 100) / 100;

  P.openEditor = (id, tool) => {
    if (!P.pageById(id)) return;
    E.id = id;
    if (tool && tool !== 'image') E.tool = tool;
    if (tool === 'image') E.tool = 'select';
    E.selected = -1;
    E.zoom = 1;
    E.renderedKey = '';
    E.drag = null;
    $('viewPop').hidden = true;
    $('editor').hidden = false;
    build();
    if (tool === 'image') P.editorPickImage();
  };
  P.closeEditor = () => {
    if (E.task) { E.task.cancel(); E.task = null; }
    $('editor').hidden = true;
    $('editor').innerHTML = '';
    E.id = null;
    P.render();
  };
  P.editorOpen = () => !$('editor').hidden;
  P.editorRefresh = () => {
    if (!P.editorOpen()) return;
    if (!page()) { P.closeEditor(); return; }
    renderChrome();
    renderPage();
  };
  P.editorDeleteSelected = () => {
    if (!P.editorOpen() || E.selected < 0 || !page()) return false;
    const k = E.selected;
    E.selected = -1;
    P.commit(() => page().annots.splice(k, 1));
    P.toast('Anotación eliminada.', 'Deshacer', P.undo);
    return true;
  };
  // Debe llamarse dentro de un toque o clic del usuario (el selector de archivos lo exige).
  P.editorPickImage = () => { $('imgInput').value = ''; $('imgInput').click(); };

  $('imgInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !P.editorOpen()) return;
    P.toast('Preparando la imagen…', null, null, 20000);
    try {
      const asset = await P.addImageAsset(file);
      insertImage(asset);
      P.toast('Imagen añadida. Arrástrala para moverla y usa el círculo de la esquina para cambiar su tamaño.');
    } catch (err) {
      console.warn(err);
      P.toast('No se pudo leer la imagen. Prueba con una foto JPG o PNG.');
    }
  });

  function build() {
    $('editor').innerHTML = `
      <header class="a-top">
        <button type="button" class="a-btn" data-ed="back">${icon('back')}<span class="lbl-wide">Páginas</span></button>
        <button type="button" class="a-icon" data-ed="prev" aria-label="Página anterior">${icon('back')}</button>
        <span id="edLbl" style="min-width:118px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums"></span>
        <button type="button" class="a-icon" data-ed="next" aria-label="Página siguiente">${icon('next')}</button>
        <span class="a-spacer"></span>
        <button type="button" class="a-icon" data-ed="undo" aria-label="Deshacer" title="Deshacer">${icon('undo')}</button>
        <button type="button" class="a-icon" data-ed="redo" aria-label="Rehacer" title="Rehacer">${icon('redo')}</button>
        <button type="button" class="a-btn a-primary" data-ed="export">${icon('share')}<span class="lbl-wide">Exportar</span></button>
      </header>
      <div class="ed-tools" id="edTools"></div>
      <div class="ed-body">
        <div class="ed-strip" id="edStrip"></div>
        <div class="ed-canvas" id="edCanvas">
          <div class="ed-hint" id="edHint"></div>
          <div class="ed-pagewrap"><div class="ed-page" id="edPage"><svg class="ed-layer" id="edSvg" aria-label="Anotaciones de la página"></svg></div></div>
        </div>
      </div>
      <footer class="ed-foot">
        <button type="button" class="a-icon" data-ed="zoomout" aria-label="Alejar">${icon('zoomout')}</button>
        <span class="zoom-val" id="edZoom"></span>
        <button type="button" class="a-icon" data-ed="zoomin" aria-label="Acercar">${icon('zoomin')}</button>
        <span class="ed-div"></span>
        <div class="a-seg" role="group" aria-label="Ajuste" id="edFit"></div>
        <span class="a-spacer"></span>
        <button type="button" class="a-btn a-danger" data-ed="delsel" id="edDelSel" hidden>${icon('trash', 18)}Eliminar anotación</button>
        <span id="edCount" style="font-size:13px;color:var(--a-muted)"></span>
      </footer>`;
    const svg = $('edSvg');
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onCancel);
    svg.addEventListener('click', onTap);
    // En iPad el dedo desplaza la página. Se impide solo cuando el Apple Pencil dibuja,
    // cuando está activo «Dibujar con el dedo» o cuando se arrastra una anotación seleccionable.
    const blockTouch = (e) => {
      if (E.tool === 'draw') {
        if (E.finger || [...e.touches].some((t) => t.touchType === 'stylus')) e.preventDefault();
      } else if (E.tool === 'select' && e.target.closest && e.target.closest('[data-idx], [data-handle]')) {
        e.preventDefault();
      }
    };
    svg.addEventListener('touchstart', blockTouch, { passive: false });
    svg.addEventListener('touchmove', blockTouch, { passive: false });
    $('editor').onclick = onClick;
    $('editor').oninput = (e) => { if (e.target.id === 'edWidth') E.width = Number(e.target.value); };
    renderChrome();
    renderPage();
  }

  function renderChrome() {
    const i = index();
    $('edLbl').textContent = `Página ${i + 1} de ${S.pages.length}`;
    $('edTools').innerHTML =
      TOOLS.map(([id, ic, label]) => `<button type="button" class="ed-tool" data-edtool="${id}" aria-pressed="${E.tool === id}" aria-label="${label}">${icon(ic)}<span>${label}</span></button>`).join('') +
      '<span class="ed-div"></span>' +
      COLORS.map(([c, name]) => `<button type="button" class="swatch" data-color="${c}" aria-label="Color ${name.toLowerCase()}" aria-pressed="${E.color === c}" style="color:${c}"><i style="background:${c}"></i></button>`).join('') +
      '<span class="ed-div"></span>' +
      `<label class="range-row">Grosor <input type="range" id="edWidth" min="1" max="12" value="${E.width}" style="width:96px;flex:none"></label>
      <span class="a-spacer"></span>
      <div class="sw-row" style="flex:none"><span style="font-size:14px;font-weight:600">Dibujar con el dedo</span>
        <button type="button" class="switch" role="switch" aria-checked="${E.finger}" aria-label="Dibujar con el dedo" data-ed="finger"><i></i></button></div>`;
    // Tira de páginas: se piden miniaturas solo de las cercanas.
    $('edStrip').innerHTML = S.pages.map((p, k) =>
      `<button type="button" data-goto="${p.id}" ${p.id === E.id ? 'aria-current="true"' : ''} aria-label="Ir a la página ${k + 1}"><span class="page">${P.sheetHTML(p)}</span>${k + 1}</button>`).join('');
    S.pages.slice(Math.max(0, i - 8), i + 9).forEach((p) => P.requestThumb(p));
    const cur = $('edStrip').querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    $('edFit').innerHTML = [['width', 'Ancho'], ['page', 'Página'], ['100', '100 %']].map(([v, l]) => `<button type="button" data-fit="${v}" aria-pressed="${S.fit === v}">${l}</button>`).join('');
    $('edCanvas').classList.toggle('finger', E.finger && E.tool === 'draw');
    $('edHint').textContent = E.tool !== 'draw' ? hintFor(E.tool)
      : E.finger ? 'Un dedo dibuja. Desactiva «Dibujar con el dedo» para desplazarte.'
        : 'El Apple Pencil (o el ratón) dibuja · los dedos desplazan y hacen zoom';
    $('editor').querySelector('[data-ed="undo"]').disabled = !P.canUndo();
    $('editor').querySelector('[data-ed="redo"]').disabled = !P.canRedo();
  }
  const hintFor = (t) => ({
    select: 'Toca una anotación para seleccionarla; arrástrala para moverla y usa el círculo de la esquina para cambiar su tamaño',
    text: 'Toca la página donde quieras escribir',
    sign: sig ? 'Toca la página para colocar tu firma' : 'Toca la página: primero dibujarás tu firma',
    erase: 'Toca una anotación para borrarla'
  }[t]);

  // Pinta la página con pdf.js. Solo se vuelve a pintar si cambia la página, el giro o la escala.
  function renderPage() {
    return renderPageInner().catch((e) => console.warn('No se pudo mostrar la página:', e));
  }
  async function renderPageInner() {
    const p = page();
    if (!p) return;
    const pg = await P.getPage(p);
    if (!page() || page().id !== p.id) return;
    const R = P.totalRot(pg, p);
    const base = pg.getViewport({ scale: 1, rotation: R });
    const area = $('edCanvas');
    let scale;
    if (S.fit === '100') scale = 1;
    else {
      const byWidth = Math.max(0.2, (area.clientWidth - 48) / base.width);
      scale = S.fit === 'page' ? Math.min(byWidth, Math.max(0.2, (area.clientHeight - 100) / base.height)) : byWidth;
    }
    scale *= E.zoom;
    const vp = pg.getViewport({ scale, rotation: R });
    E.vp = vp;
    E.R = R;
    const pageEl = $('edPage');
    pageEl.style.width = vp.width + 'px';
    pageEl.style.height = vp.height + 'px';
    $('edZoom').textContent = Math.round(scale * 100) + ' %';
    renderAnnots();
    const key = `${p.id}:${R}:${scale.toFixed(3)}`;
    if (key === E.renderedKey) return;
    E.renderedKey = key;
    // Densidad de píxeles limitada para no pasar de ~12 Mpx por lienzo (límite de iOS).
    const dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12e6 / (vp.width * vp.height)));
    const hi = pg.getViewport({ scale: scale * dpr, rotation: R });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(hi.width);
    canvas.height = Math.floor(hi.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      // iOS devuelve null cuando se agota la memoria de lienzos.
      E.renderedKey = '';
      P.toast('No hay memoria suficiente para mostrar la página. Reduce el zoom o cierra otras pestañas.');
      return;
    }
    if (E.task) E.task.cancel();
    E.task = pg.render({ canvasContext: ctx, viewport: hi });
    try {
      await E.task.promise;
    } catch (e) {
      return; // render cancelado por otro más nuevo
    }
    E.task = null;
    if (E.renderedKey !== key || !P.editorOpen()) return;
    const old = pageEl.querySelector('canvas');
    pageEl.insertBefore(canvas, $('edSvg'));
    if (old) { old.width = 0; old.height = 0; old.remove(); }
  }

  // ---------- Geometría ----------
  const css = (x, y) => E.vp.convertToViewportPoint(x, y);
  const toPdf = (cx, cy) => E.vp.convertToPdfPoint(cx, cy);
  const local = (e) => { const r = $('edSvg').getBoundingClientRect(); return [(e.clientX - r.left) * (E.vp.width / r.width), (e.clientY - r.top) * (E.vp.height / r.height)]; };
  const svgPath = (pts) => 'M' + pts.map(([x, y]) => { const [a, b] = css(x, y); return `${a.toFixed(1)} ${b.toFixed(1)}`; }).join(' L');

  // Aplica un desplazamiento (dx, dy) y una escala s alrededor de (cx, cy), todo en puntos del PDF.
  function transformed(a, t) {
    if (!t) return a;
    const f = ([x, y]) => [t.cx + (x - t.cx) * t.s + t.dx, t.cy + (y - t.cy) * t.s + t.dy];
    switch (a.type) {
      case 'stroke': return { ...a, pts: a.pts.map(f) };
      case 'sign': return { ...a, strokes: a.strokes.map((st) => st.map(f)) };
      case 'text': { const [x, y] = f([a.x, a.y]); return { ...a, x, y, size: a.size * t.s }; }
      case 'image': { const [cx, cy] = f([a.cx, a.cy]); return { ...a, cx, cy, w: a.w * t.s, h: a.h * t.s }; }
      default: return a;
    }
  }
  const roundPts = (pts) => pts.map(([x, y]) => [r2(x), r2(y)]);
  function rounded(a) {
    switch (a.type) {
      case 'stroke': return { ...a, pts: roundPts(a.pts) };
      case 'sign': return { ...a, strokes: a.strokes.map(roundPts) };
      case 'text': return { ...a, x: r2(a.x), y: r2(a.y), size: r2(a.size) };
      case 'image': return { ...a, cx: r2(a.cx), cy: r2(a.cy), w: r2(a.w), h: r2(a.h) };
      default: return a;
    }
  }
  // Contorno de la anotación en puntos del PDF (para el recuadro de selección).
  function outline(a) {
    if (a.type === 'stroke') return a.pts;
    if (a.type === 'sign') return a.strokes.flat();
    const rad = (a.rot * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    if (a.type === 'image') {
      const hx = [(c * a.w) / 2, (s * a.w) / 2];
      const hy = [(-s * a.h) / 2, (c * a.h) / 2];
      return [[a.cx - hx[0] - hy[0], a.cy - hx[1] - hy[1]], [a.cx + hx[0] - hy[0], a.cy + hx[1] - hy[1]],
        [a.cx + hx[0] + hy[0], a.cy + hx[1] + hy[1]], [a.cx - hx[0] + hy[0], a.cy - hx[1] + hy[1]]];
    }
    if (a.type === 'text') {
      const W = a.text.length * a.size * 0.58;
      const H = a.size;
      const pt = (k, m) => [a.x + c * k - s * m, a.y + s * k + c * m];
      return [pt(0, -0.25 * H), pt(W, -0.25 * H), pt(W, H), pt(0, H)];
    }
    return [];
  }
  function cssBox(a) {
    const pts = outline(a).map(([x, y]) => css(x, y));
    if (!pts.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    return { x0, y0, x1, y1 };
  }

  // ---------- Pintado de anotaciones ----------
  function annHTML(a, k, s, hitOn) {
    if (a.type === 'stroke' || a.type === 'sign') {
      const paths = a.type === 'stroke' ? [a.pts] : a.strokes;
      return `<g data-idx="${k}">` + paths.map((pts) => {
        const d = svgPath(pts);
        return `<path d="${d}" fill="none" stroke="${a.color}" stroke-width="${a.w * s}" stroke-linecap="round" stroke-linejoin="round"/>` +
          (hitOn ? `<path d="${d}" fill="none" stroke="transparent" stroke-width="26" stroke-linecap="round" pointer-events="stroke"/>` : '');
      }).join('') + '</g>';
    }
    if (a.type === 'text') {
      const [x, y] = css(a.x, a.y);
      const size = a.size * s;
      const w = a.text.length * size * 0.58;
      return `<g data-idx="${k}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${E.R - a.rot})">
        <rect x="-6" y="${-size * 1.05}" width="${w + 12}" height="${size * 1.45}" fill="transparent"/>
        <text x="0" y="0" fill="${a.color}" font-size="${size}" font-weight="700" font-family="Helvetica, Arial, sans-serif">${esc(a.text)}</text></g>`;
    }
    if (a.type === 'image') {
      const asset = S.assets.get(a.asset);
      if (!asset) return '';
      const [x, y] = css(a.cx, a.cy);
      const w = a.w * s;
      const h = a.h * s;
      return `<g data-idx="${k}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${E.R - a.rot})">
        <image href="${asset.url}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="none"/></g>`;
    }
    return '';
  }

  function renderAnnots() {
    const p = page();
    if (!p || !E.vp) return;
    if (E.selected >= p.annots.length) E.selected = -1;
    const s = E.vp.scale;
    const svg = $('edSvg');
    svg.setAttribute('viewBox', `0 0 ${E.vp.width} ${E.vp.height}`);
    svg.classList.toggle('tool-select', E.tool === 'select');
    const hitOn = E.tool === 'erase' || E.tool === 'select';
    const shown = p.annots.map((a, k) => (E.drag && E.drag.k === k ? transformed(a, E.drag.t) : a));
    let html = shown.map((a, k) => annHTML(a, k, s, hitOn)).join('');
    if (E.tool === 'select' && E.selected >= 0) {
      const b = cssBox(shown[E.selected]);
      if (b) {
        const pad = 6;
        const hx = b.x1 + pad;
        const hy = b.y1 + pad;
        html += `<rect x="${b.x0 - pad}" y="${b.y0 - pad}" width="${b.x1 - b.x0 + pad * 2}" height="${b.y1 - b.y0 + pad * 2}" fill="none" stroke="${ACCENT}" stroke-width="1.5" stroke-dasharray="6 5" pointer-events="none"/>
          <g data-handle="1" aria-label="Cambiar tamaño"><circle cx="${hx}" cy="${hy}" r="22" fill="transparent"/><circle cx="${hx}" cy="${hy}" r="10" fill="#fff" stroke="${ACCENT}" stroke-width="2.5"/></g>`;
      }
    }
    if (live) html += `<path id="edLive" d="" fill="none" stroke="${live.color}" stroke-width="${live.w * s}" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg.innerHTML = html;
    const n = p.annots.length;
    $('edCount').textContent = `${n} ${n === 1 ? 'anotación' : 'anotaciones'} en esta página`;
    $('edDelSel').hidden = E.selected < 0;
  }

  // ---------- Puntero: dibujar, mover y redimensionar ----------
  function startDrag(e, mode, k) {
    const a = page().annots[k];
    const b = cssBox(a);
    if (!b) return;
    $('edSvg').setPointerCapture(e.pointerId);
    const p0 = local(e);
    const cCss = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    E.drag = {
      k, mode, pid: e.pointerId, p0, u0: toPdf(p0[0], p0[1]), cCss, cUser: toPdf(cCss[0], cCss[1]),
      d0: Math.max(8, Math.hypot(p0[0] - cCss[0], p0[1] - cCss[1])), t: { dx: 0, dy: 0, s: 1, cx: 0, cy: 0 }, moved: false
    };
  }
  function onDown(e) {
    if (!E.vp) return;
    if (E.tool === 'select') {
      const handle = e.target.closest('[data-handle]');
      const hit = e.target.closest('[data-idx]');
      if (handle && E.selected >= 0) {
        e.preventDefault();
        startDrag(e, 'resize', E.selected);
      } else if (hit) {
        e.preventDefault();
        E.selected = Number(hit.dataset.idx);
        startDrag(e, 'move', E.selected);
        renderAnnots();
      } else if (E.selected >= 0) {
        E.selected = -1;
        renderAnnots();
      }
      return;
    }
    if (E.tool !== 'draw') return;
    const ok = e.pointerType === 'pen' || e.pointerType === 'mouse' || (e.pointerType === 'touch' && E.finger);
    if (!ok) return;
    e.preventDefault();
    $('edSvg').setPointerCapture(e.pointerId);
    const pressure = e.pointerType === 'pen' && e.pressure ? e.pressure : 0.5;
    live = { color: E.color, w: E.width * 0.9 * (0.6 + pressure * 0.8), css: [local(e)], pid: e.pointerId };
    renderAnnots();
  }
  function onMove(e) {
    const d = E.drag;
    if (d && e.pointerId === d.pid) {
      const p = local(e);
      if (d.mode === 'move') {
        const u = toPdf(p[0], p[1]);
        d.t = { dx: u[0] - d.u0[0], dy: u[1] - d.u0[1], s: 1, cx: 0, cy: 0 };
      } else {
        const s = Math.max(0.1, Math.min(10, Math.hypot(p[0] - d.cCss[0], p[1] - d.cCss[1]) / d.d0));
        d.t = { dx: 0, dy: 0, s, cx: d.cUser[0], cy: d.cUser[1] };
      }
      if (Math.hypot(p[0] - d.p0[0], p[1] - d.p0[1]) > 3) d.moved = true;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderAnnots(); });
      return;
    }
    if (!live || e.pointerId !== live.pid) return;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (evs.length ? evs : [e]).forEach((ev) => live.css.push(local(ev)));
    const path = $('edLive');
    if (path) path.setAttribute('d', 'M' + live.css.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'));
  }
  function onUp(e) {
    const d = E.drag;
    if (d && e.pointerId === d.pid) {
      E.drag = null;
      if (d.moved) {
        const id = E.id;
        P.commit(() => { const ann = P.pageById(id).annots; ann[d.k] = rounded(transformed(ann[d.k], d.t)); });
      } else renderAnnots();
      return;
    }
    if (!live || e.pointerId !== live.pid) return;
    const stroke = live;
    live = null;
    if (stroke.css.length < 2) stroke.css.push([stroke.css[0][0] + 0.6, stroke.css[0][1] + 0.6]);
    const pts = roundPts(stroke.css.map(([x, y]) => toPdf(x, y)));
    const id = E.id;
    P.commit(() => P.pageById(id).annots.push({ type: 'stroke', color: stroke.color, w: r2(stroke.w), pts }));
  }
  function onCancel(e) {
    if (E.drag && e.pointerId === E.drag.pid) { E.drag = null; renderAnnots(); }
    if (live && e.pointerId === live.pid) { live = null; renderAnnots(); }
  }

  function onTap(e) {
    const p = page();
    if (!p || !E.vp) return;
    if (E.tool === 'erase') {
      const hit = e.target.closest('[data-idx]');
      if (!hit) return;
      const k = Number(hit.dataset.idx);
      E.selected = -1;
      P.commit(() => page().annots.splice(k, 1));
      P.toast('Anotación borrada.', 'Deshacer', P.undo);
      return;
    }
    if (E.tool === 'text') { placeText(e); return; }
    if (E.tool === 'sign') {
      const at = local(e);
      if (sig) placeSign(at); else signaturePad(() => placeSign(at));
    }
  }

  function placeText(e) {
    const pageEl = $('edPage');
    const [cx, cy] = local(e);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'ann-input';
    inp.placeholder = 'Escribe y pulsa Intro';
    inp.setAttribute('aria-label', 'Texto de la anotación');
    inp.style.left = Math.max(0, Math.min(cx, pageEl.offsetWidth - 170)) + 'px';
    inp.style.top = Math.max(0, cy - 22) + 'px';
    inp.style.color = E.color;
    pageEl.appendChild(inp);
    inp.focus();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const text = inp.value.trim();
      inp.remove();
      if (!save || !text) return;
      const size = 8 + E.width * 2;
      const [x, y] = toPdf(cx, cy + size * E.vp.scale * 0.35);
      const id = E.id;
      P.commit(() => P.pageById(id).annots.push({ type: 'text', x: r2(x), y: r2(y), text, color: E.color, size, rot: E.R }));
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') { ev.stopPropagation(); finish(false); }
    });
    inp.addEventListener('blur', () => finish(true));
  }

  // Tras colocar una firma o una imagen se pasa a «Seleccionar» para poder moverla y ajustarla.
  function selectLast() {
    E.tool = 'select';
    E.selected = page().annots.length - 1;
    renderChrome();
    renderAnnots();
  }

  // Coloca la firma (dibujada en un panel de 400 × 160) centrada en el punto tocado, recta tal como se ve.
  function placeSign([cx, cy]) {
    const W = 170 * E.vp.scale;
    const H = 68 * E.vp.scale;
    const strokes = sig.map((st) => roundPts(st.map(([px, py]) => toPdf(cx - W / 2 + (px / 400) * W, cy - H / 2 + (py / 160) * H))));
    const id = E.id;
    P.commit(() => P.pageById(id).annots.push({ type: 'sign', color: E.color, w: 1.6, strokes }));
    selectLast();
    P.toast('Firma colocada. Arrástrala o cambia su tamaño desde la esquina.', 'Cambiar firma', () => signaturePad(() => P.toast('Firma actualizada. Elige «Firma» y toca la página para colocarla.')));
  }

  // Imagen nueva: centrada en la zona visible de la página, recta tal como se ve y al 40 % del ancho.
  function insertImage(asset) {
    if (!page() || !E.vp) return;
    const s = E.vp.scale;
    const pageW = E.vp.width / s;
    const pageH = E.vp.height / s;
    let w = pageW * 0.4;
    let h = (w * asset.h) / asset.w;
    if (h > pageH * 0.6) { h = pageH * 0.6; w = (h * asset.w) / asset.h; }
    const pr = $('edPage').getBoundingClientRect();
    const ar = $('edCanvas').getBoundingClientRect();
    const clamp = (v, max) => Math.min(Math.max(v, 0), max);
    const vx = pr.width ? clamp(ar.left + ar.width / 2 - pr.left, pr.width) * (E.vp.width / pr.width) : E.vp.width / 2;
    const vy = pr.height ? clamp(ar.top + ar.height / 2 - pr.top, pr.height) * (E.vp.height / pr.height) : E.vp.height / 2;
    const [cx, cy] = toPdf(vx, vy);
    const id = E.id;
    P.commit(() => P.pageById(id).annots.push({ type: 'image', asset: asset.id, cx: r2(cx), cy: r2(cy), w: r2(w), h: r2(h), rot: E.R }));
    selectLast();
  }

  function signaturePad(onDone) {
    P.dialogs.open(`<div class="dlg-head"><span class="dlg-ico">${icon('sign', 22)}</span><div><h2 id="dlgTitle">Tu firma</h2><p>Dibuja con el dedo, el Apple Pencil o el ratón</p></div>
        <button type="button" class="a-icon" data-close aria-label="Cerrar">${icon('close')}</button></div>
      <canvas class="sigpad" id="sigPad" width="800" height="320" aria-label="Zona para dibujar la firma"></canvas>
      <p class="opt-desc" style="margin:0">La firma se guarda solo en este dispositivo para reutilizarla.</p>
      <div class="dlg-foot"><button type="button" class="a-btn" id="sigClear" style="margin-right:auto">Borrar</button>
        <button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="sigUse" disabled>Usar firma</button></div>`,
    (d) => {
      const cv = d.querySelector('#sigPad');
      const ctx = cv.getContext('2d');
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1b2130';
      const strokes = [];
      let cur = null;
      const pt = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 400, ((e.clientY - r.top) / r.height) * 160]; };
      cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = [pt(e)]; strokes.push(cur); });
      cv.addEventListener('pointermove', (e) => {
        if (!cur) return;
        const prev = cur[cur.length - 1];
        const next = pt(e);
        cur.push(next);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(next[0], next[1]); ctx.stroke();
        d.querySelector('#sigUse').disabled = false;
      });
      const end = () => { cur = null; };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      d.querySelector('#sigClear').onclick = () => { strokes.length = 0; ctx.clearRect(0, 0, 400, 160); d.querySelector('#sigUse').disabled = true; };
      d.querySelector('#sigUse').onclick = () => {
        sig = strokes.filter((st) => st.length > 1).map((st) => st.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
        try { localStorage.setItem('editpdf-firma', JSON.stringify(sig)); } catch (e) { /* ignorar */ }
        P.dialogs.close();
        if (onDone) onDone();
      };
    });
  }

  function onClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.edtool === 'image') { P.editorPickImage(); return; }
    if (d.edtool) { E.tool = d.edtool; E.selected = -1; renderChrome(); renderAnnots(); return; }
    if (d.color) { E.color = d.color; renderChrome(); return; }
    if (d.goto) { E.id = d.goto; E.selected = -1; E.renderedKey = ''; renderChrome(); renderPage(); return; }
    if (d.fit) { S.fit = d.fit; P.savePrefs(); E.zoom = 1; renderChrome(); renderPage(); return; }
    const pages = S.pages;
    switch (d.ed) {
      case 'back': P.closeEditor(); break;
      case 'prev': { const i = index(); if (i > 0) { E.id = pages[i - 1].id; E.selected = -1; renderChrome(); renderPage(); } break; }
      case 'next': { const i = index(); if (i < pages.length - 1) { E.id = pages[i + 1].id; E.selected = -1; renderChrome(); renderPage(); } break; }
      case 'undo': P.undo(); break;
      case 'redo': P.redo(); break;
      case 'export': P.dialogs.exportPdf(); break;
      case 'zoomin': E.zoom = Math.min(4, E.zoom * 1.25); renderPage(); break;
      case 'zoomout': E.zoom = Math.max(0.4, E.zoom / 1.25); renderPage(); break;
      case 'finger': E.finger = !E.finger; renderChrome(); break;
      case 'delsel': P.editorDeleteSelected(); break;
    }
  }

  P.onThumb(() => { if (P.editorOpen() && $('edStrip')) renderStripImages(); });
  // Solo actualiza las miniaturas de la tira (sin reconstruir el resto).
  function renderStripImages() {
    $('edStrip').querySelectorAll('[data-goto]').forEach((b) => {
      const p = P.pageById(b.dataset.goto);
      const holder = b.querySelector('.page');
      if (p && holder && holder.querySelector('.ph') && P.thumbInfo(p)) holder.innerHTML = P.sheetHTML(p);
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (P.editorOpen()) renderPage(); }, 150);
  });
})();
