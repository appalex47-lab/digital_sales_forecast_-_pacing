/**
 * ga4Segments.js — Fase 11 · pieza 2: traductor del CSV exportado de GA4 al formato de Segmentos.
 * Decisiones del usuario: web y app en la misma propiedad (Plataforma: web → Ecommerce; Android / iOS → App); «(not set)» se muestra como
 * «Sin dato (not set)»; los usuarios no se usan (no se pueden sumar entre filas), solo Sesiones, Compras e Ingresos; el archivo es CSV.
 * Cada fila de GA4 combina varias dimensiones (dispositivo, fuente/medio, campaña, landing, nuevo/recurrente): se genera una fila de
 * Segmentos por dimensión y se SUMAN las filas que caen en el mismo día, canal, dimensión y segmento. WhatsApp y Llamadas no vienen de GA4.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  // Con cientos de miles de filas los mismos textos (dispositivo, fuente, campaña…) se normalizan millones de veces: se recuerdan.
  const NORM = new Map();
  const norm = (s) => {
    const k = s === undefined || s === null ? '' : s;
    let v = NORM.get(k);
    if (v === undefined) {
      v = String(k || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9/+]+/g, ' ').trim();
      if (NORM.size > 200000) NORM.clear();
      NORM.set(k, v);
    }
    return v;
  };
  /** Encabezados reconocidos (GA4 en español y en inglés), ya normalizados. */
  const COLS = {
    date: ['fecha', 'date'],
    platform: ['plataforma', 'platform'],
    device: ['categoria de dispositivo', 'device category'],
    sourceMedium: ['fuente/medio de la sesion', 'session source/medium', 'fuente / medio de la sesion', 'session source / medium', 'fuente/medio', 'source/medium'],
    campaign: ['campana de la sesion', 'session campaign'],
    landing: ['pagina de destino y cadena de consulta', 'pagina de destino + cadena de consulta', 'landing page + query string', 'landing page', 'pagina de destino'],
    customerType: ['nuevo/recurrente', 'nuevo / recurrente', 'new/returning', 'new / returning'],
    sessions: ['sesiones', 'sessions'],
    purchases: ['compras en comercio electronico', 'compras de comercio electronico', 'transacciones', 'ecommerce purchases', 'transactions', 'compras', 'purchases'],
    revenue: ['ingresos derivados de las compras', 'ingresos por compras', 'purchase revenue', 'ingresos totales', 'total revenue', 'ingresos', 'revenue']
  };
  const PLATFORM = { web: 'ecommerce', android: 'app', ios: 'app' };
  const DEVICE = { mobile: 'Móvil', desktop: 'Escritorio', tablet: 'Tableta', 'smart tv': 'Smart TV' };
  const CUSTOMER = { new: 'Nuevo', nuevo: 'Nuevo', returning: 'Recurrente', recurrente: 'Recurrente', established: 'Recurrente' };

  /** Separa una línea CSV respetando comillas. */
  function splitLine(line, sep) {
    if (line.indexOf('"') === -1) { const parts = line.split(sep); for (let i = 0; i < parts.length; i++) parts[i] = parts[i].trim(); return parts; }   // camino rápido: sin comillas no hay nada que desescapar
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

  /** Líneas útiles: sin comentarios «#» de GA4 ni líneas vacías. */
  function dataLines(text) {
    return String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  }

  function headerMap(headers) {
    const h = headers.map(norm); const map = {};
    Object.entries(COLS).forEach(([k, names]) => {
      for (const n of names) { const i = h.indexOf(n); if (i >= 0) { map[k] = i; break; } }   // el nombre más específico gana
    });
    return map;
  }

  /** ¿El texto parece un export de GA4? (fecha + plataforma + sesiones) */
  function detect(text) {
    const lines = dataLines(text); if (!lines.length) return false;
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const m = headerMap(splitLine(lines[0], sep));
    return m.date !== undefined && m.platform !== undefined && m.sessions !== undefined;
  }

  const MONTHS = { ene: 1, enero: 1, jan: 1, january: 1, feb: 2, febrero: 2, february: 2, mar: 3, marzo: 3, march: 3, abr: 4, abril: 4, apr: 4, april: 4,
    may: 5, mayo: 5, jun: 6, junio: 6, june: 6, jul: 7, julio: 7, july: 7, ago: 8, agosto: 8, aug: 8, august: 8, sep: 9, sept: 9, septiembre: 9, september: 9,
    oct: 10, octubre: 10, october: 10, nov: 11, noviembre: 11, november: 11, dic: 12, diciembre: 12, dec: 12, december: 12 };
  const iso = (y, m, d) => {
    y = +y; m = +m; d = +d;
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };
  /** Fechas de GA4 / Looker: 20260131, 2026-01-31, 2026/01/31, 31/01/2026, 1 ene 2026, Jan 1, 2026, 1 de enero de 2026. */
  function parseDate(v) {
    const s = String(v || '').trim().replace(/^"|"$/g, '');
    let m;
    if (/^\d{8}$/.test(s)) return iso(s.slice(0, 4), s.slice(4, 6), s.slice(6, 8));
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(m[1], m[2], m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      const a = +m[1], b = +m[2];
      return b > 12 && a <= 12 ? iso(m[3], a, b) : iso(m[3], b, a);   // día/mes/año (si el segundo número es >12, es mes/día/año)
    }
    const t = norm(s).replace(/\bde\b/g, ' ').replace(/\s+/g, ' ');
    if ((m = t.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/)) && MONTHS[m[2]]) return iso(m[3], MONTHS[m[2]], m[1]);
    if ((m = t.match(/^([a-z]+) (\d{1,2}) (\d{4})$/)) && MONTHS[m[1]]) return iso(m[3], MONTHS[m[1]], m[2]);
    return null;   // filas de totales u otras sin fecha
  }

  /** Números de GA4: «1,234», «1.234,56», «1 234,56», «$1,234.56», «1234.56», «—» (= 0). */
  function parseNumber(v) {
    let s = String(v === undefined || v === null ? '' : v).replace(/[$€£\s"\u00a0%]/g, '');
    if (s === '' || s === '-' || s === '—' || s === '–') return 0;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');            // 1,234.56
    else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');  // 1.234,56
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                          // 12,5
    const n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  const label = (v, dict) => {
    const raw = String(v || '').trim();
    if (!raw || norm(raw) === 'not set' || raw === '(not set)') return 'Sin dato (not set)';
    return (dict && dict[norm(raw)]) || raw;
  };

  /**
   * Convierte el CSV de GA4 a filas de Segmentos ya agregadas por día, canal, dimensión y segmento (ordenadas).
   * Es el núcleo común de translate() (que arma el CSV) y translateRows() (que entrega las filas sin pasar por texto).
   * @returns {{ agg: object[], stats: object }}
   */
  const KEY_MEMO = new Map();
  /** Misma llave que usa la app al importar un segmento (normalizeHeader; símbolos puros → llave por caracteres). Memoizada por texto. */
  function segKey(seg) {
    let k = KEY_MEMO.get(seg);
    if (k === undefined) {
      k = FP.normalize.normalizeHeader(seg);
      if (!k && seg) k = 'sym_' + Array.from(seg).map((c) => c.codePointAt(0).toString(16)).join('_');
      if (KEY_MEMO.size > 400000) KEY_MEMO.clear();
      KEY_MEMO.set(seg, k);
    }
    return k;
  }
  function translateCore(text) {
    const lines = dataLines(text);
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const m = headerMap(splitLine(lines[0], sep));
    const dims = [
      ['device', 'dispositivo', (r) => label(r[m.device], DEVICE)],
      ['sourceMedium', 'fuente', (r) => { const v = String(r[m.sourceMedium] || ''); return norm(v) === 'not set' || v === '(not set)' ? 'Sin dato (not set)' : label(v.split('/')[0].trim()); }],
      ['sourceMedium', 'medio', (r) => { const v = String(r[m.sourceMedium] || ''); const p = v.split('/'); return norm(v) === 'not set' || v === '(not set)' || p.length < 2 ? 'Sin dato (not set)' : label(p.slice(1).join('/').trim()); }],
      ['campaign', 'campaña', (r) => label(r[m.campaign])],
      ['landing', 'landing', (r) => label(r[m.landing])],
      ['customerType', 'tipo_cliente', (r) => label(r[m.customerType], CUSTOMER)],
      // parte 3: cruce Dispositivo × Fuente/medio (solo si el export trae las dos columnas): «Móvil · google / cpc»
      ...(m.device !== undefined && m.sourceMedium !== undefined ? [['device', 'dispositivo_fuente', (r) => {
        const d = label(r[m.device], DEVICE); const v = String(r[m.sourceMedium] || '').trim();
        return `${d} · ${!v || norm(v) === 'not set' || v === '(not set)' ? 'Sin dato (not set)' : v.replace(/\s*\/\s*/, ' / ')}`; }]] : []),
    ].filter(([k]) => m[k] !== undefined);
    const headersRaw = splitLine(lines[0], sep);
    const agg = new Map(); const stats = { rowsIn: 0, rowsOut: 0, skipped: 0, reasons: {}, headers: lines[0] ? splitLine(lines[0], sep) : [], platforms: {}, dimensions: [...new Set(dims.map((d) => d[1]))],
      usedHeaders: Object.values(m).map((i) => headersRaw[i]), ignoredHeaders: headersRaw.filter((_, i) => !Object.values(m).includes(i)),
      hasPurchases: m.purchases !== undefined, hasRevenue: m.revenue !== undefined, totals: { sessions: 0, orders: 0, revenue: 0 } };
    for (const line of lines.slice(1)) {
      const r = splitLine(line, sep);
      const date = parseDate(r[m.date]);
      const plat = norm(r[m.platform]);
      const canal = PLATFORM[plat] || (/\bandroid\b/.test(plat) || /\bios\b/.test(plat) ? 'app' : /^web\b|\bweb$/.test(plat) ? 'ecommerce' : undefined);
      const ses = parseNumber(r[m.sessions]), ped = m.purchases !== undefined ? parseNumber(r[m.purchases]) : 0, ven = m.revenue !== undefined ? parseNumber(r[m.revenue]) : 0;
      if (!date || !canal || [ses, ped, ven].some((x) => isNaN(x))) {
        stats.skipped++;
        const why = !date ? 'fecha' : !canal ? 'plataforma' : 'número';
        const ex = !date ? r[m.date] : !canal ? r[m.platform] : [r[m.sessions], m.purchases !== undefined ? r[m.purchases] : '', m.revenue !== undefined ? r[m.revenue] : ''].find((x, i) => isNaN([ses, ped, ven][i]));
        const e = stats.reasons[why] || (stats.reasons[why] = { n: 0, ejemplos: [] });
        e.n++; if (e.ejemplos.length < 3 && !e.ejemplos.includes(String(ex))) e.ejemplos.push(String(ex));
        continue;
      }
      stats.totals.sessions += ses; stats.totals.orders += ped; stats.totals.revenue += ven;
      stats.rowsIn++; stats.platforms[plat] = (stats.platforms[plat] || 0) + 1;
      dims.forEach(([, dim, fn]) => {
        const seg = fn(r);
        // Variantes del mismo texto que la app trata como UN segmento (mayúsculas, «/» final, signos: «?q=Mounjaro» y «?q=mounjaro») se suman aquí:
        // si no, al guardar solo sobreviviría la última y se perdería su tráfico y su venta.
        const k = `${date}|${canal}|${dim}|${segKey(seg)}`;
        const a = agg.get(k) || { date, canal, dim, seg, venta: 0, pedidos: 0, sesiones: 0, variants: null, best: -1 };
        a.venta += ven; a.pedidos += ped; a.sesiones += ses;
        if (a.variants === null && a.seg !== seg) { a.variants = new Map([[a.seg, a.firstSes === undefined ? 0 : a.firstSes]]); }
        if (a.variants) a.variants.set(seg, (a.variants.get(seg) || 0) + ses);
        else a.firstSes = (a.firstSes || 0) + ses;
        agg.set(k, a);
      });
    }
    // Intl.Collator() con la configuración regional predeterminada ordena igual que String.localeCompare, pero sin crear un
    // comparador por cada comparación (con 300 mil filas era buena parte de los 7 s de la traducción).
    // Si una llave juntó variantes de texto, el rótulo es el de la variante con más sesiones del día (determinista: en empate, la primera vista).
    for (const a of agg.values()) {
      if (!a.variants) continue;
      let best = a.seg, bs = -1; a.variants.forEach((v, t) => { if (v > bs) { bs = v; best = t; } });
      a.seg = best; stats.mergedKeys = (stats.mergedKeys || 0) + 1;
    }
    const coll = new Intl.Collator();
    const list = [...agg.values()].map((a) => [a.date + a.canal + a.dim + a.seg, a]);
    list.sort((x, y) => coll.compare(x[0], y[0]));
    const sorted = list.map((x) => x[1]);
    stats.rowsOut = sorted.length;
    stats.sinDimensiones = !dims.length;   // el archivo tiene fecha/plataforma/sesiones pero ninguna columna de desglose
    return { agg: sorted, stats };
  }

  /**
   * Convierte el CSV de GA4 al CSV de Segmentos de la app.
   * @returns {{ csv: string, stats: { rowsIn, rowsOut, skipped, platforms:{}, dimensions:[] } }}
   */
  function translate(text) {
    const { agg, stats } = translateCore(text);
    const q = (s) => (/[",;\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
    const out = ['fecha,canal,dimension,segmento,venta,pedidos,traffic_volume'];
    agg.forEach((a) => out.push([a.date, a.canal, a.dim, q(a.seg), Math.round(a.venta * 100) / 100, a.pedidos, a.sesiones].join(',')));
    return { csv: out.join('\n') + '\n', stats };
  }

  const ROW_HEADERS = ['fecha', 'canal', 'dimension', 'segmento', 'venta', 'pedidos', 'traffic_volume'];
  /**
   * Igual que translate(), pero entrega las filas ya separadas ({ line, values, cellCount }, como las deja el lector de CSV), sin generar
   * un texto de decenas de MB para volver a leerlo. Los valores son exactamente los que saldrían de leer el CSV de translate().
   */
  function translateRows(text) {
    const { agg, stats } = translateCore(text);
    const rows = new Array(agg.length);
    for (let i = 0; i < agg.length; i++) {
      const a = agg[i];
      rows[i] = { line: i + 2, values: { fecha: a.date, canal: a.canal, dimension: a.dim, segmento: a.seg, venta: String(Math.round(a.venta * 100) / 100), pedidos: String(a.pedidos), traffic_volume: String(a.sesiones) }, cellCount: ROW_HEADERS.length };
    }
    return { headers: ROW_HEADERS.slice(), rows, stats };
  }

  FP.ga4Segments = { detect, translate, translateRows, parseNumber, parseDate };
})(typeof window !== 'undefined' ? window : globalThis);
