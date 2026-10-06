/**
 * ga4Funnel.js — traductor del CSV de artículos de GA4 al formato de «Productos · funnel».
 * Si el archivo trae «Plataforma» (web / Android / iOS) y no trae «canal», convierte web → ecommerce y Android / iOS → app y SUMA las filas
 * que caen en el mismo día, canal y SKU (Android + iOS = app). Salida: fecha, canal, sku, producto, vistas_ficha, agregados_carrito, inicio_checkout, compras_ga4.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const COLS = {
    date: ['fecha', 'date', 'dia', 'day'],
    platform: ['plataforma', 'platform'],
    channel: ['canal', 'channel', 'canal de venta'],
    sku: ['sku', 'id del articulo', 'id de articulo', 'id del elemento', 'id de elemento', 'item id', 'id sku', 'codigo sku'],
    product: ['nombre del articulo', 'nombre del elemento', 'item name', 'producto', 'nombre producto', 'product name'],
    views: ['vistas ficha', 'articulos vistos', 'elementos vistos', 'items viewed', 'item views', 'vistas', 'views'],
    addToCart: ['agregados carrito', 'articulos agregados al carrito', 'elementos agregados al carrito', 'items added to cart', 'agregados al carrito', 'add to cart'],
    beginCheckout: ['inicio checkout', 'inicio de compra', 'inicios de compra', 'inicios de pago', 'articulos pagados', 'elementos pagados', 'articulos en el checkout', 'items checked out', 'begin checkout', 'checkout'],
    purchases: ['compras ga4', 'articulos comprados', 'elementos comprados', 'items purchased', 'compras', 'purchases']
  };
  const PLATFORM = { web: 'ecommerce', android: 'app', ios: 'app' };

  function splitLine(line, sep) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === sep && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim());
  }
  const dataLines = (t) => String(t || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  const sepOf = (l) => ((l.match(/;/g) || []).length > (l.match(/,/g) || []).length ? ';' : ',');
  function headerMap(headers) {
    const h = headers.map(norm); const m = {};
    Object.entries(COLS).forEach(([k, names]) => { for (const n of names) { const i = h.indexOf(n); if (i >= 0) { m[k] = i; break; } } });
    return m;
  }

  /** Funnel de GA4 por plataforma: fecha + plataforma + SKU + al menos una métrica de funnel, y sin columna «canal». */
  function detect(text) {
    const lines = dataLines(text); if (!lines.length) return false;
    const m = headerMap(splitLine(lines[0], sepOf(lines[0])));
    return m.date !== undefined && m.platform !== undefined && m.channel === undefined && m.sku !== undefined
      && [m.views, m.addToCart, m.beginCheckout, m.purchases].some((x) => x !== undefined);
  }

  function num(v) {
    let s = String(v === undefined || v === null ? '' : v).replace(/[\s"\u00a0]/g, '');
    if (s === '' || s === '-' || s === '—') return 0;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function translate(text) {
    const lines = dataLines(text);
    const sep = sepOf(lines[0]);
    const m = headerMap(splitLine(lines[0], sep));
    const keys = ['views', 'addToCart', 'beginCheckout', 'purchases'].filter((k) => m[k] !== undefined);
    const stats = { rowsIn: 0, rowsOut: 0, skipped: 0, platforms: {}, reasons: {}, metrics: keys, totals: {} };
    keys.forEach((k) => { stats.totals[k] = 0; });
    const why = (k, ex) => { const e = stats.reasons[k] || (stats.reasons[k] = { n: 0, ejemplos: [] }); e.n++; if (e.ejemplos.length < 3 && !e.ejemplos.includes(String(ex))) e.ejemplos.push(String(ex)); };
    const agg = new Map();
    for (const line of lines.slice(1)) {
      const r = splitLine(line, sep);
      const date = FP.ga4Segments ? FP.ga4Segments.parseDate(r[m.date]) : null;
      const plat = norm(r[m.platform]);
      const canal = PLATFORM[plat] || (/\bandroid\b|\bios\b/.test(plat) ? 'app' : /\bweb\b/.test(plat) ? 'ecommerce' : null);
      const sku = String(r[m.sku] || '').trim();
      const vals = keys.map((k) => num(r[m[k]]));
      if (!date) { stats.skipped++; why('fecha', r[m.date]); continue; }
      if (!canal) { stats.skipped++; why('plataforma', r[m.platform]); continue; }
      if (!sku || /^\(not set\)$/i.test(sku)) { stats.skipped++; why('sku', sku || '(vacío)'); continue; }
      if (vals.some(isNaN)) { stats.skipped++; why('número', r[m[keys[vals.findIndex(isNaN)]]]); continue; }
      stats.rowsIn++; stats.platforms[plat] = (stats.platforms[plat] || 0) + 1;
      const k = `${date}|${canal}|${sku}`;
      const a = agg.get(k) || { date, canal, sku, product: '', v: keys.map(() => 0) };
      if (!a.product && m.product !== undefined) a.product = String(r[m.product] || '').trim();
      vals.forEach((x, i) => { a.v[i] += x; stats.totals[keys[i]] += x; });
      agg.set(k, a);
    }
    const q = (s) => (/[",;\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const hdr = { views: 'vistas_ficha', addToCart: 'agregados_carrito', beginCheckout: 'inicio_checkout', purchases: 'compras_ga4' };
    const out = [['fecha', 'canal', 'sku', 'producto', ...keys.map((k) => hdr[k])].join(',')];
    [...agg.values()].sort((a, b) => (a.date + a.canal + a.sku).localeCompare(b.date + b.canal + b.sku))
      .forEach((a) => out.push([a.date, a.canal, q(a.sku), q(a.product), ...a.v].join(',')));
    stats.rowsOut = out.length - 1;
    return { csv: out.join('\n') + '\n', stats };
  }

  FP.ga4Funnel = { detect, translate };
})(typeof window !== 'undefined' ? window : globalThis);
