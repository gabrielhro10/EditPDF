// Compresión en el navegador (sin servidor).
//  - 'rec' (recomendada): recomprime las imágenes JPEG incrustadas; el texto y los vectores no cambian.
//  - 'max' (extrema): convierte cada página en imagen JPEG; el texto deja de ser seleccionable.
// Si el resultado no es menor que el original, se devuelve el original.
(() => {
  const MAX_SIDE = 1600;   // ~150 ppp en una hoja carta
  const JPEG_QUALITY = 0.65;
  const MIN_BYTES = 40 * 1024;

  P.compressPdf = async (bytes, level, onProgress) => {
    if (level === 'rec') return recompressImages(bytes, onProgress);
    if (level === 'max') return rasterizeAll(bytes, onProgress);
    return bytes;
  };

  const canvasToBytes = async (canvas, quality) => {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  };

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
    const w = get('Width'), h = get('Height');
    if (!(w instanceof PDFNumber) || !(h instanceof PDFNumber)) return null;
    return { gray, width: w.asNumber(), height: h.asNumber() };
  }

  async function reencode(stream, info, context) {
    const { PDFName, PDFNumber, PDFRawStream } = PDFLib;
    const bmp = await createImageBitmap(new Blob([stream.contents], { type: 'image/jpeg' }));
    // Si el navegador aplicó una orientación EXIF, las medidas no coinciden: se deja la imagen como está.
    if (bmp.width !== info.width || bmp.height !== info.height) { bmp.close(); return null; }
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const data = await canvasToBytes(canvas, JPEG_QUALITY);
    canvas.width = 0; canvas.height = 0;
    if (!data || data.length >= stream.contents.length * 0.9) return null;
    const dict = stream.dict.clone(context);
    dict.set(PDFName.of('Width'), PDFNumber.of(w));
    dict.set(PDFName.of('Height'), PDFNumber.of(h));
    dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.delete(PDFName.of('DecodeParms'));
    if (info.gray) dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
    return PDFRawStream.of(dict, data);
  }

  async function recompressImages(bytes, onProgress) {
    const { PDFDocument, PDFRawStream } = PDFLib;
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const context = doc.context;
    const jobs = [];
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFRawStream)) continue;
      const info = jpegInfo(obj, context);
      if (info) jobs.push([ref, obj, info]);
    }
    // Una imagen cada vez para no agotar la memoria en iPad.
    for (let i = 0; i < jobs.length; i++) {
      const [ref, stream, info] = jobs[i];
      try {
        const replacement = await reencode(stream, info, context);
        if (replacement) context.assign(ref, replacement);
      } catch (e) { /* se conserva la imagen original */ }
      if (onProgress) onProgress((i + 1) / jobs.length);
    }
    const result = await doc.save({ useObjectStreams: true });
    return result.length < bytes.length ? result : bytes;
  }

  async function rasterizeAll(bytes, onProgress) {
    const { PDFDocument } = PDFLib;
    const src = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const out = await PDFDocument.create();
    try {
      for (let i = 1; i <= src.numPages; i++) {
        const page = await src.getPage(i);
        const vp1 = page.getViewport({ scale: 1 });
        // ~110 ppp, con un tope de píxeles para no superar el límite de lienzo de iOS.
        const scale = Math.min(110 / 72, Math.sqrt(9e6 / (vp1.width * vp1.height)));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(vp.width);
        canvas.height = Math.ceil(vp.height);
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const data = await canvasToBytes(canvas, 0.5);
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
        const img = await out.embedJpg(data);
        out.addPage([vp1.width, vp1.height]).drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
        if (onProgress) onProgress(i / src.numPages);
      }
    } finally {
      src.destroy();
    }
    out.setProducer('EditPDF');
    out.setCreator('EditPDF');
    const result = await out.save({ useObjectStreams: true });
    return result.length < bytes.length ? result : bytes;
  }
})();
