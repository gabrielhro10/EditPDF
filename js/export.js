// Generación del PDF con pdf-lib: copia las páginas reales (conserva texto, vectores y enlaces),
// aplica giro, recorte, marca de agua, numeración y anotaciones. También dividir y entregar.
(() => {
  const S = P.state;

  const hexToRgb = (hex) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const norm = (deg) => (((deg % 360) + 360) % 360);
  // Punto en la página tal como se ve (u a la derecha, v hacia abajo, 0..1) -> marco sin girar (s, t).
  const unrot = (u, v, R) => (R === 90 ? [v, 1 - u] : R === 180 ? [1 - u, 1 - v] : R === 270 ? [1 - v, u] : [u, v]);
  const toUser = (box, s, t) => [box.x + s * box.width, box.y + (1 - t) * box.height];

  P.numLabel = (fmt, n, total) => (fmt === 'n' ? `${n}` : fmt === 'n/N' ? `${n}/${total}` : fmt === 'Página n' ? `Página ${n}` : `${n} de ${total}`);

  // Texto con fuente estándar; si tiene caracteres fuera de WinAnsi (emoji, otros alfabetos) se dibuja como imagen.
  async function drawTextSafe(out, page, font, text, { x, y, size, color, rotate = 0, opacity = 1 }) {
    const { rgb, degrees } = PDFLib;
    try {
      font.encodeText(text);
      page.drawText(text, { x, y, size, font, color: rgb(...color), rotate: degrees(rotate), opacity });
    } catch (e) {
      const px = 4;
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d');
      ctx.font = `bold ${size * px}px -apple-system, system-ui, sans-serif`;
      const w = Math.ceil(ctx.measureText(text).width) + 4;
      c.width = w;
      c.height = Math.ceil(size * px * 1.3);
      ctx.font = `bold ${size * px}px -apple-system, system-ui, sans-serif`;
      ctx.fillStyle = `rgb(${color.map((v) => Math.round(v * 255)).join(',')})`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, 2, size * px);
      const png = await out.embedPng(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
      const h = c.height / px;
      // La imagen se apoya en la línea base: se baja lo que ocupa el descendente.
      const a = (rotate * Math.PI) / 180;
      const dy = h - size;
      page.drawImage(png, { x: x + dy * Math.sin(a), y: y - dy * Math.cos(a), width: c.width / px, height: h, rotate: degrees(rotate), opacity });
    }
  }

  function strokePath(page, pts, color, width, toOut) {
    const O = PDFLib;
    if (!pts || pts.length < 2) return;
    const ops = [O.pushGraphicsState(), O.setStrokingRgbColor(...hexToRgb(color)), O.setLineWidth(width),
      O.setLineCap(O.LineCapStyle.Round), O.setLineJoin(O.LineJoinStyle.Round)];
    pts.forEach(([x, y], k) => { const [ox, oy] = toOut(x, y); ops.push(k ? O.lineTo(ox, oy) : O.moveTo(ox, oy)); });
    ops.push(O.stroke(), O.popGraphicsState());
    page.pushOperators(...ops);
  }

  // Página convertida en imagen (para PDF cifrados que pdf-lib no puede copiar).
  async function rasterPage(out, p) {
    const src = S.sources.get(p.src);
    const page = await src.doc.getPage(p.index + 1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: 150 / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    canvas.width = 0; canvas.height = 0;
    const img = await out.embedJpg(await blob.arrayBuffer());
    const pg = out.addPage([vp1.width, vp1.height]);
    pg.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
    const baseRot = page.rotate;
    page.cleanup();
    return {
      page: pg,
      baseRot,
      toOut: (x, y) => { const [vx, vy] = vp1.convertToViewportPoint(x, y); return [vx, vp1.height - vy]; },
      angleOffset: -baseRot
    };
  }

  // Construye un PDF con las páginas `list` (en ese orden). Devuelve Uint8Array.
  P.buildPdf = async (list, { effects = true, onProgress, title } = {}) => {
    const { PDFDocument, StandardFonts, degrees } = PDFLib;
    const out = await PDFDocument.create();
    const raster = new Set();
    const copied = new Map();
    let rasterNote = false;

    // Se copian juntas las páginas de cada archivo para compartir fuentes e imágenes.
    const bySrc = new Map();
    list.forEach((p) => { if (!bySrc.has(p.src)) bySrc.set(p.src, []); if (!bySrc.get(p.src).includes(p.index)) bySrc.get(p.src).push(p.index); });
    for (const [srcId, indices] of bySrc) {
      const src = S.sources.get(srcId);
      let doc;
      try {
        doc = await PDFDocument.load(src.bytes, { updateMetadata: false });
      } catch (e) {
        if (/encrypt/i.test(`${e.name} ${e.message}`)) { raster.add(srcId); rasterNote = true; continue; }
        throw e;
      }
      const pages = await out.copyPages(doc, indices);
      indices.forEach((ix, k) => copied.set(`${srcId}:${ix}`, pages[k]));
    }

    const font = await out.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await out.embedFont(StandardFonts.Helvetica);
    const images = new Map(); // cada imagen insertada se incrusta una sola vez
    const total = list.length;

    for (let i = 0; i < total; i++) {
      const p = list[i];
      let page;
      let toOut = (x, y) => [x, y];
      let angleOffset = 0;
      let cropFrame = p.crop;
      if (raster.has(p.src)) {
        const r = await rasterPage(out, p);
        page = r.page;
        toOut = r.toOut;
        angleOffset = r.angleOffset;
        if (p.crop) cropFrame = P.rotInsets(p.crop, r.baseRot);
      } else {
        page = out.addPage(copied.get(`${p.src}:${p.index}`));
      }
      const R = norm(page.getRotation().angle + p.rot);
      page.setRotation(degrees(R));

      if (cropFrame) {
        const cb = page.getCropBox();
        const c = cropFrame;
        page.setCropBox(cb.x + (c.l / 100) * cb.width, cb.y + (c.b / 100) * cb.height,
          cb.width * (1 - (c.l + c.r) / 100), cb.height * (1 - (c.t + c.b) / 100));
      }
      const box = page.getCropBox();
      const dw = R % 180 ? box.height : box.width;
      const dh = R % 180 ? box.width : box.height;

      // Anotaciones (guardadas en el espacio de usuario de la página original).
      for (const a of p.annots || []) {
        if (a.type === 'stroke') strokePath(page, a.pts, a.color, a.w, toOut);
        else if (a.type === 'sign') a.strokes.forEach((s) => strokePath(page, s, a.color, a.w, toOut));
        else if (a.type === 'text') {
          const [x, y] = toOut(a.x, a.y);
          await drawTextSafe(out, page, font, a.text, { x, y, size: a.size, color: hexToRgb(a.color), rotate: a.rot + angleOffset });
        } else if (a.type === 'image') {
          const asset = S.assets.get(a.asset);
          if (!asset) continue;
          let img = images.get(asset.id);
          if (!img) {
            img = asset.type === 'png' ? await out.embedPng(asset.bytes) : await out.embedJpg(asset.bytes);
            images.set(asset.id, img);
          }
          // Guardada por su centro; pdf-lib la coloca por la esquina inferior izquierda y gira sobre ella.
          const [cx, cy] = toOut(a.cx, a.cy);
          const ang = a.rot + angleOffset;
          const r = (ang * Math.PI) / 180;
          const x = cx - (a.w / 2) * Math.cos(r) + (a.h / 2) * Math.sin(r);
          const y = cy - (a.w / 2) * Math.sin(r) - (a.h / 2) * Math.cos(r);
          page.drawImage(img, { x, y, width: a.w, height: a.h, rotate: degrees(ang) });
        }
      }

      if (effects && S.fx.wm) {
        const wm = S.fx.wm;
        let size = Math.min(dw, dh) * 0.12;
        const tw = font.widthOfTextAtSize(wm.text, size);
        const limit = (wm.rot ? 0.85 * Math.hypot(dw, dh) : 0.85 * dw);
        if (tw > limit) size *= limit / tw;
        const w = font.widthOfTextAtSize(wm.text, size);
        const alpha = ((-wm.rot + R) * Math.PI) / 180;
        const hh = size * 0.35;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        const x = cx - ((w / 2) * Math.cos(alpha) - hh * Math.sin(alpha));
        const y = cy - ((w / 2) * Math.sin(alpha) + hh * Math.cos(alpha));
        await drawTextSafe(out, page, font, wm.text, { x, y, size, color: hexToRgb('#d62839'), rotate: -wm.rot + R, opacity: wm.opacity });
      }
      if (effects && S.fx.num) {
        const label = P.numLabel(S.fx.num.format, i + 1, total);
        const size = Math.max(8, Math.min(14, dw / 60));
        const w = fontReg.widthOfTextAtSize(label, size);
        const m = Math.max(18, Math.min(dw, dh) * 0.04);
        const pos = S.fx.num.pos;
        const px = pos[1] === 'l' ? m : pos[1] === 'r' ? dw - m - w : (dw - w) / 2;
        const py = pos[0] === 't' ? m + size : dh - m;
        const [s, t] = unrot(px / dw, py / dh, R);
        const [x, y] = toUser(box, s, t);
        await drawTextSafe(out, page, fontReg, label, { x, y, size, color: [0.35, 0.39, 0.46], rotate: R });
      }
      if (onProgress) onProgress((i + 1) / total);
    }

    out.setProducer('EditPDF');
    out.setCreator('EditPDF');
    if (title) out.setTitle(title);
    const bytes = await out.save({ useObjectStreams: true });
    return { bytes, rasterNote };
  };

  // Construye y, si se pide, comprime. level: 'none' | 'low' | 'rec' | 'max'.
  P.makePdf = async (list, { level = 'none', onProgress, title } = {}) => {
    const report = (f) => onProgress && onProgress(f);
    const heavy = level === 'rec' || level === 'max';
    const built = await P.buildPdf(list, { onProgress: (f) => report(heavy ? f * 0.4 : f), title });
    let bytes = built.bytes;
    if (heavy) bytes = await P.compressPdf(bytes, level, (f) => report(0.4 + f * 0.6));
    report(1);
    return { bytes, rasterNote: built.rasterNote };
  };

  // Varios PDF dentro de un .zip (dividir, o extraer una página por archivo).
  P.makeZip = async (groups, baseName, onProgress) => {
    const zip = new JSZip();
    for (let g = 0; g < groups.length; g++) {
      const { bytes } = await P.buildPdf(groups[g], { onProgress: (f) => onProgress && onProgress((g + f) / groups.length) });
      zip.file(`${baseName}-${String(g + 1).padStart(2, '0')}.pdf`, bytes);
    }
    return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  };

  // ---------- Entrega del archivo ----------
  P.deliver = {
    canShare(blob, name) {
      try {
        const file = new File([blob], name, { type: blob.type });
        return !!(navigator.canShare && navigator.canShare({ files: [file] }));
      } catch (e) { return false; }
    },
    // Debe llamarse dentro de un toque del usuario (iOS lo exige para la hoja Compartir).
    async share(blob, name) {
      const file = new File([blob], name, { type: blob.type });
      try {
        await navigator.share({ files: [file], title: name });
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        P.deliver.download(blob, name);
      }
    },
    download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari cancela la descarga si la URL se revoca enseguida.
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  };
})();
