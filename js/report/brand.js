/**
 * brand.js — Marca de la presentación (logo + colores). Una sola marca para toda la herramienta.
 *  - Puro y sin DOM salvo `readLogo` (canvas) y `applyStyle` (una hoja <style>): paleta, contraste y tonos se prueban con píxeles sueltos.
 *  - La marca solo cambia el aspecto de la presentación (color principal, acento, logo). No toca cifras ni textos de negocio.
 *  - Se guarda como una clave más del almacenamiento (`reportBrand`), así viaja con la sincronización de equipo que ya existe.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const MAX_W = 640, MAX_H = 320, MAX_BYTES = 2 * 1024 * 1024, MAX_STORED = 450000;   // tamaño final del logo guardado (caracteres de la URL de datos)
  const HEX = /^#[0-9a-f]{6}$/i;
  const FALLBACK_ACCENT = '#F2A33A';

  /* ---------- color ---------- */
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
  const lum = (h) => { const [r, g, b] = hex2rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  /** Contraste WCAG entre dos colores hex (1 a 21). */
  function contrast(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  const mix = (h, to, t) => { const a = hex2rgb(h), b = hex2rgb(to); return rgb2hex(a.map((v, i) => v + (b[i] - v) * t)); };
  /** Tono del color principal que se puede usar como TEXTO sobre blanco (≥ 4.5 : 1); si ya cumple, queda igual. */
  function textTone(h) { let c = h, i = 0; while (contrast(c, '#FFFFFF') < 4.5 && i++ < 20) c = mix(c, '#000000', 0.1); return c; }
  /** Fondo oscuro de la portada derivado del principal (texto blanco siempre legible). */
  function darkTone(h) { let c = mix(h, '#000000', 0.55), i = 0; while (contrast(c, '#FFFFFF') < 9 && i++ < 10) c = mix(c, '#000000', 0.15); return c; }
  function hue(h) { const [r, g, b] = hex2rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; }
  const hueDist = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

  /* ---------- paleta desde los píxeles del logo ---------- */
  /** `data`: RGBA plano (Uint8ClampedArray o arreglo). Ignora transparente, casi blanco, casi negro y grises. Devuelve hasta `n` hex por peso. */
  function paletteFromPixels(data, n) {
    n = n || 5;
    const bins = new Map(); let counted = 0;
    for (let i = 0; i + 3 < data.length; i += 4) {
      const a = data[i + 3]; if (a < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 238 && mn > 228) continue;            // blanco / fondo
      if (mx < 38) continue;                          // casi negro (texto, contornos)
      if (mx === 0 || (mx - mn) / mx < 0.2) continue; // gris o casi gris
      counted++;
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4), o = bins.get(k) || { n: 0, r: 0, g: 0, b: 0 };
      o.n++; o.r += r; o.g += g; o.b += b; bins.set(k, o);
    }
    if (!counted) return [];
    const list = [...bins.values()].map((o) => ({ n: o.n, c: [o.r / o.n, o.g / o.n, o.b / o.n] })).sort((x, y) => y.n - x.n);
    const groups = [];
    list.forEach((o) => {   // une tonos parecidos en el grupo más grande que ya exista
      const g = groups.find((q) => Math.hypot(q.c[0] - o.c[0], q.c[1] - o.c[1], q.c[2] - o.c[2]) < 56);
      if (g) { g.c = g.c.map((v, i) => (v * g.n + o.c[i] * o.n) / (g.n + o.n)); g.n += o.n; } else groups.push({ n: o.n, c: o.c.slice() });
    });
    return groups.filter((g) => g.n / counted >= 0.01).sort((x, y) => y.n - x.n).slice(0, n).map((g) => rgb2hex(g.c));
  }
  /** Principal: el color más usado que se puede leer como texto sobre blanco (si ninguno, el más oscuro). Acento: otro tono claramente distinto. */
  function pickRoles(palette) {
    if (!palette || !palette.length) return { main: null, accent: null };
    const readable = palette.filter((c) => contrast(c, '#FFFFFF') >= 4.5);
    const main = readable[0] || palette.slice().sort((a, b) => lum(a) - lum(b))[0];
    const rest = palette.filter((c) => c !== main);
    const accent = rest.find((c) => hueDist(c, main) > 40) || rest[0] || FALLBACK_ACCENT;
    return { main, accent };
  }

  /** Recuadro que ocupa el dibujo (sin márgenes transparentes o blancos) con un margen del 3 %. Devuelve {x,y,w,h}. */
  function trimBox(data, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (data[i + 3] < 25 || (data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return { x: 0, y: 0, w, h };
    const m = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w - 1, x1 + m); y1 = Math.min(h - 1, y1 + m);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /* ---------- marca guardada ---------- */
  function normalize(b) {
    if (!b || typeof b !== 'object') return null;
    const logo = b.logo && typeof b.logo.dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/.test(b.logo.dataUrl) && b.logo.dataUrl.length <= MAX_STORED
      ? { dataUrl: b.logo.dataUrl, w: +b.logo.w || null, h: +b.logo.h || null, name: String(b.logo.name || 'logo').slice(0, 80) } : null;
    const palette = Array.isArray(b.palette) ? b.palette.filter((c) => HEX.test(c)).map((c) => c.toUpperCase()).slice(0, 5) : [];
    const main = HEX.test(b.main || '') ? b.main.toUpperCase() : null, accent = HEX.test(b.accent || '') ? b.accent.toUpperCase() : null;
    if (!logo && !main) return null;
    return { v: 1, logo, palette, main, accent: accent || (main ? FALLBACK_ACCENT : null) };
  }

  let current = null;
  const active = () => current;
  /** CSS de la marca: solo variables de color y reglas de portada; sin marca no hay hoja y el aspecto sigue igual que antes. */
  function css(b) {
    if (!b || !b.main) return '';
    const main = b.main, text = textTone(main), dark = darkTone(main), acc = b.accent || FALLBACK_ACCENT;
    return `.rp-doc,.rp-preview{--blue:${text};--brand:${main};--brand-accent:${acc};--brand-dark:${dark};}
.rp-page--cover{background:radial-gradient(760px 420px at 88% 6%,${main}8C,transparent 62%),radial-gradient(620px 420px at 0% 108%,${main}47,transparent 62%),${dark};}
.rp-page--cover .rp-cover__rule{background:${acc};}.rp-page--cover .rp-cover__eyebrow{color:${acc};}
.rp-page--cover .rp-cover__sub{color:#fff;opacity:.88;}`;
  }
  function applyStyle() {
    const d = root.document; if (!d) return;
    let el = d.getElementById('rp-brand-style');
    const text = css(current);
    if (!text) { if (el) el.remove(); return; }
    if (!el) { el = d.createElement('style'); el.id = 'rp-brand-style'; d.head.appendChild(el); }
    el.textContent = text;
  }
  function set(b) { current = normalize(b); applyStyle(); return current; }

  /* ---------- logo: lectura y reducción en el navegador ---------- */
  function readLogo(file) {
    return new Promise((resolve) => {
      if (!file || !/^image\/(png|jpeg)$/.test(file.type)) return resolve({ ok: false, error: 'El logo debe ser PNG o JPG.' });
      if (file.size > MAX_BYTES) return resolve({ ok: false, error: 'El logo pesa más de 2 MB. Usa una versión más ligera.' });
      const url = root.URL.createObjectURL(file), img = new root.Image();
      img.onload = () => {
        try {
          const k0 = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight)), W = Math.max(1, Math.round(img.naturalWidth * k0)), Hh = Math.max(1, Math.round(img.naturalHeight * k0));
          const c0 = root.document.createElement('canvas'); c0.width = W; c0.height = Hh; const x0 = c0.getContext('2d'); x0.fillStyle = '#fff'; if (file.type === 'image/jpeg') x0.fillRect(0, 0, W, Hh); x0.drawImage(img, 0, 0, W, Hh);
          const bb = trimBox(x0.getImageData(0, 0, W, Hh).data, W, Hh);   // recorta los márgenes vacíos: el logo se ve completo y grande
          const k = Math.min(1, MAX_W / bb.w, MAX_H / bb.h), w = Math.max(1, Math.round(bb.w * k)), h = Math.max(1, Math.round(bb.h * k));
          const cv = root.document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.drawImage(c0, bb.x, bb.y, bb.w, bb.h, 0, 0, w, h);
          const png = file.type === 'image/png', dataUrl = png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
          const px = cx.getImageData(0, 0, w, h).data, palette = paletteFromPixels(px, 5), roles = pickRoles(palette);
          root.URL.revokeObjectURL(url);
          if (dataUrl.length > MAX_STORED) return resolve({ ok: false, error: 'El logo es demasiado detallado para guardarse. Usa una versión más simple o más pequeña.' });
          resolve({ ok: true, logo: { dataUrl, w, h, name: file.name }, palette, main: roles.main, accent: roles.accent });
        } catch (e) { resolve({ ok: false, error: 'No se pudo leer la imagen.' }); }
      };
      img.onerror = () => { root.URL.revokeObjectURL(url); resolve({ ok: false, error: 'No se pudo abrir la imagen.' }); };
      img.src = url;
    });
  }

  FP.brand = { contrast, textTone, darkTone, mix, paletteFromPixels, pickRoles, trimBox, normalize, css, set, active, applyStyle, readLogo, HEX, FALLBACK_ACCENT, MAX_STORED };
})(typeof window !== 'undefined' ? window : globalThis);
