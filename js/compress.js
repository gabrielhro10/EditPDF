// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
// Compresión en el navegador (sin servidor). Ningún nivel toca el texto ni los vectores:
// siguen nítidos y seleccionables. Solo se optimizan las imágenes y los datos que no se ven.
//  - 'lossless' (sin pérdida): quita miniaturas incrustadas y datos de edición ocultos, une
//    streams idénticos (imágenes o fuentes repetidas al unir PDF) y descarta objetos huérfanos.
//  - 'rec' (recomendada): además, reduce a 200 ppp las imágenes JPEG que pasan de esa resolución
//    y recodifica al 85 % las que vienen casi sin comprimir. Las que ya están bien no se tocan.
//  - 'max' (máxima): igual, con imágenes a 120 ppp y calidad 72 %.
// Si el resultado no es menor que el original, se devuelve el original.
(() => {
  const LEVELS = {
    lossless: null,
    rec: { dpi: 200, quality: 0.85, bpp: 1.2 },
    max: { dpi: 120, quality: 0.72, bpp: 0.6 }
  };
  const MIN_BYTES = 30 * 1024;
  const MAX_CANVAS = 16e6; // área máxima de un lienzo en iOS (~16,7 Mpx)

  P.compressPdf = async (bytes, level, onProgress) => {
    const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
    stripHidden(doc);
    dedupeStreams(doc);
    const cfg = LEVELS[level];
    if (cfg) await recompressImages(doc, cfg, onProgress);
    collectGarbage(doc);
    if (onProgress) onProgress(1);
    const out = await doc.save({ useObjectStreams: true });
    return out.length < bytes.length ? out : bytes;
  };

  // ---------- Sin pérdida ----------
  // Miniaturas de página (/Thumb) y datos privados de apps de diseño (/PieceInfo, /Metadata en XObjects).
  function stripHidden(doc) {
    const { PDFName, PDFDict, PDFStream } = PDFLib;
    const pageKeys = ['PieceInfo', 'Thumb', 'LastModified'].map((k) => PDFName.of(k));
    doc.getPages().forEach((p) => pageKeys.forEach((k) => p.node.delete(k)));
    const IMAGE = PDFName.of('Image');
    const FORM = PDFName.of('Form');
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null;
      if (!dict) continue;
      const sub = dict.get(PDFName.of('Subtype'));
      if (sub === IMAGE || sub === FORM) {
        dict.delete(PDFName.of('Metadata'));
        dict.delete(PDFName.of('PieceInfo'));
      }
    }
  }

  // FNV-1a de 32 bits: basta como primera criba; los iguales se confirman byte a byte.
  const fnv = (bytes) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  };
  const sameBytes = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  // Une streams idénticos (mismo contenido y mismo diccionario): las referencias apuntan al primero.
  function dedupeStreams(doc) {
    const { PDFRawStream, PDFRef, PDFDict, PDFArray, PDFStream, PDFName } = PDFLib;
    const ctx = doc.context;
    const LENGTH = PDFName.of('Length');
    const groups = new Map();
    const replace = new Map();
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const dictKey = obj.dict.entries().filter(([k]) => k !== LENGTH).map(([k, v]) => `${k}${v}`).join('');
      const key = `${obj.contents.length}:${fnv(obj.contents)}:${dictKey}`;
      const list = groups.get(key);
      if (!list) { groups.set(key, [[ref, obj]]); continue; }
      const same = list.find(([, o]) => sameBytes(o.contents, obj.contents));
      if (same) replace.set(ref.tag, same[0]); else list.push([ref, obj]);
    }
    if (!replace.size) return;
    const swap = (v) => (v instanceof PDFRef && replace.has(v.tag) ? replace.get(v.tag) : v);
    const fixAny = (v) => {
      if (v instanceof PDFDict) {
        for (const [k, val] of v.entries()) { const n = swap(val); if (n !== val) v.set(k, n); else fixAny(val); }
      } else if (v instanceof PDFArray) {
        for (let i = 0; i < v.size(); i++) { const val = v.get(i); const n = swap(val); if (n !== val) v.set(i, n); else fixAny(val); }
      }
    };
    for (const [, obj] of ctx.enumerateIndirectObjects()) fixAny(obj instanceof PDFStream ? obj.dict : obj);
  }

  // Borra los objetos a los que ya nada hace referencia (pdf-lib los escribiría igualmente).
  function collectGarbage(doc) {
    const { PDFRef, PDFDict, PDFArray, PDFStream } = PDFLib;
    const ctx = doc.context;
    const seen = new Set();
    const stack = [ctx.trailerInfo.Root, ctx.trailerInfo.Info, ctx.trailerInfo.Encrypt].filter(Boolean);
    while (stack.length) {
      const v = stack.pop();
      if (v instanceof PDFRef) {
        if (seen.has(v.tag)) continue;
        seen.add(v.tag);
        const target = ctx.lookup(v);
        if (target) stack.push(target);
      } else if (v instanceof PDFStream) stack.push(v.dict);
      else if (v instanceof PDFDict) v.entries().forEach(([, val]) => stack.push(val));
      else if (v instanceof PDFArray) for (let i = 0; i < v.size(); i++) stack.push(v.get(i));
    }
    for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) ctx.delete(ref);
  }

  // ---------- Imágenes ----------
  // ¿Es una imagen JPEG RGB o en grises de 8 bits que el navegador sabe decodificar sin sorpresas?
  function jpegInfo(stream, context) {
    const { PDFName, PDFArray, PDFNumber, PDFRef, PDFRawStream, PDFBool } = PDFLib;
    const d = stream.dict;
    const get = (k) => { const v = d.get(PDFName.of(k)); return v instanceof PDFRef ? context.lookup(v) : v; };
    if (get('Subtype') !== PDFName.of('Image')) return null;
    let filter = get('Filter');
    if (filter instanceof PDFArray) filter = filter.size() === 1 ? filter.get(0) : null;
    if (filter !== PDFName.of('DCTDecode')) return null;
    if (get('Decode') || get('SMaskInData') || get('ImageMask') === PDFBool.True) return null;
    const bpc = get('BitsPerComponent');
    if (!(bpc instanceof PDFNumber) || bpc.asNumber() !== 8) return null;
    const cs = get('ColorSpace');
    let gray = false;
    if (cs === PDFName.of('DeviceGray')) gray = true;
    else if (cs instanceof PDFArray && cs.get(0) === PDFName.of('ICCBased')) {
      const icc = context.lookup(cs.get(1));
      const n = icc instanceof PDFRawStream ? icc.dict.get(PDFName.of('N')) : null;
      if (!(n instanceof PDFNumber) || n.asNumber() !== 3) return null;
    } else if (cs !== PDFName.of('DeviceRGB')) return null;
    if (stream.contents.length < MIN_BYTES) return null;
    const w = get('Width');
    const h = get('Height');
    if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) return null;
    return { gray, width: w.asNumber(), height: h.asNumber() };
  }

  async function recompressImages(doc, cfg, onProgress) {
    const { PDFRawStream } = PDFLib;
    const ctx = doc.context;
    // Tope en píxeles: el lado mayor de la página más grande a la resolución elegida. Una imagen
    // nunca se ve más grande que la página, así que por debajo de ese tope no se pierde detalle visible.
    const maxSideIn = Math.max(...doc.getPages().map((p) => { const { width, height } = p.getSize(); return Math.max(width, height); })) / 72;
    const capPx = Math.round(maxSideIn * cfg.dpi);
    const jobs = [];
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const info = jpegInfo(obj, ctx);
      if (!info) continue;
      const longest = Math.max(info.width, info.height);
      const bpp = (obj.contents.length * 8) / (info.width * info.height);
      const scale = longest > capPx * 1.05 ? capPx / longest : 1;
      // Ya tiene la resolución justa y está bien comprimida: se deja tal cual (recomprimir solo añadiría pérdida).
      if (scale === 1 && bpp <= cfg.bpp) continue;
      jobs.push({ ref, stream: obj, info, scale });
    }
    // Una imagen cada vez para no agotar la memoria en iPad.
    for (let i = 0; i < jobs.length; i++) {
      try {
        const replacement = await reencode(jobs[i], cfg.quality, ctx);
        if (replacement) ctx.assign(jobs[i].ref, replacement);
      } catch (e) { /* se conserva la imagen original */ }
      if (onProgress) onProgress(((i + 1) / jobs.length) * 0.95);
    }
  }

  const canvasToBytes = async (canvas, quality) => {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  };
  const makeCanvas = (w, h) => {
    if (w * h > MAX_CANVAS) throw new Error('Imagen demasiado grande para el lienzo');
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { alpha: false });
    if (!g) throw new Error('Sin memoria para el lienzo');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    return [c, g];
  };
  const free = (c) => { if (c && c.getContext) { c.width = 0; c.height = 0; } };

  async function reencode({ stream, info, scale }, quality, context) {
    const { PDFName, PDFNumber, PDFRawStream } = PDFLib;
    const bmp = await createImageBitmap(new Blob([stream.contents], { type: 'image/jpeg' }));
    try {
      // Si el navegador aplicó una orientación EXIF, las medidas no coinciden: se deja la imagen como está.
      if (bmp.width !== info.width || bmp.height !== info.height) return null;
      const tw = Math.max(1, Math.round(bmp.width * scale));
      const th = Math.max(1, Math.round(bmp.height * scale));
      // Reducción por mitades y suavizado de alta calidad: más nítido que un único salto grande.
      let src = bmp;
      let sw = bmp.width;
      let sh = bmp.height;
      while (sw >= tw * 2 && sh >= th * 2) {
        let nw = Math.round(sw / 2);
        let nh = Math.round(sh / 2);
        if (nw * nh > MAX_CANVAS) { const k = Math.sqrt(MAX_CANVAS / (nw * nh)); nw = Math.floor(nw * k); nh = Math.floor(nh * k); }
        const [c, g] = makeCanvas(nw, nh);
        g.drawImage(src, 0, 0, nw, nh);
        if (src !== bmp) free(src);
        src = c;
        sw = nw;
        sh = nh;
      }
      const [out, g] = makeCanvas(tw, th);
      g.drawImage(src, 0, 0, tw, th);
      if (src !== bmp) free(src);
      const data = await canvasToBytes(out, quality);
      free(out);
      if (!data || data.length > stream.contents.length * 0.9) return null;
      const dict = stream.dict.clone(context);
      dict.set(PDFName.of('Width'), PDFNumber.of(tw));
      dict.set(PDFName.of('Height'), PDFNumber.of(th));
      dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      dict.delete(PDFName.of('DecodeParms'));
      if (info.gray) dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      return PDFRawStream.of(dict, data);
    } finally {
      bmp.close();
    }
  }
})();
