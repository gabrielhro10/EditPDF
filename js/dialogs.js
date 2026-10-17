// Diálogos: extraer, recortar, dividir, marca de agua, números, comprimir, exportar, acerca de.
(() => {
  const { $, icon, esc, plural } = P;
  const S = P.state;
  const D = (P.dialogs = {});

  const head = (ic, title, sub) => `<div class="dlg-head"><span class="dlg-ico">${icon(ic, 22)}</span>
    <div><h2 id="dlgTitle">${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>
    <button type="button" class="a-icon" data-close aria-label="Cerrar">${icon('close')}</button></div>`;
  const opt = (group, value, title, desc, checked, extra = '') => `<button type="button" class="opt" role="radio" data-group="${group}" data-value="${value}" aria-checked="${checked}">
    <span class="radio"></span><span class="opt-body"><span class="opt-title">${title}</span>${desc ? `<span class="opt-desc">${desc}</span>` : ''}${extra}</span></button>`;
  const picked = (d, group) => { const b = d.querySelector(`[data-group="${group}"][aria-checked="true"]`); return b && b.dataset.value; };
  const preview = (p, extra = '') => `<span class="page prev-box">${P.sheetHTML(p, extra)}</span>`;
  const pdfName = (name, fallback) => { let n = (name || '').trim() || fallback; if (!/\.pdf$/i.test(n)) n += '.pdf'; return n.replace(/[\\/:*?"<>|]/g, '-'); };
  D.defaultName = () => {
    const ids = [...new Set(S.pages.map((p) => p.src))];
    if (ids.length === 1) return S.sources.get(ids[0]).name.replace(/\.pdf$/i, '') + '-editado.pdf';
    return 'documento-unido.pdf';
  };

  let busy = false;
  let result = null; // { blob, name }
  D.open = (html, mount) => {
    const d = $('dialog');
    d.setAttribute('aria-labelledby', 'dlgTitle');
    d.innerHTML = html;
    $('modal').hidden = false;
    result = null;
    if (mount) mount(d);
    const first = d.querySelector('input[type="text"], .a-primary');
    if (first) first.focus();
  };
  D.close = () => {
    if (busy) return;
    $('dialog').innerHTML = '';
    $('modal').hidden = true;
    result = null;
  };
  D.isOpen = () => !$('modal').hidden;

  $('dialog').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) { D.close(); return; }
    if (b.getAttribute('role') === 'radio' && !b.disabled) {
      $('dialog').querySelectorAll(`[data-group="${b.dataset.group}"]`).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      b.dispatchEvent(new CustomEvent('picked', { bubbles: true }));
    }
    if (b.dataset.deliver && result) {
      if (b.dataset.deliver === 'share') P.deliver.share(result.blob, result.name);
      else P.deliver.download(result.blob, result.name);
    }
  });
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') D.close(); });

  // Ejecuta una tarea con barra de progreso y muestra el resultado listo para compartir o descargar.
  D.process = async (d, working, task) => {
    const foot = d.querySelector('.dlg-foot');
    const box = d.querySelector('.result');
    box.hidden = false;
    box.innerHTML = `<div class="result-row">${working}</div><div class="bar"><i></i></div>`;
    foot.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    d.querySelectorAll('.opt, input, select').forEach((el) => { el.disabled = true; });
    d.querySelectorAll('[data-close]').forEach((b) => { b.disabled = true; });
    const bar = box.querySelector('.bar i');
    busy = true;
    try {
      const out = await task((f) => { bar.style.width = Math.round(Math.min(1, f) * 100) + '%'; });
      result = { blob: out.blob, name: out.name };
      box.innerHTML = `<div class="result-row"><span class="ok-dot">${icon('check', 14, 3.2)}</span>${out.title}</div>
        <div class="bar"><i style="width:100%"></i></div><span class="opt-desc">${out.detail}</span>`;
      const share = P.deliver.canShare(out.blob, out.name);
      foot.innerHTML = `<button type="button" class="a-btn${share ? '' : ' a-primary'}" data-deliver="download">${icon('download')}Descargar</button>` +
        (share ? `<button type="button" class="a-btn a-primary" data-deliver="share">${icon('share')}Compartir</button>` : '');
    } catch (err) {
      console.error(err);
      box.innerHTML = `<p class="err">No se pudo completar: ${esc(err && err.message ? err.message : 'error desconocido')}. Prueba con menos páginas o recarga la app.</p>`;
      foot.innerHTML = '<button type="button" class="a-btn" data-close>Cerrar</button>';
    } finally {
      busy = false;
      d.querySelectorAll('[data-close]').forEach((b) => { b.disabled = false; });
    }
  };
  const pdfBlob = (bytes) => new Blob([bytes], { type: 'application/pdf' });

  // ---------- Extraer ----------
  D.extract = (ids) => {
    const list = S.pages.filter((p) => ids.includes(p.id));
    D.open(`${head('extract', 'Extraer páginas', plural(list.length, 'página seleccionada', 'páginas seleccionadas'))}
      <div style="display:flex;flex-direction:column;gap:10px">
        ${opt('ex', 'one', 'Un PDF con todas', 'Las páginas se guardan juntas en un archivo nuevo.', S.extractMode === 'one')}
        ${opt('ex', 'each', 'Un PDF por página', 'Se crea un .zip con un archivo por página.', S.extractMode === 'each')}
      </div>
      <label class="field">Nombre del archivo<input type="text" id="exName" value="extracto.pdf" autocomplete="off"></label>
      <div class="result" hidden></div>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="exGo">Extraer</button></div>`,
    (d) => {
      d.querySelector('#exGo').onclick = () => {
        const each = picked(d, 'ex') === 'each';
        S.extractMode = each ? 'each' : 'one';
        const name = pdfName(d.querySelector('#exName').value, 'extracto.pdf');
        D.process(d, 'Creando el archivo…', async (progress) => {
          if (each) {
            const base = name.replace(/\.pdf$/i, '');
            const blob = await P.makeZip(list.map((p) => [p]), base, progress);
            return { blob, name: base + '.zip', title: esc(base + '.zip'), detail: `${plural(list.length, 'PDF', 'PDF')} · ${P.mb(blob.size)}. El documento original no cambia.` };
          }
          const { bytes } = await P.makePdf(list, { onProgress: progress });
          return { blob: pdfBlob(bytes), name, title: esc(name), detail: `${plural(list.length, 'página', 'páginas')} · ${P.mb(bytes.length)}. El documento original no cambia.` };
        });
      };
    });
  };

  // ---------- Recortar (márgenes tal como se ven las páginas) ----------
  D.crop = async (ids) => {
    const list = S.pages.filter((p) => ids.includes(p.id));
    const first = list[0];
    if (!first) return;
    const baseRot = async (p) => { const info = P.thumbInfo(p); if (info) return info.rot; const pg = await P.getPage(p); return pg.rotate; };
    const R0 = (await baseRot(first) + first.rot) % 360;
    const shown = first.crop ? P.rotInsets(first.crop, R0) : { t: 5, r: 5, b: 5, l: 5 };
    const num = (id, label, v) => `<label class="field">${label}<input type="number" id="${id}" min="0" max="40" step="1" value="${Math.round(v)}" inputmode="numeric"></label>`;
    D.open(`${head('crop', 'Recortar márgenes', `Se aplica a ${plural(list.length, 'página', 'páginas')}`)}
      <div class="prev-grid">
        <div id="cropPrev"></div>
        <div class="fields-2">${num('cT', 'Arriba (%)', shown.t)}${num('cB', 'Abajo (%)', shown.b)}${num('cL', 'Izquierda (%)', shown.l)}${num('cR', 'Derecha (%)', shown.r)}</div>
      </div>
      <p class="opt-desc" style="margin:0">Se guarda como recuadro de recorte: el contenido no se borra y el recorte se puede quitar después.</p>
      <div class="dlg-foot">
        ${list.some((p) => p.crop) ? '<button type="button" class="a-btn" id="cropRemove" style="margin-right:auto">Quitar recorte</button>' : ''}
        <button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="cropGo">Aplicar</button></div>`,
    (d) => {
      const read = () => {
        const v = (id) => Math.max(0, Math.min(40, Number(d.querySelector('#' + id).value) || 0));
        const c = { t: v('cT'), r: v('cR'), b: v('cB'), l: v('cL') };
        if (c.t + c.b > 90) c.b = 90 - c.t;
        if (c.l + c.r > 90) c.r = 90 - c.l;
        return c;
      };
      const draw = () => { d.querySelector('#cropPrev').innerHTML = preview({ ...first, crop: P.rotInsets(read(), 360 - R0) }); };
      d.addEventListener('input', draw);
      draw();
      d.querySelector('#cropGo').onclick = async () => {
        const shownCrop = read();
        const empty = !shownCrop.t && !shownCrop.r && !shownCrop.b && !shownCrop.l;
        const rots = await Promise.all(list.map(baseRot));
        P.commit(() => list.forEach((p, k) => {
          const page = P.pageById(p.id);
          if (page) page.crop = empty ? null : P.rotInsets(shownCrop, 360 - ((rots[k] + page.rot) % 360));
        }));
        D.close();
        P.toast(empty ? 'Recorte quitado.' : `Recorte aplicado a ${plural(list.length, 'página', 'páginas')}.`, 'Deshacer', P.undo);
      };
      const rm = d.querySelector('#cropRemove');
      if (rm) rm.onclick = () => {
        P.commit(() => list.forEach((p) => { const page = P.pageById(p.id); if (page) page.crop = null; }));
        D.close();
        P.toast('Recorte quitado.', 'Deshacer', P.undo);
      };
    });
  };

  // ---------- Dividir ----------
  const parseRanges = (txt, max) => {
    const parts = txt.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return null;
    const out = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2] || m[1]);
      if (a < 1 || b > max || a > b) return null;
      out.push([a, b]);
    }
    return out;
  };
  D.split = () => {
    const N = S.pages.length;
    if (!N) { P.toast('No hay páginas para dividir.'); return; }
    const half = Math.max(1, Math.floor(N / 2));
    const inputStyle = 'margin:-4px 0 4px 48px';
    D.open(`${head('split', 'Dividir PDF', `${plural(N, 'página', 'páginas')} en total`)}
      <div style="display:flex;flex-direction:column;gap:10px">
        ${opt('sp', 'ranges', 'Por rangos', 'Separa los rangos con comas.', true)}
        <input type="text" class="inline-input" id="spRanges" data-for="ranges" value="1-${half}${N > 1 ? `, ${half + 1}-${N}` : ''}" aria-label="Rangos de páginas" style="${inputStyle}" autocomplete="off">
        ${opt('sp', 'every', 'Cada N páginas', '', false)}
        <input type="number" class="inline-input" id="spEvery" data-for="every" value="2" min="1" aria-label="Número de páginas por archivo" style="${inputStyle};width:110px">
        ${opt('sp', 'each', 'Una página por archivo', `Se crean ${N} archivos.`, false)}
      </div>
      <div><div class="insp-label">Resultado</div><div class="chips-out" id="spOut"></div><p class="err" id="spErr" hidden></p></div>
      <div class="result" hidden></div>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="spGo">Dividir</button></div>`,
    (d) => {
      let groups = [];
      const calc = () => {
        const mode = picked(d, 'sp');
        const err = d.querySelector('#spErr');
        err.hidden = true;
        if (mode === 'ranges') {
          const r = parseRanges(d.querySelector('#spRanges').value, N);
          if (!r) { groups = []; err.hidden = false; err.textContent = `Revisa los rangos: usa números del 1 al ${N}, por ejemplo 1-3, 5, 7-${N}.`; } else groups = r;
        } else if (mode === 'every') {
          const k = Math.max(1, Math.floor(Number(d.querySelector('#spEvery').value) || 1));
          groups = [];
          for (let a = 1; a <= N; a += k) groups.push([a, Math.min(N, a + k - 1)]);
        } else {
          groups = Array.from({ length: N }, (_, i) => [i + 1, i + 1]);
        }
        d.querySelector('#spOut').innerHTML = groups.slice(0, 12).map(([a, b], i) => `<span>parte-${i + 1} · ${a === b ? `pág. ${a}` : `págs. ${a}–${b}`}</span>`).join('') + (groups.length > 12 ? `<span>y ${groups.length - 12} más</span>` : '');
        const go = d.querySelector('#spGo');
        go.disabled = !groups.length;
        go.textContent = groups.length ? `Dividir en ${plural(groups.length, 'archivo', 'archivos')}` : 'Dividir';
      };
      d.addEventListener('input', calc);
      d.addEventListener('picked', calc);
      d.querySelectorAll('[data-for]').forEach((inp) => inp.addEventListener('focus', () => {
        d.querySelectorAll('[data-group="sp"]').forEach((x) => x.setAttribute('aria-checked', String(x.dataset.value === inp.dataset.for)));
        calc();
      }));
      calc();
      d.querySelector('#spGo').onclick = () => {
        const parts = groups.map(([a, b]) => S.pages.slice(a - 1, b));
        const base = D.defaultName().replace(/(-editado)?\.pdf$/i, '');
        D.process(d, 'Dividiendo…', async (progress) => {
          const blob = await P.makeZip(parts, base, progress);
          return { blob, name: base + '-partes.zip', title: esc(base + '-partes.zip'), detail: `${plural(parts.length, 'PDF', 'PDF')} dentro del .zip · ${P.mb(blob.size)}.` };
        });
      };
    });
  };

  // ---------- Marca de agua ----------
  D.watermark = () => {
    const wm = S.fx.wm || { text: 'CONFIDENCIAL', opacity: 0.2, rot: -32 };
    const sample = S.pages[0];
    if (!sample) { P.toast('Primero carga un PDF.'); return; }
    D.open(`${head('drop', 'Marca de agua', `Se añade a las ${plural(S.pages.length, 'página', 'páginas')} al exportar`)}
      <div class="prev-grid">
        <div id="wmPrev"></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <label class="field">Texto<input type="text" id="wmText" value="${esc(wm.text)}" maxlength="30" autocomplete="off"></label>
          <label class="field">Opacidad<input type="range" id="wmOp" min="5" max="60" value="${Math.round(wm.opacity * 100)}"></label>
          <label class="field">Orientación<select id="wmRot">
            <option value="0" ${wm.rot === 0 ? 'selected' : ''}>Horizontal</option>
            <option value="-32" ${wm.rot === -32 ? 'selected' : ''}>Diagonal suave</option>
            <option value="-45" ${wm.rot === -45 ? 'selected' : ''}>Diagonal 45°</option></select></label>
        </div>
      </div>
      <div class="dlg-foot">
        ${S.fx.wm ? '<button type="button" class="a-btn" id="wmRemove" style="margin-right:auto">Quitar marca</button>' : ''}
        <button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="wmGo">Aplicar</button></div>`,
    (d) => {
      const read = () => ({ text: d.querySelector('#wmText').value.trim() || 'CONFIDENCIAL', opacity: Number(d.querySelector('#wmOp').value) / 100, rot: Number(d.querySelector('#wmRot').value) });
      const draw = () => {
        const w = read();
        d.querySelector('#wmPrev').innerHTML = preview(sample, `<span class="wm"><span style="transform: rotate(${w.rot}deg); opacity: ${w.opacity}; font-size: 15px">${esc(w.text)}</span></span>`);
      };
      d.addEventListener('input', draw);
      d.addEventListener('change', draw);
      draw();
      d.querySelector('#wmGo').onclick = () => { const v = read(); P.commit(() => { S.fx.wm = v; }); S.showFx = true; P.savePrefs(); D.close(); P.toast('Marca de agua aplicada. Se incluirá al exportar.', 'Deshacer', P.undo); };
      const rm = d.querySelector('#wmRemove');
      if (rm) rm.onclick = () => { P.commit(() => { S.fx.wm = null; }); D.close(); P.toast('Marca de agua quitada.', 'Deshacer', P.undo); };
    });
  };

  // ---------- Números de página ----------
  D.numbers = () => {
    const cur = S.fx.num || { format: 'n de N', pos: 'bc' };
    const sample = S.pages[0];
    if (!sample) { P.toast('Primero carga un PDF.'); return; }
    const N = S.pages.length;
    const POS = [['tl', 'Arriba a la izquierda'], ['tc', 'Arriba en el centro'], ['tr', 'Arriba a la derecha'], ['bl', 'Abajo a la izquierda'], ['bc', 'Abajo en el centro'], ['br', 'Abajo a la derecha']];
    D.open(`${head('hash', 'Números de página', 'Se añaden al exportar')}
      <div class="prev-grid">
        <div id="nPrev"></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <label class="field">Formato<select id="nFmt">
            ${['n', 'n/N', 'n de N', 'Página n'].map((f) => `<option value="${f}" ${f === cur.format ? 'selected' : ''}>${P.numLabel(f, 1, N)}</option>`).join('')}
          </select></label>
          <div class="field">Posición<div class="pos-grid" id="nPos">${POS.map(([v, l]) => `<button type="button" data-pos="${v}" aria-label="${l}" aria-pressed="${v === cur.pos}"></button>`).join('')}</div></div>
        </div>
      </div>
      <div class="dlg-foot">
        ${S.fx.num ? '<button type="button" class="a-btn" id="nRemove" style="margin-right:auto">Quitar numeración</button>' : ''}
        <button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="nGo">Aplicar</button></div>`,
    (d) => {
      let pos = cur.pos;
      const draw = () => {
        const label = P.numLabel(d.querySelector('#nFmt').value, 1, N);
        const v = pos[0] === 't' ? 'top: 5%; bottom: auto;' : '';
        const h = pos[1] === 'l' ? 'left' : pos[1] === 'r' ? 'right' : 'center';
        d.querySelector('#nPrev').innerHTML = preview(sample, `<span class="pnum" style="${v} text-align:${h}">${esc(label)}</span>`);
        d.querySelectorAll('#nPos button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pos === pos)));
      };
      d.querySelector('#nPos').addEventListener('click', (e) => { const b = e.target.closest('[data-pos]'); if (b) { pos = b.dataset.pos; draw(); } });
      d.addEventListener('change', draw);
      draw();
      d.querySelector('#nGo').onclick = () => { const v = { format: d.querySelector('#nFmt').value, pos }; P.commit(() => { S.fx.num = v; }); S.showFx = true; P.savePrefs(); D.close(); P.toast('Numeración aplicada. Se incluirá al exportar.', 'Deshacer', P.undo); };
      const rm = d.querySelector('#nRemove');
      if (rm) rm.onclick = () => { P.commit(() => { S.fx.num = null; }); D.close(); P.toast('Numeración quitada.', 'Deshacer', P.undo); };
    });
  };

  // ---------- Comprimir ----------
  const levelOpts = (group, current) =>
    opt(group, 'low', 'Baja <span class="tag">Conserva el texto</span>', 'Optimiza la estructura del archivo, sin tocar las imágenes.', current === 'low') +
    opt(group, 'rec', 'Recomendada <span class="tag">Conserva el texto</span>', 'Recomprime fotos y páginas escaneadas a menor resolución.', current === 'rec') +
    opt(group, 'max', 'Extrema', 'Convierte cada página en imagen. Máxima reducción.', current === 'max', `<span class="warn">${icon('warn', 16, 2)}El texto deja de ser seleccionable</span>`);
  D.compress = () => {
    if (!S.pages.length) { P.toast('Primero carga un PDF.'); return; }
    const files = new Set(S.pages.map((p) => p.src)).size;
    D.open(`${head('compress', 'Comprimir PDF', `${plural(files, 'archivo', 'archivos')} · ${plural(S.pages.length, 'página', 'páginas')}`)}
      <div style="display:flex;flex-direction:column;gap:10px">${levelOpts('lvl', 'rec')}</div>
      <label class="field">Nombre del archivo<input type="text" id="cName" value="${esc(D.defaultName().replace(/(-editado)?\.pdf$/i, '-comprimido.pdf'))}" autocomplete="off"></label>
      <div class="result" hidden></div>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="cGo">Comprimir</button></div>`,
    (d) => {
      d.querySelector('#cGo').onclick = () => {
        const level = picked(d, 'lvl');
        const name = pdfName(d.querySelector('#cName').value, 'documento-comprimido.pdf');
        D.process(d, 'Comprimiendo…', async (progress) => {
          const built = await P.buildPdf(S.pages, { onProgress: (f) => progress(f * 0.4) });
          const before = built.bytes.length;
          const bytes = await P.compressPdf(built.bytes, level, (f) => progress(0.4 + f * 0.6));
          const pct = Math.max(0, Math.round((1 - bytes.length / before) * 100));
          const detail = pct === 0
            ? 'No se pudo reducir más: se conserva el archivo sin recomprimir.'
            : level === 'max' ? 'Cada página es ahora una imagen: el texto ya no se puede seleccionar ni buscar.' : 'El texto sigue siendo seleccionable.';
          return { blob: pdfBlob(bytes), name, title: `${P.mb(before)} → ${P.mb(bytes.length)} <span class="tag">−${pct} %</span>`, detail };
        });
      };
    });
  };

  // ---------- Exportar ----------
  D.exportPdf = () => {
    if (!S.pages.length) { P.toast('No hay páginas para exportar.'); return; }
    const n = S.sel.size;
    const annots = S.pages.reduce((a, p) => a + p.annots.length, 0);
    const extras = [S.fx.wm && 'marca de agua', S.fx.num && 'numeración', annots && plural(annots, 'anotación', 'anotaciones'), S.pages.some((p) => p.crop) && 'recortes'].filter(Boolean);
    D.open(`${head('share', 'Exportar PDF', extras.length ? `Incluye ${extras.join(', ')}` : 'Conserva el texto y la calidad del original')}
      <label class="field">Nombre del archivo<input type="text" id="xName" value="${esc(D.defaultName())}" autocomplete="off"></label>
      ${n ? `<div><div class="insp-label">Páginas</div><div style="display:flex;flex-direction:column;gap:10px">
        ${opt('pg', 'all', `Todas (${S.pages.length})`, '', true)}${opt('pg', 'sel', `Solo la selección (${n})`, '', false)}</div></div>` : ''}
      <label class="field">Tamaño del archivo<select id="xSize">
        <option value="none">Sin comprimir</option><option value="rec">Compresión recomendada (conserva el texto)</option><option value="max">Compresión extrema (pierde el texto)</option>
      </select></label>
      <div class="result" hidden></div>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="xGo">Exportar</button></div>`,
    (d) => {
      d.querySelector('#xGo').onclick = () => {
        const name = pdfName(d.querySelector('#xName').value, 'documento-editado.pdf');
        const list = picked(d, 'pg') === 'sel' ? P.selPages() : S.pages.slice();
        const level = d.querySelector('#xSize').value;
        D.process(d, 'Generando el PDF…', async (progress) => {
          const { bytes, rasterNote } = await P.makePdf(list, { level, onProgress: progress, title: name.replace(/\.pdf$/i, '') });
          const note = rasterNote ? ' Algunas páginas venían de un PDF protegido y se guardaron como imagen.' : '';
          return { blob: pdfBlob(bytes), name, title: esc(name), detail: `${plural(list.length, 'página', 'páginas')} · ${P.mb(bytes.length)}.${note}` };
        });
      };
    });
  };

  // ---------- Confirmaciones ----------
  D.confirmClose = () => {
    D.open(`${head('trash', 'Cerrar todos los PDF', 'Se quitan las páginas y se borra la sesión guardada en este dispositivo')}
      <p class="opt-desc" style="margin:0">Exporta antes lo que quieras conservar. Esta acción no se puede deshacer.</p>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cancelar</button><button type="button" class="a-btn a-primary" id="clGo">Cerrar todo</button></div>`,
    (d) => { d.querySelector('#clGo').onclick = async () => { D.close(); await P.closeAll(); P.toast('Se cerraron todos los PDF.'); }; });
  };
  D.restore = (saved) => {
    const n = saved.data.pages.length;
    D.open(`${head('layers', 'Recuperar el trabajo anterior', `${plural(n, 'página', 'páginas')} de la última sesión`)}
      <p class="opt-desc" style="margin:0">La app guarda tu trabajo en este dispositivo para que no se pierda si se cierra.</p>
      <div class="dlg-foot"><button type="button" class="a-btn" id="rsNo">Empezar de cero</button><button type="button" class="a-btn a-primary" id="rsYes">Recuperar</button></div>`,
    (d) => {
      d.querySelector('#rsYes').onclick = async () => { D.close(); P.toast('Recuperando…', null, null, 30000); await P.restoreSession(saved); P.toast('Trabajo recuperado.'); };
      d.querySelector('#rsNo').onclick = async () => { D.close(); await P.session.clear(); };
    });
  };

  // ---------- Acerca de / instalar ----------
  D.about = () => {
    const installed = P.isStandalone();
    const ios = P.isIOS && !installed;
    D.open(`${head('file', 'EditPDF', 'Edita, ordena y comprime PDF en el navegador')}
      <p class="opt-desc" style="margin:0;font-size:14px">Los archivos se procesan en tu dispositivo y no se suben a ningún servidor. Después de la primera visita, la app funciona sin conexión.</p>
      <div class="result">
        <div class="result-row">${installed ? 'App instalada' : 'Instalar como app'}</div>
        ${installed ? '<span class="opt-desc">Ya la estás usando desde la pantalla de inicio.</span>'
          : ios ? '<span class="opt-desc">En Safari, toca <b>Compartir</b> y luego <b>Añadir a pantalla de inicio</b>.</span>'
            : P.installPrompt ? '<span class="opt-desc">Instálala para abrirla en su propia ventana y usarla sin conexión.</span>'
              : '<span class="opt-desc">En Chrome o Edge, usa el icono de instalar de la barra de direcciones. En iPad o iPhone, abre la página en Safari.</span>'}
      </div>
      <p class="opt-desc" style="margin:0">Usa PDF.js, pdf-lib, JSZip y SortableJS (licencias Apache 2.0 y MIT). Versión 1.0.</p>
      <div class="dlg-foot"><button type="button" class="a-btn" data-close>Cerrar</button>${!installed && P.installPrompt ? '<button type="button" class="a-btn a-primary" id="aInstall">Instalar</button>' : ''}</div>`,
    (d) => {
      const b = d.querySelector('#aInstall');
      if (b) b.onclick = async () => {
        const evt = P.installPrompt;
        P.installPrompt = null;
        D.close();
        evt.prompt();
        await evt.userChoice.catch(() => {});
      };
    });
  };
})();
