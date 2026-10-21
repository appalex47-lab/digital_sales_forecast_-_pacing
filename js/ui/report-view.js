/**
 * report-view.js — Presentación (PDF): pinta las páginas que arma FP.reportBuilder y las imprime a PDF con el navegador.
 * Solo presenta: no calcula nada (cada cifra llega ya calculada y etiquetada). Sin librerías ni servicios externos:
 * las gráficas son SVG propios y el PDF sale de «Imprimir → Guardar como PDF» sobre un contenedor de 16:9 horizontal.
 * El color nunca es el único indicador: hay signos (+/−), flechas, trazos distintos (continuo, punteado, guiones) y etiquetas de texto.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const RB = () => FP.reportBuilder;
  const fmt = (k, v) => RB().fmt(k, v);
  const NA = 'No disponible';
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const C = { navy: '#0B1F3A', blue: '#1F5FD6', teal: '#0E8F80', green: '#0B7A59', orange: '#B86A00', red: '#C0392B', grey: '#56667D', light: '#E4EAF1', ink: '#0F1B2D' };
  const PW = 1122, PH = 630;   // 297 × 167 mm a 96 dpi (16:9)
  const MO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  /* ================= gráficas SVG ================= */
  const svgT = (x, y, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 13.4}" fill="${o.fill || C.grey}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''}>${esc(txt)}</text>`;
  const sMC = (v) => (isNum(v) ? `${v > 0 ? '+' : ''}${fmt('moneyC', v)}` : NA);
  const cut = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
  function ticks(max, n = 4) {
    const raw = (max || 1) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag, out = [];
    for (let v = 0; v <= Math.ceil(max / step) * step + step / 2; v += step) out.push(v);
    return out;
  }
  const wrap = (W, H, inner, label) => `<svg class="rp-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label || '')}" font-family="inherit">${inner}</svg>`;
  const empty = (W, H, msg) => wrap(W, H, svgT(W / 2, H / 2, msg, { anchor: 'middle' }), msg);
  function segs(vals, X, Y, from, to) {   // trazos que se cortan en los huecos (null): un faltante no se une ni se vuelve 0
    const out = []; let cur = [];
    for (let i = from; i <= to; i++) { if (isNum(vals[i])) cur.push(`${cur.length ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(vals[i]).toFixed(1)}`); else { if (cur.length) out.push(cur.join('')); cur = []; } }
    if (cur.length) out.push(cur.join(''));
    return out;
  }
  const marker = (shape, x, y, col, r = 4.5) => shape === 'sq' ? `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${col}"/>`
    : shape === 'tri' ? `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y + r}L${x - r - 1} ${y + r}Z" fill="${col}"/>`
      : shape === 'dia' ? `<path d="M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z" fill="${col}"/>` : `<circle cx="${x}" cy="${y}" r="${r}" fill="${col}"/>`;

  function chartCumulative(c) {
    const W = 590, H = 262, L = 62, R = 16, T = 36, B = 28;
    const all = [...c.plan, ...c.actual, ...c.forecast].filter(isNum);
    if (!all.length) return empty(W, H, 'Sin serie para graficar');
    const tk = ticks(Math.max(...all)), ymax = tk[tk.length - 1];
    const N = c.labels.length, LAST = Math.max(N - 1, 1), daily = N > 14;
    const X = (i) => L + i * (W - L - R) / LAST, Y = (v) => T + (H - T - B) * (1 - v / ymax);
    let g = tk.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.light}"/>${svgT(L - 6, Y(v) + 4, fmt('moneyC', v), { anchor: 'end' })}`).join('');
    g += c.labels.map((m, i) => (!daily || i === 0 || i === LAST || (+m) % 5 === 0 ? svgT(X(i), H - 8, m, { anchor: 'middle' }) : '')).join('');
    const from = Math.max(c.cutIndex, 0);
    segs(c.plan, X, Y, 0, LAST).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.grey}" stroke-width="2.2" stroke-dasharray="2 4" stroke-linecap="round"/>`; });
    segs(c.forecast, X, Y, from, LAST).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.teal}" stroke-width="2.6" stroke-dasharray="9 5"/>`; });
    if (c.cutIndex >= 0) {
      segs(c.actual, X, Y, 0, c.cutIndex).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.navy}" stroke-width="3.2"/>`; });
      c.actual.forEach((v, i) => { if (!daily && isNum(v) && i <= c.cutIndex) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.6" fill="${C.navy}"/>`; });
      if (!c.noCut) g += `<line x1="${X(c.cutIndex)}" x2="${X(c.cutIndex)}" y1="${T}" y2="${H - B}" stroke="${C.orange}" stroke-width="1.5" stroke-dasharray="4 3"/>${svgT(X(c.cutIndex) + 4, T + 12, 'Corte', { fill: C.orange, weight: 600 })}`;
    }
    const lastF = c.forecast[LAST];
    if (isNum(lastF)) g += svgT(X(LAST), Y(lastF) - 7, fmt('moneyC', lastF), { anchor: 'end', fill: C.teal, weight: 700 });
    const L3 = c.legend || ['Real (Observado)', 'Plan', 'Forecast (Estimado)'];
    const lg = [[C.navy, '', L3[0], 3.2], [C.grey, '2 4', L3[1], 2.2], [C.teal, '9 5', L3[2], 2.6]].filter((x) => x[2]);
    let lx = L;
    lg.forEach(([col, dash, txt, w]) => { g += `<line x1="${lx}" x2="${lx + 26}" y1="14" y2="14" stroke="${col}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${svgT(lx + 31, 19, txt)}`; lx += 40 + txt.length * 7; });
    return wrap(W, H, g, c.title);
  }

  function chartWaterfall(c) {
    const W = 540, H = 262, L = 10, R = 10, T = 30, B = 50, n = c.steps.length;
    let run = 0; const bars = c.steps.map((s) => { if (s.kind === 'total') { run = s.value; return { ...s, lo: 0, hi: s.value, end: s.value }; } const a = run, b = run + s.value; run = b; return { ...s, lo: Math.min(a, b), hi: Math.max(a, b), end: b }; });
    const lvl = bars.flatMap((b) => [b.lo === 0 && b.kind === 'total' ? b.hi : b.lo, b.hi]), lo = Math.min(...lvl), hi = Math.max(...lvl), span = (hi - lo) || hi * 0.05 || 1;
    let ymin = lo - span * 0.9; const trunc = ymin > 0; if (!trunc) ymin = 0; const ymax = hi + span * 0.3;
    const Y = (v) => T + (H - T - B) * (1 - (v - ymin) / (ymax - ymin)), slot = (W - L - R) / n, bw = slot * 0.56;
    let g = `<line x1="${L}" x2="${W - R}" y1="${Y(ymin)}" y2="${Y(ymin)}" stroke="${C.grey}"/>`;
    bars.forEach((b, i) => {
      const x = L + i * slot + (slot - bw) / 2, top = Y(b.hi), bot = b.kind === 'total' ? Y(ymin) : Y(b.lo);
      const col = b.kind === 'total' ? C.navy : b.value >= 0 ? C.green : C.red, h = Math.max(2, bot - top);
      g += `<rect x="${x}" y="${top}" width="${bw}" height="${h}" fill="${col}" rx="2"/>`;
      g += b.kind === 'total' ? svgT(x + bw / 2, top - 6, fmt('moneyC', b.value), { anchor: 'middle', fill: C.navy, weight: 700 })
        : svgT(x + bw / 2, top - 6, `${b.value >= 0 ? '▲' : '▼'} ${sMC(b.value)}`, { anchor: 'middle', fill: col, weight: 700 });
      g += svgT(x + bw / 2, H - B + 18, cut(b.label, 13), { anchor: 'middle', fill: C.ink });
      if (i < n - 1) g += `<line x1="${x + bw}" x2="${x + slot}" y1="${Y(b.end)}" y2="${Y(b.end)}" stroke="${C.grey}" stroke-dasharray="2 3"/>`;
    });
    if (trunc) g += svgT(L, H - 6, 'El eje no inicia en cero (se acotó para ver las palancas)', { italic: true });
    return wrap(W, H, g, c.title);
  }

  // Etiqueta de hasta dos líneas cortando por palabra; el nombre completo queda como <title> (no se pierde información).
  const wrapLbl = (txt, n) => { const w = String(txt).split(/\s+/), l = ['']; w.forEach((t) => { const cur = l[l.length - 1]; if (!cur) l[l.length - 1] = t; else if ((cur + ' ' + t).length <= n) l[l.length - 1] = cur + ' ' + t; else l.push(t); }); if (l.length > 2) { l[1] = l.slice(1).join(' '); l.length = 2; } return l.map((x) => (x.length > n + 3 ? x.slice(0, n + 2) + '…' : x)); };
  function chartHbar(c) {
    const items = c.items.filter((i) => isNum(i.value)); if (!items.length) return empty(520, 120, 'Sin datos para graficar');
    const W = 520, rowH = 38, T = 6, H = T + items.length * rowH + 6, labW = 132;
    const vals = items.map((i) => i.value), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
    const plotL = labW + 8 + (mn < 0 ? 92 : 0), plotR = W - 8 - (mx > 0 ? 92 : 0), sc = (plotR - plotL) / ((mx - mn) || 1), x0 = plotL - mn * sc;
    let g = `<line x1="${x0}" x2="${x0}" y1="${T}" y2="${H - 4}" stroke="${C.grey}"/>`;
    items.forEach((it, i) => {
      const y = T + i * rowH + 7, w = Math.abs(it.value) * sc, x = it.value >= 0 ? x0 : x0 - w, col = it.value >= 0 ? C.green : C.red;
      const ln = wrapLbl(it.label, 19); g += `<g><title>${esc(it.label)}</title>${ln.length > 1 ? ln.map((t2, k) => svgT(labW, y + 10 + k * 14, t2, { anchor: 'end', fill: C.ink })).join('') : svgT(labW, y + 17, ln[0], { anchor: 'end', fill: C.ink })}</g>` + `<rect x="${x}" y="${y}" width="${Math.max(2, w)}" height="22" fill="${col}" rx="2"/>`;
      g += it.value >= 0 ? svgT(x + w + 5, y + 17, `▲ ${sMC(it.value)}`, { fill: col, weight: 700 }) : svgT(x - 5, y + 17, `▼ ${sMC(it.value)}`, { anchor: 'end', fill: col, weight: 700 });
    });
    return wrap(W, H, g, c.title);
  }

  function chartRange(c) {
    const W = 560, H = 150, L = 24, R = 24;
    const pts = [c.min, c.max, c.selected, c.goal].filter(isNum), lo = Math.min(...pts), hi = Math.max(...pts), pad = ((hi - lo) || hi * 0.02) * 0.35;
    const X = (v) => L + (W - L - R) * (v - (lo - pad)) / ((hi + pad) - (lo - pad)), y = 82;
    let g = `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="${C.light}" stroke-width="2"/>`;
    g += `<rect x="${X(c.min)}" y="${y - 14}" width="${Math.max(3, X(c.max) - X(c.min))}" height="28" fill="${c.material ? '#F6D9A8' : '#CFE0F3'}" stroke="${c.material ? C.orange : C.blue}" stroke-width="1.5" rx="3"/>`;
    g += svgT(X(c.min), y + 40, fmt('moneyC', c.min), { anchor: 'middle' }) + svgT(X(c.max), y + 40, fmt('moneyC', c.max), { anchor: 'middle' });
    if (isNum(c.goal)) g += `<line x1="${X(c.goal)}" x2="${X(c.goal)}" y1="${y - 36}" y2="${y + 22}" stroke="${C.red}" stroke-width="2.2"/>${svgT(X(c.goal), y - 42, `Meta ${fmt('moneyC', c.goal)}`, { anchor: 'middle', fill: C.red, weight: 700 })}`;
    if (isNum(c.selected)) g += marker('dia', X(c.selected), y, C.navy, 8) + svgT(X(c.selected), y + 26, '', {});
    g += `${marker('dia', L + 6, 14, C.navy, 6)}${svgT(L + 18, 19, 'Método elegido')}<rect x="${L + 150}" y="8" width="22" height="12" fill="#CFE0F3" stroke="${C.blue}"/>${svgT(L + 178, 19, 'Rango entre métodos con datos suficientes')}`;
    return wrap(W, H, g, c.title);
  }

  function chartStacked(c) {
    const W = 520, H = 190, L = 50, R = 10, T = 34, B = 24, n = c.labels.length;
    const totals = c.labels.map((_, i) => c.series.reduce((a, s) => a + (isNum(s.values[i]) ? s.values[i] : 0), 0)), tk = ticks(Math.max(...totals, 1)), ymax = tk[tk.length - 1];
    const Y = (v) => T + (H - T - B) * (1 - v / ymax), slot = (W - L - R) / n, bw = Math.min(56, slot * 0.6);
    const fills = [C.navy, 'url(#rpp1)', 'url(#rpp2)'], strokes = [C.navy, C.blue, C.teal];
    let g = `<defs><pattern id="rpp1" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#BBD2EC"/><line x1="0" y1="0" x2="0" y2="8" stroke="${C.blue}" stroke-width="3"/></pattern><pattern id="rpp2" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#CDEBE6"/><circle cx="3.5" cy="3.5" r="1.8" fill="${C.teal}"/></pattern></defs>`;
    g += tk.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.light}"/>${svgT(L - 6, Y(v) + 4, fmt('int', v), { anchor: 'end' })}`).join('');
    c.labels.forEach((lab, i) => {
      const x = L + i * slot + (slot - bw) / 2; let acc = 0;
      c.series.forEach((s, k) => { const v = isNum(s.values[i]) ? s.values[i] : 0; if (v > 0) g += `<rect x="${x}" y="${Y(acc + v)}" width="${bw}" height="${Y(acc) - Y(acc + v)}" fill="${fills[k % 3]}" stroke="${strokes[k % 3]}"/>`; acc += v; });
      g += svgT(x + bw / 2, Y(acc) - 5, fmt('int', acc), { anchor: 'middle', fill: C.ink, weight: 700 }) + svgT(x + bw / 2, H - 8, /^\d{4}-\d{2}$/.test(lab) ? `${MO[+lab.slice(5) - 1].toLowerCase()} ${lab.slice(2, 4)}` : lab.slice(2), { anchor: 'middle' });
    });
    let lx = L; c.series.forEach((s, k) => { g += `<rect x="${lx}" y="8" width="16" height="14" fill="${fills[k % 3]}" stroke="${strokes[k % 3]}"/>${svgT(lx + 21, 20, s.name)}`; lx += 38 + s.name.length * 7.5; });
    return wrap(W, H, g, c.title);
  }

  function chartLines(c) {
    const W = 590, H = 262, L = 50, R = 16, T = 36, B = 28;
    const all = c.series.flatMap((s) => s.values).filter(isNum).concat(c.baseline || 1); const lo = Math.min(...all), hi = Math.max(...all), pad = ((hi - lo) || 0.2) * 0.15;
    const Y = (v) => T + (H - T - B) * (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))), X = (i) => L + i * (W - L - R) / 11;
    let g = ''; const step = (hi - lo) > 0.6 ? 0.2 : 0.1;
    for (let v = Math.ceil((lo - pad) / step) * step; v <= hi + pad; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.light}"/>${svgT(L - 6, Y(v) + 4, v.toFixed(1), { anchor: 'end' })}`;
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(c.baseline || 1)}" y2="${Y(c.baseline || 1)}" stroke="${C.grey}" stroke-dasharray="3 3"/>` + c.labels.map((m, i) => svgT(X(i), H - 8, m, { anchor: 'middle' })).join('');
    const sty = [[C.navy, '', 'circ'], [C.teal, '8 4', 'sq'], [C.orange, '2 4', 'tri'], [C.blue, '10 3 2 3', 'dia']]; let lx = L;
    c.series.forEach((s, k) => { const [col, dash, mk] = sty[k % 4];
      segs(s.values, X, Y, 0, 11).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${col}" stroke-width="2.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`; });
      s.values.forEach((v, i) => { if (isNum(v)) g += marker(mk, X(i), Y(v), col, 3.6); });
      g += `<line x1="${lx}" x2="${lx + 22}" y1="14" y2="14" stroke="${col}" stroke-width="2.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/>${marker(mk, lx + 11, 14, col, 3.6)}${svgT(lx + 27, 19, s.name)}`; lx += 48 + s.name.length * 7.2; });
    return wrap(W, H, g, c.title);
  }

  function spark(series) {
    const v = (series || []).map((x) => (x && isNum(x.value) ? x.value : null)); const ok = v.filter(isNum);
    if (ok.length < 2) return '<span class="rp-na">—</span>';
    const lo = Math.min(...ok), hi = Math.max(...ok), W = 72, H = 22, X = (i) => 3 + i * (W - 6) / (v.length - 1), Y = (a) => 3 + (H - 6) * (1 - (a - lo) / ((hi - lo) || 1));
    const d = segs(v, X, Y, 0, v.length - 1).join(''); const li = v.map(isNum).lastIndexOf(true);
    return `<svg class="rp-spark-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Evolución de ${v.length} períodos"><path d="${d}" fill="none" stroke="${C.navy}" stroke-width="1.8"/><circle cx="${X(li)}" cy="${Y(v[li])}" r="2.8" fill="${C.navy}"/></svg>`;
  }

  const CHARTS = { cumulative: chartCumulative, waterfall: chartWaterfall, hbar: chartHbar, range: chartRange, stacked: chartStacked, lines: chartLines };
  const chartHtml = (c) => `<figure class="rp-fig"><figcaption>${esc(c.title)}</figcaption>${(CHARTS[c.type] || (() => ''))(c)}</figure>`;

  /* ================= bloques HTML ================= */
  const tagHtml = (t) => (t ? `<span class="rp-tag rp-tag--${{ Observado: 'obs', Calculado: 'calc', Estimado: 'est' }[t] || 'calc'}">${esc(t)}</span>` : '');
  function kpisHtml(p, showTags) {
    if (!p.kpis || !p.kpis.length) return '';
    return `<div class="rp-kpis">${p.kpis.map((k, i) => `<div class="rp-kpi${i === 0 ? ' rp-kpi--hero' : ''}${k.tone ? ` rp-kpi--${k.tone}` : ''}"><div class="rp-kpi__l">${esc(k.label)}</div>${showTags && k.tag ? `<span class="rp-kpi__tag">${tagHtml(k.tag)}</span>` : ''}
      <div class="rp-kpi__v${k.kind === 'text' ? ' rp-kpi__v--t' : ''}">${k.tone === 'pos' && isNum(k.value) && k.value > 0 ? '▲ ' : k.tone === 'neg' && isNum(k.value) && k.value < 0 ? '▼ ' : ''}${esc(fmt(k.kind === 'smoney' ? 'smoneyC' : k.kind === 'money' ? 'moneyC' : k.kind, k.value))}</div>
      <div class="rp-kpi__s${showTags && k.tag ? ' rp-kpi__s--tag' : ''}">${k.sub ? esc(k.sub) : '&nbsp;'}</div></div>`).join('')}</div>`;
  }
  const nice = (v) => { const t = String(v == null ? '' : v); return t && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t) ? t.toLowerCase().replace(/(^|[\s(\/-])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()) : t; };
  const cut2 = (t, n) => (t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t);
  function tableHtml(t, exact) {
    if (!t.rows || !t.rows.length) return `<div class="rp-tbl"><div class="rp-tbl__t">${esc(t.title)}</div><p class="rp-empty">Sin datos para mostrar.</p></div>`;
    const cell = (c, r) => {
      const kind = c.kindBy ? ((t.kindMap || {})[r[c.kindBy]] || 'text') : c.kind, v = r[c.key];
      if (kind === 'spark') return `<td class="rp-spk">${spark(v)}</td>`;
      const na = v === null || v === undefined || (typeof v === 'number' && !isFinite(v));
      const tone = c.tone && isNum(v) ? (v > 0 ? ' rp-pos' : v < 0 ? ' rp-neg' : '') : '';
      const k2 = exact ? kind : (kind === 'smoney' ? 'smoneyC' : kind === 'money' ? 'moneyC' : kind);   // lámina: $5.11M en vez de $5,112,073 (el anexo conserva el exacto)
      const txt = !na && k2 === 'text' && c.key === 'entity' ? cut2(nice(v), 44) : fmt(k2, v);
      return `<td class="${c.num ? 'num' : ''}${tone}${na ? ' rp-na' : ''}">${esc(txt)}</td>`;
    };
    return `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">${esc(t.title)}</div><table class="rp-t${t.id === 'retention' ? ' rp-t--rt' : ''}"><thead><tr>${t.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr${r._total ? ' class="rp-total"' : ''}>${t.columns.map((c) => cell(c, r)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  let NOANNEX = false;   // se fija en docHtml: si el anexo no va en el PDF, no se remite a él
  const dx = (t) => (NOANNEX ? String(t == null ? '' : t).replace(/\s*\((?:detalle|ver)[^)]*anexo[^)]*\)/i, '').replace(/\s*El detalle de cada método está en el anexo\.?/i, '').replace(/\s*Ver anexo técnico\.?/i, '').trim() : t);
  const notesHtml = (p) => (p.notes && p.notes.length ? `<ul class="rp-notes">${p.notes.map((n) => `<li>${esc(dx(n))}</li>`).join('')}</ul>` : '');
  const callout = (txt, tone = 'info', title = '') => `<div class="rp-callout rp-callout--${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${esc(dx(txt))}</div>`;

  /* Alcance: solo se imprime lo que cambia la lectura (filtro activo, período parcial); el resto va en el encabezado de la lámina. */
  const scopeNote = (p) => { const sc = p.scope || {}; const bits = [sc.filter ? `Filtro: ${sc.filter}` : null, sc.partial && !(p.notes || []).some((n) => /parcial/i.test(n)) ? 'Incluye un período parcial.' : null].filter(Boolean); return bits.length ? `<p class="rp-scope">${esc(bits.join(' · '))}</p>` : ''; };
  /* ================= cuerpo por página ================= */
  const TYPECLS = { Canal: 'c', Palanca: 'p', 'Categoría': 'g', Producto: 'r' };
  const moverRow = (i, pos) => `<div class="rp-mv__r"><span class="rp-mv__tp rp-mv__tp--${TYPECLS[i.type] || 'o'}">${esc(i.type)}</span><div class="rp-mv__n"><b>${esc(i.name)}</b>${i.evidence ? `<small>${esc(i.evidence)}</small>` : ''}</div><div class="rp-mv__v ${pos ? 'rp-pos' : 'rp-neg'}">${esc(fmt('smoneyC', i.value))}<span class="rp-mv__bar"><i class="${pos ? 'pos' : 'neg'}" style="width:${Math.max(4, Math.round((i.weight || 0) * 100))}%"></i></span></div></div>`;
  const moversStrip = (m) => `<div class="rp-strip"><div class="rp-strip__g rp-strip__g--m"><span class="rp-strip__t">Lo que más resta</span>${m.minus.map((i) => `<div class="rp-chip rp-chip--m"><i>${esc(i.type.toUpperCase())}</i><b>${esc(fmt('smoneyC', i.value))}</b><span>${esc(i.name)}</span></div>`).join('') || '<div class="rp-chip rp-chip--e"><span>Nada resta de forma medible</span></div>'}</div>
    <div class="rp-strip__g rp-strip__g--p"><span class="rp-strip__t">Lo que más suma</span>${m.plus.map((i) => `<div class="rp-chip rp-chip--p"><i>${esc(i.type.toUpperCase())}</i><b>${esc(fmt('smoneyC', i.value))}</b><span>${esc(i.name)}</span></div>`).join('') || '<div class="rp-chip rp-chip--e"><span>Nada suma de forma medible</span></div>'}</div></div>`;

  /* Tabla «Por canal» del pacing con una mini-barra de brecha por fila (la longitud es relativa a la mayor brecha). */
  function chanTable(t) {
    if (t.id !== 'by-channel' || !t.rows || !t.rows.length) return tableHtml(t);
    const mx = Math.max(...t.rows.filter((r) => !r._total).map((r) => (isNum(r.gap) ? Math.abs(r.gap) : 0)), 1);
    const bar = (r) => (isNum(r.gap) && !r._total ? `<span class="rp-gb"><i class="${r.gap >= 0 ? 'pos' : 'neg'}" style="width:${Math.max(3, Math.round(Math.abs(r.gap) / mx * 100))}%"></i></span>` : '');
    const tone = (v) => (isNum(v) ? (v > 0 ? ' rp-pos' : v < 0 ? ' rp-neg' : '') : '');
    return `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">${esc(t.title)}</div><table class="rp-t rp-t--ch"><thead><tr><th>Canal</th><th class="num">Real</th><th class="num">Plan esperado</th><th class="num">Brecha</th><th></th><th class="num">%</th></tr></thead><tbody>${t.rows.map((r) => `<tr${r._total ? ' class="rp-total"' : ''}><td>${esc(r.channel)}</td><td class="num">${esc(fmt('moneyC', r.real))}</td><td class="num">${esc(fmt('moneyC', r.plan))}</td><td class="num${tone(r.gap)}">${esc(fmt('smoneyC', r.gap))}</td><td class="rp-gbc">${bar(r)}</td><td class="num${tone(r.gapPct)}">${esc(fmt('spct', r.gapPct))}</td></tr>`).join('')}</tbody></table></div>`;
  }
  const recoveryPlain = (p, x) => `${kpisHtml(p, x.tags)}${p.progress ? `<div class="rp-panel"><div class="rp-panel__t"><span>${esc(p.progress.label || 'Avance hacia la meta anual')}</span><span>${esc(fmt('pct', p.progress.pct))} · ${esc(fmt('moneyC', p.progress.real))} de ${esc(fmt('moneyC', p.progress.target))}</span></div><div class="rp-bar" role="img" aria-label="Avance ${esc(fmt('pct', p.progress.pct))}"><i style="width:${Math.max(0, Math.min(100, p.progress.pct * 100)).toFixed(1)}%"></i></div></div>` : ''}<div class="rp-row"><div class="rp-col-h"><div class="rp-tbl__t">Escenarios guardados</div>${p.scenarios.length
        ? `<table class="rp-t"><thead><tr><th>Escenario</th><th>Canal</th><th>Tipo</th></tr></thead><tbody>${p.scenarios.slice(0, 4).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(fmt('text', s.channel))}</td><td>${esc(fmt('text', s.type))}</td></tr>`).join('')}${p.scenarios.length > 4 ? `<tr><td colspan="3" class="rp-empty">Y ${p.scenarios.length - 4} más en Recovery Center.</td></tr>` : ''}</tbody></table>` : '<p class="rp-empty">Siguiente paso: guardar un escenario de recuperación para el canal más rezagado.</p>'}</div>
      <div class="rp-col-h"><div class="rp-tbl__t">Acciones registradas</div>${p.actions.length
        ? `<table class="rp-t"><thead><tr><th>Acción</th><th>Canal</th><th>Responsable</th><th>Fechas</th></tr></thead><tbody>${p.actions.slice(0, 4).map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(fmt('text', a.channel))}</td><td>${esc(fmt('text', a.owner))}</td><td>${esc(a.start ? `${fmt('date', a.start)} – ${a.end ? fmt('date', a.end) : '…'}` : NA)}</td></tr>`).join('')}${p.actions.length > 4 ? `<tr><td colspan="4" class="rp-empty">Y ${p.actions.length - 4} más en Recovery Center.</td></tr>` : ''}</tbody></table>` : '<p class="rp-empty">Siguiente paso: definir una acción con responsable y fecha para el canal más rezagado.</p>'}</div></div>${notesHtml(p)}`;

  /** Recuperación con respaldo por canal: de dónde salen la brecha neta y la suma de canales rezagados, acciones y siguiente paso. */
  function recoveryNet(p, x) {
    const b = p.byChannel, m = (v) => esc(fmt('moneyC', v)), dash = '—';
    const rows = b.rows.map((r) => `<tr><td><b>${esc(r.channel)}</b></td><td class="num">${m(r.real)}</td><td class="num">${m(r.plan)}</td><td class="num${r.shortfall > 0 ? ' rp-neg' : ''}">${r.shortfall > 0 ? `<b>${m(r.shortfall)}</b>` : dash}</td><td class="num${r.surplus > 0 ? ' rp-pos' : ''}">${r.surplus > 0 ? `<b>${m(r.surplus)}</b>` : dash}</td></tr>`).join('');
    const t = b.total, per = p.progress && /plan de/i.test(p.progress.label || '') ? 'plan' : 'meta';
    const table = `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">Por canal: de dónde salen las dos cifras</div><table class="rp-t rp-t--rt"><thead><tr><th>Canal</th><th class="num">Real</th><th class="num">${per === 'plan' ? 'Plan del mes' : 'Meta'}</th><th class="num">Falta</th><th class="num">Superó</th></tr></thead><tbody>${rows}<tr class="rp-total"><td>Total</td><td class="num">${m(t.real)}</td><td class="num">${m(t.plan)}</td><td class="num rp-neg">${m(t.shortfall)}</td><td class="num rp-pos">${t.surplus > 0 ? m(t.surplus) : dash}</td></tr></tbody></table></div>`;
    const how = `<div class="rp-card"><b>Cómo leerlo</b><br>Los ${m(t.shortfall)} suman lo que le falta a cada canal que aún no llega a su ${per}. ${b.rows.filter((r) => r.surplus > 0).map((r) => r.channel).join(' y ') || 'Otros canales'} ya lo superó${b.rows.filter((r) => r.surplus > 0).length > 1 ? 'ron' : ''} por ${m(t.surplus)}, y ese excedente no se resta. Por eso, en neto, faltan ${m(t.net)} (${per} − real).</div>`;
    const acts = p.actions.length ? `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">Acciones registradas</div><table class="rp-t"><thead><tr><th>Acción</th><th>Canal</th><th>Responsable</th><th>Fechas</th></tr></thead><tbody>${p.actions.slice(0, 4).map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(fmt('text', a.channel))}</td><td>${esc(fmt('text', a.owner))}</td><td>${esc(a.start ? `${fmt('date', a.start)} – ${a.end ? fmt('date', a.end) : '…'}` : NA)}</td></tr>`).join('')}${p.actions.length > 4 ? `<tr><td colspan="4" class="rp-empty">Y ${p.actions.length - 4} más en Recovery Center.</td></tr>` : ''}</tbody></table></div>` : '';
    const scen = p.scenarios.length ? `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">Escenarios guardados</div><table class="rp-t"><thead><tr><th>Escenario</th><th>Canal</th><th class="num">Impacto estimado</th></tr></thead><tbody>${p.scenarios.slice(0, 3).map((q) => `<tr><td>${esc(q.name)}</td><td>${esc(fmt('text', q.channel))}</td><td class="num">${esc(isNum(q.impact) ? fmt('smoneyC', q.impact) : NA)}</td></tr>`).join('')}</tbody></table></div>` : '';
    const lag = b.rows.filter((r) => r.shortfall > 0).slice(0, 2), share = t.shortfall > 0 ? lag.reduce((a, r) => a + r.shortfall, 0) / t.shortfall : null;
    const nm = lag.map((r) => r.channel).join(' y ');
    const next = lag.length ? `<div class="rp-card"><b>Siguiente paso</b><br>${esc(nm)} concentra${lag.length > 1 ? 'n' : ''} ${isNum(share) ? `${Math.round(share * 100)} % ` : ''}de lo que falta: ${p.actions.length ? 'confirma que sus acciones cubren esa brecha' : 'define una acción con responsable y fecha'}${p.scenarios.length ? '.' : ' y guarda un escenario de recuperación.'}</div>` : '';
    const bare = !acts && !scen;   // sin acciones ni escenarios: la tabla a la izquierda y las dos lecturas apiladas a la derecha (sin hueco vacío)
    return `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-h">${bare ? table : table + how}</div><div class="rp-col-h">${bare ? next + how : acts + scen + next}</div></div>${notesHtml({ notes: (p.notes || []).slice(1) })}`;
  }

  const BODY = {
    movers: (p) => `<div class="rp-mv"><section class="rp-mv__c rp-mv__c--m"><h3 class="rp-mv__h">Lo que resta${p.channelSums && isNum(p.channelSums.minus) ? `<span class="rp-neg">${esc(fmt('smoneyC', p.channelSums.minus))}</span>` : ''}</h3>${p.minus.map((i) => moverRow(i, false)).join('') || '<p class="rp-empty">Nada resta de forma medible en este período.</p>'}</section>
      <section class="rp-mv__c rp-mv__c--p"><h3 class="rp-mv__h">Lo que suma${p.channelSums && isNum(p.channelSums.plus) ? `<span class="rp-pos">${esc(fmt('smoneyC', p.channelSums.plus))}</span>` : ''}</h3>${p.plus.map((i) => moverRow(i, true)).join('') || '<p class="rp-empty">Nada suma de forma medible en este período.</p>'}</section></div>${p.channelSums && (isNum(p.channelSums.minus) || isNum(p.channelSums.plus)) ? `<p class="rp-scope">Los totales de cada lado suman solo los canales${p.totals ? ` (resultado frente a ${esc(p.totals.ref)}: ${esc(fmt('smoneyC', p.totals.gap))})` : ''}.</p>` : ''}${notesHtml(p)}`,
    pacing: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(chanTable).join('')}</div></div>
      ${p.caveat ? callout(p.caveat, 'warn') : ''}${p.reconciliation ? callout(p.notes[0], 'warn') : ''}<ul class="rp-notes">${p.notes.filter((n, i) => !(p.reconciliation && i === 0)).map((n) => `<li>${esc(dx(n))}</li>`).join('')}</ul>`,
    reliability: (p, x) => {
      const s = p.suficiencia || {};
      return `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a">${p.charts.map(chartHtml).join('') || '<p class="rp-empty">No hay otros métodos con datos suficientes para contrastar.</p>'}</div>
        <div class="rp-col-b"><div class="rp-box"><div class="rp-box__t">Suficiencia de datos del método elegido</div>
          <div class="rp-box__v rp-box__v--${s.light || 'na'}">${s.light === 'green' ? '● ' : s.light === 'yellow' ? '▲ ' : s.light === 'red' ? '■ ' : ''}${esc(s.text || NA)}</div>
          <dl class="rp-dl"><dt>Días contados</dt><dd>${esc(fmt('int', s.countedDays))}</dd><dt>Confianza del motor</dt><dd>${esc(fmt('text', s.confidence))}</dd><dt>Calidad de datos</dt><dd>${esc(fmt('text', s.dataQuality))}</dd></dl>
          ${s.reasons && s.reasons.length ? `<p class="rp-small">${esc(s.reasons.join(' · '))}</p>` : ''}</div></div></div>
        ${p.warning ? callout(p.notes[0], 'warn', 'Advertencia') : ''}<ul class="rp-notes">${p.notes.filter((n, i) => !(p.warning && i === 0)).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    },
    drivers: (p, x) => driversBody(p, x),
    trends: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-stack">${p.tables.filter((t) => t.rows && t.rows.length).map((t) => tableHtml(t)).join('')}</div>${p.tables.some((t) => !(t.rows && t.rows.length)) ? `<p class="rp-scope">${esc(p.tables.filter((t) => !(t.rows && t.rows.length)).map((t) => `${t.title}: ninguna entidad en este período.`).join(' '))}</p>` : ''}
      ${scopeNote(p)}${notesHtml(p)}`,
    categories: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>
      ${scopeNote(p)}${notesHtml(p)}`,
    customers: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('')}${retStrip(p)}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}${p.lapsed ? lapsedBox(p) : ''}</div></div>
      ${p.scope && p.scope.label && !/^Toda la empresa$/i.test(p.scope.label) ? `<p class="rp-scope">Alcance: ${esc(p.scope.label)}</p>` : ''}${notesHtml(p.lapsed && p.lapsed.monthLabel ? { notes: (p.notes || []).filter((n) => !/clientes que compraron el mes anterior/.test(n)) } : p)}`,
    traffic: (p, x) => p.overview ? trafficBody(p, x) : `${p.tables.map(tableHtml).join('')}<p class="rp-scope">${esc([p.scope.dimension, p.scope.comparison, p.scope.denominator].filter(Boolean).join(' · '))}</p>${notesHtml(p)}`,
    recovery: (p, x) => (p.byChannel ? recoveryNet(p, x) : recoveryPlain(p, x)),
    campaigns: (p, x) => campaignsBody(p, x),
    seasonality: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('') || '<p class="rp-empty">No hay años completos para calcular estacionalidad.</p>'}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>${notesHtml(p)}`
  };




  /* Clientes del mes anterior que volvieron a comprar este mes, con la tasa de los meses anteriores como referencia. */
  function lapsedBox(p) {
    const L = p.lapsed;
    if (!L.monthLabel) return `<div class="rp-box"><div class="rp-box__t">Compraron el mes anterior y no regresaron en ${esc(L.month)}</div><div class="rp-box__v">${esc(fmt('int', L.count))} de ${esc(fmt('int', L.base))}</div></div>`;
    const pc = (v) => `${Math.round(v * 100)} %`, ret = L.returned;
    const hist = isNum(L.histBase) && isNum(L.histBought) ? ` · Base histórica: ${esc(fmt('int', L.histBase))} clientes; en ${esc(L.monthLabel)} compraron ${esc(fmt('int', L.histBought))} (${pc(L.histBought / L.histBase)})` : '';
    return `<div class="rp-box"><div class="rp-box__t">Compraron en ${esc(L.prevLabel)} y volvieron en ${esc(L.monthLabel)}${L.inProgress ? ' (mes en curso)' : ''}</div><div class="rp-box__v">${esc(fmt('int', ret))} de ${esc(fmt('int', L.base))} · ${pc(ret / L.base)} <small>(sin volver aún: ${esc(fmt('int', L.count))})</small></div><p class="rp-box__h rp-box__h--s">${hist ? hist.slice(3) : ''}</p></div>`;
  }
  /* Regreso mes a mes debajo de cada barra: alineado con las barras del gráfico (misma columna por mes). */
  function retStrip(p) {
    const ch = (p.charts || [])[0], rs = p.returns || []; if (!ch || !ch.labels || !rs.length) return '';
    const by = Object.fromEntries(rs.map((r) => [r.key, r])), pc = (v) => (isNum(v) ? `${Math.round(v * 100)} %` : '—');
    const row = (lbl, k) => (rs.some((r) => isNum(r[k])) ? `<div class="rp-rs__cap">${lbl}</div><div class="rp-rs__row">${ch.labels.map((m) => { const r = by[m]; return `<span class="${r && r.partial ? 'rp-rs--p' : ''}">${r ? pc(r[k]) + (r.partial ? '*' : '') : '—'}</span>`; }).join('')}</div>` : '');
    return `<div class="rp-rs">${row(`Volvieron del mes anterior (% de quienes compraron el mes previo)${rs.some((r) => r.partial) ? ' · *mes en curso' : ''}`, 'rate')}${row('Base histórica que compra (% de clientes con compra antes del mes)', 'histRate')}</div>`;
  }

  /* ================= Brecha: barras divergentes por palanca (reemplaza la cascada) ================= */
  const GLOSS = { trafficVolume: 'Más o menos visitas y contactos', conversionRate: 'Qué parte de ellas termina en pedido', aov: 'Cuánto vale cada pedido' };
  function driversBody(p, x) {
    const t0 = p.tables[0] || { rows: [] }, rows = t0.rows || [], t1 = p.tables.find((t) => t.id === 'channels');
    if (!rows.length) return notesHtml(p);
    const net = rows.reduce((a, r) => a + (isNum(r.contribution) ? r.contribution : 0), 0), mx = Math.max(...rows.map((r) => Math.abs(r.contribution)), Math.abs(net), 1);
    const bar = (v, navy) => { const w = Math.max(1.5, Math.abs(v) / mx * 24); const cls = navy ? 'nv' : v >= 0 ? 'pos' : 'neg'; return `<div class="rp-dv__t"><i class="rp-dv__ax"></i><i class="rp-dv__b rp-dv__b--${cls}" style="${v >= 0 ? `left:50%` : `right:50%`};width:${w.toFixed(1)}%"></i><span class="rp-dv__v ${v >= 0 ? 'rp-pos' : 'rp-neg'}" style="${v >= 0 ? `left:calc(${(50 + w).toFixed(1)}% + 6px)` : `right:calc(${(50 + w).toFixed(1)}% + 6px)`}">${esc(fmt('smoneyC', v))}</span></div>`; };
    const short = { trafficVolume: 'Volumen', conversionRate: 'CR', aov: 'AOV' };
    const left = rows.map((r) => `<div class="rp-dv__r"><span class="rp-dv__l">${esc(short[r._kind] || r.driver)}</span>${bar(r.contribution)}</div>`).join('') + `<div class="rp-dv__r rp-dv__r--net"><span class="rp-dv__l">Resultado neto</span>${bar(net, true)}</div>`;
    const right = rows.map((r) => `<div class="rp-dv2"><div class="rp-dv2__n"><b>${esc(short[r._kind] || r.driver)}</b><small>${esc(GLOSS[r._kind] || '')}</small><em>${isNum(r.deltaPct) ? `${esc(fmt('spct', r.deltaPct))} frente a la referencia` : ''}</em></div><div class="rp-dv2__v ${r.contribution >= 0 ? 'rp-pos' : 'rp-neg'}">${esc(fmt('smoneyC', r.contribution))}</div></div>`).join('');
    const ch = t1 && t1.rows && t1.rows.length ? `<div class="rp-dv__h">Mayor componente por canal</div>${t1.rows.map((r) => `<div class="rp-dv3"><b>${esc(r.channel)}</b><span class="${r.gap >= 0 ? 'rp-pos' : 'rp-neg'}">${esc(fmt('smoneyC', r.gap))}</span><small>${esc(r.main)}</small></div>`).join('')}` : '';
    return `<div class="rp-row rp-dvrow"><div class="rp-col-a"><div class="rp-dv__h">Aporte de cada componente a la brecha</div><div class="rp-dv">${left}</div></div>
      <div class="rp-col-b"><div class="rp-dv__h">Contribución de cada componente</div>${right}${ch}</div></div>${notesHtml(p)}`;
  }

  /* ================= Tráfico y conversión (panorama) y Campañas ================= */
  const rich = (t) => esc(t || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');   // «**cifra**» → negrita (texto ya escapado)
  const readingHtml = (p, x) => { const t = FP.reportCopy && FP.reportCopy.reading ? FP.reportCopy.reading(p, x.report) : null; return t ? `<div class="rp-read"><span class="rp-read__t">Lectura</span><span>${rich(t)}</span></div>` : ''; };
  const wkLabel = (w) => { const m = (iso) => MO[+iso.slice(5, 7) - 1].toLowerCase(); return `${+w.from.slice(8)}–${+w.to.slice(8)} ${m(w.to)}`; };
  function chartWeekly(wk) {
    const W = 560, H = 196, L = 46, R = 50, T = 14, B = 30, n = wk.length, gx = (W - L - R) / n, bw = Math.min(64, gx * 0.55), ih = H - T - B;
    const mt = Math.max(...wk.map((w) => w.perDay)) * 1.1, crs = wk.map((w) => w.cr).filter(isNum), c0 = crs.length ? Math.min(...crs) * 0.96 : 0, c1 = crs.length ? Math.max(...crs) * 1.04 : 1;
    const yb = (v) => T + ih - v / mt * ih, yc = (v) => T + ih - (v - c0) / ((c1 - c0) || 1) * ih, cx = (i) => L + gx * i + gx / 2;
    let g = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${T + ih - f * ih}" y2="${T + ih - f * ih}" stroke="${C.light}"/>${svgT(L - 6, T + ih - f * ih + 4, fmt('int', Math.round(mt * f / 1000)) + 'K', { anchor: 'end' })}${crs.length ? svgT(W - R + 6, T + ih - f * ih + 4, ((c0 + (c1 - c0) * f) * 100).toFixed(2) + '%', { fill: C.blue }) : ''}`).join('');
    wk.forEach((w, i) => { g += `<rect x="${cx(i) - bw / 2}" y="${yb(w.perDay)}" width="${bw}" height="${T + ih - yb(w.perDay)}" rx="3" fill="#DCE6F8"/>${svgT(cx(i), T + ih - 6, fmt('int', Math.round(w.perDay / 1000)) + 'K', { anchor: 'middle' })}${svgT(cx(i), H - 8, wkLabel(w), { anchor: 'middle' })}`; });
    const pts = wk.map((w, i) => (isNum(w.cr) ? [cx(i), yc(w.cr), w.cr] : null));
    g += `<path d="${segs(wk.map((w) => w.cr), (i) => cx(i), yc, 0, n - 1).join('')}" fill="none" stroke="${C.blue}" stroke-width="3"/>` + pts.map((q) => (q ? `<circle cx="${q[0]}" cy="${q[1]}" r="4.5" fill="${C.blue}" stroke="#fff" stroke-width="2"/>${svgT(q[0], q[1] - 10, (q[2] * 100).toFixed(2) + '%', { anchor: 'middle', fill: C.blue, weight: 700 })}` : '')).join('');
    return wrap(W, H, g, 'Tráfico diario promedio y conversión por semana');
  }
  const MIXC = ['#1F5FD6', '#0B1F3A', '#8FB0EE', '#9AA9C0'];
  function mixBlock(m) {
    const up = [...m.rows].sort((a, b) => (b.share - b.baseShare) - (a.share - a.baseShare))[0], d = up ? up.share - up.baseShare : 0;
    const note = up && Math.abs(d) >= 0.005 ? `${esc(up.label)} ${d > 0 ? 'gana' : 'pierde'} ${(Math.abs(d) * 100).toFixed(1)} pp` : 'sin cambio de mezcla';
    return `<div class="rp-mix"><div class="rp-mix__h"><b>${esc(m.label)}</b><span>${note}</span></div><div class="rp-mix__bar">${m.rows.map((r, i) => `<i style="width:${(r.share * 100).toFixed(1)}%;background:${MIXC[i % 4]}"></i>`).join('')}</div>
      <div class="rp-mix__lg">${[...m.rows].map((r, i) => ({ r, i })).filter((o) => o.r.share >= 0.03).slice(0, 4).map((o) => `<span><i style="background:${MIXC[o.i % 4]}"></i>${esc(cut(o.r.label, 18))} <b>${(o.r.share * 100).toFixed(0)} %</b></span>`).join('')}</div></div>`;
  }
  function trafficBody(p, x) {
    const o = p.overview, t = o.totals, tone = (v) => (isNum(v) ? (v > 0 ? ' rp-pos' : v < 0 ? ' rp-neg' : '') : '');
    const pp = isNum(t.crDiffPp) ? `${t.crDiffPp < 0 ? '−' : '+'}${(Math.abs(t.crDiffPp) * 100).toFixed(2)} pp` : '';
    const kp = (l, v, sub, cls = '', hero = false) => `<div class="rp-kpi${hero ? ' rp-kpi--hero' : ''}"><div class="rp-kpi__l">${l}</div><div class="rp-kpi__v">${v}</div><div class="rp-kpi__s${cls}">${sub || '&nbsp;'}</div></div>`;
    const notes = (p.notes || []).filter((n) => !/CAC|promedios de tasas/.test(n));
    return `<div class="rp-kpis">${kp('Sesiones', esc(fmt('int', t.traffic)), isNum(t.trafficChg) ? `${esc(fmt('spct', t.trafficChg))} vs. referencia` : '', tone(t.trafficChg), true)}${kp('Conversión', esc(fmt('pct2', t.cr)), pp, tone(t.crDiffPp))}${kp('Pedidos', esc(fmt('int', t.orders)), isNum(t.ordersChg) ? esc(fmt('spct', t.ordersChg)) : '', tone(t.ordersChg))}${kp('Ticket promedio', isNum(t.aov) ? esc(fmt('money', t.aov)) : NA, '')}</div>
      <div class="rp-row rp-tv"><div class="rp-tv__a">${o.weekly.length ? `<div class="rp-panel__t"><span>Tráfico diario promedio (barras) y conversión (línea) por semana</span></div>${chartWeekly(o.weekly)}` : ''}</div>
      <div class="rp-tv__b"><div class="rp-panel__t"><span>De dónde viene el tráfico</span></div>${o.mix.map(mixBlock).join('')}</div></div>
      ${o.atypical ? `<div class="rp-callout rp-callout--warn"><strong>Validar cobertura.</strong> La variación de sesiones o de conversión es extrema; revisa que el archivo de Segmentos cubra igual el período actual y el anterior.</div>` : ''}${readingHtml(p, x)}<p class="rp-scope">${esc([p.scope.period, p.scope.comparison].filter(Boolean).join(' · '))}${notes.length ? ' · ' + esc(notes.join(' ')) : ''}</p>`;
  }
  const QN = { star: 'Estrella', conversion: 'Convertir mejor', scale: 'Escalar tráfico', review: 'Revisar', low: 'Poco volumen' };
  function campaignsBody(p, x) {
    const c = p.campaigns, any = c.rows.some((r) => r.opportunity);
    const row = (r) => `<tr><td class="rp-tv__n">${esc(cut(r.name, 30))}</td><td><span class="rp-qd rp-qd--${r.quadrant}">${QN[r.quadrant]}</span></td><td class="num">${esc(fmt('int', r.traffic))}</td><td class="num">${esc(fmt('pct', r.share, 0))}</td><td class="num">${esc(fmt('int', r.orders))}</td><td class="num">${esc(fmt('pct2', r.cr))}</td><td class="num${isNum(r.crChg) ? (r.crChg < 0 ? ' rp-neg' : ' rp-pos') : ''}">${isNum(r.crChg) ? esc(fmt('spct', r.crChg)) : NA}</td><td class="num">${isNum(r.aov) ? esc(fmt('money', r.aov)) : NA}</td><td class="num"><b>${isNum(r.revenue) ? esc(fmt('moneyC', r.revenue)) : NA}</b></td><td class="num">${isNum(r.revenuePerSession) ? '$' + r.revenuePerSession.toFixed(2) : NA}</td>${any ? `<td class="num">${r.opportunity ? `<b class="rp-neg">${esc(fmt('moneyC', r.opportunity))}</b>` : '—'}</td>` : ''}</tr>`;
    return `${readingHtml(p, x)}<div class="rp-panel"><div class="rp-panel__t"><span>${c.shown < c.all ? `Las ${c.shown} campañas con más tráfico (de ${esc(fmt('int', c.all))})` : 'Campañas por tráfico'}</span></div>
      <table class="rp-t"><thead><tr><th>Campaña</th><th>Cuadrante</th><th class="num">Sesiones</th><th class="num">% tráfico</th><th class="num">Pedidos</th><th class="num">Conv.</th><th class="num">Cambio</th><th class="num">Ticket</th><th class="num">Venta</th><th class="num">Venta/ses.</th>${any ? '<th class="num">Oportunidad</th>' : ''}</tr></thead><tbody>${c.rows.map(row).join('')}</tbody></table></div>${notesHtml(p)}`;
  }

  /** Entidad que concentra la caída contra el resto del negocio (índice 100 = primer período); la línea punteada es el resto. */
  function focusSpark(sp) {
    const W = 270, H = 84, L = 6, R = 6, T = 10, B = 22, n = sp.periods.length, all = [...sp.entity, ...sp.rest], lo = Math.min(...all, 100) - 4, hi = Math.max(...all, 100) + 4;
    const X = (i) => L + (W - L - R) * i / Math.max(1, n - 1), Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    const path = (arr) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    const si = sp.since ? sp.periods.indexOf(sp.since) : -1;
    const lab = (k) => { const m = /^(\d{4})-(\d{2})$/.exec(k); return m ? `${MO[+m[2] - 1].toLowerCase()} ${m[1].slice(2)}` : k; };
    return wrap(W, H, `<line x1="${L}" x2="${W - R}" y1="${Y(100)}" y2="${Y(100)}" stroke="${C.light}"/><path d="${path(sp.rest)}" fill="none" stroke="${C.grey}" stroke-width="2" stroke-dasharray="5 4"/><path d="${path(sp.entity)}" fill="none" stroke="${C.red}" stroke-width="3"/>
      ${si >= 0 ? `<circle cx="${X(si)}" cy="${Y(sp.entity[si])}" r="4.5" fill="${C.red}"/>${svgT(X(si), H - 6, lab(sp.since), { anchor: 'middle', fill: C.red, weight: 700 })}` : ''}${svgT(L, H - 6, lab(sp.periods[0]), { fill: C.grey })}${svgT(W - R, H - 6, lab(sp.periods[n - 1]), { anchor: 'end', fill: C.grey })}`, `${sp.periods.length} períodos de ${p0(sp)}`);
  }
  const p0 = () => 'la entidad contra el resto del negocio';
  function summaryBody(p, x) {
    const shown = p.focus ? p.items.filter((i) => i.page !== 'focus') : p.items;   // con la banda del foco, su tarjeta sería repetir lo mismo
    const cards = shown.map((i) => `<li class="rp-find${i.n === 1 ? ' rp-find--lead' : ''}"><div class="rp-find__fig">${esc(i.figure || '')}</div><div class="rp-find__lab">${esc(i.figureLabel || '')}</div><h3 class="rp-find__t">${esc(i.title || i.text)}</h3><p class="rp-find__w">${esc(i.why || i.text)}</p>${i.note ? `<p class="rp-find__n">${esc(i.note)}</p>` : ''}</li>`).join('');
    const band = p.focus ? `<div class="rp-since">${p.focus.spark ? `<div class="rp-since__g">${focusSpark(p.focus.spark)}<div class="rp-since__k"><i class="k1"></i>${esc(p.focus.entity)} <i class="k2"></i>Resto del negocio</div></div>` : ''}<div class="rp-since__t">${esc(p.focus.text)}</div></div>` : '';
    const boldNum = (t) => esc(t).replace(/(\$[\d.,]+[MK]?|[+−-]?\d+(?:\.\d+)? ?%)/g, '<b>$1</b>');
    const mv = p.movers ? movCard(p.movers) : '';
    return `<div class="rp-sm"><div class="rp-sm__l">${p.narrative ? `<p class="rp-lead">${boldNum(p.narrative)}</p>` : ''}${band}${p.filterStrip ? `<p class="rp-yr rp-yr--f">${esc(p.filterStrip)}</p>` : ''}</div>
      <div class="rp-sm__r"><ol class="rp-finds rp-finds--stack">${cards}</ol>${mv}</div></div>
      ${p.yearStrip ? `<p class="rp-yr rp-yr--bottom"><span>En el año</span>${esc(p.yearStrip.replace(/^En el año \d{4}: ?/, ''))}</p>` : ''}
      ${p.review ? `<div class="rp-callout rp-callout--info"><strong>Qué revisar primero.</strong> ${esc(p.review.text)}</div>` : ''}`;
  }
  const movCard = (m) => { const col = (arr, tone, ttl) => `<div class="rp-mc__c"><div class="rp-mc__t rp-mc__t--${tone}">${ttl}</div>${arr.map((i) => `<div class="rp-mc__r"><span><em>${esc(i.type)}</em> ${esc(i.name)}</span><b class="${tone === 'p' ? 'rp-pos' : 'rp-neg'}">${esc(fmt('smoneyC', i.value))}</b></div>`).join('') || '<div class="rp-mc__e">Nada medible</div>'}</div>`;
    return `<div class="rp-mc">${col(m.plus, 'p', 'Qué suma')}${col(m.minus, 'm', 'Qué resta')}</div>`; };

  function closingBody(p, x) {
    const tx = dx;
    return `<div class="rp-close">${p.blocks.map((b, i) => `<section class="rp-cl rp-cl--${i + 1}"><h3 class="rp-cl__t">${esc(b.title)}</h3>${b.big ? `<div class="rp-cl__big">${esc(b.big)}</div><div class="rp-cl__u">${esc(b.unit)}</div>` : ''}${b.list ? `<ul class="rp-cl__list">${b.list.map((i) => `<li><span><em>${esc(i.type)}</em> ${esc(i.name)}</span><b class="${i.value < 0 ? 'rp-neg' : 'rp-pos'}">${esc(fmt('smoneyC', i.value))}</b></li>`).join('')}</ul>` : ''}${b.text ? `<p class="rp-cl__x">${esc(tx(b.text))}</p>` : ''}</section>`).join('')}</div>`;
  }

  function relBlock(r) {
    const sf = r.suficiencia || {};
    return `<div class="rp-panel"><div class="rp-panel__t"><span>Confiabilidad del cierre estimado</span><span>${esc(r.headline || '')}</span></div>${r.charts && r.charts.length ? r.charts.map(chartHtml).join('') : ''}<p class="rp-small">${esc([sf.text, sf.confidence ? `Confianza del motor: ${sf.confidence}` : null, ...(r.notes || []).slice(0, 2)].filter(Boolean).join(' · '))}</p></div>`;
  }
  function annexBody(p, x, sub) {
    const T = (title, cols, rows) => tableHtml({ title, columns: cols, rows }, true);
    if (sub === 1) {
      return `<div class="rp-row"><div class="rp-col-h">${T('Calidad de datos por archivo', [{ key: 'type', label: 'Tipo', kind: 'text' }, { key: 'files', label: 'Arch.', kind: 'int', num: true }, { key: 'imported', label: 'Importadas', kind: 'int', num: true }, { key: 'rejected', label: 'Rechaz.', kind: 'int', num: true }, { key: 'warning', label: 'Adv.', kind: 'int', num: true }, { key: 'error', label: 'Err.', kind: 'int', num: true }], p.quality)}
        ${T('Datos faltantes', [{ key: 'item', label: 'Concepto', kind: 'text' }, { key: 'value', label: 'Cuántos', kind: 'int', num: true }], p.missing)}</div>
        <div class="rp-col-h">${x.gapsPage ? T('Las brechas del reporte: qué mide cada una', [{ key: 'name', label: 'Brecha', kind: 'text' }, { key: 'what', label: 'Cómo se calcula', kind: 'text' }, { key: 'period', label: 'Período / horizonte', kind: 'text' }, { key: 'value', label: 'Valor', kind: 'smoney', num: true, tone: true }], x.gapsPage.gaps) + `<p class="rp-small">${esc(x.gapsPage.gapsNote || '')}</p>` : ''}${T('Páginas omitidas y motivo', [{ key: 'title', label: 'Página', kind: 'text' }, { key: 'reason', label: 'Motivo', kind: 'text' }], p.omitted.length ? p.omitted : [{ title: 'Ninguna', reason: 'Todas las páginas tuvieron datos suficientes.' }])}</div></div>`;
    }
    if (sub === 2) {
      return `<div class="rp-row"><div class="rp-col-h">${T('Comparación completa de métodos (sensibilidad; el método elegido no cambia)', [{ key: 'method', label: 'Método', kind: 'text' }, { key: 'status', label: 'Datos', kind: 'text' }, { key: 'forecast', label: 'Cierre', kind: 'moneyC', num: true }, { key: 'gap', label: 'vs. meta', kind: 'smoney', num: true, tone: true }, { key: 'days', label: 'Días', kind: 'int', num: true }, { key: 'fallback', label: 'Fallback', kind: 'int', num: true }], p.methods)}
        <p class="rp-small">${esc(p.methods.filter((m) => m.reasons).map((m) => `${m.method}: ${m.reasons}`).join(' · '))}</p>${x.relPage ? relBlock(x.relPage) : ''}</div>
        <div class="rp-col-h">${p.backtest.length ? T('Error histórico (WAPE a 7 días)', [{ key: 'method', label: 'Método', kind: 'text' }, { key: 'wape', label: 'Método', kind: 'pct', num: true }, { key: 'plan', label: 'Plan', kind: 'pct', num: true }], p.backtest) : ''}
        <p class="rp-small">${esc(p.backtestNote)}</p>${T('Supuestos del forecast y del reporte', [{ key: 'item', label: 'Supuesto', kind: 'text' }, { key: 'value', label: 'Valor', kind: 'text' }], p.assumptions)}</div></div>`;
    }
    return `<div class="rp-row"><div class="rp-col-h"><div class="rp-tbl__t">Definiciones</div><dl class="rp-defs">${p.definitions.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      <div class="rp-col-h"><div class="rp-tbl__t">Limitaciones de interpretación</div><ul class="rp-notes rp-notes--l">${p.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`;
  }

  /* ================= páginas, numeración e impresión ================= */
  function units(report, exclude) {
    const ex = new Set(exclude || []), out = [];
    const ORDER = ['cover', 'summary', 'pacing', 'drivers', 'movers', 'trends', 'categories', 'customers', 'traffic', 'campaigns', 'seasonality', 'recovery', 'closing', 'reliability', 'annex'], rank = (id) => { const i = ORDER.indexOf(id); return i < 0 ? ORDER.length : i; };   // solo el orden de lectura de la presentación; el reporte conserva el suyo
    report.pages.filter((p) => p.status === 'included' && !p.annex && !ex.has(p.id)).map((p, i) => ({ p, i })).sort((a, b) => rank(a.p.id) - rank(b.p.id) || a.i - b.i).map((o) => o.p).forEach((p) => {
      if (p.id === 'annex') [['Anexo técnico A · Calidad de datos y brechas', 1], ['Anexo técnico B · Métodos, backtest y confiabilidad', 2], ['Anexo técnico C · Definiciones y límites', 3]].forEach(([t, s]) => out.push({ id: 'annex', sub: s, title: t, page: p }));
      else out.push({ id: p.id, title: p.title, page: p });
    });
    out.forEach((u, i) => { u.number = i + 1; });
    return out;
  }
  const dateOf = (iso) => fmt('date', iso);
  const TITLES = { movers: 'Qué resta y qué suma', summary: 'Resumen ejecutivo', pacing: 'Desempeño contra el plan y proyección de cierre', drivers: 'Qué explica la diferencia: tráfico, conversión y ticket', trends: 'Evolución: qué cae y qué compensa', categories: 'Categorías y productos: dónde se concentra el cambio', customers: 'Clientes, recurrencia y valor', traffic: 'Tráfico y conversión por segmento', recovery: 'Recuperación: lo que falta para la meta', seasonality: 'Estacionalidad y meta del siguiente año', closing: 'Cierre ejecutivo | Qué nos llevamos de este periodo' };
  const SECTION = { summary: 'Resumen ejecutivo', pacing: 'Desempeño comercial', drivers: 'Qué explica la diferencia', movers: 'Qué suma y qué resta', trends: 'Evolución y movimientos', categories: 'Categorías y productos', customers: 'Clientes y recurrencia', traffic: 'Tráfico y conversión', campaigns: 'Campañas', recovery: 'Recuperación y prioridades', closing: 'Cierre ejecutivo', reliability: 'Método y confiabilidad', seasonality: 'Estacionalidad' };
  const DECO = '<svg class="rp-deco" width="640" height="420" viewBox="0 0 640 420" aria-hidden="true"><g fill="#fff" opacity=".10"><rect x="330" y="250" width="34" height="170"/><rect x="380" y="210" width="34" height="210"/><rect x="430" y="165" width="34" height="255"/><rect x="480" y="120" width="34" height="300"/><rect x="530" y="70" width="34" height="350"/><rect x="580" y="20" width="34" height="400"/></g><g fill="none" stroke="#8DB6E8" stroke-width="2.5" opacity=".55"><path d="M0 330 L90 290 L180 308 L270 230 L360 250 L450 160 L540 150 L640 60"/></g><circle cx="640" cy="60" r="7" fill="#8DB6E8" opacity=".8"/></svg>';
  /** Marca (logo): grande en la portada dentro de un recuadro claro, pequeña en el pie. Sin logo guardado queda el cuadrito de siempre. */
  function brandLogo() { const b = FP.brand && FP.brand.active && FP.brand.active(); return b && b.logo ? b.logo : null; }
  function brandMark(big) { const l = brandLogo(); return l ? `<img class="${big ? 'rp-logo-l' : 'rp-logo-s'}" src="${l.dataUrl}" alt="Logo">` : (big ? '<span class="rp-mark"></span>' : ''); }
  function brandName(p) { return brandLogo() && p && p.businessName ? p.businessName : 'RevNavigator'; }
  function pageHtml(u, x) {
    const p = u.page;
    const fl = ((x.units.find((q) => q.id === 'cover') || {}).page || {}).filterLabel || '';
    const scopeTag = !fl ? null : (['categories', 'trends', 'customers'].includes(u.id) || (u.id === 'pacing' && p.selection)) ? `Filtro: ${fl}` : (['drivers', 'recovery'].includes(u.id) || (u.id === 'pacing' && !p.selection)) ? 'Total del negocio (el plan no tiene este filtro)' : null;
    const ctxLine = [x.channelLabel === 'Total digital' ? null : x.channelLabel, scopeTag, p.ctx || null].filter(Boolean).join(' · ');
    const per = ((x.units.find((q) => q.id === 'cover') || {}).page.facts.find((f) => f.id === 'period') || {}).value || '';
    const foot = `<div class="rp-foot"><span>${brandMark(false)}${esc(brandName(null))} · ${esc(x.channelLabel)}${x.lastActual ? ` · Venta real al ${esc(x.lastActual)} (corte ${esc(x.cutoff)})` : ''}${x.tags && p.sources && p.sources.length ? ` · Fuente: ${esc(p.sources.join(', '))}${p.tags && p.tags.length ? ` · ${esc(p.tags.join(' / '))}` : ''}` : ''}</span><span class="rp-pgno">${u.number}</span></div>`;
    const eyebrow = u.id === 'annex' ? 'Anexo técnico' : (SECTION[u.id] || p.title);
    if (u.id === 'cover') {
      const per = (x.units.find((q) => q.id === 'cover').page.facts.find((f) => f.id === 'period') || {}).value || '';
      return `<section class="rp-page rp-page--cover" data-page="cover">${DECO}<div class="rp-cover__in"><div class="rp-brand">${brandMark(true)}${brandLogo() ? '' : 'RevNavigator'}</div>
        <div class="rp-cover__eyebrow">Reporte ejecutivo</div><h1 class="rp-cover__title">${esc(p.headline)}</h1><div class="rp-cover__rule"></div><p class="rp-cover__sub">${esc([per, p.businessName].filter(Boolean).join(' · '))}</p>
        <dl class="rp-cover__meta"><div><dt>Período analizado</dt><dd>${esc(per)}</dd></div><div><dt>Fecha de corte</dt><dd>${esc(x.cutoff)}</dd></div>${x.lastActual ? `<div><dt>Venta real hasta</dt><dd>${esc(x.lastActual)}</dd></div>` : ''}<div><dt>Alcance</dt><dd>${esc(p.scope || x.channelLabel)}</dd></div>${p.filterLabel ? `<div><dt>Filtro</dt><dd>${esc(p.filterLabel)}</dd></div>` : ''}</dl>${p.filterNote ? `<p class="rp-cover__note">${esc(p.filterNote)}</p>` : ''}</div>${brandLogo() ? '<div class="rp-cover__by">RevNavigator</div>' : ''}</section>`;
    }
    const body = u.id === 'summary' ? summaryBody(p, x) : u.id === 'closing' ? closingBody(p, x) : u.id === 'annex' ? annexBody(p, x, u.sub) : (BODY[u.id] ? BODY[u.id](p, x) : '');
    const concl = u.id === 'annex' || !FP.reportCopy ? null : FP.reportCopy.title(p, x.report);   // título con conclusión si los datos la permiten; si no, el neutro
    const title = u.id === 'annex' ? u.title : (concl || (u.id === 'pacing' && p.selection ? 'Venta de la selección contra su periodo de referencia' : (TITLES[u.id] || p.title)));
    const q = u.id === 'annex' ? '' : u.id === 'closing' ? '' : (p.question || '');
    return `<section class="rp-page" data-page="${esc(u.id)}${u.sub ? `-${u.sub}` : ''}"><div class="rp-top"><span class="rp-eyebrow">${esc(eyebrow)}</span><span class="rp-per">${esc(per)}</span></div>
      <h2 class="rp-title">${esc(title)}</h2><div class="rp-sub"><p class="rp-q">${esc(q)}</p>${ctxLine ? `<div class="rp-ctx">${esc(ctxLine)}</div>` : ''}</div>${!['summary', 'annex', 'closing', 'campaigns'].includes(u.id) && !(u.id === 'recovery' && p.byChannel) && !(u.id === 'traffic' && p.overview) && p.headline ? `<p class="rp-headline">${esc(p.headline)}</p>` : ''}
      <div class="rp-body">${body}</div>${foot}</section>`;
  }
  function docHtml(report, opts = {}) {
    const us = units(report, opts.exclude); NOANNEX = !us.some((q) => q.id === 'annex'); const cover = report.pages.find((p) => p.id === 'cover');
    const sel = cover && cover.facts ? (cover.facts.find((f) => f.id === 'selection') || {}).value : '';
    const x = { report, tags: opts.tags === undefined ? report.options.showTags === true : Boolean(opts.tags), units: us, total: us.length, omitted: report.omitted.length, omittedList: report.omitted, gapsPage: (report.pages.find((q) => q.id === 'recovery' && q.status === 'included') || {}).gaps ? report.pages.find((q) => q.id === 'recovery') : null, relPage: report.pages.find((q) => q.id === 'reliability' && q.status === 'included') || null, channelLabel: report.context.channel === 'total' || !report.context.channel ? 'Total digital' : ({ ecommerce: 'Ecommerce', app: 'App', whatsapp: 'WhatsApp', llamadas: 'Llamadas' }[report.context.channel] || report.context.channel), cutoff: report.context.cutoff ? dateOf(report.context.cutoff) : NA, lastActual: report.context.lastActual && report.context.cutoff && report.context.lastActual < report.context.cutoff ? dateOf(report.context.lastActual) : null,
      selection: sel && !/^Sin filtros/.test(sel) ? cut(sel, 60) : 'Sin filtros' };
    const parts = us.map((u) => pageHtml(u, x).replace(/<(th|dt)(\s|>)/g, '<$1 data-helped="1"$2'));   // sin íconos de ayuda de la app dentro del reporte
    return { html: parts.join(''), parts, units: us, total: us.length };
  }

  /* ---- impresión: se monta un contenedor aparte, se imprime y se retira ---- */
  /** Revisa que cada lámina quepa en su cuerpo: si no, aplica el modo compacto (espaciados, no tipografía); si aun así no cabe, la marca. */
  function fitPages(rootEl) {
    const bad = [], hidden = rootEl.id === 'rp-print-host';
    // el contenedor de impresión está oculto en pantalla: se muestra fuera de la vista solo para medir (con la misma anchura y estilos de lámina)
    if (hidden) Object.assign(rootEl.style, { display: 'block', position: 'absolute', left: '-99999px', top: '0', visibility: 'hidden' });
    rootEl.querySelectorAll('.rp-page').forEach((pg) => {
      const b = pg.querySelector('.rp-body'); if (!b) return;
      pg.classList.remove('rp-compact', 'rp-tight'); pg.removeAttribute('data-overflow');
      if (b.scrollHeight > b.clientHeight + 1) { pg.classList.add('rp-compact'); }
      if (b.scrollHeight > b.clientHeight + 1) { pg.classList.add('rp-tight'); }   // último recurso antes de quitar filas: gráficos más bajos
      // Resumen: antes de quitar nada se esconde el gráfico del foco; luego, los hallazgos secundarios (lo dice una nota; siguen en sus láminas).
      if (pg.getAttribute('data-page') === 'summary' && b.scrollHeight > b.clientHeight + 1) {
        pg.classList.add('rp-lean');
        const finds = [...b.querySelectorAll('.rp-find')]; let dropped = 0;
        while (b.scrollHeight > b.clientHeight + 1 && finds.length - dropped > 1) { finds[finds.length - 1 - dropped].remove(); dropped++; }
        if (dropped) { const n = document.createElement('p'); n.className = 'rp-scope rp-trim'; n.textContent = `Por espacio, el resumen muestra ${finds.length - dropped} de ${finds.length} hallazgos; el resto está en sus láminas.`; b.appendChild(n); pg.setAttribute('data-trimmed', '1'); }
      }
      // Aun compacta no cabe: se muestran solo las filas de mayor magnitud (las tablas ya vienen ordenadas) y la lámina lo dice; nunca se recorta en silencio.
      if (b.scrollHeight > b.clientHeight + 1 && !/^annex/.test(pg.getAttribute('data-page') || '')) {
        const note = document.createElement('p'); note.className = 'rp-scope rp-trim'; b.appendChild(note);
        const tables = [...b.querySelectorAll('table.rp-t:not(.rp-t--rt) tbody')]; tables.forEach((t) => { t.dataset.total = t.rows.length; });
        let guard = 60;
        while (b.scrollHeight > b.clientHeight + 1 && guard-- > 0) {
          const t = tables.filter((x) => x.rows.length > 1).sort((a, c) => c.rows.length - a.rows.length)[0]; if (!t) break;
          t.lastElementChild.remove();
          note.textContent = `Por espacio, esta lámina muestra solo las filas de mayor magnitud (${tables.map((x) => `${x.rows.length} de ${x.dataset.total}`).join(' · ')}); el orden es por impacto.`;
        }
        if (tables.every((x) => x.rows.length === +x.dataset.total)) note.remove(); else pg.setAttribute('data-trimmed', '1');
      }
      // Clientes: con filtro u otras líneas, primero se quita la fila de base histórica de la tira y luego su línea en la caja (siguen en la caja/notas).
      if (b.scrollHeight > b.clientHeight + 1 && pg.getAttribute('data-page') === 'customers') {
        const caps = [...b.querySelectorAll('.rp-rs__cap')], rows = [...b.querySelectorAll('.rp-rs__row')];
        if (caps.length > 1 && rows.length > 1) { caps[caps.length - 1].remove(); rows[rows.length - 1].remove(); }
        const bh = b.querySelector('.rp-box__h--s'); if (b.scrollHeight > b.clientHeight + 1 && bh) bh.remove();
      }
      // Brecha: si los textos largos no caben, se quitan los canales de menor peso de la lista lateral (la lámina lo dice).
      if (b.scrollHeight > b.clientHeight + 1 && pg.getAttribute('data-page') === 'drivers') {
        const rs = [...b.querySelectorAll('.rp-dv3')], tot = rs.length; let k = rs.length;
        while (b.scrollHeight > b.clientHeight + 1 && k > 1) { rs[--k].remove(); }
        if (k < tot) { const n = document.createElement('p'); n.className = 'rp-scope rp-trim'; n.textContent = `Por espacio, la lectura por canal muestra ${k} de ${tot} canales.`; b.appendChild(n); pg.setAttribute('data-trimmed', '1'); }
      }
      // Suma/resta: sin tablas, se quitan las filas de menor peso de la columna más larga y la lámina lo dice.
      if (b.scrollHeight > b.clientHeight + 1 && pg.getAttribute('data-page') === 'movers') {
        const cols = [...b.querySelectorAll('.rp-mv__c')], tot = cols.map((c) => c.querySelectorAll('.rp-mv__r').length); let guard = 40;
        const trimNote = document.createElement('p'); trimNote.className = 'rp-scope rp-trim'; trimNote.textContent = 'Por espacio, esta lámina muestra solo las filas de mayor peso de cada lado.'; b.appendChild(trimNote); // se reserva su espacio antes de recortar
        while (b.scrollHeight > b.clientHeight + 1 && guard-- > 0) { const c = cols.sort((a, d) => d.querySelectorAll('.rp-mv__r').length - a.querySelectorAll('.rp-mv__r').length)[0], rs = c.querySelectorAll('.rp-mv__r'); if (rs.length <= 1) break; rs[rs.length - 1].remove(); }
        if (b.querySelectorAll('.rp-mv__r').length < tot.reduce((a, c) => a + c, 0)) pg.setAttribute('data-trimmed', '1'); else trimNote.remove();
      }
      if (b.scrollHeight > b.clientHeight + 1) { pg.setAttribute('data-overflow', '1'); bad.push(pg.getAttribute('data-page')); }
    });
    if (hidden) ['display', 'position', 'left', 'top', 'visibility'].forEach((k) => { rootEl.style[k] = ''; });
    return bad;
  }
  function mountPrint(report, opts) {
    unmountPrint();
    const host = document.createElement('div'); host.id = 'rp-print-host'; host.className = 'rp-doc'; host.innerHTML = docHtml(report, opts).html;
    const st = document.createElement('style'); st.id = 'rp-print-style'; st.textContent = '@page{size:297mm 167mm;margin:0}';
    document.head.appendChild(st); document.body.appendChild(host); document.body.classList.add('rp-printing');
    fitPages(host);
    return host;
  }
  function unmountPrint() {
    ['rp-print-host', 'rp-print-style'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
    document.body.classList.remove('rp-printing');
  }
  function print(report, opts) {
    mountPrint(report, opts);
    const done = () => { unmountPrint(); root.removeEventListener('afterprint', done); };
    root.addEventListener('afterprint', done);
    setTimeout(() => { try { root.print(); } catch (e) { unmountPrint(); } }, 60);
  }

  /* ================= vista «Presentación (PDF)» ================= */
  function signature(state) {
    const s = state.dx.settings, an = state.an || {};
    return JSON.stringify([s.channel, s.periodType, s.periodKey, s.comparison, state.year, state.rp.options.showBusinessName, state.rp.filter || null, (an.filter && FP.productFilter) ? FP.productFilter.active(an.filter) : null, state.fc.run ? state.fc.run.generatedAt : null]);
  }
  function scale(rootEl) {
    rootEl.querySelectorAll('.rp-frame').forEach((f) => { const s = Math.max(0.5, Math.min(1, f.clientWidth / PW)); f.style.setProperty('--rp-s', s.toFixed(3)); });
  }
  /** Filtros separados y encadenados (categoría → subcategoría → producto; estado → ciudad → sucursal; entrega). Solo se muestran los que tienen opciones. */
  function filterSelect(state) {
    const PF = FP.productFilter, PS = FP.productStore;
    if (!PF || !PS || !PS.available || !PS.available()) return '';
    // sin venta por producto cargada no hay categorías ni sucursales reales: se avisa en vez de mostrar selectores vacíos o de relleno
    if (!(PS.meta && PS.meta.batches)) return '<div class="rp-filters"><h3 class="panel__title">Filtros de la presentación</h3><p class="field__hint">Para filtrar por categoría, subcategoría, producto, estado, ciudad o sucursal, primero carga la venta por producto en Datos → Productos.</p></div>';
    const cur = PF.active(state.rp.filter || {});
    const KEYS = ['category', 'subcategory', 'product', 'state', 'city', 'branch'], LBL = { ...PF.LABEL, branch: 'Nombre de sucursal' };
    let o = {}, names = {}; try { o = PF.options(cur, KEYS); const g = PS.geoOptions({ state: cur.state || undefined, city: cur.city || undefined }); (g.branches || []).forEach((b) => { names[b.code] = b.name || b.code; }); } catch (e) { return ''; }
    // sucursal: se muestra el nombre (con el código solo si dos sucursales comparten nombre); el filtro sigue usando el código
    const dup = new Set(); const seen = new Set(); (o.branch || []).forEach((c) => { const n = names[c] || c; if (seen.has(n)) dup.add(n); seen.add(n); });
    const text = (k, v) => (k === 'branch' ? ((names[v] || v) + (dup.has(names[v] || v) ? ` (${v})` : '')) : v);
    const sel = (k) => (o[k] && o[k].length ? `<div class="field rp-f"><label class="field__label" for="rp-f-${k}">${esc(LBL[k])}</label>
      <select class="select" id="rp-f-${k}" data-action="rp-filter" data-key="${k}"><option value="">Todas</option>${o[k].map((v) => ({ v, t: text(k, v) })).sort((a, b) => String(a.t).localeCompare(String(b.t), 'es')).map(({ v, t }) => `<option value="${esc(v)}"${cur[k] === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : '');
    const any = PF.isActive(cur);
    return `<div class="rp-filters"><div class="rp-filters__head"><h3 class="panel__title">Filtros de la presentación</h3>${any ? '<button type="button" class="btn btn--ghost" data-action="rp-filter-clear">Limpiar filtros</button>' : ''}</div>
      <div class="rp-filters__grid">${KEYS.map(sel).join('')}</div>
      <p class="field__hint">Se pueden combinar. Aplican a las láminas de categorías, evolución y clientes; pacing, forecast, diagnóstico y recuperación siguen siendo del total del negocio porque el plan no está por producto ni por sucursal (cada una lo indica en su encabezado).</p></div>`;
  }
  /** Aviso al pulsar «Generar vista previa» cuando el corte va más adelante que la venta real cargada. */
  function gapWarn(g) {
    const d = (x) => esc(dateOf(x)), n = g.days;
    return `<div class="note note--warn rp-gap" role="alertdialog" aria-labelledby="rp-gap-t" aria-describedby="rp-gap-d">
      <h3 class="panel__title" id="rp-gap-t">Faltan datos para el corte</h3>
      <p id="rp-gap-d">El corte es el <strong>${d(g.cutoff)}</strong>, pero la venta real cargada llega al <strong>${d(g.last)}</strong> (${n} día${n === 1 ? '' : 's'} sin dato).${g.products ? ` Productos y categorías llegan al ${d(g.products)}.` : ''} La presentación se genera con lo que hay: la venta diaria requerida y el cierre estimado usan datos incompletos.</p>
      <div class="btn-row"><button type="button" class="btn" data-action="rp-gap-load">Cargar datos</button>
        <button type="button" class="btn" data-action="rp-gap-last">Usar el último día con datos</button>
        <button type="button" class="btn btn--primary" data-action="rp-gap-go">Generar de todos modos</button>
        <button type="button" class="btn btn--ghost" data-action="rp-gap-cancel">Cancelar</button></div></div>`;
  }
  function render(state) {
    const el = document.getElementById('presentacion-view'); if (!el) return;
    const rp = state.rp, H = () => FP.ui.helpers;
    const ready = rp.status === 'ready' && rp.report;
    const stale = ready && rp.sig !== signature(state);
    const doc = ready ? docHtml(rp.report, { exclude: rp.exclude, tags: rp.options.showTags }) : null;
    const list = ready ? rp.report.pages.filter((p) => p.id !== 'cover') : [];
    el.innerHTML = `
      <section class="panel" aria-labelledby="t-rp">
        <div class="panel__head"><div data-own-head>
          <h2 class="panel__title" id="t-rp">Presentación (PDF)</h2>
          <p class="panel__desc">Un reporte ejecutivo en 16:9 con lo que la herramienta ya calculó: resultado, brecha, forecast, qué mirar y qué decidir, más un anexo para auditar. No calcula nada nuevo y se genera en este navegador, sin enviar datos a ningún servicio.</p>
        </div></div>
        <div class="panel__body stack">
          <div><h3 class="panel__title">Periodo y canal</h3>
            <p class="field__hint">Son los mismos de Diagnóstico y Narrativa. Si eliges un mes, todo el reporte gira en torno a ese mes y canal, y el año aparece solo como contexto en el resumen y el cierre. Con semana o año, el pacing sigue siendo del año completo al corte.</p>
            ${FP.narrativeView.contextControls(state, 'rp', 'pkg-context', 'pkg-context')}</div>
          ${filterSelect(state)}
          <div class="rp-opts"><label class="check"><input type="checkbox" data-action="rp-option" data-key="showTags" ${rp.options.showTags ? 'checked' : ''}> Mostrar etiquetas Observado / Calculado / Estimado</label>
            <label class="check"><input type="checkbox" data-action="rp-option" data-key="showBusinessName" ${rp.options.showBusinessName ? 'checked' : ''}> Incluir el nombre del negocio en la portada</label></div>
          <div class="btn-row"><button type="button" class="btn ${ready && !stale ? '' : 'btn--primary'}" data-action="rp-generate" ${rp.status === 'busy' ? 'disabled aria-busy="true"' : ''}>${ready ? 'Volver a generar' : 'Generar vista previa'}</button>
            <button type="button" class="btn btn--primary" data-action="rp-print" ${ready ? '' : 'disabled title="Primero genera el reporte"'}>Guardar como PDF</button></div>
          ${rp.gap ? gapWarn(rp.gap) : ''}
          <div id="rp-status" aria-live="polite">${rp.status === 'busy' ? FP.loader.html('Armando la presentación con los cálculos actuales…', { key: 'presentacion' }) : ''}
            ${rp.status === 'error' ? `<p class="note note--warn">No pude armar la presentación: ${H().esc(rp.error || '')}</p>` : ''}
            ${stale ? '<p class="note note--warn" role="status">La selección o los datos cambiaron desde que se generó la vista previa. Vuelve a generar antes de guardar el PDF.</p>' : ''}</div>
          <p class="field__hint">«Guardar como PDF» abre el cuadro de impresión del navegador: elige <strong>Guardar como PDF</strong>; el tamaño horizontal 16:9 ya viene definido. Si no salen los colores, activa «Gráficos de fondo».</p>
        </div>
      </section>
      ${ready ? `<section class="panel" aria-labelledby="t-rp-pages"><div class="panel__head"><div><h3 class="panel__title" id="t-rp-pages">Páginas del reporte</h3>
        <p class="panel__desc">${doc.total} página${doc.total === 1 ? '' : 's'} en el PDF${rp.report.omitted.length ? ` · ${rp.report.omitted.length} sin datos suficientes (listadas en el anexo)` : ''}. Quita las que no quieras incluir.</p></div></div>
        <div class="panel__body"><ul class="rp-pagelist">${list.map((p) => p.status === 'included'
          ? `<li><label class="check"><input type="checkbox" data-action="rp-toggle-page" data-id="${esc(p.id)}" ${rp.exclude.includes(p.id) ? '' : 'checked'} > ${esc(p.title)}</label></li>`
          : `<li class="rp-pagelist__off"><span class="pill pill--na">Omitida</span> ${esc(p.title)} — ${esc(p.reason)}</li>`).join('')}</ul></div></section>
      <section class="rp-preview" aria-label="Vista previa de la presentación">${doc.parts.map((h) => `<div class="rp-frame">${h}</div>`).join('')}</section>` : ''}`;
    if (ready) { scale(el); fitPages(el); }
  }
  if (typeof window !== 'undefined') { let t; window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => { const el = document.getElementById('presentacion-view'); if (el) scale(el); }, 120); }); }

  FP.reportView = { render, fitPages, docHtml, units, mountPrint, unmountPrint, print, signature, PW, PH, charts: CHARTS, spark };
})(typeof window !== 'undefined' ? window : globalThis);
