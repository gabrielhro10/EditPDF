// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Interfaz principal: cuadrícula y lista de páginas, selección, herramientas, vista y arranque.
(() => {
  const { $, icon, esc, plural } = P;
  const S = P.state;
  const app = $('app');

  // ---------- Pintado ----------
  const fxOverlay = (index, total) => {
    if (!S.showFx) return '';
    let html = '';
    if (S.fx.wm) html += `<span class="wm"><span style="transform: rotate(${S.fx.wm.rot}deg); opacity: ${S.fx.wm.opacity}; font-size: ${Math.round(S.thumb * 0.13)}px">${esc(S.fx.wm.text)}</span></span>`;
    if (S.fx.num) {
      const pos = S.fx.num.pos;
      const v = pos[0] === 't' ? 'top: 5%; bottom: auto;' : '';
      const h = pos[1] === 'l' ? 'left' : pos[1] === 'r' ? 'right' : 'center';
      html += `<span class="pnum" style="${v} text-align: ${h}">${esc(P.numLabel(S.fx.num.format, index + 1, total))}</span>`;
    }
    return html;
  };
  const badgesHTML = (p) =>
    (p.rot ? `<span class="badge">Girada ${p.rot}°</span>` : '') +
    (p.crop ? '<span class="badge crop">Recortada</span>' : '') +
    (p.annots.length ? `<span class="badge">${plural(p.annots.length, 'anotación', 'anotaciones')}</span>` : '');
  const srcOf = (p) => S.sources.get(p.src) || { name: '?', color: '#8e97a8' };

  function renderChips() {
    const counts = new Map();
    S.pages.forEach((p) => counts.set(p.src, (counts.get(p.src) || 0) + 1));
    $('chips').innerHTML = [...counts].map(([id, n]) => {
      const s = S.sources.get(id);
      return s ? `<span class="a-chip" title="${esc(s.name)}"><span class="dot" style="background:${s.color}"></span><span class="name">${esc(s.name)}</span><small>${plural(n, 'pág.', 'págs.')}</small></span>` : '';
    }).join('');
  }

  function cardHTML(p, i, total) {
    const s = srcOf(p);
    const sel = S.sel.has(p.id);
    return `<div class="card${sel ? ' sel' : ''}" data-id="${p.id}" data-key="${P.thumbKey(p)}">
      <div class="pwrap">
        <button type="button" class="page" aria-pressed="${sel}" aria-label="Página ${i + 1}, ${esc(s.name)} página ${p.index + 1}">
          ${P.sheetHTML(p, fxOverlay(i, total))}
          <span class="badges">${badgesHTML(p)}</span>
          <span class="check">${icon('check', 16, 3)}</span>
        </button>
        <button type="button" class="open-btn" data-open="${p.id}" aria-label="Abrir la página ${i + 1} en el editor">${icon('open', 18)}</button>
      </div>
      <div class="meta"><span class="dot" style="background:${s.color}"></span><b>${i + 1}</b><span class="src">${esc(s.name)} · p. ${p.index + 1}</span></div>
    </div>`;
  }
  function rowHTML(p, i) {
    const s = srcOf(p);
    const sel = S.sel.has(p.id);
    return `<div class="row${sel ? ' sel' : ''}" data-id="${p.id}" data-key="${P.thumbKey(p)}">
      <span class="grip" aria-hidden="true">${icon('grip', 18)}</span>
      <button type="button" class="rcheck" aria-pressed="${sel}" aria-label="Seleccionar la página ${i + 1}"><span class="off"></span><span class="on">${icon('check', 14, 3.2)}</span></button>
      <div class="mini"><span class="page">${P.sheetHTML(p)}</span></div>
      <div class="rinfo"><b>Página ${i + 1}</b><span><span class="dot" style="background:${s.color}"></span><span class="src">${esc(s.name)} · pág. original ${p.index + 1}</span></span></div>
      <div class="rbadges">${badgesHTML(p)}</div>
      <button type="button" class="a-icon ract" data-row-act="rotl" aria-label="Girar la página ${i + 1} a la izquierda">${icon('rotl')}</button>
      <button type="button" class="a-icon ract" data-row-act="rotr" aria-label="Girar la página ${i + 1} a la derecha">${icon('rotr')}</button>
      <button type="button" class="a-icon ract" data-open="${p.id}" aria-label="Abrir la página ${i + 1} en el editor">${icon('open')}</button>
      <button type="button" class="a-icon" data-row-act="delete" aria-label="Eliminar la página ${i + 1}" style="color: var(--a-danger)">${icon('trash')}</button>
    </div>`;
  }

  // Las miniaturas se piden cuando la tarjeta se acerca a la zona visible.
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const p = P.pageById(en.target.dataset.id);
      if (p) P.requestThumb(p);
    });
  }, { root: $('content'), rootMargin: '600px 0px' });
  // Se reinicia en cada repintado para no retener tarjetas que ya no están en la página.
  const observeMissing = (root) => {
    io.disconnect();
    root.querySelectorAll('[data-key]').forEach((el) => { if (el.querySelector('.ph')) io.observe(el); });
  };
  P.onThumb((key) => {
    const total = S.pages.length;
    document.querySelectorAll(`#grid [data-key="${key}"], #listRows [data-key="${key}"]`).forEach((el) => {
      const p = P.pageById(el.dataset.id);
      const sheet = el.querySelector('.sheet');
      if (!p || !sheet) return;
      sheet.outerHTML = el.classList.contains('card') ? P.sheetHTML(p, fxOverlay(S.pages.indexOf(p), total)) : P.sheetHTML(p);
    });
  });

  const actBtn = (a, cls) => `<button type="button" class="${cls}${a.danger ? ' danger' : ''}" data-act="${a.id}" aria-label="${a.aria || a.label}">${icon(a.icon, 18)}<span>${a.label}</span></button>`;
  function renderSelUI() {
    const n = S.sel.size;
    const layout = app.dataset.layout;
    app.classList.toggle('has-sel', n > 0);
    const count = plural(n, 'seleccionada', 'seleccionadas');
    $('ctxBar').innerHTML = `<div class="ctx-in">
      <button type="button" class="a-icon" data-sel="clear" aria-label="Cancelar la selección">${icon('close')}</button>
      <span class="ctx-count">${count}</span>
      <button type="button" class="dark-act" data-sel="all">Seleccionar todo</button>
      <span class="a-spacer"></span>
      ${P.ACTIONS.map((a) => actBtn(a, 'dark-act')).join('')}
    </div>`;
    $('pill').innerHTML = `<span class="ctx-count">${count}</span>` +
      P.ACTIONS.map((a) => `<button type="button" class="a-icon" data-act="${a.id}" aria-label="${a.aria || a.label}" ${a.danger ? 'style="color:var(--a-danger-dark)"' : ''}>${icon(a.icon, 22)}</button>`).join('');
    // Hoja inferior: con selección, primero sus acciones; las herramientas del documento no las repiten.
    const toolTiles = [['split', 'split', 'Dividir'], ['watermark', 'drop', 'Marca de agua'], ['numbers', 'hash', 'N.º de página'], ['annotate', 'pen', 'Anotar'], ['compress', 'compress', 'Comprimir']];
    const tiles = (n ? P.ACTIONS.map((a) => `<button type="button" class="tile${a.danger ? ' danger' : ''}" data-act="${a.id}">${icon(a.icon, 22)}${a.label}</button>`).join('') : '') +
      toolTiles.map(([id, ic, label]) => `<button type="button" class="tile" data-tool="${id}">${icon(ic, 22)}${label}</button>`).join('') +
      (!n && S.pages.length ? `<button type="button" class="tile danger" data-tool="clear">${icon('trash', 22)}Cerrar todo</button>` : '');
    const expanded = n > 0 || S.sheetOpen || layout === 'narrow';
    $('sheet').classList.toggle('expanded', expanded);
    $('sheet').innerHTML = `<button type="button" class="sheet-handle" data-sheet="toggle" aria-label="${expanded ? 'Contraer' : 'Expandir'} las herramientas" aria-expanded="${expanded}"></button>
      <div class="sheet-head">${n ? `<b>${count}</b><button type="button" class="link" data-sel="clear">Limpiar</button>` : '<b>Herramientas</b>'}
        ${S.pages.length ? '<button type="button" class="link strong" data-sel="all">Seleccionar todo</button>' : ''}</div>
      <div class="sheet-grid">${tiles}</div>`;
  }

  function renderTools() {
    $('toolList').innerHTML = P.TOOLS.map((g) =>
      `<div class="a-group">${g.group}</div>` +
      g.items.map((t) => `<button type="button" class="a-tool" data-tool="${t.id}" ${t.id === 'order' ? 'aria-current="true"' : ''} title="${t.title || t.label}">${icon(t.icon)}<span class="tool-label">${t.label}</span></button>`).join('')
    ).join('');
  }
  function applyToolLabels() {
    const rail = app.dataset.layout === 'wide' && S.rail;
    P.TOOLS.forEach((g) => g.items.forEach((t) => {
      const el = $('toolList').querySelector(`[data-tool="${t.id}"] .tool-label`);
      if (el) el.textContent = rail ? t.short : t.label;
    }));
    $('aboutLabel').textContent = rail ? 'Acerca de' : 'Acerca de EditPDF';
  }
  function renderTabs() {
    const toolsOpen = $('sheet').classList.contains('tools-open');
    $('tabs').innerHTML = [['load', 'plus', 'Cargar'], ['pages', 'layers', 'Páginas'], ['tools', 'sliders', 'Herramientas'], ['annotate', 'pen', 'Anotar']]
      .map(([id, ic, label]) => {
        const current = (id === 'tools' && toolsOpen) || (id === 'pages' && !toolsOpen);
        return `<button type="button" data-tab="${id}" ${current ? 'aria-current="page"' : ''}>${icon(ic, 22)}${label}</button>`;
      }).join('');
  }
  function applyPrefs() {
    app.classList.toggle('show-num', S.showNum);
    app.classList.toggle('show-src', S.showSrc);
    app.classList.toggle('file-colors', S.fileColors);
    $('grid').style.setProperty('--thumb', S.thumb + 'px');
    $('sizeQuick').value = S.thumb;
    document.querySelectorAll('#subbar [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  }

  P.render = () => {
    applyPrefs();
    renderChips();
    const total = S.pages.length;
    const empty = total === 0;
    $('empty').hidden = !empty;
    $('grid').hidden = empty || S.mode !== 'grid';
    $('list').hidden = empty || S.mode !== 'list';
    if (S.mode === 'grid') { $('grid').innerHTML = S.pages.map((p, i) => cardHTML(p, i, total)).join(''); observeMissing($('grid')); }
    else {
      $('listRows').innerHTML = S.pages.map(rowHTML).join('');
      $('listCount').textContent = `${plural(total, 'página', 'páginas')} de ${plural(new Set(S.pages.map((p) => p.src)).size, 'archivo', 'archivos')}`;
      observeMissing($('listRows'));
    }
    renderSelUI();
    renderTabs();
    $('btnUndo').disabled = !P.canUndo();
    $('btnRedo').disabled = !P.canRedo();
    $('btnExport').disabled = empty;
    if (!$('viewPop').hidden) renderViewPop();
  };

  // ---------- Menú de opciones de vista ----------
  const sw = (key, label, sub) => `<div class="sw-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>
    <button type="button" class="switch" role="switch" aria-checked="${S[key]}" aria-label="${label}" data-pref="${key}"><i></i></button></div>`;
  function renderViewPop() {
    const seg = (attr, opts, cur) => `<div class="a-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === cur}">${l}</button>`).join('')}</div>`;
    $('viewPop').innerHTML = `
      <div class="pop-head">Opciones de vista<button type="button" class="a-icon" data-pop="close" aria-label="Cerrar">${icon('close')}</button></div>
      <div class="pop-sec pop-size"><span>Tamaño de miniaturas</span>
        <label class="range-row">S <input type="range" id="sizePop" min="110" max="230" step="10" value="${S.thumb}" aria-label="Tamaño de las miniaturas"> L</label></div>
      <div class="pop-sec"><span>Mostrar</span>
        ${sw('showNum', 'Número de página')}${sw('showSrc', 'Archivo de origen')}${sw('showFx', 'Vista previa de efectos', 'Marca de agua y numeración')}${sw('fileColors', 'Color por archivo')}</div>
      <div class="pop-sec"><span>Ajuste en el editor</span>${seg('fit', [['width', 'Ancho'], ['page', 'Página'], ['100', '100 %']], S.fit)}</div>`;
  }
  function toggleViewPop(force) {
    const open = force ?? $('viewPop').hidden;
    $('viewPop').hidden = !open;
    $('btnView').setAttribute('aria-expanded', String(open));
    if (open) renderViewPop();
  }

  // ---------- Selección, acciones y herramientas ----------
  P.selectAll = () => { S.pages.forEach((p) => S.sel.add(p.id)); P.render(); };
  P.clearSel = () => { S.sel.clear(); P.render(); };
  const toggleSel = (id) => { if (S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); P.render(); };

  P.doAction = (id, ids) => {
    const target = ids || [...S.sel];
    if (!target.length) { P.toast('Selecciona al menos una página.'); return; }
    const set = new Set(target);
    if (id === 'rotl' || id === 'rotr') {
      P.commit(() => S.pages.forEach((p) => { if (set.has(p.id)) p.rot = (p.rot + (id === 'rotr' ? 90 : 270)) % 360; }));
    } else if (id === 'delete') {
      P.commit(() => { S.pages = S.pages.filter((p) => !set.has(p.id)); target.forEach((x) => S.sel.delete(x)); });
      P.toast(`${plural(target.length, 'página eliminada', 'páginas eliminadas')}.`, 'Deshacer', P.undo);
    } else if (id === 'extract') P.dialogs.extract(target);
    else if (id === 'crop') P.dialogs.crop(target);
  };

  P.doTool = (id) => {
    const first = S.sel.size ? P.selPages()[0] : S.pages[0];
    $('sheet').classList.remove('tools-open');
    if (!S.pages.length && id !== 'order') { P.toast('Primero carga un PDF.'); renderTabs(); return; }
    switch (id) {
      case 'order': S.mode = 'grid'; P.savePrefs(); P.render(); P.toast('Mantén pulsada una miniatura y arrástrala para cambiar el orden.'); break;
      case 'split': P.dialogs.split(); break;
      case 'watermark': P.dialogs.watermark(); break;
      case 'numbers': P.dialogs.numbers(); break;
      case 'compress': P.dialogs.compress(); break;
      case 'clear': P.dialogs.confirmClose(); break;
      case 'annotate': P.openEditor(first.id); break;
    }
    renderTabs();
  };

  // ---------- Distribución y panel contraíble ----------
  function setLayout() {
    const w = app.clientWidth;
    const layout = w >= 1000 ? 'wide' : w >= 600 ? 'medium' : 'narrow';
    if (app.dataset.layout !== layout) {
      app.dataset.layout = layout;
      if (layout !== 'narrow') $('sheet').classList.remove('tools-open');
      P.render();
    }
    applyRail();
  }
  function applyRail() {
    app.classList.toggle('rail', S.rail);
    const b = $('btnLogo');
    if (app.dataset.layout === 'wide') {
      b.setAttribute('aria-expanded', String(!S.rail));
      b.setAttribute('aria-label', S.rail ? 'Expandir el panel de herramientas' : 'Contraer el panel de herramientas');
      b.title = S.rail ? 'Expandir panel' : 'Contraer panel';
    } else {
      b.removeAttribute('aria-expanded');
      b.setAttribute('aria-label', 'Acerca de EditPDF');
      b.title = 'Acerca de EditPDF';
    }
    applyToolLabels();
  }

  // ---------- Reordenar (Sortable) ----------
  let justDragged = false;
  function reorderFrom(container) {
    const ids = [...container.querySelectorAll('[data-id]')].map((n) => n.dataset.id);
    const byId = new Map(S.pages.map((p) => [p.id, p]));
    P.commit(() => { S.pages = ids.map((id) => byId.get(id)).filter(Boolean); });
  }
  function initSortable() {
    if (!window.Sortable) return;
    const common = {
      animation: 160,
      onStart: () => { justDragged = true; },
      onEnd: (e) => {
        if (e.oldIndex !== e.newIndex) reorderFrom(e.from);
        setTimeout(() => { justDragged = false; }, 80);
      }
    };
    Sortable.create($('grid'), { ...common, delay: 220, delayOnTouchOnly: true, filter: '.open-btn', preventOnFilter: false });
    Sortable.create($('listRows'), { ...common, handle: '.grip' });
  }

  // ---------- Eventos ----------
  app.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-tab]');
    if (!$('viewPop').hidden && !e.target.closest('#viewPop') && !(t && t.id === 'btnView')) toggleViewPop(false);
    if (!t || !app.contains(t) || t.closest('#editor') || t.closest('#modal')) return;
    const d = t.dataset;
    if (d.open) { P.openEditor(d.open); return; }
    if (t.classList.contains('page') && t.closest('.card')) { if (!justDragged) toggleSel(t.closest('.card').dataset.id); return; }
    if (t.classList.contains('rcheck')) { toggleSel(t.closest('.row').dataset.id); return; }
    if (d.rowAct) { P.doAction(d.rowAct, [t.closest('.row').dataset.id]); return; }
    if (d.act) { P.doAction(d.act); return; }
    if (d.sel) { d.sel === 'all' ? P.selectAll() : P.clearSel(); return; }
    if (d.tool) { P.doTool(d.tool); return; }
    if (d.sheet) { S.sheetOpen = !S.sheetOpen; renderSelUI(); return; }
    if (d.mode) { S.mode = d.mode; P.savePrefs(); P.render(); return; }
    if (d.fit) { S.fit = d.fit; P.savePrefs(); renderViewPop(); return; }
    if (d.pref) { S[d.pref] = !S[d.pref]; P.savePrefs(); P.render(); return; }
    if (d.pop) { toggleViewPop(false); return; }
    if (d.tab) {
      if (d.tab === 'load') $('fileInput').click();
      if (d.tab === 'pages') $('sheet').classList.remove('tools-open');
      if (d.tab === 'tools') $('sheet').classList.toggle('tools-open');
      if (d.tab === 'annotate') P.doTool('annotate');
      renderTabs();
      return;
    }
    switch (t.id) {
      case 'btnLogo':
        // En pantalla ancha el logo contrae o expande el panel; sin panel (iPad vertical, móvil) abre «Acerca de».
        if (app.dataset.layout === 'wide') { S.rail = !S.rail; P.savePrefs(); applyRail(); } else P.dialogs.about();
        break;
      case 'btnAbout': P.dialogs.about(); break;
      case 'btnLoad': case 'btnLoadEmpty': $('fileInput').click(); break;
      case 'btnUndo': P.undo(); break;
      case 'btnRedo': P.redo(); break;
      case 'btnView': toggleViewPop(); break;
      case 'btnExport': P.dialogs.exportPdf(); break;
    }
  });
  app.addEventListener('dblclick', (e) => {
    const card = e.target.closest('#grid .card');
    if (card && !e.target.closest('.open-btn')) P.openEditor(card.dataset.id);
  });
  app.addEventListener('input', (e) => {
    if (e.target.id === 'sizeQuick' || e.target.id === 'sizePop') {
      S.thumb = Number(e.target.value);
      $('grid').style.setProperty('--thumb', S.thumb + 'px');
      P.savePrefs();
    }
  });
  app.addEventListener('change', (e) => { if (e.target.id === 'sizeQuick' || e.target.id === 'sizePop') P.render(); });
  $('fileInput').addEventListener('change', (e) => {
    const files = e.target.files;
    if (files && files.length) P.loadFiles(files);
    e.target.value = '';
  });

  // Arrastrar archivos desde el escritorio (no confundir con reordenar miniaturas).
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; app.classList.add('dragging'); });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) app.classList.remove('dragging'); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    app.classList.remove('dragging');
    P.loadFiles(e.dataTransfer.files);
  });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape') {
      if (P.dialogs.isOpen()) { P.dialogs.close(); return; }
      if (!$('viewPop').hidden) { toggleViewPop(false); return; }
      if (P.editorOpen()) { P.closeEditor(); return; }
      if (S.sel.size) P.clearSel();
      return;
    }
    if (typing || P.dialogs.isOpen()) return;
    const k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? P.redo() : P.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); P.redo(); return; }
    if (mod && k === 'o') { e.preventDefault(); $('fileInput').click(); return; }
    if (mod && k === 's') { e.preventDefault(); if (S.pages.length) P.dialogs.exportPdf(); return; }
    if (P.editorOpen()) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && P.editorDeleteSelected()) e.preventDefault();
      return;
    }
    if (mod && k === 'a') { e.preventDefault(); P.selectAll(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { e.preventDefault(); P.doAction('delete'); }
  });

  // ---------- PWA: service worker, instalación y abrir PDF desde el sistema ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('No se pudo registrar el service worker:', err));
    });
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); P.installPrompt = e; });
  window.addEventListener('appinstalled', () => { P.installPrompt = null; P.toast('EditPDF quedó instalada.'); });
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const files = await Promise.all(params.files.map((h) => h.getFile()));
      P.loadFiles(files);
    });
  }

  // ---------- Arranque ----------
  document.querySelectorAll('#app [data-icon]').forEach((n) => { n.innerHTML = icon(n.dataset.icon); });
  $('list').innerHTML = '<div class="a-list-head"><span id="listCount"></span><span class="a-spacer"></span><span>Arrastra el asa para reordenar</span></div><div id="listRows"></div>';
  renderTools();
  P.render();
  initSortable();
  new ResizeObserver(setLayout).observe(app);
  setLayout();
  if (!P.libsReady()) {
    P.toast('No se pudieron cargar las librerías de PDF. Revisa la conexión y recarga la página.', null, null, 15000);
  } else {
    P.session.load().then((saved) => { if (saved && !S.pages.length) P.dialogs.restore(saved); });
  }
})();
