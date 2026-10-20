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
  const C = { navy: '#0B2A4A', blue: '#2F6DB5', teal: '#0E8F80', green: '#1B7F4D', orange: '#B86A00', red: '#B42318', grey: '#5B6776', light: '#E4EAF1', ink: '#1A2433' };
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
    const X = (i) => L + i * (W - L - R) / 11, Y = (v) => T + (H - T - B) * (1 - v / ymax);
    let g = tk.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.light}"/>${svgT(L - 6, Y(v) + 4, fmt('moneyC', v), { anchor: 'end' })}`).join('');
    g += c.labels.map((m, i) => svgT(X(i), H - 8, m, { anchor: 'middle' })).join('');
    const from = Math.max(c.cutIndex, 0);
    segs(c.plan, X, Y, 0, 11).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.grey}" stroke-width="2.2" stroke-dasharray="2 4" stroke-linecap="round"/>`; });
    segs(c.forecast, X, Y, from, 11).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.teal}" stroke-width="2.6" stroke-dasharray="9 5"/>`; });
    if (c.cutIndex >= 0) {
      segs(c.actual, X, Y, 0, c.cutIndex).forEach((d) => { g += `<path d="${d}" fill="none" stroke="${C.navy}" stroke-width="3.2"/>`; });
      c.actual.forEach((v, i) => { if (isNum(v) && i <= c.cutIndex) g += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.6" fill="${C.navy}"/>`; });
      g += `<line x1="${X(c.cutIndex)}" x2="${X(c.cutIndex)}" y1="${T}" y2="${H - B}" stroke="${C.orange}" stroke-width="1.5" stroke-dasharray="4 3"/>${svgT(X(c.cutIndex) + 4, T + 12, 'Corte', { fill: C.orange, weight: 600 })}`;
    }
    const lastF = c.forecast[11];
    if (isNum(lastF)) g += svgT(X(11), Y(lastF) - 7, fmt('moneyC', lastF), { anchor: 'end', fill: C.teal, weight: 700 });
    const lg = [[C.navy, '', 'Real (Observado)', 3.2], [C.grey, '2 4', 'Plan', 2.2], [C.teal, '9 5', 'Forecast (Estimado)', 2.6]];
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

  function chartHbar(c) {
    const items = c.items.filter((i) => isNum(i.value)); if (!items.length) return empty(520, 120, 'Sin datos para graficar');
    const W = 520, rowH = 38, T = 6, H = T + items.length * rowH + 6, labW = 132;
    const vals = items.map((i) => i.value), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals);
    const plotL = labW + 8 + (mn < 0 ? 92 : 0), plotR = W - 8 - (mx > 0 ? 92 : 0), sc = (plotR - plotL) / ((mx - mn) || 1), x0 = plotL - mn * sc;
    let g = `<line x1="${x0}" x2="${x0}" y1="${T}" y2="${H - 4}" stroke="${C.grey}"/>`;
    items.forEach((it, i) => {
      const y = T + i * rowH + 7, w = Math.abs(it.value) * sc, x = it.value >= 0 ? x0 : x0 - w, col = it.value >= 0 ? C.green : C.red;
      g += svgT(labW, y + 17, cut(it.label, 17), { anchor: 'end', fill: C.ink }) + `<rect x="${x}" y="${y}" width="${Math.max(2, w)}" height="22" fill="${col}" rx="2"/>`;
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
      g += svgT(x + bw / 2, Y(acc) - 5, fmt('int', acc), { anchor: 'middle', fill: C.ink, weight: 700 }) + svgT(x + bw / 2, H - 8, lab.slice(2), { anchor: 'middle' });
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
      <div class="rp-kpi__v${k.kind === 'text' ? ' rp-kpi__v--t' : ''}">${k.tone === 'pos' && isNum(k.value) && k.value > 0 ? '▲ ' : k.tone === 'neg' && isNum(k.value) && k.value < 0 ? '▼ ' : ''}${esc(fmt(k.kind, k.value))}</div>
      <div class="rp-kpi__s">${k.sub ? esc(k.sub) : '&nbsp;'}</div></div>`).join('')}</div>`;
  }
  function tableHtml(t) {
    if (!t.rows || !t.rows.length) return `<div class="rp-tbl"><div class="rp-tbl__t">${esc(t.title)}</div><p class="rp-empty">Sin datos para mostrar.</p></div>`;
    const cell = (c, r) => {
      const kind = c.kindBy ? ((t.kindMap || {})[r[c.kindBy]] || 'text') : c.kind, v = r[c.key];
      if (kind === 'spark') return `<td class="rp-spk">${spark(v)}</td>`;
      const na = v === null || v === undefined || (typeof v === 'number' && !isFinite(v));
      const tone = c.tone && isNum(v) ? (v > 0 ? ' rp-pos' : v < 0 ? ' rp-neg' : '') : '';
      return `<td class="${c.num ? 'num' : ''}${tone}${na ? ' rp-na' : ''}">${esc(fmt(kind, v))}</td>`;
    };
    return `<div class="rp-tbl rp-panel"><div class="rp-tbl__t">${esc(t.title)}</div><table class="rp-t"><thead><tr>${t.columns.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${t.rows.map((r) => `<tr${r._total ? ' class="rp-total"' : ''}>${t.columns.map((c) => cell(c, r)).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const notesHtml = (p) => (p.notes && p.notes.length ? `<ul class="rp-notes">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '');
  const callout = (txt, tone = 'info', title = '') => `<div class="rp-callout rp-callout--${tone}">${title ? `<strong>${esc(title)}</strong> ` : ''}${esc(txt)}</div>`;

  /* ================= cuerpo por página ================= */
  const BODY = {
    pacing: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>
      ${p.reconciliation ? callout(p.notes[0], 'warn') : ''}<ul class="rp-notes">${p.notes.filter((n, i) => !(p.reconciliation && i === 0)).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`,
    reliability: (p, x) => {
      const s = p.suficiencia || {};
      return `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a">${p.charts.map(chartHtml).join('') || '<p class="rp-empty">No hay otros métodos con datos suficientes para contrastar.</p>'}</div>
        <div class="rp-col-b"><div class="rp-box"><div class="rp-box__t">Suficiencia de datos del método elegido</div>
          <div class="rp-box__v rp-box__v--${s.light || 'na'}">${s.light === 'green' ? '● ' : s.light === 'yellow' ? '▲ ' : s.light === 'red' ? '■ ' : ''}${esc(s.text || NA)}</div>
          <dl class="rp-dl"><dt>Días contados</dt><dd>${esc(fmt('int', s.countedDays))}</dd><dt>Confianza del motor</dt><dd>${esc(fmt('text', s.confidence))}</dd><dt>Calidad de datos</dt><dd>${esc(fmt('text', s.dataQuality))}</dd></dl>
          ${s.reasons && s.reasons.length ? `<p class="rp-small">${esc(s.reasons.join(' · '))}</p>` : ''}</div></div></div>
        ${p.warning ? callout(p.notes[0], 'warn', 'Advertencia') : ''}<ul class="rp-notes">${p.notes.filter((n, i) => !(p.warning && i === 0)).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
    },
    drivers: (p, x) => `<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>${notesHtml(p)}`,
    trends: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row">${p.tables.filter((t) => t.rows && t.rows.length).map((t) => `<div class="rp-col-h">${tableHtml(t)}</div>`).join('')}</div>${p.tables.some((t) => !(t.rows && t.rows.length)) ? `<p class="rp-scope">${esc(p.tables.filter((t) => !(t.rows && t.rows.length)).map((t) => `${t.title}: ninguna entidad en este período.`).join(' '))}</p>` : ''}
      <p class="rp-scope">Alcance: ${esc([p.scope.channel, p.scope.level, p.scope.metric, p.scope.filter ? `Filtro: ${p.scope.filter}` : 'Sin filtro de producto o ubicación', p.scope.partial ? 'incluye período parcial' : 'períodos completos'].filter(Boolean).join(' · '))}</p>${notesHtml(p)}`,
    categories: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>
      <p class="rp-scope">Nivel: ${esc(p.scope.level)} · Período ${esc(p.scope.period ? `${p.scope.period.from} a ${p.scope.period.to}` : NA)} · vs. ${esc(p.scope.baseline && (p.scope.baseline.label || `${p.scope.baseline.from} a ${p.scope.baseline.to}`) || NA)}${p.scope.filter ? ` · Filtro: ${esc(p.scope.filter)}` : ' · Sin filtro de producto o ubicación'}</p>${notesHtml(p)}`,
    customers: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('')}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}
      ${p.lapsed ? `<div class="rp-box"><div class="rp-box__t">Compraron el mes anterior y no regresaron en ${esc(p.lapsed.month)}</div><div class="rp-box__v">${esc(fmt('int', p.lapsed.count))} de ${esc(fmt('int', p.lapsed.base))}</div></div>` : ''}</div></div>
      <p class="rp-scope">Alcance: ${esc(p.scope.label)}</p>${notesHtml(p)}`,
    traffic: (p, x) => `${p.tables.map(tableHtml).join('')}<p class="rp-scope">Dimensión: ${esc(p.scope.dimension)} · ${esc(p.scope.period || NA)} · ${esc(p.scope.comparison || '')} · ${esc(p.scope.denominator)}</p>${notesHtml(p)}`,
    recovery: (p, x) => `${kpisHtml(p, x.tags)}${p.gaps && p.gaps.length ? tableHtml({ title: 'Las brechas del reporte: qué mide cada una', columns: [{ key: 'name', label: 'Brecha', kind: 'text' }, { key: 'what', label: 'Cómo se calcula', kind: 'text' }, { key: 'period', label: 'Período / horizonte', kind: 'text' }, { key: 'value', label: 'Valor', kind: 'smoney', num: true, tone: true }, { key: 'tag', label: 'Tipo', kind: 'text' }], rows: p.gaps }) : ''}<div class="rp-row"><div class="rp-col-h"><div class="rp-tbl__t">Escenarios guardados ${x.tags ? tagHtml('Estimado') : ''}</div>${p.scenarios.length
        ? `<table class="rp-t"><thead><tr><th>Escenario</th><th>Tipo</th></tr></thead><tbody>${p.scenarios.slice(0, 3).map((s) => `<tr><td>${esc(s.name)}</td><td>${esc(fmt('text', s.type))}</td></tr>`).join('')}</tbody></table>` : '<p class="rp-empty">No hay escenarios guardados.</p>'}</div>
      <div class="rp-col-h"><div class="rp-tbl__t">Acciones registradas</div>${p.actions.length
        ? `<table class="rp-t"><thead><tr><th>Acción</th><th>Responsable</th><th>Fechas</th></tr></thead><tbody>${p.actions.slice(0, 3).map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(fmt('text', a.owner))}</td><td>${esc(a.start ? `${fmt('date', a.start)} – ${a.end ? fmt('date', a.end) : '…'}` : NA)}</td></tr>`).join('')}</tbody></table>` : '<p class="rp-empty">No hay acciones registradas en el plan de acción.</p>'}</div></div>${notesHtml(p)}`,
    seasonality: (p, x) => `${kpisHtml(p, x.tags)}<div class="rp-row"><div class="rp-col-a rp-col-a--m">${p.charts.map(chartHtml).join('') || '<p class="rp-empty">No hay años completos para calcular estacionalidad.</p>'}</div><div class="rp-col-b">${p.tables.map(tableHtml).join('')}</div></div>${notesHtml(p)}`
  };

  function summaryBody(p, x) {
    const inc = x.units.filter((u) => u.id !== 'cover' && u.id !== 'summary' && u.id !== 'annex').map((u) => `<span class="rp-chip">${esc(cut(u.title, 28))}</span>`).join('');
    const off = (x.omittedList || []).map((o) => `<span class="rp-chip rp-chip--off">${esc(cut(o.title, 28))} · sin datos</span>`).join('');
    return `<ol class="rp-sum">${p.items.map((i) => `<li class="rp-sum__i"><span class="rp-sum__n">${i.n}</span><div class="rp-sum__t">${esc(i.text)}</div>
      <div class="rp-sum__m">${x.tags ? tagHtml(i.tag) : ''}<span class="rp-sum__c">${esc(i.certainty)}</span><span>${esc(i.source)}</span>${i.limit ? `<span>Límite: ${esc(i.limit)}</span>` : ''}</div></li>`).join('')}</ol>
      ${p.review ? `<div class="rp-callout rp-callout--info"><strong>Qué revisar primero.</strong> ${esc(p.review.text)} <span class="rp-small">${esc(p.review.basis)}</span></div>` : ''}
      <div class="rp-cov"><span class="rp-cov__t">Cobertura del reporte</span><div class="rp-chips">${inc}${off}</div></div>`;
  }

  function coverBody(p, x) {
    return `<div class="rp-cover__facts">${p.facts.map((f) => `<div class="rp-fact"><div><div class="rp-fact__l">${esc(f.label)}</div><div class="rp-fact__v${f.tone ? ` rp-fact__v--${f.tone}` : ''}">${f.tone === 'pos' ? '● ' : f.tone === 'warn' ? '▲ ' : f.tone === 'neg' ? '■ ' : ''}${esc(f.value)}</div></div></div>`).join('')}</div>`;
  }

  function annexBody(p, x, sub) {
    const T = (title, cols, rows) => tableHtml({ title, columns: cols, rows });
    if (sub === 1) {
      return `<div class="rp-row"><div class="rp-col-h">${T('Calidad de datos por archivo', [{ key: 'type', label: 'Tipo', kind: 'text' }, { key: 'files', label: 'Arch.', kind: 'int', num: true }, { key: 'imported', label: 'Importadas', kind: 'int', num: true }, { key: 'rejected', label: 'Rechaz.', kind: 'int', num: true }, { key: 'warning', label: 'Adv.', kind: 'int', num: true }, { key: 'error', label: 'Err.', kind: 'int', num: true }], p.quality)}
        ${T('Datos faltantes', [{ key: 'item', label: 'Concepto', kind: 'text' }, { key: 'value', label: 'Cuántos', kind: 'int', num: true }], p.missing)}</div>
        <div class="rp-col-h">${T('Páginas omitidas y motivo', [{ key: 'title', label: 'Página', kind: 'text' }, { key: 'reason', label: 'Motivo', kind: 'text' }], p.omitted.length ? p.omitted : [{ title: 'Ninguna', reason: 'Todas las páginas tuvieron datos suficientes.' }])}</div></div>`;
    }
    if (sub === 2) {
      return `<div class="rp-row"><div class="rp-col-h">${T('Comparación completa de métodos (sensibilidad; el método elegido no cambia)', [{ key: 'method', label: 'Método', kind: 'text' }, { key: 'status', label: 'Datos', kind: 'text' }, { key: 'forecast', label: 'Cierre', kind: 'moneyC', num: true }, { key: 'gap', label: 'vs. meta', kind: 'smoney', num: true, tone: true }, { key: 'days', label: 'Días', kind: 'int', num: true }, { key: 'fallback', label: 'Fallback', kind: 'int', num: true }], p.methods)}
        <p class="rp-small">${esc(p.methods.filter((m) => m.reasons).map((m) => `${m.method}: ${m.reasons}`).join(' · '))}</p></div>
        <div class="rp-col-h">${p.backtest.length ? T('Error histórico (WAPE a 7 días)', [{ key: 'method', label: 'Método', kind: 'text' }, { key: 'wape', label: 'Método', kind: 'pct', num: true }, { key: 'plan', label: 'Plan', kind: 'pct', num: true }], p.backtest) : ''}
        <p class="rp-small">${esc(p.backtestNote)}</p>${T('Supuestos del forecast y del reporte', [{ key: 'item', label: 'Supuesto', kind: 'text' }, { key: 'value', label: 'Valor', kind: 'text' }], p.assumptions)}</div></div>`;
    }
    return `<div class="rp-row"><div class="rp-col-h"><div class="rp-tbl__t">Definiciones</div><dl class="rp-defs">${p.definitions.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>
      <div class="rp-col-h"><div class="rp-tbl__t">Limitaciones de interpretación</div><ul class="rp-notes rp-notes--l">${p.limits.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></div></div>`;
  }

  /* ================= páginas, numeración e impresión ================= */
  function units(report, exclude) {
    const ex = new Set(exclude || []), out = [];
    report.pages.filter((p) => p.status === 'included' && !ex.has(p.id)).forEach((p) => {
      if (p.id === 'annex') [['Anexo A · Calidad, faltantes y páginas omitidas', 1], ['Anexo B · Métodos, backtest y supuestos', 2], ['Anexo C · Definiciones y límites', 3]].forEach(([t, s]) => out.push({ id: 'annex', sub: s, title: t, page: p }));
      else out.push({ id: p.id, title: p.title, page: p });
    });
    out.forEach((u, i) => { u.number = i + 1; });
    return out;
  }
  const dateOf = (iso) => fmt('date', iso);
  const DECO = '<svg class="rp-deco" width="520" height="260" viewBox="0 0 520 260" aria-hidden="true"><g fill="none" stroke="#8DB6E8" stroke-width="2" opacity=".5"><path d="M0 220 L70 180 L140 196 L210 130 L280 150 L350 80 L420 96 L520 20"/><path d="M0 245 L90 215 L170 228 L250 175 L330 190 L410 130 L520 90" stroke="#fff" opacity=".35"/></g><g fill="#fff" opacity=".18"><rect x="300" y="170" width="26" height="90"/><rect x="340" y="140" width="26" height="120"/><rect x="380" y="110" width="26" height="150"/><rect x="420" y="70" width="26" height="190"/><rect x="460" y="40" width="26" height="220"/></g></svg>';
  function pageHtml(u, x) {
    const p = u.page, ctxLine = `${x.channelLabel} · ${p.ctx ? `${p.ctx} · ` : ''}Corte ${x.cutoff}`;
    const foot = `<div class="rp-foot"><span>${p.sources && p.sources.length ? `Fuente: ${esc(p.sources.join(', '))}` : ''}${x.tags && p.tags && p.tags.length ? ` · Etiquetas: ${esc(p.tags.join(' / '))}` : ''}</span><span>${esc(x.selection)}</span></div>`;
    const no = `<span class="rp-pgno">${u.number} de ${x.total}</span>`;
    if (u.id === 'cover') {
      const toc = x.units.filter((q) => q.id !== 'cover').map((q) => `<li><span class="rp-toc__n">${String(q.number).padStart(2, '0')}</span>${esc(cut(q.title, 36))}</li>`).join('');
      return `<section class="rp-page rp-page--cover" data-page="cover"><div class="rp-cover__hero">${DECO}<div class="rp-brand"><span class="rp-mark"></span>RevNavigator</div>
        <h1 class="rp-cover__title">${esc(p.headline)}</h1><p class="rp-cover__sub">Pacing, forecast y diagnóstico del negocio digital${p.businessName ? ` · ${esc(p.businessName)}` : ''}</p>
        <div class="rp-cover__toc"><div class="rp-tbl__t">Contenido</div><ol class="rp-toc">${toc}</ol>${x.omitted ? `<p class="rp-small" style="color:#CFE0F5">${x.omitted} página${x.omitted === 1 ? '' : 's'} sin datos suficientes: ver el anexo.</p>` : ''}</div></div>
        <div class="rp-cover__body">${coverBody(p, x)}</div>${foot}</section>`;
    }
    const body = u.id === 'summary' ? summaryBody(p, x) : u.id === 'annex' ? annexBody(p, x, u.sub) : (BODY[u.id] ? BODY[u.id](p, x) : '');
    const title = u.id === 'annex' ? u.title : p.title;
    return `<section class="rp-page" data-page="${esc(u.id)}${u.sub ? `-${u.sub}` : ''}"><div class="rp-top"><div class="rp-brand"><span class="rp-mark"></span>RevNavigator</div>${no}</div>
      <h2 class="rp-title">${esc(title)}</h2><div class="rp-sub"><p class="rp-q">${p.question && u.id !== 'annex' ? esc(p.question) : ''}</p><div class="rp-ctx">${esc(ctxLine)}</div></div>${u.id !== 'summary' && u.id !== 'annex' && p.headline ? `<p class="rp-headline">${esc(p.headline)}</p>` : ''}
      <div class="rp-body">${body}</div>${foot}</section>`;
  }
  function docHtml(report, opts = {}) {
    const us = units(report, opts.exclude), cover = report.pages.find((p) => p.id === 'cover');
    const sel = cover && cover.facts ? (cover.facts.find((f) => f.id === 'selection') || {}).value : '';
    const x = { tags: opts.tags === undefined ? report.options.showTags !== false : Boolean(opts.tags), units: us, total: us.length, omitted: report.omitted.length, omittedList: report.omitted, channelLabel: report.context.channel === 'total' || !report.context.channel ? 'Total digital' : ({ ecommerce: 'Ecommerce', app: 'App', whatsapp: 'WhatsApp', llamadas: 'Llamadas' }[report.context.channel] || report.context.channel), cutoff: report.context.cutoff ? dateOf(report.context.cutoff) : NA,
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
      // Aun compacta no cabe: se muestran solo las filas de mayor magnitud (las tablas ya vienen ordenadas) y la lámina lo dice; nunca se recorta en silencio.
      if (b.scrollHeight > b.clientHeight + 1 && !/^annex/.test(pg.getAttribute('data-page') || '')) {
        const note = document.createElement('p'); note.className = 'rp-scope rp-trim'; b.appendChild(note);
        const tables = [...b.querySelectorAll('table.rp-t tbody')]; tables.forEach((t) => { t.dataset.total = t.rows.length; });
        let guard = 60;
        while (b.scrollHeight > b.clientHeight + 1 && guard-- > 0) {
          const t = tables.filter((x) => x.rows.length > 1).sort((a, c) => c.rows.length - a.rows.length)[0]; if (!t) break;
          t.lastElementChild.remove();
          note.textContent = `Por espacio, esta lámina muestra solo las filas de mayor magnitud (${tables.map((x) => `${x.rows.length} de ${x.dataset.total}`).join(' · ')}); el orden es por impacto.`;
        }
        if (tables.every((x) => x.rows.length === +x.dataset.total)) note.remove(); else pg.setAttribute('data-trimmed', '1');
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
    return JSON.stringify([s.channel, s.periodType, s.periodKey, s.comparison, state.year, state.rp.options.showBusinessName, (an.filter && FP.productFilter) ? FP.productFilter.active(an.filter) : null, state.fc.run ? state.fc.run.generatedAt : null]);
  }
  function scale(rootEl) {
    rootEl.querySelectorAll('.rp-frame').forEach((f) => { const s = Math.max(0.5, Math.min(1, f.clientWidth / PW)); f.style.setProperty('--rp-s', s.toFixed(3)); });
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
            <p class="field__hint">Son los mismos de Diagnóstico y Narrativa. Pacing, forecast y reforecast son del año completo al corte. Cada página usa los filtros y ajustes actuales de su vista (Evolución, Productos y Clientes).</p>
            ${FP.narrativeView.contextControls(state, 'rp', 'pkg-context', 'pkg-context')}</div>
          <div class="rp-opts"><label class="check"><input type="checkbox" data-action="rp-option" data-key="showTags" ${rp.options.showTags ? 'checked' : ''}> Mostrar etiquetas Observado / Calculado / Estimado</label>
            <label class="check"><input type="checkbox" data-action="rp-option" data-key="showBusinessName" ${rp.options.showBusinessName ? 'checked' : ''}> Incluir el nombre del negocio en la portada</label></div>
          <div class="btn-row"><button type="button" class="btn ${ready && !stale ? '' : 'btn--primary'}" data-action="rp-generate" ${rp.status === 'busy' ? 'disabled aria-busy="true"' : ''}>${ready ? 'Volver a generar' : 'Generar vista previa'}</button>
            <button type="button" class="btn btn--primary" data-action="rp-print" ${ready ? '' : 'disabled title="Primero genera el reporte"'}>Guardar como PDF</button></div>
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
