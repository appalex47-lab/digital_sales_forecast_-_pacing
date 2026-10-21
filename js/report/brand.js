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

  /* ---------- fondos de portada ---------- */
  const COVERS = [{ id: 'chart', label: 'Gráfica ascendente' }, { id: 'waves', label: 'Ondas' }, { id: 'geo', label: 'Geométrico' }, { id: 'dots', label: 'Retícula de puntos' }, { id: 'side', label: 'Bloque lateral' }, { id: 'light', label: 'Claro (ahorra tinta)' }];
  const coverId = (id) => (COVERS.some((c) => c.id === id) ? id : 'chart');
  const tones = (b) => { const main = b.main, acc = b.accent || FALLBACK_ACCENT; return { main, acc, dark: darkTone(main), text: textTone(main), accText: textTone(acc) }; };
  /** Fondo (CSS background) de la portada según el estilo; todos salen de los colores de la marca. */
  function coverBg(id, b) {
    const t = tones(b);
    switch (coverId(id)) {
      case 'waves': return `linear-gradient(135deg,${t.dark},${t.main} 140%)`;
      case 'dots': return `linear-gradient(120deg,${t.dark} 40%,${t.main})`;
      case 'geo': case 'side': return t.dark;
      case 'light': return '#FFFFFF';
      default: return `radial-gradient(760px 420px at 88% 6%,${t.main}8C,transparent 62%),radial-gradient(620px 420px at 0% 108%,${t.main}47,transparent 62%),${t.dark}`;
    }
  }
  /** Dibujo decorativo (SVG 1122×630) de cada fondo; null en «Gráfica ascendente» (la usa el dibujo de siempre). Queda lejos del bloque de datos. */
  function coverDeco(id, b) {
    const t = tones(b); id = coverId(id);
    const open = '<svg class="rp-deco rp-deco--bg" viewBox="0 0 1122 630" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">';
    if (id === 'waves') return `${open}<path d="M0 412C280 333 560 491 1122 377V630H0Z" fill="${t.main}" opacity=".5"/><path d="M0 473C280 394 560 552 1122 438V630H0Z" fill="${t.acc}" opacity=".2"/><path d="M0 526C280 447 560 605 1122 491V630H0Z" fill="#fff" opacity=".1"/></svg>`;
    if (id === 'geo') return `${open}<polygon points="666,0 1122,0 1122,630 421,630" fill="${t.main}" opacity=".45"/><polygon points="859,0 1122,0 1122,377" fill="${t.acc}" opacity=".85"/><polygon points="964,630 1122,630 1122,491" fill="#fff" opacity=".12"/></svg>`;
    if (id === 'dots') { let d = ''; for (let x = 640; x < 1122; x += 36) for (let y = 18; y < 630; y += 36) { const k = (1122 - x) / 230; d += `<circle cx="${x}" cy="${y}" r="${Math.max(1.2, 4.4 - k).toFixed(1)}" fill="#fff" opacity="${Math.max(0.06, 0.5 - (1122 - x) / 1600).toFixed(2)}"/>`; } return `${open}${d}<rect x="1108" y="0" width="14" height="630" fill="${t.acc}"/></svg>`; }
    if (id === 'side') return `${open}<rect x="833" y="0" width="289" height="630" fill="${t.main}"/><rect x="824" y="0" width="9" height="630" fill="${t.acc}"/><circle cx="978" cy="494" r="105" fill="none" stroke="#fff" opacity=".22" stroke-width="3"/><circle cx="978" cy="494" r="70" fill="none" stroke="#fff" opacity=".22" stroke-width="3"/><circle cx="978" cy="494" r="35" fill="#fff" opacity=".12"/></svg>`;
    if (id === 'light') return `${open}<rect x="0" y="0" width="1122" height="14" fill="${t.main}"/><polygon points="1122,630 1122,368 753,630" fill="${t.main}" opacity=".13"/><polygon points="1122,630 1122,490 930,630" fill="${t.acc}" opacity=".35"/></svg>`;
    return null;
  }

  /* ---------- marca guardada ---------- */
  function normalize(b) {
    if (!b || typeof b !== 'object') return null;
    const logo = b.logo && typeof b.logo.dataUrl === 'string' && /^data:image\/(png|jpeg);base64,/.test(b.logo.dataUrl) && b.logo.dataUrl.length <= MAX_STORED
      ? { dataUrl: b.logo.dataUrl, w: +b.logo.w || null, h: +b.logo.h || null, name: String(b.logo.name || 'logo').slice(0, 80) } : null;
    const palette = Array.isArray(b.palette) ? b.palette.filter((c) => HEX.test(c)).map((c) => c.toUpperCase()).slice(0, 5) : [];
    const main = HEX.test(b.main || '') ? b.main.toUpperCase() : null, accent = HEX.test(b.accent || '') ? b.accent.toUpperCase() : null;
    if (!logo && !main) return null;
    return { v: 1, logo, palette, main, accent: accent || (main ? FALLBACK_ACCENT : null), cover: coverId(b.cover) };
  }

  let current = null;
  const active = () => current;
  /** CSS de la marca: solo variables de color y reglas de portada; sin marca no hay hoja y el aspecto sigue igual que antes. */
  function css(b) {
    if (!b || !b.main) return '';
    const main = b.main, text = textTone(main), dark = darkTone(main), acc = b.accent || FALLBACK_ACCENT;
    const cv = coverId(b.cover), bg = coverBg(cv, b), at = textTone(acc);
    return `.rp-doc,.rp-preview{--blue:${text};--brand:${main};--brand-accent:${acc};--brand-dark:${dark};}
.rp-page--cover{background:${bg};}
.rp-page--cover .rp-cover__rule{background:${acc};}.rp-page--cover .rp-cover__eyebrow{color:${cv === 'light' ? at : acc};}
.rp-page--cover .rp-cover__sub{color:#fff;opacity:.88;}
.rp-page--cover[data-cover=light]{color:#14233B;}.rp-page--cover[data-cover=light] .rp-cover__title{color:#14233B;}
.rp-page--cover[data-cover=light] .rp-cover__sub{color:#55657D;opacity:1;}.rp-page--cover[data-cover=light] .rp-cover__meta dt{color:#55657D;}
.rp-page--cover[data-cover=light] .rp-cover__meta dd{color:#14233B;}.rp-page--cover[data-cover=light] .rp-cover__by{color:#55657D;}
.rp-page--cover[data-cover=light] .rp-logo-l{border:1px solid #DFE5F0;}`;
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

  FP.brand = { contrast, textTone, darkTone, mix, paletteFromPixels, pickRoles, trimBox, COVERS, coverId, coverBg, coverDeco, tones, normalize, css, set, active, applyStyle, readLogo, HEX, FALLBACK_ACCENT, MAX_STORED };
})(typeof window !== 'undefined' ? window : globalThis);
