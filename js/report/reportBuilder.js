/**
 * reportBuilder.js — Presentación ejecutiva (PDF). Arma el CONTENIDO de las páginas; no calcula nada nuevo ni dibuja.
 * Recibe resultados que la app ya calculó (forecast, reforecast, diagnóstico, evolución, productos, clientes, proyección, calidad)
 * y los ordena en páginas con una idea cada una. El renderizado (HTML/SVG/impresión) vive en js/ui/report-view.js.
 *
 * Reglas que este módulo hace cumplir (tools/test-report-builder.js las prueba):
 *  - Un dato faltante es «No disponible» (valor null), nunca 0. Un cero real se muestra como 0.
 *  - CR y AOV nunca se promedian: solo se leen los que el motor ya calculó desde sumas.
 *  - El pacing compara real y plan de los mismos días contados; el Total solo cuenta días con real en todos los canales
 *    y la página lo explica con la conciliación (suma de canales vs Total estricto).
 *  - La descomposición Tráfico × CR × AOV se muestra con su método y SOLO si cierra con la brecha; no es causal.
 *  - El método de forecast vigente es el del usuario; los alternativos son sensibilidad, nunca un reemplazo.
 *  - Cada cifra lleva una etiqueta: Observado, Calculado o Estimado.
 *  - Una página sin datos suficientes se omite y queda en el anexo con su motivo.
 *  - Sin claves, preferencias ni datos del negocio (el nombre del negocio es opt-in).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const SCHEMA = 'executive_report', SCHEMA_VERSION = '1.0.0';
  const NA = 'No disponible';
  const TAG = { obs: 'Observado', calc: 'Calculado', est: 'Estimado' };
  const CHANNELS = ['ecommerce', 'app', 'whatsapp', 'llamadas'];
  const CH_LABEL = { ecommerce: 'Ecommerce', app: 'App', whatsapp: 'WhatsApp', llamadas: 'Llamadas', total: 'Total digital' };
  const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MATERIAL_SPREAD = 0.02;       // los métodos usables se separan ≥ 2 % de la meta → aviso (misma constante que el comparador de métodos)
  const CLOSE_TOL = 1;                // la descomposición cierra si |Σ contribuciones − brecha| ≤ max(1 peso, 1e-6 de la brecha)

  /* ---------------- formato (una sola fuente para titulares, tablas y gráficas) ---------------- */
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const nfCache = new Map();
  const nf = (o) => { const k = JSON.stringify(o); if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat('es-MX', o)); return nfCache.get(k); };
  const cur = () => (FP.config && FP.config.currency) || 'MXN';
  const money = (v, d = 0) => (isNum(v) ? nf({ style: 'currency', currency: cur(), minimumFractionDigits: d, maximumFractionDigits: d }).format(v).replace('-', '−') : NA);
  function moneyC(v) {
    if (!isNum(v)) return NA;
    const a = Math.abs(v), s = v < 0 ? '−' : '';
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M`;
    if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
    return `${s}$${a.toFixed(0)}`;
  }
  const pct = (v, d = 1) => (isNum(v) ? `${(v * 100).toFixed(d)} %` : NA);
  const spct = (v, d = 1) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(d)} %` : NA);
  const smoney = (v, d = 0) => (isNum(v) ? `${v > 0 ? '+' : ''}${money(v, d)}` : NA);
  const int = (v) => (isNum(v) ? nf({ maximumFractionDigits: 0 }).format(v) : NA);
  const num2 = (v, d = 2) => (isNum(v) ? nf({ maximumFractionDigits: d }).format(v) : NA);
  const pp = (v) => (isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100).toFixed(1)} pp` : NA);
  function dateLabel(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]} ${MONTHS[+m[2] - 1].toLowerCase()} ${m[1]}` : NA;
  }
  function dateTimeLabel(iso) {
    const d = new Date(iso); if (!iso || isNaN(d)) return NA;
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  const pct2 = (v) => pct(v, 2);
  const dShort = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]} ${MONTHS[+m[2] - 1].toLowerCase()}` : NA; };
  const rangeLabel = (a, b) => (!a || !b ? null : a === b ? dateLabel(a) : `${dShort(a)} – ${dateLabel(b)}`);
  const addDay = (iso, n) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)); return d.toISOString().slice(0, 10); };
  const periodEnd = (per) => { if (!per) return null; if (per.type === 'year') return `${per.key}-12-31`; if (per.type === 'month' && /^\d{4}-\d{2}$/.test(per.key || '')) { const [y, m] = per.key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); } return null; };
  const FMT = { pct2, text: (v) => (v === null || v === undefined || v === '' ? NA : String(v)), money, moneyC, smoney, pct, spct, int, num2, pp, date: dateLabel };
  const fmt = (kind, v) => (FMT[kind] || FMT.text)(v);
  const chLabel = (id) => CH_LABEL[id] || id || NA;
  const absOr = (v) => (isNum(v) ? Math.abs(v) : null);
  const closes = (parts, gap) => isNum(gap) && parts.every(isNum) && Math.abs(parts.reduce((a, b) => a + b, 0) - gap) <= Math.max(CLOSE_TOL, Math.abs(gap) * 1e-6);
  const clean = (t) => (typeof t === 'string' && !/\b(null|undefined|NaN|Infinity)\b/.test(t) ? t : null);

  const series = (run, ch) => (!run ? null : ch === 'total' ? run.total : (run.channels && run.channels[ch]) || null);
  const omit = (id, title, reason) => ({ id, title, status: 'omitted', reason });
  const page = (id, title, o) => ({ id, title, status: 'included', question: '', headline: '', kpis: [], tables: [], charts: [], notes: [], sources: [], ...o });
  const kpi = (id, label, value, kind, tag, o = {}) => ({ id, label, value: isNum(value) || typeof value === 'string' ? value : null, kind, tag: tag || null, ...o });
  const toneOfGap = (v) => (!isNum(v) || v === 0 ? 'neutral' : v > 0 ? 'pos' : 'neg');

  /* ---------------- período seleccionado (mes): todo el reporte gira en torno a él; el año queda como una línea de contexto ---------------- */
  const MONTH_FULL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const monthName = (key) => {
    let m = /^(\d{4})-(\d{2})$/.exec(key || ''); if (m) return `${MONTH_FULL[+m[2] - 1][0].toUpperCase()}${MONTH_FULL[+m[2] - 1].slice(1)} ${m[1]}`;
    m = /^(\d{4})-W(\d{2})$/.exec(key || ''); return m ? `Semana ${+m[2]} de ${m[1]}` : null;
  };
  const isWeekKey = (k) => /^\d{4}-W\d{2}$/.test(k || '');
  /** «septiembre» / «la semana 41»: cómo se nombra el período dentro de una frase. */
  const periodLow = (key) => (isWeekKey(key) ? `la semana ${+key.slice(6)}` : (monthName(key) || '').split(' ')[0].toLowerCase());
  /** Clave del mes (AAAA-MM) o la semana (AAAA-Wnn) seleccionada si el forecast la cubre; si no (año o fuera del año del forecast), null y el reporte usa la lectura anual. */
  function selMonth(s) {
    const sel = s.selection, S = series(s.run, s.channel);
    if (!sel || !S) return null;
    const coll = sel.periodType === 'month' && /^\d{4}-\d{2}$/.test(sel.periodKey || '') ? 'months' : sel.periodType === 'week' && isWeekKey(sel.periodKey) ? 'weeks' : null;
    if (!coll || !Array.isArray(S[coll])) return null;
    return S[coll].some((m) => m.key === sel.periodKey) ? sel.periodKey : null;
  }
  function yearLine(s) {
    const S = series(s.run, s.channel), A = S && S.annual; if (!A) return null;
    const tr = A.toDate && A.toDate.revenue, fg = A.forecastGap && A.forecastGap.revenue;
    return { year: s.run.year, compliance: tr && isNum(tr.compliance) ? tr.compliance : null, gap: tr && isNum(tr.gap) ? tr.gap : null, forecast: A.forecast && isNum(A.forecast.revenue) ? A.forecast.revenue : null, goal: A.plan && isNum(A.plan.revenue) ? A.plan.revenue : null, forecastGapPct: fg && isNum(fg.gapPct) ? fg.gapPct : null };
  }

  /* ---------------- 1 · Portada ---------------- */
  function pageCover(s) {
    const run = s.run, q = s.quality;
    const filters = (s.filters || []).filter((f) => f && f.label);
    // Título editorial según canal y período: mes cerrado → resultados; mes abierto → avance y cierre estimado; semana; año acumulado.
    const sm = selMonth(s), subj = s.channel === 'total' || !s.channel ? 'Ventas digitales' : `Ventas de ${chLabel(s.channel)}`;
    const cutoff = run && run.cutoff, mEnd = sm && !isWeekKey(sm) ? periodEnd({ type: 'month', key: sm }) : null;
    const headline = sm ? (isWeekKey(sm) ? `${subj}: lectura de ${periodLow(sm)}` : (cutoff && mEnd && cutoff < mEnd ? `${subj}: avance de ${periodLow(sm)} y cierre estimado` : `${subj}: resultados y lectura de ${periodLow(sm)}`))
      : (run && run.year ? `${subj}: acumulado ${run.year} y cierre estimado` : `${subj}: resultados y lectura del período`);
    return page('cover', 'Portada', {
      headline,
      scope: s.channel === 'total' || !s.channel ? 'Total digital · Ecommerce, App, WhatsApp y Llamadas' : chLabel(s.channel),
      filterLabel: s.reportFilter || null,
      filterNote: s.reportFilter ? 'El filtro aplica a las láminas de categorías, evolución y clientes; el resto muestra el total del negocio.' : null,
      facts: [
        { id: 'period', label: 'Período analizado', value: run ? (selMonth(s) ? monthName(selMonth(s)) : `Año ${run.year} · acumulado al corte`) : NA },
        { id: 'cutoff', label: 'Fecha de corte', value: run && run.cutoff ? dateLabel(run.cutoff) : NA, note: 'La fecha de corte es diaria; la herramienta no registra hora de corte.' },
        { id: 'generated', label: 'Generado', value: dateTimeLabel(s.generatedAt) },
        { id: 'channels', label: 'Canales incluidos', value: s.channel === 'total' || !s.channel ? 'Total digital (Ecommerce, App, WhatsApp, Llamadas)' : chLabel(s.channel) },
        { id: 'selection', label: 'Selección y filtros activos', value: filters.length ? filters.map((f) => `${f.page}: ${f.label}`).join(' · ') : 'Sin filtros de producto o ubicación' },
        { id: 'plan', label: 'Plan / meta', value: run && run.plan && run.plan.source !== 'none' ? (run.plan.label || 'Plan cargado') : 'Sin plan cargado' },
        { id: 'method', label: 'Método de forecast', value: run && run.method ? `${run.method.id} · ${run.method.label}` : NA },
        { id: 'quality', label: 'Calidad de datos', value: q ? q.statusText : NA, tone: q ? (q.status === 'ok' ? 'pos' : q.status === 'error' ? 'neg' : 'warn') : 'neutral' }
      ],
      businessName: s.options && s.options.showBusinessName && s.businessName ? s.businessName : null,
      sources: ['Configuración de la herramienta']
    });
  }

  /* ---------------- 3 · Pacing y forecast ---------------- */
  function cumulativeByMonth(S) {
    const labels = MONTHS.slice(), plan = [], actual = [], fc = [];
    let p = 0, a = 0, f = 0, pOk = true, aOk = true, fOk = true, cut = -1;
    (S.months || []).forEach((m, i) => {
      const pv = m.plan && m.plan.revenue, av = m.actualToDate && m.actualToDate.revenue, fv = m.forecast && m.forecast.revenue;
      if (isNum(pv)) p += pv; else pOk = false;
      if (m.countedDays > 0 && isNum(av)) { a += av; cut = i; } else if (m.countedDays > 0) aOk = false;
      if (isNum(fv)) f += fv; else fOk = false;
      plan.push(pOk ? p : null); fc.push(fOk ? f : null); actual.push(aOk && i <= cut ? a : null);
    });
    return { labels, plan, actual, forecast: fc, cutIndex: cut };
  }

  function pageMonthPacing(s, S, mk) {
    const wk = isWeekKey(mk), coll = wk ? 'weeks' : 'months', lw = periodLow(mk), uDel = wk ? 'de la semana' : 'del mes';
    const M = S[coll].find((m) => m.key === mk), name = monthName(mk), cutIso = s.run.cutoff;
    const tr = M.toDate && M.toDate.revenue, fg = M.forecastGap && M.forecastGap.revenue;
    if (!tr || !isNum(tr.actual) || !(M.countedDays > 0)) return omit('pacing', 'Pacing y forecast', `${name} todavía no tiene días contados con venta real hasta la fecha de corte.`);
    const hasPlan = isNum(tr.plan), closed = M.status === 'closed' || (M.lastDate && cutIso && M.lastDate <= cutIso);
    const fcM = M.forecast && isNum(M.forecast.revenue) ? M.forecast.revenue : null, planM = M.plan && isNum(M.plan.revenue) ? M.plan.revenue : null;
    // acumulado diario del mes: real (días contados), plan y forecast
    const days = (S.days || []).filter((d) => (wk ? d.weekKey : d.month) === mk).sort((a, b) => (a.date < b.date ? -1 : 1));
    const labels = days.map((d) => String(+d.date.slice(8, 10))); let p = 0, a = 0, f = 0, pOk = true, aOk = true, fOk = true, cut = -1; const plan = [], actual = [], fc = [];
    days.forEach((d, i) => {
      const pv = d.plan && d.plan.revenue, av = d.actual && d.actual.revenue, fv = d.forecast && d.forecast.revenue;
      if (isNum(pv)) p += pv; else pOk = false;
      if (d.counted && isNum(av)) { a += av; cut = i; } else if (d.counted) aOk = false;
      if (isNum(fv)) f += fv; else fOk = false;
      plan.push(pOk ? p : null); fc.push(fOk ? f : null); actual.push(aOk && i <= cut ? a : null);
    });
    const rows = [...CHANNELS.map((c) => [c, series(s.run, c)]), ['total', s.run.total]].filter(([, x]) => x && x[coll]).map(([c, x]) => {
      const m = x[coll].find((q) => q.key === mk), t = m && m.toDate && m.toDate.revenue;
      return { channel: chLabel(c), real: t ? t.actual : null, plan: t ? t.plan : null, gap: t ? t.gap : null, gapPct: t ? t.gapPct : null, days: m ? m.countedDays : null, _total: c === 'total' };
    }).filter((r) => r.real !== null);
    const state = !hasPlan ? null : Math.abs(tr.gapPct) < 0.005 ? 'en línea con el plan' : tr.gap < 0 ? `${pct(Math.abs(tr.gapPct))} por debajo del plan` : `${pct(Math.abs(tr.gapPct))} por encima del plan`;
    const headline = !hasPlan ? `${name}: venta real a la fecha ${moneyC(tr.actual)}; no hay plan comparable para medir el avance.`
      : `${name} va ${state} a la fecha (${smoney(tr.gap)})${fcM !== null && planM !== null ? `; cierre estimado ${uDel} ${moneyC(fcM)} frente a un plan de ${moneyC(planM)}.` : '.'}`;
    const recon = s.channel === 'total' && FP.methodAdvisor ? FP.methodAdvisor.totalReconciliation(s.run) : null;
    const notes = [];
    if (!hasPlan) notes.push('Sin plan comparable no se calculan brecha ni cumplimiento; se muestra solo el real.');
    notes.push(`Plan esperado: plan de los mismos ${M.countedDays} días con venta real cargada de ${name.toLowerCase()}. El cierre estimado ${uDel} no es un compromiso ni una meta.`);
    return page('pacing', 'Pacing y forecast', {
      ctx: `${name} · ${M.countedDays} días contados${cutIso && M.firstDate && M.lastDate && cutIso >= M.firstDate && cutIso < M.lastDate ? ` al ${dateLabel(cutIso)}` : ''}`,
      question: `¿Cómo va ${lw} contra su plan y dónde cerraría ${wk ? 'la semana' : 'el mes'}?`, headline, monthKey: mk, monthLabel: name, year: yearLine(s),
      kpis: [
        kpi('real', `Venta real de ${lw} a la fecha`, tr.actual, 'moneyC', TAG.obs, { sub: `${M.countedDays} días contados` }),
        kpi('plan', 'Plan esperado al corte', hasPlan ? tr.plan : null, 'moneyC', TAG.calc, { sub: 'mismos días contados' }),
        kpi('compliance', wk ? 'Cumplimiento de la semana' : 'Cumplimiento del mes', hasPlan ? tr.compliance : null, 'pct', TAG.calc, { tone: hasPlan ? toneOfGap(tr.gap) : 'neutral', sub: hasPlan ? `Brecha ${smoney(tr.gap)}` : null }),
        kpi('forecast', `Cierre estimado de ${lw}`, fcM, 'moneyC', TAG.est, { sub: isNum(fg && fg.gap) ? `vs. plan ${uDel} ${smoney(fg.gap)}` : (planM !== null ? `plan ${uDel} ${moneyC(planM)}` : `Método ${s.run.method ? s.run.method.id : '—'}`) })
      ],
      charts: [{ type: 'cumulative', id: 'cum', title: `Venta acumulada de ${lw} por día: real, plan y cierre estimado`, labels, plan, actual, forecast: fc, cutIndex: cut }],
      tables: [{ id: 'by-channel', title: `Por canal (${lw} a la fecha)`, columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'real', label: 'Real', kind: 'moneyC', num: true }, { key: 'plan', label: 'Plan esperado', kind: 'moneyC', num: true }, { key: 'gap', label: 'Brecha', kind: 'smoney', num: true, tone: true }, { key: 'gapPct', label: 'Brecha %', kind: 'spct', num: true, tone: true }, { key: 'days', label: 'Días', kind: 'int', num: true }], rows }],
      reconciliation: null, caveat: null, closedMonth: Boolean(closed),
      notes, sources: ['Pacing y forecast (motor de forecast)'], tags: [TAG.obs, TAG.calc, TAG.est]
    });
  }


  /* ---------------- con filtro: la selección contra su periodo anterior (no hay plan por producto ni sucursal) ---------------- */
  function pageSelectionPacing(s) {
    const SP = s.selPacing, flt = s.reportFilter || 'la selección';
    const sum = (k) => { const v = SP.channels.map((c) => c[k]).filter(isNum); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const cur = sum('cur'), prev = sum('prev');
    if (!isNum(cur)) return omit('pacing', 'Venta de la selección', 'La selección no tiene venta en el período elegido.');
    const delta = isNum(prev) ? cur - prev : null, dpct = isNum(prev) && prev > 0 ? delta / prev : null;
    const pname = s.selection && s.selection.periodKey ? monthName(s.selection.periodKey) : (SP.from && SP.to ? `${dShort(SP.from)} – ${dShort(SP.to)}` : 'el período');
    const baseLabel = SP.base && SP.base.label ? SP.base.label : 'periodo anterior', baseRef = `${/^semana/.test(baseLabel) ? 'la' : 'el'} ${baseLabel}`;
    const yoyPct = SP.yoy && isNum(SP.yoy.prev) && SP.yoy.prev > 0 ? cur / SP.yoy.prev - 1 : null;
    const state = !isNum(dpct) ? null : Math.abs(dpct) < 0.005 ? 'se mantiene sin cambio' : dpct < 0 ? `cae ${pct(Math.abs(dpct))}` : `crece ${pct(Math.abs(dpct))}`;
    const cum = (arr, n) => { let a = 0; const out = []; for (let i = 0; i < n; i++) { const v = arr[i]; a += isNum(v) ? v : 0; out.push(i < arr.length ? a : null); } return out; };
    const dayVals = (daily, from, n) => { const m = new Map(daily); const out = []; for (let i = 0; i < n; i++) out.push(m.has(addDay(from, i)) ? m.get(addDay(from, i)) : 0); return out; };
    const n = SP.from && SP.to ? Math.min(Math.max(1, Math.round((Date.parse(SP.to) - Date.parse(SP.from)) / 86400000) + 1), 400) : 0;
    const labels = Array.from({ length: n }, (_, i) => String(+addDay(SP.from, i).slice(8, 10)));
    const curC = n ? cum(dayVals(SP.curDaily || [], SP.from, n), n) : [], prevC = n && SP.base ? cum(dayVals(SP.prevDaily || [], SP.base.from, n), n) : [];
    const rows = SP.channels.map((c) => ({ channel: chLabel(c.key), real: c.cur, plan: c.prev, gap: isNum(c.cur) && isNum(c.prev) ? c.cur - c.prev : null, gapPct: isNum(c.cur) && isNum(c.prev) && c.prev > 0 ? (c.cur - c.prev) / c.prev : null })).filter((r) => isNum(r.real) || isNum(r.plan));
    if (rows.length > 1) rows.push({ channel: 'Total', real: cur, plan: prev, gap: delta, gapPct: dpct, _total: true });
    return page('pacing', 'Venta de la selección', {
      ctx: `${pname} vs. ${baseLabel}`, selection: true, periodLabel: pname, baseLabel, baseRef, filterLabel: flt,
      question: `¿Cómo va la venta de la selección contra ${baseRef}?`,
      headline: `${flt}: ${moneyC(cur)} en ${pname}${isNum(prev) ? `, ${state} frente a ${baseRef} (${smoney(delta)})` : '; no hay venta en el periodo de referencia'}.`,
      kpis: [
        kpi('real', 'Venta de la selección', cur, 'moneyC', TAG.obs, { sub: pname }),
        kpi('prev', 'Periodo de referencia', prev, 'moneyC', TAG.obs, { sub: baseLabel }),
        kpi('change', 'Cambio vs. referencia', dpct, 'spct', TAG.calc, { tone: isNum(delta) ? toneOfGap(delta) : 'neutral', sub: isNum(delta) ? `Diferencia ${smoney(delta)}` : null })
      ].concat(isNum(yoyPct) ? [kpi('yoy', 'vs. mismo periodo del año anterior', yoyPct, 'spct', TAG.calc, { tone: toneOfGap(yoyPct), sub: `Referencia ${moneyC(SP.yoy.prev)}` })] : []),
      charts: n > 1 ? [{ type: 'cumulative', id: 'cum', title: 'Venta acumulada por día: período elegido vs. referencia', labels, plan: prevC, actual: curC, forecast: curC.map(() => null), cutIndex: n - 1, noCut: true, legend: ['Período elegido', baseLabel, null] }] : [],
      tables: [{ id: 'by-channel', title: 'Por canal', columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'real', label: 'Selección', kind: 'moneyC', num: true }, { key: 'plan', label: 'Referencia', kind: 'moneyC', num: true }, { key: 'gap', label: 'Cambio', kind: 'smoney', num: true, tone: true }, { key: 'gapPct', label: 'Cambio %', kind: 'spct', num: true, tone: true }], rows }],
      reconciliation: null, caveat: null,
      notes: ['No hay plan por producto ni por sucursal: esta lámina compara contra el periodo de referencia, no mide cumplimiento del plan.', 'El diagnóstico y la recuperación siguen siendo del total del negocio.'],
      sources: ['Ventas por producto'], tags: [TAG.obs, TAG.calc]
    });
  }

  function pagePacing(s) {
    if (s.selPacing && s.reportFilter) return pageSelectionPacing(s);
    const S = series(s.run, s.channel);
    const mk = selMonth(s); if (S && S.annual && mk) return pageMonthPacing(s, S, mk);
    if (!S || !S.annual) return omit('pacing', 'Pacing y forecast', 'No hay forecast calculado: falta el plan o la venta real del año.');
    const A = S.annual, tr = A.toDate && A.toDate.revenue, fg = A.forecastGap && A.forecastGap.revenue;
    if (!tr || !isNum(tr.actual) || !(A.countedDays > 0)) return omit('pacing', 'Pacing y forecast', 'Todavía no hay días contados con venta real hasta la fecha de corte.');
    const hasPlan = isNum(tr.plan), cutIso = s.run.cutoff;
    const headline = !hasPlan
      ? `Venta real a la fecha ${moneyC(tr.actual)}; no hay plan comparable para medir el avance.`
      : `${Math.abs(tr.gapPct) < 0.005 ? 'En línea con el plan' : tr.gap < 0 ? `${pct(Math.abs(tr.gapPct))} por debajo del plan` : `${pct(Math.abs(tr.gapPct))} por encima del plan`} a la fecha (${smoney(tr.gap)}); ${isNum(A.forecast && A.forecast.revenue) ? `cierre estimado ${moneyC(A.forecast.revenue)}${isNum(fg && fg.gapPct) ? ` (${spct(fg.gapPct)} vs. meta)` : ''}.` : 'el cierre estimado no está disponible.'}`;
    const rows = [...CHANNELS.map((c) => [c, series(s.run, c)]), ['total', s.run.total]].filter(([, x]) => x && x.annual).map(([c, x]) => {
      const t = x.annual.toDate && x.annual.toDate.revenue;
      return { channel: chLabel(c), real: t ? t.actual : null, plan: t ? t.plan : null, gap: t ? t.gap : null, gapPct: t ? t.gapPct : null, days: x.annual.countedDays, _total: c === 'total' };
    });
    const recon = s.channel === 'total' && FP.methodAdvisor ? FP.methodAdvisor.totalReconciliation(s.run) : null;
    const notes = [];
    if (recon && recon.excludedDays > 0) {
      const who = Object.entries(recon.byChannel || {}).map(([c, r]) => `${chLabel(c)} (${r.map((x) => (x[0] === x[1] ? dateLabel(x[0]) : `${dateLabel(x[0])} a ${dateLabel(x[1])}`)).join(', ')})`).join('; ');
      notes.push(`Conciliación del Total: ${recon.excludedDays} día${recon.excludedDays === 1 ? '' : 's'} excluido${recon.excludedDays === 1 ? '' : 's'} del pacing del Total porque falta el real de ${who}. Suma de los canales ${smoney(recon.sumChannelsGap)} · Total estricto ${smoney(recon.totalGap)} · Diferencia ${smoney(recon.difference)}.`);
    }
    if (!hasPlan) notes.push('Sin plan comparable no se calculan brecha ni cumplimiento; se muestra solo el real.');
    if (!isNum(A.forecast && A.forecast.revenue)) notes.push('El forecast al cierre no está disponible: el plan no cubre todo el año o no hay método con datos suficientes.');
    notes.push(`Plan esperado: plan de los mismos ${A.countedDays} días con venta real cargada (1 ene – ${dateLabel(cutIso)}). El cierre estimado no es un compromiso ni una meta.`);
    return page('pacing', 'Pacing y forecast', {
      ctx: `Año ${s.run.year}: 1 ene – ${dateLabel(cutIso)} · ${A.countedDays} días contados`,
      question: '¿Vamos arriba o abajo del plan hoy y dónde cerraríamos al ritmo actual?', headline,
      kpis: [
        kpi('real', 'Venta real acumulada al corte', tr.actual, 'moneyC', TAG.obs, { sub: `${A.countedDays} días contados` }),
        kpi('plan', 'Plan esperado al corte', hasPlan ? tr.plan : null, 'moneyC', TAG.calc, { sub: 'mismos días contados' }),
        kpi('compliance', 'Cumplimiento', hasPlan ? tr.compliance : null, 'pct', TAG.calc, { tone: hasPlan ? toneOfGap(tr.gap) : 'neutral', sub: hasPlan ? `Brecha ${smoney(tr.gap)}` : null }),
        kpi('forecast', `Cierre estimado ${s.run.year}`, A.forecast ? A.forecast.revenue : null, 'moneyC', TAG.est, { sub: isNum(fg && fg.gap) ? `vs. meta ${smoney(fg.gap)}` : `Método ${s.run.method ? s.run.method.id : '—'}` })
      ],
      charts: [Object.assign({ type: 'cumulative', id: 'cum', title: 'Venta acumulada por mes: real, plan y forecast' }, cumulativeByMonth(S))],
      tables: [{ id: 'by-channel', title: 'Por canal (a la fecha)', columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'real', label: 'Real', kind: 'moneyC', num: true }, { key: 'plan', label: 'Plan esperado', kind: 'moneyC', num: true }, { key: 'gap', label: 'Brecha', kind: 'smoney', num: true, tone: true }, { key: 'gapPct', label: 'Brecha %', kind: 'spct', num: true, tone: true }, { key: 'days', label: 'Días', kind: 'int', num: true }], rows }],
      reconciliation: recon && recon.excludedDays > 0 ? recon : null,
      caveat: null,
      notes, sources: ['Pacing y forecast (motor de forecast)'], tags: [TAG.obs, TAG.calc, TAG.est]
    });
  }

  /* ---------------- 4 · Confiabilidad y sensibilidad del forecast ---------------- */
  const LIGHT_TEXT = { green: 'Datos suficientes', yellow: 'Datos limitados', red: 'Datos insuficientes' };
  function advise(s) {
    if (!FP.methodAdvisor || !s.run) return null;
    try { return FP.methodAdvisor.advise({ run: s.run, channel: s.channel || 'total', metric: 'revenue', backtest: s.backtest || null, horizon: 7 }); } catch (e) { return null; }
  }
  function pageReliability(s, adv) {
    const S = series(s.run, s.channel);
    if (!S || !S.annual || !s.run.method) return omit('reliability', 'Confiabilidad del forecast', 'No hay forecast calculado.');
    const A = S.annual, fc = A.forecast && A.forecast.revenue, goal = A.plan && A.plan.revenue, fg = A.forecastGap && A.forecastGap.revenue;
    const mid = s.run.method.id, light = adv && adv.methods && adv.methods[mid] ? adv.methods[mid].light : null;
    const range = adv && adv.range ? adv.range : null;
    const material = range && isNum(range.spreadPct) && range.spreadPct >= MATERIAL_SPREAD;
    const conf = S.confidence && S.confidence.level ? S.confidence.level : null;
    const confText = conf && FP.config && FP.config.confidenceLabels ? FP.config.confidenceLabels[conf] : conf;
    const notes = [];
    if (range) notes.push(material
      ? `Advertencia: los métodos con datos suficientes cierran entre ${money(range.min)} y ${money(range.max)}; la diferencia es ${pct(range.spreadPct)} de la meta. Es un rango entre métodos, no un intervalo de confianza.`
      : `Los métodos con datos suficientes coinciden dentro de ${pct(range.spreadPct)} de la meta. Es un rango entre métodos, no un intervalo de confianza.`);
    else notes.push('No hay métodos alternativos con datos suficientes para contrastar el cierre.');
    if (!isNum(goal)) notes.push('Sin meta que cubra el año no se calcula la brecha proyectada.');
    notes.push('El método lo eligió una persona en Pacing y forecast; la herramienta no lo cambia sola. El detalle de cada método está en el anexo.');
    return page('reliability', 'Confiabilidad del forecast', {
      ctx: `Cierre anual ${s.run.year} · método ${mid}`,
      question: '¿Cuánto confiar en el cierre estimado y cuánto depende del método?',
      headline: isNum(fc) ? `Cierre estimado ${moneyC(fc)} con el método ${mid}${isNum(fg && fg.gapPct) ? ` (${spct(fg.gapPct)} vs. meta)` : ''}${light ? `; ${LIGHT_TEXT[light].toLowerCase()}` : ''}.` : `El método ${mid} no tiene cierre estimado disponible.`,
      kpis: [
        kpi('method', 'Método seleccionado', `${mid} · ${s.run.method.label}`, 'text', null),
        kpi('fc', 'Cierre estimado', isNum(fc) ? fc : null, 'moneyC', TAG.est),
        kpi('goal', `Meta anual ${s.run.year}`, isNum(goal) ? goal : null, 'moneyC', TAG.calc),
        kpi('gap', 'Cierre estimado − meta anual', fg && isNum(fg.gap) ? fg.gap : null, 'smoney', TAG.est, { tone: fg ? toneOfGap(fg.gap) : 'neutral', sub: fg && isNum(fg.gapPct) ? spct(fg.gapPct) : null })
      ],
      suficiencia: { light, text: light ? LIGHT_TEXT[light] : NA, reasons: adv && adv.methods && adv.methods[mid] ? adv.methods[mid].reasons || [] : [], confidence: confText || null, countedDays: A.countedDays, dataQuality: s.quality ? s.quality.statusText : null },
      charts: range ? [{ type: 'range', id: 'range', title: 'Rango de cierre entre métodos con datos suficientes', min: range.min, max: range.max, selected: isNum(fc) ? fc : null, goal: isNum(goal) ? goal : null, material: Boolean(material) }] : [],
      annex: true, warning: material ? 'divergence' : null, notes, sources: ['Pacing y forecast', 'Comparación de métodos'], tags: [TAG.calc, TAG.est]
    });
  }

  /* ---------------- 5 · Diagnóstico de motores y canales ---------------- */
  function pageDrivers(s) {
    const d = s.diag;
    if (!d || d.status !== 'ok' || !d.gap) return omit('drivers', 'Diagnóstico de motores y canales', 'No hay brecha que descomponer: falta plan o venta real en el período del diagnóstico.');
    const L1 = (d.level1Drivers || []).filter((x) => isNum(x.contribution));
    if (L1.length < 2) return omit('drivers', 'Diagnóstico de motores y canales', 'Faltan tráfico, pedidos o venta para descomponer la brecha en tráfico, conversión y ticket.');
    const ok = closes(L1.map((x) => x.contribution), d.gap.abs);
    if (!ok) return omit('drivers', 'Diagnóstico de motores y canales', 'La descomposición no cierra con la brecha del período; no se muestra una atribución que no concilia.');
    const main = [...L1].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0];
    const steps = [{ label: d.result.baselineLabel || 'Referencia', value: d.gap.baseline, kind: 'total' }, ...L1.map((x) => ({ label: x.label, value: x.contribution, kind: 'delta' })), { label: d.result.currentLabel || 'Real', value: d.gap.current, kind: 'total' }];
    const rows = L1.map((x) => ({ driver: x.label, baseline: x.baseline, current: x.current, deltaPct: x.deltaPct, contribution: x.contribution, _kind: x.driver }));
    const fmtK = (k) => (k === 'conversionRate' ? 'pct2' : k === 'aov' ? 'money' : 'int');
    const channelDim = (d.level2 || []).find((x) => x.dimension === 'channel');
    let chRows = null;
    if (s.channel === 'total' && channelDim && channelDim.groups && channelDim.groups.length > 1) {
      chRows = channelDim.groups.filter((g) => isNum(g.gap)).map((g) => {
        const top = Object.entries(g.contributions || {}).filter(([, v]) => isNum(v)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
        const lab = { trafficVolume: 'Tráfico', conversionRate: 'CR', aov: 'AOV' };
        return { channel: g.label, gap: g.gap, main: top ? `${lab[top[0]] || top[0]} (${smoney(top[1])})` : NA, share: g.currentShare };
      }).sort((a, b) => a.gap - b.gap);
    }
    const cov = d.coverage || {}, perEnd = periodEnd(d.period), obsRange = rangeLabel((cov.currentRange || [])[0], (cov.currentRange || [])[1]);
    const dPartial = Boolean(perEnd && cov.currentRange && cov.currentRange[1] && cov.currentRange[1] < perEnd);
    return page('drivers', 'Diagnóstico de motores y canales', {
      ctx: `${d.period && d.period.label ? d.period.label : 'Período del diagnóstico'}${obsRange ? ` (datos ${obsRange})` : ''} · ${d.comparison && d.comparison.label ? d.comparison.label : 'vs. referencia'}`,
      question: '¿Qué palanca explica matemáticamente la brecha contra el plan?',
      headline: `${d.period && d.period.label ? `${d.period.label}: l` : 'L'}a brecha de ${smoney(d.gap.abs)} (${spct(d.gap.pct)}) se descompone en tráfico, CR y AOV; la mayor contribución aritmética es ${main.label} (${smoney(main.contribution)}).`,
      kpis: [
        kpi('gap', `Brecha del diagnóstico (${d.comparison && d.comparison.baseline ? `real − ${String(d.comparison.baseline).toLowerCase()}` : 'real − referencia'})`, d.gap.abs, 'smoney', TAG.calc, { tone: toneOfGap(d.gap.abs), sub: spct(d.gap.pct) }),
        kpi('cur', d.result.currentLabel || 'Real', d.gap.current, 'moneyC', TAG.obs),
        kpi('base', d.result.baselineLabel || 'Referencia', d.gap.baseline, 'moneyC', TAG.calc)
      ],
      charts: [{ type: 'waterfall', id: 'wf', title: 'De la referencia al real, por palanca', steps }],
      tables: [{ id: 'drivers', title: 'Contribución por palanca', columns: [{ key: 'driver', label: 'Palanca', kind: 'text' }, { key: 'baseline', label: 'Referencia', kindBy: '_kind', num: true }, { key: 'current', label: 'Real', kindBy: '_kind', num: true }, { key: 'deltaPct', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'contribution', label: 'Contribución', kind: 'smoney', num: true, tone: true }], rows, kindMap: { trafficVolume: 'int', conversionRate: 'pct2', aov: 'money' } },
        ...(chRows && chRows.length ? [{ id: 'channels', title: 'Lectura por canal', columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'gap', label: 'Brecha', kind: 'smoney', num: true, tone: true }, { key: 'main', label: 'Mayor contribución aritmética', kind: 'text' }], rows: chRows.slice(0, 4) }] : [])],
      method: { id: d.attributionMethod, label: d.attributionMethodLabel, closes: true, sum: L1.reduce((a, x) => a + x.contribution, 0), gap: d.gap.abs },
      notes: [`Las contribuciones suman exactamente la brecha (${smoney(L1.reduce((a, x) => a + x.contribution, 0))}). Es aritmética de Venta = Tráfico × CR × AOV: indica cuánto aporta cada palanca, no demuestra que sea la causa.`, dPartial ? `Período seleccionado: ${d.period.label}. Solo hay datos observados ${obsRange}; la comparación usa los mismos días de la referencia, no el período completo.` : null, d.coverage && isNum(d.coverage.unpaired) && d.coverage.unpaired > 0 ? `${d.coverage.unpaired} día(s) sin par comparable quedaron fuera de la comparación.` : null].filter(Boolean),
      comparison: { label: d.comparison && d.comparison.label, period: d.period && d.period.label, channel: d.channel && d.channel.label },
      sources: ['Diagnóstico de brecha'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 6 · Evolución y patrones ---------------- */
  const PATTERN = { growth_sustained: 'Crecimiento sostenido', growth_accelerating: 'Crecimiento acelerado', growth_decelerating: 'Crecimiento desacelerando', decline_sustained: 'Caída sostenida', decline_accelerating: 'Caída acelerada', decline_decelerating: 'Caída desacelerando', recovery: 'Recuperación', strong_recovery: 'Recuperación fuerte', trend_break: 'Ruptura de tendencia', stable: 'Estable', volatile: 'Volátil', anomaly: 'Anomalía', insufficient_history: 'Historia insuficiente' };
  const patternText = (p, n) => {
    const base = PATTERN[p] || NA;
    const dec = /^decline|^growth/.test(p || '');
    return dec && isNum(n) && n >= 2 ? `${base} · ${n} períodos` : base;
  };
  function pageTrends(s) {
    const t = s.trend, P = t && t.priorities;
    if (!P || P.status !== 'available') return omit('trends', 'Evolución y patrones', 'No hay análisis de evolución: carga venta por producto con historia de al menos 6 períodos.');
    const ctx = t.context || {};
    const rowBy = new Map((t.rows || []).map((r) => [r.entity, r]));
    const bn = (e) => (ctx.level === 'branch' && s.branchNames && s.branchNames[e]) || e;   // sucursal: nombre_sucursal, no el código
    const mapRow = (x) => ({ entity: bn(x.entity), impact: x.impact, relative: x.relativeChange, pattern: patternText(x.pattern, x.consecutivePeriods), _spark: (rowBy.get(x.entity) || {}).series || null });
    const drag = (P.drag || []).filter((x) => isNum(x.impact)).slice(0, 5).map(mapRow), comp = (P.compensate || []).filter((x) => isNum(x.impact)).slice(0, 5).map(mapRow);
    if (!drag.length && !comp.length) return omit('trends', 'Evolución y patrones', 'El análisis no encontró entidades con cambio medible en el período.');
    const cmp = P.comparison || {};
    const partial = cmp.currentPartial || cmp.baselinePartial;
    const lvl = { category: 'categoría', subcategory: 'subcategoría', product: 'producto', sku: 'SKU', state: 'estado', city: 'ciudad', branch: 'sucursal', delivery: 'tipo de entrega', channel: 'canal' }[ctx.level] || 'entidad';
    const cols = [{ key: 'entity', label: 'Entidad', kind: 'text' }, { key: 'impact', label: 'Impacto', kind: 'smoney', num: true, tone: true }, { key: 'relative', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'pattern', label: 'Patrón', kind: 'text' }, { key: '_spark', label: 'Evolución', kind: 'spark' }];
    return page('trends', 'Evolución y patrones', {
      ctx: `${cmp.currentPeriod || 'Período'} vs. ${cmp.baselinePeriod || 'anterior'}${partial ? ' (incluye período parcial)' : ''}`,
      question: '¿Qué entidades arrastran la caída, cuáles compensan y desde cuándo?',
      headline: `${cmp.currentPeriod || 'El período'} vs. ${cmp.baselinePeriod || 'el anterior'}: caen ${money(P.totals && P.totals.dragAbs)} en ${(P.drag || []).length} ${lvl}(s) y compensan ${money(P.totals && P.totals.compensateAbs)} en ${(P.compensate || []).length}.`,
      kpis: [
        kpi('drag', 'Lo que arrastra', P.totals ? P.totals.drag : null, 'smoney', TAG.calc, { tone: 'neg' }),
        kpi('comp', 'Lo que compensa', P.totals ? P.totals.compensate : null, 'smoney', TAG.calc, { tone: 'pos' }),
        kpi('bal', 'Balance neto', P.totals ? P.totals.balance : null, 'smoney', TAG.calc, { tone: P.totals ? toneOfGap(P.totals.balance) : 'neutral' })
      ],
      tables: [{ id: 'drag', title: 'Arrastran', columns: cols, rows: drag }, { id: 'comp', title: 'Compensan', columns: cols, rows: comp }],
      scope: { level: ctx.levelLabel || lvl, metric: ctx.metricLabel || 'Venta', channel: ctx.channelLabel || null, periodType: ctx.periodType || null, filter: s.trendFilterLabel || null, partial: Boolean(partial) },
      notes: [partial ? 'Hay un período parcial en la comparación: los cambios pueden cambiar al cerrar el período.' : 'Comparación entre períodos completos.', 'Los patrones son descriptivos (cómo se movió la venta), no explican por qué. Una duración corta no es un deterioro estructural.'],
      sources: ['Evolución y patrones'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 7 · Categorías y productos ---------------- */
  function pageCategories(s) {
    // Izquierda: cambio de venta por categoría. Derecha: participación en venta por subcategoría (si el análisis por nivel está disponible).
    const PL = s.productByLevel || {};
    const r = PL.category || s.product, rt = PL.subcategory || r;
    if (!r || !r.rows || !r.rows.length) return omit('categories', 'Categorías y productos', 'No hay venta por producto cargada para el período.');
    const rows = r.rows.filter((x) => x.revenue && isNum(x.revenue.current));
    if (!rows.length) return omit('categories', 'Categorías y productos', 'Los grupos del período no tienen venta observada.');
    const tot = r.total && r.total.revenue ? r.total.revenue : {};
    const level = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', channel: 'Canal' }[r.level] || 'Grupo';
    const byShare = [...rows].sort((a, b) => b.revenue.current - a.revenue.current);
    const byDelta = [...rows].filter((x) => isNum(x.revenue.delta)).sort((a, b) => Math.abs(b.revenue.delta) - Math.abs(a.revenue.delta));
    const top3 = byShare.slice(0, 3).reduce((a, x) => a + (isNum(x.share) ? x.share : 0), 0);
    const stable = isNum(tot.delta) && isNum(tot.baseline) && tot.baseline > 0 && Math.abs(tot.delta) / tot.baseline >= 0.01;
    const levelT = { category: 'Categoría', subcategory: 'Subcategoría', product: 'Producto', sku: 'SKU', channel: 'Canal' }[rt.level] || 'Grupo';
    const rowsT = (rt.rows || []).filter((x) => x.revenue && isNum(x.revenue.current)).sort((a, b) => b.revenue.current - a.revenue.current);
    const stableT = rt === r ? stable : (() => { const t = rt.total && rt.total.revenue ? rt.total.revenue : {}; return isNum(t.delta) && isNum(t.baseline) && t.baseline > 0 && Math.abs(t.delta) / t.baseline >= 0.01; })();
    const tbl = rowsT.slice(0, 6).map((x) => ({ key: x.key, current: x.revenue.current, delta: x.revenue.delta, deltaPct: x.revenue.deltaPct, share: x.share, contribution: stableT && isNum(x.contribution) ? x.contribution : null }));
    const lead = byDelta[0];
    const pr = r.period || {}, bl = r.baseline || {};
    return page('categories', 'Categorías y productos', {
      ctx: `${rangeLabel(pr.from, pr.to) || 'Período'} vs. ${bl.label || rangeLabel(bl.from, bl.to) || 'referencia'}`,
      question: '¿Dónde está concentrada la venta y dónde está el cambio?',
      headline: `${level}s: los 3 mayores concentran ${pct(top3, 0)} de la venta${lead ? `; el mayor cambio está en ${lead.key} (${smoney(lead.revenue.delta)})` : ''}.`,
      kpis: [kpi('total', 'Venta del período', tot.current, 'moneyC', TAG.obs), kpi('delta', 'Cambio vs. referencia', tot.delta, 'smoney', TAG.calc, { tone: toneOfGap(tot.delta), sub: isNum(tot.deltaPct) ? spct(tot.deltaPct) : null }), kpi('top3', 'Top 3 en venta', top3, 'pct', TAG.calc)],
      charts: [{ type: 'hbar', id: 'contrib', title: `Cambio de venta por ${level.toLowerCase()}`, unit: 'money', items: byDelta.slice(0, 6).map((x) => ({ label: x.key, value: x.revenue.delta })) }],
      tables: [{ id: 'share', title: `Participación en venta · ${levelT}`, columns: [{ key: 'key', label: levelT, kind: 'text' }, { key: 'current', label: 'Venta', kind: 'moneyC', num: true }, { key: 'share', label: 'Participación', kind: 'pct', num: true }, { key: 'delta', label: 'Cambio', kind: 'smoney', num: true, tone: true }, { key: 'contribution', label: 'Aporte al cambio', kind: 'pct', num: true }], rows: tbl }],
      scope: { period: r.period, baseline: r.baseline, channel: r.channel, level, filter: s.productFilterLabel || null },
      notes: ['Participación = venta del grupo ÷ venta total. Aporte al cambio = cambio del grupo ÷ cambio total; son medidas distintas.', stable ? null : 'El cambio total es muy pequeño, así que el «aporte al cambio» no es estable y no se muestra.', r.compensation && clean(r.compensation.text) ? r.compensation.text : null].filter(Boolean),
      sources: ['Categoría → Producto'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 8 · Clientes, recurrencia y LTV ---------------- */
  function pageCustomers(s) {
    const c = s.customers && s.customers.result;
    if (!c || c.status !== 'ok' || !c.summary || !(c.summary.customers > 0)) return omit('customers', 'Clientes, recurrencia y LTV', 'No hay libro de clientes: carga venta con ID de pedido e ID de cliente.');
    const mkP = selMonth(s), wkRow = mkP && isWeekKey(mkP) ? ((series(s.run, s.channel) || {}).weeks || []).find((w) => w.key === mkP) : null, mkC = wkRow && wkRow.lastDate ? wkRow.lastDate.slice(0, 7) : mkP, months = (c.monthly || []).filter((m) => !mkC || m.key <= mkC).slice(-6);
    if (!months.length) return omit('customers', 'Clientes, recurrencia y LTV', 'No hay meses con clientes identificados.');
    const reliableNew = months.every((m) => m.reliableNew);
    const last = months[months.length - 1];
    const pooled = (c.pooled || []).filter((p) => p.mature > 0 && isNum(p.repeatRate));
    const retention = pooled.map((p) => ({ window: `${p.days} días`, mature: p.mature, repeat: p.repeatRate, ltv: p.ltv }));
    const filtered = Boolean(c.filtered);
    const cutIso = s.run && s.run.cutoff, inProgress = Boolean(cutIso && last.key === cutIso.slice(0, 7) && cutIso < periodEnd({ type: 'month', key: last.key }));
    return page('customers', 'Clientes, recurrencia y LTV', {
      ctx: `${last.key}${inProgress ? ` (en curso, datos al ${dateLabel(cutIso)})` : ''} · últimos ${months.length} meses`,
      question: '¿Qué calidad tiene la base de clientes detrás de la venta?',
      headline: `${int(c.summary.customers)} clientes identificados; en ${last.key} ${int(last.customers.total)} compraron (${int(last.customers.new)} nuevos, ${int(last.customers.recurrent)} recurrentes, ${int(last.customers.reactivated)} reactivados).`,
      kpis: [kpi('customers', 'Clientes identificados', c.summary.customers, 'int', TAG.obs), kpi('repeat', 'Recompra (histórico)', c.summary.repeatRate, 'pct', TAG.calc), kpi('rpc', 'Venta por cliente', c.summary.revenuePerCustomer, 'moneyC', TAG.calc)],
      charts: [{ type: 'stacked', id: 'mix', title: 'Clientes por mes: nuevos, recurrentes y reactivados', labels: months.map((m) => m.key), series: [{ name: 'Nuevos', values: months.map((m) => m.customers.new) }, { name: 'Recurrentes', values: months.map((m) => m.customers.recurrent) }, { name: 'Reactivados', values: months.map((m) => m.customers.reactivated) }] }],
      tables: [{ id: 'retention', title: 'Recompra y LTV observado por ventana (clientes con la ventana completa)', columns: [{ key: 'window', label: 'Ventana', kind: 'text' }, { key: 'mature', label: 'Clientes', kind: 'int', num: true }, { key: 'repeat', label: 'Recompraron', kind: 'pct', num: true }, { key: 'ltv', label: 'LTV observado', kind: 'money', num: true }], rows: retention }],
      lapsed: isNum(last.lapsed) && isNum(last.lapsedBase) ? { month: last.key, count: last.lapsed, base: last.lapsedBase } : null,
      scope: { filtered, label: s.customers.scopeLabel || (filtered ? 'Selección' : 'Toda la empresa') },
      notes: [inProgress ? `${last.key} está en curso (datos al ${dateLabel(cutIso)}): sus clientes y compras no son comparables con meses completos.` : null, reliableNew ? null : 'Con poca historia previa, «nuevo» puede incluir clientes que ya compraban: la apertura nuevo/recurrente de los primeros meses no es confiable.', isNum(last.lapsed) ? `${int(last.lapsed)} de ${int(last.lapsedBase)} clientes que compraron el mes anterior no compraron en ${last.key}; es una ventana de un mes, no una pérdida definitiva.` : null, 'El LTV observado es la venta acumulada de clientes con la ventana completa; no es un valor futuro garantizado.'].filter(Boolean),
      sources: ['Clientes y LTV'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 9 · Tráfico y conversión ---------------- */
  const SEG_DIMS = ['device', 'sourceMedium', 'campaign', 'landingPage', 'source', 'medium'];
  function pageTraffic(s) {
    const hasSeg = (x) => x && x.level2 && x.level2.some((l) => l.source !== 'core' && l.groups && l.groups.length);
    const alt = !hasSeg(s.diag) && hasSeg(s.trafficDiag);
    const d = alt ? s.trafficDiag : s.diag;
    const dims = d && d.level2 ? d.level2.filter((x) => x.source !== 'core' && x.groups && x.groups.length) : [];
    if (!dims.length) return omit('traffic', 'Tráfico y conversión', (String((d && d.availability && d.availability.segmentsNote) || '').slice(0, 230) || 'No hay segmentos de tráfico (GA4 o archivo de Segmentos) para el período.'));
    const dim = dims[0];
    const rows = dim.groups.map((g) => {
      const m = g.metrics || {};
      return { segment: g.label, traffic: g.current ? g.current.trafficVolume : null, trafficChg: m.trafficVolume ? m.trafficVolume.deltaPct : null, cr: g.current ? g.current.conversionRate : null, crChg: m.conversionRate ? m.conversionRate.deltaPct : null, aov: g.current ? g.current.aov : null, revenue: g.current ? g.current.revenue : null, revChg: m.revenue ? m.revenue.deltaPct : null, obs: g.observations };
    }).filter((r) => isNum(r.traffic) || isNum(r.revenue)).sort((a, b) => (b.traffic || 0) - (a.traffic || 0)).slice(0, 6);
    if (!rows.length) return omit('traffic', 'Tráfico y conversión', 'Los segmentos del período no traen tráfico ni venta observados.');
    const best = [...rows].filter((r) => isNum(r.crChg)).sort((a, b) => b.crChg - a.crChg)[0], worst = [...rows].filter((r) => isNum(r.crChg)).sort((a, b) => a.crChg - b.crChg)[0];
    const overview = trafficOverview(dims, s.trafficWeekly);
    return page('traffic', 'Tráfico y conversión', {
      overview,
      ctx: `${d.period && d.period.label ? d.period.label : 'Período del diagnóstico'} · ${d.comparison && d.comparison.label ? d.comparison.label : 'vs. referencia'}`,
      question: overview ? '¿Cómo se movieron el tráfico y la conversión, y de dónde viene el cambio?' : '¿En qué segmento ganó o perdió tráfico y conversión?',
      headline: best && worst && best !== worst ? `Por ${dim.label.toLowerCase()}, el CR cambió más en ${best.segment} (${spct(best.crChg)}) y menos en ${worst.segment} (${spct(worst.crChg)}).` : `Tráfico y conversión por ${dim.label.toLowerCase()} en el período del diagnóstico.`,
      tables: [{ id: 'segments', title: `Segmentos · ${dim.label}`, columns: [{ key: 'segment', label: 'Segmento', kind: 'text' }, { key: 'traffic', label: 'Tráfico', kind: 'int', num: true }, { key: 'trafficChg', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'cr', label: 'CR', kind: 'pct2', num: true }, { key: 'crChg', label: 'Cambio', kind: 'spct', num: true, tone: true }, { key: 'aov', label: 'AOV', kind: 'money', num: true }, { key: 'revChg', label: 'Venta', kind: 'spct', num: true, tone: true }], rows }],
      scope: { dimension: dim.label, period: d.period && d.period.label, comparison: d.comparison && d.comparison.label, denominator: 'CR = pedidos ÷ tráfico del segmento; AOV = venta ÷ pedidos' },
      notes: [...(alt ? ['El plan no tiene segmentos y el export no trae el mismo periodo del año anterior: esta lámina compara contra el periodo anterior, no contra el plan.'] : []), 'Descriptivo: las diferencias entre segmentos no demuestran causa ni rentabilidad publicitaria.', 'CR y AOV vienen de sumas del segmento, no de promedios de tasas diarias.', 'La herramienta no incluye inversión publicitaria; no hay CAC ni ROAS.'],
      sources: ['Diagnóstico · segmentos de tráfico'], tags: [TAG.obs, TAG.calc]
    });
  }


  /* Tráfico y conversión: panorama (totales contra la referencia, mezcla por canal / dispositivo / tipo de cliente y semanas) y campañas.
     Solo reordena lo que el diagnóstico ya calculó por segmento (current, baseline, metrics): no hay fórmulas nuevas. */
  const MEDIUM_NAME = { '(none)': 'Directo', '(direct)': 'Directo', cpc: 'Pago (cpc)', organic: 'Orgánico', referral: 'Referido', email: 'Correo' };
  const mixRows = (dim, nameMap) => {
    const g = dim.groups.filter((x) => x.current && isNum(x.current.trafficVolume) && x.baseline && isNum(x.baseline.trafficVolume));
    const T = g.reduce((a, x) => a + x.current.trafficVolume, 0), B = g.reduce((a, x) => a + x.baseline.trafficVolume, 0);
    if (!g.length || !(T > 0) || !(B > 0)) return null;
    return { id: dim.dimension, label: dim.label, rows: g.map((x) => ({ label: nameMap && nameMap[x.label] ? nameMap[x.label] : x.label, traffic: x.current.trafficVolume, share: x.current.trafficVolume / T, baseShare: x.baseline.trafficVolume / B, cr: x.current.conversionRate, crChg: x.metrics && x.metrics.conversionRate ? x.metrics.conversionRate.deltaPct : null, trafficChg: x.metrics && x.metrics.trafficVolume ? x.metrics.trafficVolume.deltaPct : null, aov: x.current.aov, revenue: x.current.revenue })).sort((a, b) => b.traffic - a.traffic) };
  };
  function trafficOverview(dims, weekly) {
    const by = Object.fromEntries(dims.map((d) => [d.dimension, d]));
    const base = ['device', 'medium', 'customer_type', 'campaign'].map((k) => by[k]).find((d) => d && d.groups.length);
    if (!base) return null;
    const sum = (side, k) => base.groups.reduce((a, g) => a + (g[side] && isNum(g[side][k]) ? g[side][k] : 0), 0);
    const cT = sum('current', 'trafficVolume'), cO = sum('current', 'orders'), cV = sum('current', 'revenue'), bT = sum('baseline', 'trafficVolume'), bO = sum('baseline', 'orders');
    if (!(cT > 0) || !(bT > 0)) return null;
    const mix = [['medium', MEDIUM_NAME, 'Canal de adquisición'], ['device', null, 'Dispositivo'], ['customer_type', null, 'Nuevos y recurrentes']].map(([k, m, lbl]) => (by[k] ? mixRows(by[k], m) : null)).filter(Boolean);
    mix.forEach((m) => { m.label = ({ medium: 'Canal de adquisición', device: 'Dispositivo', customer_type: 'Nuevos y recurrentes' })[m.id] || m.label; });
    // semanas de 1-2 días (corte a mitad de semana) ensucian la tendencia: se descartan
    const wk = Array.isArray(weekly) ? weekly.filter((w) => w && isNum(w.traffic) && w.traffic > 0 && w.days >= 3).map((w) => ({ from: w.from, to: w.to, days: w.days, perDay: w.traffic / w.days, cr: isNum(w.orders) ? w.orders / w.traffic : null })) : [];
    const atypical = (cT / bT - 1) <= -0.5 || (cT / bT - 1) >= 1 || mix.some((m) => m.rows.some((r) => r.share >= 0.05 && isNum(r.crChg) && Math.abs(r.crChg) >= 0.9));   // caída/alza extrema o canal que se va a cero: casi siempre es cobertura incompleta del archivo
    return { atypical, totals: { traffic: cT, orders: cO, cr: cO / cT, aov: cO > 0 ? cV / cO : null, trafficChg: cT / bT - 1, ordersChg: bO > 0 ? cO / bO - 1 : null, crDiffPp: bO > 0 ? cO / cT - bO / bT : null, crChg: bO > 0 ? (cO / cT) / (bO / bT) - 1 : null }, mix, weekly: wk.length >= 2 ? wk : [] };
  }
  const wilson = (o, n) => { const z = 1.96, pp = o / n, d = 1 + z * z / n, c = pp + z * z / (2 * n), m = z * Math.sqrt(pp * (1 - pp) / n + z * z / (4 * n * n)); return { lo: (c - m) / d, hi: (c + m) / d }; };   // misma regla que la pantalla de segmentos
  const SEG_MIN_SESSIONS = 500, SEG_MIN_SHARE = 0.01;
  function pageCampaigns(s) {
    const hasSeg = (x) => x && x.level2 && x.level2.some((l) => l.source !== 'core' && l.groups && l.groups.length);
    const d = hasSeg(s.diag) ? s.diag : (hasSeg(s.trafficDiag) ? s.trafficDiag : null);
    const dim = d && d.level2.find((x) => x.dimension === 'campaign' && x.groups && x.groups.length);
    if (!dim) return omit('campaigns', 'Campañas', 'No hay campañas con tráfico en el período (archivo de Segmentos).');
    const g = dim.groups.filter((x) => x.current && isNum(x.current.trafficVolume) && x.current.trafficVolume > 0);
    const T = g.reduce((a, x) => a + x.current.trafficVolume, 0), O = g.reduce((a, x) => a + (isNum(x.current.orders) ? x.current.orders : 0), 0), V = g.reduce((a, x) => a + (isNum(x.current.revenue) ? x.current.revenue : 0), 0);
    if (!(T > 0) || !(O > 0)) return omit('campaigns', 'Campañas', 'Las campañas del período no traen tráfico y pedidos observados.');
    const crT = O / T, aovT = V / O, thr = Math.max(SEG_MIN_SESSIONS, Math.ceil(SEG_MIN_SHARE * T)), relN = g.filter((x) => x.current.trafficVolume >= thr).length, avgSh = relN ? 1 / relN : 1;
    const all = g.map((x) => { const c = x.current, sh = c.trafficVolume / T, w = wilson(c.orders, c.trafficVolume), conclusive = crT < w.lo || crT > w.hi, relevant = c.trafficVolume >= thr;
      const q = !relevant ? 'low' : (sh >= avgSh ? (c.conversionRate >= crT ? 'star' : 'conversion') : (c.conversionRate >= crT ? 'scale' : 'review'));
      return { name: x.label, quadrant: q, traffic: c.trafficVolume, share: sh, trafficChg: x.metrics && x.metrics.trafficVolume ? x.metrics.trafficVolume.deltaPct : null, orders: c.orders, cr: c.conversionRate, crChg: x.metrics && x.metrics.conversionRate ? x.metrics.conversionRate.deltaPct : null, aov: c.aov, revenue: c.revenue, revenuePerSession: isNum(c.revenue) ? c.revenue / c.trafficVolume : null, conclusive, opportunity: conclusive && relevant && c.conversionRate < crT ? c.trafficVolume * (crT - c.conversionRate) * aovT : null }; })
      .sort((a, b) => b.traffic - a.traffic);
    const rows = all.slice(0, 5), counts = ['star', 'scale', 'conversion', 'review', 'low'].map((k) => ({ quadrant: k, n: all.filter((r) => r.quadrant === k).length }));
    const opp = all.filter((r) => r.opportunity).sort((a, b) => b.opportunity - a.opportunity);
    return page('campaigns', 'Campañas', {
      ctx: `${d.period && d.period.label ? d.period.label : 'Período del diagnóstico'} · ${d.comparison && d.comparison.label ? d.comparison.label : 'vs. referencia'}`,
      question: '¿Qué campañas concentran el tráfico, cuáles convierten mejor y dónde hay venta por recuperar?',
      headline: opp.length ? `${opp[0].name} concentra la mayor oportunidad de conversión.` : `Las diferencias de conversión entre campañas no son concluyentes (${all.filter((r) => !r.conclusive).length} de ${all.length}).`,
      tables: [{ id: 'campaigns', title: 'Campañas con más tráfico', columns: [], rows }],
      campaigns: { rows, all: all.length, counts, threshold: thr, crTotal: crT, opportunity: opp.slice(0, 3).map((r) => ({ name: r.name, value: r.opportunity })), shown: rows.length },
      notes: ['Cuadrantes: estrella (mucho tráfico y conversión sobre el total), convertir mejor (mucho tráfico y conversión bajo el total), escalar (poco tráfico y conversión alta), revisar (poco tráfico y conversión baja).', 'La oportunidad solo se calcula cuando la diferencia de conversión es estadísticamente clara. Descriptivo, no causal.'],
      sources: ['Diagnóstico · segmentos de tráfico'], tags: [TAG.obs, TAG.calc]
    });
  }

  /* ---------------- 10 · Recuperación y plan de acción ---------------- */
  function pageRecovery(s) {
    const mk = selMonth(s), mname = mk ? monthName(mk) : null;
    const rf = mk ? s.rfMonth : s.rf, R = rf ? (s.channel === 'total' ? rf.total : (rf.channels || {})[s.channel]) : null;
    const h = R && R.horizon;
    if (mk && (!h || h.type !== 'month' || h.key !== mk)) return omit('recovery', 'Recuperación y plan de acción', (isWeekKey(mk) ? `La recuperación se calcula contra el mes en curso o el año, no contra una semana; ${mname} se lee sin esa lámina.` : `La recuperación se calcula solo para el mes en curso; ${mname} no es el mes abierto a la fecha de corte.`));
    if (!h || !isNum(h.target)) return omit('recovery', 'Recuperación y plan de acción', 'No hay meta que cubra el horizonte: sin meta no hay brecha pendiente ni requerimiento diario.');
    const hs = R.horizonSummary || {};
    const pr = hs.pressure && hs.pressure.revenue ? hs.pressure.revenue : null;
    const days = h.futureDays;
    const reqDaily = isNum(h.requiredTotal) && days > 0 ? h.requiredTotal / days : null;
    const planDaily = pr && isNum(pr.plan) && days > 0 ? pr.plan / days : null;
    const actions = (s.recovery && s.recovery.actions ? s.recovery.actions : []).filter((a) => a && a.title);
    const scen = (s.recovery && s.recovery.scenarios ? s.recovery.scenarios : []).filter((x) => x && x.name);
    const met = h.remaining === 0 && isNum(h.surplus) && h.surplus >= 0;
    const S0 = series(s.run, s.channel) || {}, M0 = mk && (S0.months || []).find((m) => m.key === mk), A0 = mk ? (M0 || {}) : (S0.annual || {}), trd = A0.toDate && A0.toDate.revenue, fgp = A0.forecastGap && A0.forecastGap.revenue;
    const cutIso = s.run && s.run.cutoff, yEnd = mk ? ((M0 && M0.lastDate) || `${mk}-28`) : `${h.key || (s.run && s.run.year)}-12-31`, hz = cutIso ? rangeLabel(addDay(cutIso, 1), yEnd) : null;
    const dg = s.diag && s.diag.status === 'ok' && s.diag.gap ? s.diag : null;
    const gapsRows = [
      trd && isNum(trd.gap) ? { name: 'Brecha a la fecha (pacing)', what: 'Real − plan esperado', period: mk ? `${mname} al ${dateLabel(cutIso)}` : `1 ene – ${dateLabel(cutIso)}`, value: trd.gap, tag: TAG.calc } : null,
      dg && isNum(dg.gap.abs) ? { name: 'Brecha del diagnóstico', what: `Real − ${String((dg.comparison && dg.comparison.baseline) || 'referencia').toLowerCase()}`, period: `${dg.period && dg.period.label ? dg.period.label : 'período del diagnóstico'}`, value: dg.gap.abs, tag: TAG.calc } : null,
      fgp && isNum(fgp.gap) ? { name: 'Brecha proyectada al cierre', what: mk ? 'Cierre estimado − plan del mes' : 'Cierre estimado − meta anual', period: `${mk ? mname : `Año ${s.run.year}`} · método ${s.run.method ? s.run.method.id : '—'}`, value: fgp.gap, tag: TAG.est } : null,
      { name: 'Brecha pendiente (recuperación)', what: mk ? 'Plan del mes − real acumulado' : 'Meta − real acumulado', period: `${mk ? `Plan de ${mname}` : 'Meta anual'}; faltan ${hz || 'el resto del año'}`, value: h.remaining, tag: TAG.calc }
    ].filter(Boolean);
    return page('recovery', 'Recuperación y plan de acción', {
      ctx: `Horizonte ${hz || 'resto del año'} · ${int(days)} días restantes`,
      gaps: gapsRows, gapsNote: 'Las brechas responden preguntas distintas (otro período y otra referencia): no se suman ni tienen por qué coincidir.',
      question: mk ? `¿Qué tendría que pasar de aquí al cierre de ${periodLow(mk)} para cumplir su plan?` : '¿Qué tendría que pasar de aquí al cierre para cumplir la meta?',
      headline: met ? `La meta del horizonte ya está cubierta (excedente ${money(h.surplus)}).` : `Faltan ${moneyC(h.remaining)} para ${mk ? `el plan de ${periodLow(mk)}` : 'la meta'}; en ${int(days)} días restantes se requieren ${moneyC(reqDaily)} por día${pr && isNum(pr.pressure) ? ` (${spct(pr.pressure)} vs. el plan diario restante)` : ''}.`,
      kpis: [
        kpi('target', mk ? `Plan de ${periodLow(mk)}` : h.type === 'year' ? `Meta anual ${h.key}` : 'Meta del horizonte', h.target, 'moneyC', TAG.calc), kpi('remaining', 'Brecha pendiente a la meta', h.remaining, 'moneyC', TAG.calc, { tone: h.remaining > 0 ? 'neg' : 'pos', sub: isNum(h.actualToDate) ? `meta − real ${moneyC(h.actualToDate)}` : null }),
        kpi('days', 'Días restantes', days, 'int', TAG.calc), kpi('daily', 'Requerimiento diario', reqDaily, 'moneyC', TAG.est, { sub: isNum(planDaily) ? `plan diario ${moneyC(planDaily)}` : null })
      ],
      scenarios: scen.map((x) => ({ name: x.name, type: x.type || null, impact: x.impact, tag: TAG.est })),
      actions: actions.map((a) => ({ title: a.title, owner: a.owner || null, status: a.status || null, start: a.startDate || null, end: a.endDate || null, impact: a.expectedImpact && isNum(a.expectedImpact.incrementalValue) ? a.expectedImpact.incrementalValue : null })),
      progress: isNum(h.actualToDate) && h.target > 0 ? { real: h.actualToDate, target: h.target, pct: h.actualToDate / h.target } : null,
      notes: ['El requerimiento diario es lo que tendría que ocurrir para cumplir la meta; no es una proyección.', scen.length ? 'Los escenarios guardados son simulaciones con supuestos, no resultados.' : null, actions.length ? null : 'No hay acciones registradas en el plan de acción; no se muestran responsables ni fechas.'].filter(Boolean),
      annex: false,
      sources: ['Reforecast', 'Recovery Center'], tags: [TAG.calc, TAG.est]
    });
  }

  /* ---------------- 11 · Estacionalidad y proyección ---------------- */
  function pageSeasonality(s) {
    const prof = s.profiles || {}, proj = s.projection;
    const lines = CHANNELS.map((c) => ({ c, m: prof[c] && prof[c].monthly })).filter((x) => x.m && x.m.available && Array.isArray(x.m.index) && x.m.index.length === 12 && x.m.index.every(isNum));
    const hasProj = proj && proj.hasData;
    if (!lines.length && !hasProj) return omit('seasonality', 'Estacionalidad y proyección', 'No hay historia suficiente: se necesita al menos un año completo para la estacionalidad y venta real/histórica para proyectar.');
    const tbl = hasProj ? (proj.rows || []).map((r) => ({ channel: r.label, base: r.base, meta: r.meta, proj: r.proj, gap: r.gap })) : [];
    return page('seasonality', 'Estacionalidad y proyección', {
      question: '¿Qué parte de lo observado es temporada y qué meta se propone para el año siguiente?',
      ctx: hasProj ? `Base ${proj.baseYear} → ${proj.targetYear}` : 'Historia de años completos',
      headline: hasProj ? `Para ${proj.targetYear}, la meta propuesta (${moneyC(proj.meta.total)}, supuesto de ${spct(proj.growth)} sobre la base) es ${moneyC(Math.abs(proj.gap.total))} ${proj.gap.total > 0 ? 'mayor' : 'menor'} que la proyección por ritmo reciente (${moneyC(proj.projection.total)}); la meta es un supuesto de planeación, no un pronóstico.` : 'Factores de estacionalidad mensual observados en la historia.',
      kpis: hasProj ? [kpi('base', `Base ${proj.baseYear}`, proj.base.total, 'moneyC', TAG.obs), kpi('meta', `Meta propuesta ${proj.targetYear}`, proj.meta.total, 'moneyC', TAG.est, { sub: `supuesto de crecimiento ${pct(proj.growth)}` }), kpi('proj', 'Proyección por ritmo reciente', proj.projection.total, 'moneyC', TAG.est)] : [],
      charts: lines.length ? [{ type: 'lines', id: 'season', title: 'Factor mensual de estacionalidad (1 = promedio del año)', labels: MONTHS, series: lines.map((x) => ({ name: chLabel(x.c), values: x.m.index })), baseline: 1 }] : [],
      tables: hasProj ? [{ id: 'proj', title: `Meta vs. proyección ${proj.targetYear}`, columns: [{ key: 'channel', label: 'Canal', kind: 'text' }, { key: 'base', label: `Base ${proj.baseYear}`, kind: 'moneyC', num: true }, { key: 'meta', label: 'Meta propuesta', kind: 'moneyC', num: true }, { key: 'proj', label: 'Proyección', kind: 'moneyC', num: true }, { key: 'gap', label: 'Meta − proyección', kind: 'smoney', num: true }], rows: tbl }] : [],
      notes: [hasProj ? `Supuestos: la meta crece ${pct(proj.growth)} sobre la base y se reparte por canal según su peso; la proyección extiende el ritmo de los últimos 2 meses cerrados contra ${proj.baseYear - 1}. Son supuestos editables, no una recomendación.` : null, lines.length ? 'La estacionalidad es el patrón histórico observado de años completos; no garantiza el comportamiento futuro.' : 'No hay años completos para calcular estacionalidad.', ...(hasProj ? (proj.warnings || []).slice(0, 2) : [])].filter(Boolean),
      sources: ['Estacionalidad', 'Proyección del año siguiente'], tags: [TAG.obs, TAG.est]
    });
  }

  /* ---------------- foco de la caída: qué categoría pesa más, desde cuándo, dónde ---------------- */
  const periodLabel = (k) => { const m = /^(\d{4})-(\d{2})$/.exec(k || ''); return m ? `${MONTHS[+m[2] - 1].toLowerCase()} ${m[1]}` : (k || null); };
  const FOCUS_VS_EQUAL = 1.5;   // y al menos 1.5 veces el reparto igual entre las que caen (con 2 que caen, hace falta ≥75 %)
  const MIN_FOCUS_SHARE = 0.25;   // una entidad es «el foco» solo si concentra al menos una cuarta parte de lo que cae
  function focusInsight(s) {
    const F = s.focusData, C = F && F.category;
    if (!C || !C.priorities || C.priorities.status !== 'available') return null;
    const P = C.priorities, dragAll = (P.drag || []).filter((x) => isNum(x.impact) && x.impact < 0);
    const top = dragAll[0], totalDrag = P.totals && isNum(P.totals.drag) ? P.totals.drag : dragAll.reduce((a, x) => a + x.impact, 0);
    if (!top || !(totalDrag < 0)) return null;
    const share = top.impact / totalDrag;
    if (!(share >= MIN_FOCUS_SHARE) || share < FOCUS_VS_EQUAL / dragAll.length || dragAll.length < 2 && share >= 0.999 && (C.rows || []).length < 2) return null;
    const row = (C.rows || []).find((r) => r.entity === top.entity) || {};
    const lvl = { category: 'categoría', subcategory: 'subcategoría' }[(C.context || {}).level] || 'categoría';
    const declining = row.direction === 'decline' && isNum(row.consecutivePeriods) && row.consecutivePeriods >= 2;
    const since = declining ? (row.patternStartPeriod || row.turningPoint || null) : null;
    // mismo mes del año anterior (solo si la serie lo cubre): evita confundir temporada con deterioro
    let yoy = null;
    const ser = Array.isArray(row.series) ? row.series.filter((x) => x && isNum(x.value)) : [];
    if (ser.length) { const last = ser[ser.length - 1], m = /^(\d{4})-(\d{2})$/.exec(last.period || ''); if (m) { const prev = ser.find((x) => x.period === `${+m[1] - 1}-${m[2]}`); if (prev && prev.value > 0) yoy = { pct: last.value / prev.value - 1, period: periodLabel(prev.period) }; } }
    // índice 100 = primer período: la entidad contra el resto del negocio
    let spark = null;
    const periods = ser.map((x) => x.period), others = (C.rows || []).filter((r) => r.entity !== top.entity && Array.isArray(r.series));
    if (ser.length >= 4 && others.length) {
      const rest = periods.map((p) => others.reduce((a, r) => { const v = r.series.find((x) => x.period === p); return a + (v && isNum(v.value) ? v.value : 0); }, 0));
      if (rest[0] > 0 && ser[0].value > 0) spark = { periods, entity: ser.map((x) => x.value / ser[0].value * 100), rest: rest.map((v) => v / rest[0] * 100), since };
    }
    const restChange = spark ? spark.rest[spark.rest.length - 1] / 100 - 1 : null;
    // dentro de la entidad: subcategoría que más arrastra
    const S = F.subcategory && F.subcategory.priorities && F.subcategory.priorities.status === 'available' ? F.subcategory.priorities : null;
    const subDrag = S ? (S.drag || []).filter((x) => isNum(x.impact) && x.impact < 0) : [];
    const subTotal = S && S.totals && isNum(S.totals.drag) ? S.totals.drag : null;
    const sub = subDrag[0] ? { entity: subDrag[0].entity, impact: subDrag[0].impact, share: isNum(subTotal) && subTotal < 0 ? subDrag[0].impact / subTotal : null } : null;
    // dónde: farmacias (sucursales), estados y entrega, lo que más cae
    const ev = (top.evidenceBreakdown || []);
    const named = (r) => r && r.name && !/^\s*(\(?sin (dato|definir|asignar)\)?|n\/a|null|undefined|-+)\s*$/i.test(String(r.name));
    const pick = (dim) => { const d = ev.find((x) => x.dimension === dim); return d ? d.rows.filter((r) => named(r) && isNum(r.delta) && r.delta < 0).slice(0, 2).map((r) => (dim === 'branch' && s.branchNames && s.branchNames[r.name] ? { ...r, name: s.branchNames[r.name] } : r)) : []; };
    const branches = pick('branch'), deliveries = (F.delivery || []).filter((r) => named(r) && r.delta < 0).slice(0, 1);
    const comp = (P.compensate || []).filter((x) => isNum(x.impact) && x.impact > 0)[0] || null;
    return { level: lvl, entity: top.entity, loss: top.impact, share, totalDrag, periods: row.consecutivePeriods || null, since, sinceLabel: periodLabel(since), pattern: row.pattern || null, yoy, spark, restChange, sub, branches, deliveries, compensate: comp ? { entity: comp.entity, impact: comp.impact } : null, comparison: (P.comparison || {}).currentPeriod || null };
  }

  /* ---------------- lectura ejecutiva común (resumen y cierre): todo sale de las páginas ya calculadas ---------------- */
  function readout(s, by) {
    const out = {};
    const pc = by.pacing, kp = (p, id) => (p && p.kpis.find((k) => k.id === id)) || null;
    const rows = pc && pc.tables[0] ? pc.tables[0].rows.filter((r) => !r._total && isNum(r.gap)) : [];
    const real = kp(pc, 'real'), plan = kp(pc, 'plan'), comp = kp(pc, 'compliance'), fc = kp(pc, 'forecast');
    const hasPlan = Boolean(pc && comp && isNum(comp.value) && plan && isNum(plan.value));
    const gap = hasPlan ? real.value - plan.value : null;
    out.state = !hasPlan ? null : Math.abs(comp.value - 1) < 0.005 ? 'en línea' : comp.value < 1 ? 'por debajo' : 'por encima';
    out.pc = pc ? { real: real && real.value, plan: plan && plan.value, compliance: comp && comp.value, gap, forecast: fc && fc.value, forecastSub: fc && fc.sub } : null;
    out.best = rows.filter((r) => r.gap > 0).sort((a, b) => b.gap - a.gap)[0] || null;
    out.worst = rows.filter((r) => r.gap < 0).sort((a, b) => a.gap - b.gap)[0] || null;
    const drag = by.trends && by.trends.tables[0] && by.trends.tables[0].rows[0];
    out.drag = drag && isNum(drag.impact) && drag.impact < 0 ? drag : null;
    out.material = Boolean(by.reliability && by.reliability.warning);
    const rc = by.recovery;
    out.rec = rc ? { remaining: (kp(rc, 'remaining') || {}).value, daily: (kp(rc, 'daily') || {}).value, days: (kp(rc, 'days') || {}).value, actions: rc.actions || [], target: (kp(rc, 'target') || {}).value } : null;
    out.sel = pc && pc.selection ? { real: (kp(pc, 'real') || {}).value, prev: (kp(pc, 'prev') || {}).value, pct: (kp(pc, 'change') || {}).value, period: pc.periodLabel, base: pc.baseLabel, baseRef: pc.baseRef, filter: pc.filterLabel } : null;
    out.cutoff = s.run && s.run.cutoff ? dateLabel(s.run.cutoff) : null;
    out.movers = by.movers ? { minus: by.movers.minus, plus: by.movers.plus } : null;
    out.mk = selMonth(s); out.mname = out.mk ? monthName(out.mk) : null; out.mlow = out.mk ? periodLow(out.mk) : null; out.year = out.mk ? yearLine(s) : null;
    out.scopeWord = out.mk ? out.mlow : 'año';
    out.focus = focusInsight(s);
    out.driverMain = (() => { const dv = by.drivers; const rows = dv && dv.tables[0] ? dv.tables[0].rows.filter((r) => isNum(r.contribution)) : []; const m = rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0]; return m ? { name: m.driver, value: m.contribution } : null; })();
    return out;
  }
  const yearPhrase = (r) => {
    const y = r.year; if (!y) return null;
    const bits = [isNum(y.compliance) ? `cumplimiento acumulado de ${pct(y.compliance)}` : null, isNum(y.forecast) && isNum(y.goal) ? `cierre estimado de ${moneyC(y.forecast)} frente a una meta anual de ${moneyC(y.goal)}` : (isNum(y.forecast) ? `cierre estimado de ${moneyC(y.forecast)}` : null)].filter(Boolean);
    return bits.length ? `En el año ${y.year}: ${bits.join('; ')}.` : null;
  };
  const phrasePlan = (r) => (r.state === 'en línea' ? 'va en línea con el plan' : `va ${pct(Math.abs(1 - r.pc.compliance))} ${r.state} del plan`);

  const focusWhere = (f) => [f.sub ? `la subcategoría ${f.sub.entity} (${smoney(f.sub.impact)})` : null, f.branches && f.branches.length ? `${f.branches.length === 1 ? 'la farmacia' : 'las farmacias'} ${f.branches.map((b) => `${b.name} (${smoney(b.delta)})`).join(' y ')}` : null, f.deliveries && f.deliveries.length ? `entregas ${f.deliveries[0].name} (${smoney(f.deliveries[0].delta)})` : null].filter(Boolean);
  const focusSince = (f) => (f.sinceLabel ? `cae desde ${f.sinceLabel} (${f.periods} períodos seguidos)` : null);
  const restPhrase = (f) => (!isNum(f.restChange) ? null : Math.abs(f.restChange) < 0.03 ? 'el resto del negocio se mantiene' : f.restChange > 0 ? `el resto del negocio crece ${pct(f.restChange, 0)}` : `el resto del negocio baja ${pct(Math.abs(f.restChange), 0)}`);
  const yoyPhrase = (f) => (f.yoy ? `Frente a ${f.yoy.period}, ${f.yoy.pct < 0 ? 'cae' : 'crece'} ${pct(Math.abs(f.yoy.pct), 0)}.` : null);
  const actionsOn = (R, f) => { const acts = R.rec ? R.rec.actions.filter((a) => a && a.title) : []; if (!acts.length) return 'No hay acciones registradas en el plan.'; const on = acts.filter((a) => String(a.title).toLowerCase().includes(String(f.entity).toLowerCase())); return on.length ? `Hay ${on.length} acción${on.length === 1 ? '' : 'es'} registrada${on.length === 1 ? '' : 's'} sobre ${f.entity}.` : (acts.length === 1 ? `La acción registrada en el plan no es sobre ${f.entity}.` : `Ninguna de las ${acts.length} acciones registradas en el plan es sobre ${f.entity}.`); };

  /* ---------------- 2 · Resumen ejecutivo (determinista, desde las páginas ya armadas) ---------------- */
  function pageSummary(s, pages) {
    const by = Object.fromEntries(pages.filter((p) => p.status === 'included').map((p) => [p.id, p]));
    const R = readout(s, by), items = [];
    // Hasta 3 hallazgos, por criterio fijo: 1) dónde estamos contra el plan (incluye el cierre estimado si existe), 2) qué lo explica
    // aritméticamente, 3) lo que falta para la meta; si no hay recuperación, la señal de evolución y luego categorías.
    const pc = by.pacing;
    if (pc && R.sel) {
      const x = R.sel, d = isNum(x.real) && isNum(x.prev) ? x.real - x.prev : null;
      items.push({ tag: TAG.obs, certainty: 'Hecho observado', text: pc.headline, source: 'Pág. Venta de la selección', limit: 'Se compara contra el periodo de referencia, no contra el plan.', page: 'pacing', title: `${x.filter}: ${isNum(x.pct) ? (x.pct < 0 ? 'cae' : 'crece') : 'venta'} frente ${x.baseRef.startsWith('el ') ? `al ${x.baseRef.slice(3)}` : `a ${x.baseRef}`}`, figure: isNum(x.pct) ? spct(x.pct) : moneyC(x.real), figureLabel: `${x.period} vs. ${x.base}`, why: `${moneyC(x.real)} frente a ${moneyC(x.prev)}${d !== null ? ` (${smoney(d)})` : ''}.`, note: 'No hay plan por producto ni sucursal.' });
    } else if (pc) {
      const comp = pc.kpis.find((k) => k.id === 'compliance');
      const f = R.pc && isNum(R.pc.forecast) ? `Cierre estimado de ${R.scopeWord === 'año' ? 'l año' : R.mlow}: ${moneyC(R.pc.forecast)}${R.pc.forecastSub ? ` (${R.pc.forecastSub})` : ''}.` : null;
      items.push({ tag: TAG.obs, certainty: 'Hecho observado', text: pc.headline, source: 'Pág. Pacing y forecast', limit: comp && comp.value === null ? 'Sin plan comparable.' : (by.reliability && by.reliability.warning ? 'El cierre estimado depende del método; los alternativos difieren de forma material.' : 'El cierre estimado depende del método elegido.'), page: 'pacing',
        title: R.state ? `${R.mk ? R.mname : 'El negocio'} ${phrasePlan(R)}` : (R.mk ? `Venta real de ${R.mlow} a la fecha` : 'Venta real acumulada al corte'), figure: R.state ? pct(R.pc.compliance) : moneyC(R.pc && R.pc.real), figureLabel: R.state ? (R.mk ? `de cumplimiento de ${R.mlow}` : 'de cumplimiento al corte') : 'venta real',
        why: [R.state ? `${moneyC(R.pc.real)} de venta real frente a ${moneyC(R.pc.plan)} esperados (${smoney(R.pc.gap)}).` : null, R.mk ? null : f].filter(Boolean).join(' '), note: R.material ? 'El cierre depende del método de proyección elegido; los alternativos difieren de forma material.' : null });
    }
    const dv = by.drivers, FO = R.focus;
    if (FO) {
      const where = focusWhere(FO);
      items.push({ tag: TAG.calc, certainty: 'Cálculo', text: `${FO.entity} concentra ${pct(FO.share, 0)} de la caída (${smoney(FO.loss)}).`, source: 'Pág. Categorías y evolución', limit: 'Lectura descriptiva, no causal.', page: 'focus', title: `${FO.entity} concentra ${pct(FO.share, 0)} de lo que se pierde`, figure: smoney(FO.loss), figureLabel: `${FO.level} ${FO.entity}${FO.comparison ? ` · ${FO.comparison}` : ''}`,
        why: [focusSince(FO) ? `${FO.entity} ${focusSince(FO)}.` : null, where.length ? `Dentro de ella pesan ${where.slice(0, 2).join(' y ')}.` : null].filter(Boolean).join(' ') || `Es la ${FO.level} que más arrastra en el período.`, note: 'Es una lectura descriptiva; no demuestra la causa.' });
    } else if (dv && !R.sel) { const g = dv.kpis.find((k) => k.id === 'gap'); items.push({ tag: TAG.calc, certainty: 'Cálculo aritmético', text: dv.headline, source: 'Pág. Diagnóstico de motores', limit: 'Descomposición matemática, no causal.', page: 'drivers', title: 'La brecha se reparte entre tráfico, conversión y ticket', figure: g ? smoney(g.value) : '', figureLabel: g && g.sub ? `brecha del período (${g.sub})` : 'brecha del período', why: dv.headline, note: 'Es una descomposición aritmética; no demuestra la causa.' }); }
    const rv = by.recovery;
    if (rv && !R.sel) items.push({ tag: TAG.est, certainty: 'Requerimiento aritmético', text: rv.headline, source: 'Pág. Recuperación', limit: 'No es un pronóstico ni una meta de ejecución.', page: 'recovery', title: R.mk ? `Lo que falta para cumplir ${R.mlow}` : 'Lo que falta para llegar a la meta', figure: R.rec && isNum(R.rec.remaining) ? moneyC(R.rec.remaining) : '', figureLabel: R.mk ? `brecha pendiente al plan de ${R.mlow}` : 'brecha pendiente a la meta', why: rv.headline, note: 'El ritmo diario es lo que se requiere, no una proyección.' });
    if (by.trends) items.push({ tag: TAG.calc, certainty: 'Señal calculada', text: by.trends.headline, source: 'Pág. Evolución y patrones', limit: by.trends.scope && by.trends.scope.partial ? 'Incluye un período parcial.' : 'Patrones descriptivos.', page: 'trends', title: 'Qué cae y qué compensa', figure: '', figureLabel: '', why: by.trends.headline, note: null });
    if (by.categories) items.push({ tag: TAG.calc, certainty: 'Cálculo', text: by.categories.headline, source: 'Pág. Categorías y productos', limit: null, page: 'categories', title: 'Dónde se concentra la venta', figure: '', figureLabel: '', why: by.categories.headline, note: null });
    const out = items.filter((i) => clean(i.text)).slice(0, 3).map((i, k) => ({ ...i, n: k + 1 }));
    if (!out.length) return omit('summary', 'Resumen ejecutivo', 'Todavía no hay cálculos válidos que resumir.');
    // Introducción narrativa: estado contra plan → qué sobresale → área de atención → implicación para el cierre. Cada frase solo si hay dato.
    const sent = [];
    if (R.sel) sent.push(`En ${R.sel.period}, ${R.sel.filter} vende ${moneyC(R.sel.real)}${isNum(R.sel.pct) ? `, ${Math.abs(R.sel.pct) < 0.005 ? 'sin cambio' : R.sel.pct < 0 ? `${pct(Math.abs(R.sel.pct))} menos` : `${pct(R.sel.pct)} más`} que ${R.sel.baseRef}` : ''}.`);
    else if (R.state) sent.push(`Al corte del ${R.cutoff}, ${R.mk ? R.mname : 'el negocio'} ${phrasePlan(R)}: ${moneyC(R.pc.real)} de venta real frente a ${moneyC(R.pc.plan)} esperados.`);
    else if (R.pc && isNum(R.pc.real) && !R.sel) sent.push(`Al corte del ${R.cutoff}, la venta real acumulada es ${moneyC(R.pc.real)}; no hay plan comparable para medir el avance.`);
    if (R.best) sent.push(`${R.best.channel} es el canal que más sobresale (${smoney(R.best.gap)} frente al plan).`);
    if (R.focus) sent.push(`Lo que más pesa en la caída es ${R.focus.entity}: concentra el ${pct(R.focus.share, 0)} de lo que se pierde${R.focus.sinceLabel ? ` y ${focusSince(R.focus).replace('cae desde', 'cae desde')}` : ''}.`);
    else if (R.drag) sent.push(`La principal área de atención es ${R.drag.entity}, que resta ${money(Math.abs(R.drag.impact))} en el período comparado.`);
    else if (R.worst) sent.push(`La principal área de atención es ${R.worst.channel} (${smoney(R.worst.gap)} frente al plan).`);
    if (R.pc && isNum(R.pc.forecast)) sent.push(`Al ritmo actual, ${R.mk ? R.mlow : 'el año'} cerraría en ${moneyC(R.pc.forecast)}${R.pc.forecastSub && !R.mk ? ` (${R.pc.forecastSub})` : ''}${R.material ? ', cifra que depende del método de proyección' : ''}.`);
    else if (R.rec && isNum(R.rec.remaining)) sent.push(`Para cumplir ${R.mk ? `el plan de ${R.mlow}` : 'la meta'} faltan ${moneyC(R.rec.remaining)}.`);
    const yp = yearPhrase(R);
    const review = R.focus || s.reportFilter ? null : R.drag ? `Revisar primero ${R.drag.entity}: es la entidad que más arrastra (${smoney(R.drag.impact)}) en el período comparado.` : (R.rec && rv && rv.headline.includes('vs. el plan diario') ? 'Revisar si el ritmo diario requerido para cumplir la meta es alcanzable.' : null);
    return page('summary', 'Resumen ejecutivo', { question: '¿Qué debo saber si solo leo una página?', headline: 'Lo más importante, en una mirada', narrative: sent.length ? sent.join(' ') : null, yearStrip: yp || null, movers: R.movers && (R.movers.minus.length || R.movers.plus.length) ? { minus: [...R.movers.minus].sort((a, b) => a.rank - b.rank).slice(0, 2), plus: [...R.movers.plus].sort((a, b) => a.rank - b.rank).slice(0, 2) } : null, filterStrip: s.reportFilter ? `Filtro activo: ${s.reportFilter}. ${R.sel ? 'Venta, categorías, evolución y clientes muestran solo esa selección (la venta contra el periodo de referencia, no contra el plan); el diagnóstico y la recuperación son del total del negocio.' : 'Categorías, evolución y clientes muestran solo esa selección; el pacing y el forecast son del total del negocio.'}` : null, focus: R.focus ? { entity: R.focus.entity, spark: R.focus.spark, text: [R.focus.sinceLabel ? `${R.focus.entity} ${focusSince(R.focus)}${restPhrase(R.focus) ? `, mientras ${restPhrase(R.focus)}` : ''}.` : `${R.focus.entity} es la ${R.focus.level} que más arrastra${restPhrase(R.focus) ? `, mientras ${restPhrase(R.focus)}` : ''}.`, `Aporta ${smoney(R.focus.loss)} de los ${smoney(R.focus.totalDrag)} que caen las ${R.focus.level === 'categoría' ? 'categorías' : 'entidades'}.`, yoyPhrase(R.focus)].filter(Boolean).join(' ') } : null, items: out, review: review ? { text: review, basis: 'Regla determinista sobre los cálculos de las páginas siguientes; no es una recomendación causal.' } : null, sources: ['Cálculos de las páginas siguientes'], tags: [TAG.obs, TAG.calc, TAG.est] });
  }

  /* ---------------- 13 · Cierre ejecutivo ---------------- */
  function pageClosing(s, pages) {
    const by = Object.fromEntries(pages.filter((p) => p.status === 'included').map((p) => [p.id, p]));
    const R = readout(s, by); if (!R.pc) return omit('closing', 'Cierre ejecutivo', 'Sin resultados de pacing no hay base para un cierre.');
    const where = R.sel ? { title: 'Dónde estamos', big: isNum(R.sel.pct) ? spct(R.sel.pct) : moneyC(R.sel.real), unit: `${R.sel.period} vs. ${R.sel.base}`, text: `${R.sel.filter}: ${moneyC(R.sel.real)} frente a ${moneyC(R.sel.prev)}${isNum(R.sel.real) && isNum(R.sel.prev) ? ` (${smoney(R.sel.real - R.sel.prev)})` : ''}. No hay plan por producto ni sucursal: se compara contra el periodo de referencia.` }
      : R.state ? { title: 'Dónde estamos', big: pct(R.pc.compliance), unit: R.mk ? `de cumplimiento de ${R.mlow}` : 'de cumplimiento al corte', text: `${R.mk ? `${R.mname}: ` : ''}${moneyC(R.pc.real)} de venta real contra ${moneyC(R.pc.plan)} del plan comparable (${smoney(R.pc.gap)}). ${isNum(R.pc.forecast) ? `Cierre estimado de${R.mk ? ` ${R.mlow}` : 'l año'}: ${moneyC(R.pc.forecast)}${R.pc.forecastSub ? ` (${R.pc.forecastSub})` : ''}.` : ''} ${yearPhrase(R) || ''}`.replace(/\s+/g, ' ').trim() }
      : { title: 'Dónde estamos', big: moneyC(R.pc.real), unit: 'venta real acumulada', text: 'No hay plan comparable: no es posible medir el cumplimiento del período.' };
    const stand = R.best ? { title: 'Qué sobresalió', big: smoney(R.best.gap), unit: `${R.best.channel} frente ${R.sel ? 'a la referencia' : 'al plan'}`, text: `${R.best.channel} es el canal con mayor avance sobre ${R.sel ? 'el periodo de referencia' : 'el plan comparable'}.` }
      : (by.categories && by.categories.headline ? { title: 'Qué sobresalió', big: '', unit: '', text: by.categories.headline } : { title: 'Qué sobresalió', big: '', unit: '', text: 'Ningún canal supera su plan comparable al corte.' });
    const acts = R.rec ? R.rec.actions.filter((a) => a && a.title) : [];
    const F = R.focus, fw = F ? focusWhere(F) : [];
    const move = F ? { title: 'Qué debemos mover', big: smoney(F.loss), unit: `${F.entity}${F.sinceLabel ? ` · cae desde ${F.sinceLabel}` : ' · mayor arrastre'}`, text: `${F.entity} concentra ${pct(F.share, 0)} de lo que se pierde${F.sinceLabel ? ` y lleva ${F.periods} períodos sin recuperarse` : ''}.${fw.length ? ` Revisar primero ${fw.join(', ')}.` : ''} ${actionsOn(R, F)}` }
      : R.drag ? { title: 'Qué debemos mover', big: smoney(R.drag.impact), unit: `${R.drag.entity}: mayor arrastre`, text: `${R.drag.entity} concentra la mayor caída del período comparado.${acts.length ? ` Hay ${acts.length} acción${acts.length === 1 ? '' : 'es'} registrada${acts.length === 1 ? '' : 's'} en el plan.` : ' No hay acciones registradas en el plan.'}` }
      : R.worst ? { title: 'Qué debemos mover', big: smoney(R.worst.gap), unit: `${R.worst.channel} frente ${R.sel ? 'a la referencia' : 'al plan'}`, text: `${R.worst.channel} es el canal más rezagado.${acts.length ? ` Hay ${acts.length} acción${acts.length === 1 ? '' : 'es'} registrada${acts.length === 1 ? '' : 's'} en el plan.` : ' No hay acciones registradas en el plan.'}` }
      : { title: 'Qué debemos mover', big: '', unit: '', text: 'Los datos disponibles no permiten sostener una prioridad comercial.' };
    const watch = [];
    if (R.material) watch.push('El cierre estimado cambia de forma material según el método de proyección.');
    if (R.rec && isNum(R.rec.daily)) watch.push(`Cumplir ${R.mk ? `el plan de ${R.mlow}` : 'la meta'} requiere ${moneyC(R.rec.daily)} por día en ${int(R.rec.days)} días restantes.`);
    if (s.quality && s.quality.status && s.quality.status !== 'ok') watch.push('Hay advertencias de calidad de datos (ver anexo técnico).');
    const vig = { title: 'Qué debemos vigilar', big: R.rec && isNum(R.rec.daily) ? moneyC(R.rec.daily) : '', unit: R.rec && isNum(R.rec.daily) ? (R.mk ? `requeridos por día para cerrar ${R.mlow}` : 'requeridos por día para la meta') : '', text: watch.length ? watch.join(' ') : 'Sin riesgos materiales identificados en los datos disponibles.' };
    if (R.movers) {
      const top = (arr) => [...arr].sort((a, b) => a.rank - b.rank).slice(0, 3).map((i) => ({ name: i.name, value: i.value, type: i.type }));
      if (R.movers.plus.length) { stand.list = top(R.movers.plus); stand.title = 'Qué suma'; stand.big = ''; stand.unit = ''; stand.text = R.best ? `${R.best.channel} es el canal con mayor avance${R.sel ? ' sobre la referencia' : ' sobre el plan'}.` : (by.categories && by.categories.headline ? stand.text : ''); }
      if (R.movers.minus.length) { move.list = top(R.movers.minus); move.title = 'Qué resta'; move.big = ''; move.unit = ''; move.text = F ? `${F.entity} concentra ${pct(F.share, 0)} de lo que se pierde${fw.length ? `; revisar primero ${fw.join(', ')}` : ''}. ${actionsOn(R, F)}` : (acts.length ? `Hay ${acts.length} acción${acts.length === 1 ? '' : 'es'} registrada${acts.length === 1 ? '' : 's'} en el plan.` : 'No hay acciones registradas en el plan.'); }
    }
    return page('closing', 'Cierre ejecutivo', { question: 'Qué nos llevamos de este periodo', headline: '', blocks: [where, stand, move, vig], sources: [], tags: [] });
  }


  /* ---------------- Qué resta y qué suma: todo lo que mueve la venta del período, de mayor a menor peso ---------------- */
  const MOVER_ORDER = ['Canal', 'Palanca', 'Categoría', 'Producto'];
  function moversOf(s, by) {
    const items = [], add = (type, name, value, evidence, page) => { if (isNum(value) && Math.abs(value) >= 1 && clean(name)) items.push({ type, name, value, evidence: evidence || null, page }); };
    const ref = by.pacing && by.pacing.selection ? 'vs. referencia' : 'vs. plan';
    const dv = by.drivers, chMain = new Map(((dv && dv.tables.find((t) => t.id === 'channels') || {}).rows || []).map((r) => [r.channel, r.main]));
    const pc = by.pacing;
    if (pc && pc.tables[0]) pc.tables[0].rows.filter((r) => !r._total && isNum(r.gap)).forEach((r) => add('Canal', r.channel, r.gap, `${isNum(r.gapPct) ? `${spct(r.gapPct)} ${ref}` : ref}${chMain.get(r.channel) && !pc.selection ? ` · mayor palanca: ${chMain.get(r.channel)}` : ''}`, 'pacing'));
    if (dv && !s.reportFilter) (dv.tables[0] ? dv.tables[0].rows : []).filter((r) => isNum(r.contribution)).forEach((r) => add('Palanca', r.driver, r.contribution, isNum(r.deltaPct) ? `${spct(r.deltaPct)} vs. referencia` : null, 'drivers'));
    const ca = by.categories;
    if (ca && ca.charts[0]) ca.charts[0].items.forEach((i) => add('Categoría', i.label, i.value, null, 'categories'));
    const tr = by.trends, lvl = tr && tr.scope && tr.scope.level ? String(tr.scope.level) : 'producto', typ = lvl.charAt(0).toUpperCase() + lvl.slice(1);
    if (tr) [...(tr.tables.find((t) => t.id === 'drag') || { rows: [] }).rows, ...(tr.tables.find((t) => t.id === 'comp') || { rows: [] }).rows].forEach((r) => {
      if (typ === 'Categoría' && items.some((x) => x.type === 'Categoría' && x.name === r.entity)) return;
      add(typ, r.entity, r.impact, [isNum(r.relative) ? spct(r.relative) : null, r.pattern].filter(Boolean).join(' · '), 'trends');
    });
    const types = [...new Set(items.map((i) => i.type))].sort((a, b) => (MOVER_ORDER.indexOf(a) + 1 || 99) - (MOVER_ORDER.indexOf(b) + 1 || 99));
    const maxBy = {}; items.forEach((i) => { maxBy[i.type] = Math.max(maxBy[i.type] || 0, Math.abs(i.value)); });
    items.forEach((i) => { i.weight = maxBy[i.type] ? Math.abs(i.value) / maxBy[i.type] : 0; });
    // por lado: se reparte entre tipos (uno por tipo, por vuelta) hasta 8, para que no domine un solo tipo
    const side = (neg, cap) => {
      const q = types.map((t) => items.filter((i) => i.type === t && (neg ? i.value < 0 : i.value > 0)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)));
      const out = []; let k = 0;
      while (out.length < cap && q.some((x) => x.length > k)) { q.forEach((x) => { if (x[k] && out.length < cap) { x[k].rank = out.length; out.push(x[k]); } }); k++; }
      return out.sort((a, b) => (types.indexOf(a.type) - types.indexOf(b.type)) || (Math.abs(b.value) - Math.abs(a.value)));
    };
    return { items, types, minus: side(true, 8), plus: side(false, 8) };
  }
  function pageMovers(s, pages) {
    const by = Object.fromEntries(pages.filter((p) => p.status === 'included').map((p) => [p.id, p]));
    const M = moversOf(s, by);
    if (!M.minus.length && !M.plus.length) return omit('movers', 'Qué resta y qué suma', 'No hay canales, palancas, categorías o entidades con un cambio medible en el período.');
    const pc = by.pacing, per = pc ? (pc.monthLabel || pc.periodLabel || null) : null, sel = pc && pc.selection;
    const tot = pc && pc.tables[0] ? pc.tables[0].rows.find((r) => r._total) : null;
    const minusSum = M.minus.filter((i) => i.type === 'Canal').reduce((a, i) => a + i.value, 0), plusSum = M.plus.filter((i) => i.type === 'Canal').reduce((a, i) => a + i.value, 0);
    const head = `${M.minus.length ? `Lo que más resta: ${M.minus.slice(0, 3).map((i) => `${i.name} (${smoney(i.value)})`).join(', ')}.` : 'Nada resta de forma medible.'} ${M.plus.length ? `Lo que más suma: ${M.plus.slice(0, 3).map((i) => `${i.name} (${smoney(i.value)})`).join(', ')}.` : 'Nada suma de forma medible.'}`;
    return page('movers', 'Qué resta y qué suma', {
      ctx: [per, s.reportFilter ? `Filtro: ${s.reportFilter}` : null].filter(Boolean).join(' · ') || 'Período elegido',
      question: '¿Qué está moviendo la venta hacia abajo y hacia arriba, y cuánto pesa cada cosa?',
      headline: head, minus: M.minus, plus: M.plus, types: M.types,
      channelSums: { minus: M.minus.some((i) => i.type === 'Canal') ? minusSum : null, plus: M.plus.some((i) => i.type === 'Canal') ? plusSum : null },
      totals: tot && isNum(tot.gap) ? { gap: tot.gap, ref: sel ? 'la referencia' : 'el plan' } : null,
      notes: ['Cada fila es un ángulo distinto del mismo resultado: no se suman entre sí y la barra compara dentro de cada tipo. Son contribuciones descriptivas; no demuestran la causa.', s.reportFilter ? 'Con filtro, las palancas del diagnóstico se omiten porque son del total del negocio.' : null].filter(Boolean),
      sources: ['Pacing, diagnóstico, categorías y evolución'], tags: [TAG.calc]
    });
  }

  /* ---------------- 12 · Anexo técnico y calidad ---------------- */
  function pageAnnex(s, pages, adv) {
    const run = s.run, q = s.quality;
    const omitted = pages.filter((p) => p.status === 'omitted').map((p) => ({ title: p.title, reason: p.reason }));
    const quality = q ? Object.values(q.byType || {}).filter((t) => t && t.files > 0).map((t) => ({ type: t.label, files: t.files, read: t.rowsRead, imported: t.imported, rejected: t.rejected, warning: t.warning, error: t.error, duplicates: t.duplicateKeys })) : [];
    const ST = run && run.settings ? run.settings : {};
    const A = (series(run, s.channel) || {}).annual || {};
    const missing = [];
    if (A && isNum(A.missingActualDays)) missing.push({ item: 'Días del año sin venta real cargada (aún por ocurrir o sin dato)', value: A.missingActualDays });
    if (q && q.totals && isNum(q.totals.missingChannels)) missing.push({ item: 'Combinaciones fecha-canal sin dato', value: q.totals.missingChannels });
    if (q && q.totals && isNum(q.totals.rejected)) missing.push({ item: 'Filas rechazadas al importar', value: q.totals.rejected });
    const methods = adv && adv.methods ? Object.entries(adv.methods).map(([id, m]) => ({ method: id, light: m.light, status: LIGHT_TEXT[m.light] || NA, forecast: m.forecast, gap: m.forecast !== null && isNum(m.forecast) && A.plan && isNum(A.plan.revenue) ? m.forecast - A.plan.revenue : null, days: m.comparableDays, fallback: m.fallbackDays, reasons: (m.reasons || []).join(' · ') })) : [];
    const bt = s.backtest && s.backtest.byChannel ? s.backtest.byChannel[s.channel === 'total' ? null : s.channel] : null;
    const btRows = bt ? Object.entries(bt).map(([m, byH]) => { const r = byH && (byH[7] || byH['7']); return r ? { method: m, status: r.status, wape: r.wape, plan: r.planWape } : null; }).filter(Boolean) : [];
    return page('annex', 'Anexo técnico y calidad', {
      question: '¿Qué tan confiable es todo lo anterior y qué no incluye?',
      headline: 'Calidad de datos, supuestos, definiciones y páginas omitidas',
      quality, missing, methods, backtest: btRows, backtestNote: bt ? 'Error histórico (WAPE) a 7 días, calculado por canal; las muestras y períodos pueden no ser comparables entre métodos.' : 'El error histórico (backtest) no se había calculado al generar el reporte; se calcula en Pacing y forecast → «Calcular error histórico». El total no tiene backtest propio.',
      assumptions: [
        { item: 'Ventana reciente (método C)', value: ST.recentWindow ? (/^last(\d+)$/.test(String(ST.recentWindow)) ? `últimos ${String(ST.recentWindow).replace('last','')} días` : `${ST.recentWindow} días`) : NA }, { item: 'Mínimo de días comparables', value: isNum(ST.minComparableDays) ? `${ST.minComparableDays} días` : NA },
        { item: 'Cobertura mínima de ventana', value: isNum(ST.minWindowCoverage) ? pct(ST.minWindowCoverage, 0) : NA }, { item: 'Método de atribución de la brecha', value: s.diag && s.diag.attributionMethodLabel ? s.diag.attributionMethodLabel : NA }],
      definitions: [
        ['Venta', 'Tráfico × CR × AOV. Las tres palancas explican la venta de forma aritmética, no causal.'], ['CR', 'Pedidos ÷ tráfico, siempre desde sumas del período (nunca promedio de tasas diarias).'], ['AOV', 'Venta ÷ pedidos, desde sumas.'],
        ['Corte', 'Último día con venta real cargada que se usa para comparar con el plan.'], ['Día contado', 'Día con real válido en el canal; en el Total, día con real en todos los canales.'], ['Plan comparable', 'Plan de los mismos días contados que el real.'],
        ['Brecha', 'Real − plan comparable. Cumplimiento = real ÷ plan comparable.'], ['Observado', 'Dato cargado desde un archivo.'], ['Calculado', 'Derivado de datos con una regla fija.'], ['Estimado', 'Proyección, simulación o supuesto.']],
      omitted,
      limits: ['La fecha de corte es diaria; no hay hora de corte.', 'Un dato faltante se muestra como «No disponible», nunca como 0.', 'El rango entre métodos no es un intervalo de confianza estadístico.', 'La descomposición de la brecha y los patrones son descriptivos: no establecen causas.', 'No incluye marketing pagado (CAC, ROAS), ejecución de CRM ni claves, preferencias o datos del negocio.', 'El reporte se genera en este navegador; no envía datos a ningún servicio.'],
      sources: ['Calidad de datos', 'Configuración de forecast'], tags: []
    });
  }

  /* ---------------- ensamblado ---------------- */
  const ORDER = ['cover', 'summary', 'pacing', 'reliability', 'drivers', 'categories', 'trends', 'movers', 'customers', 'traffic', 'campaigns', 'recovery', 'seasonality', 'closing', 'annex'];
  function build(src) {
    const s = { channel: 'total', options: {}, filters: [], ...src };
    s.options = { includeAnnex: true, showTags: false, showBusinessName: false, ...(s.options || {}) };
    const adv = advise(s);
    const head6 = [pageCover(s), pagePacing(s), pageReliability(s, adv), pageDrivers(s), pageCategories(s), pageTrends(s)];
    const core = [...head6, pageMovers(s, head6), pageCustomers(s), pageTraffic(s), pageCampaigns(s), pageRecovery(s), pageSeasonality(s)];
    const all = [core[0], pageSummary(s, core), ...core.slice(1)];
    const rel = all.find((p) => p.id === 'reliability'), pac = all.find((p) => p.id === 'pacing');
    if (rel && rel.status === 'included' && rel.warning && pac && pac.status === 'included') pac.caveat = 'El cierre estimado depende del método de proyección: los métodos con datos suficientes difieren de forma material (detalle en el anexo técnico).';
    all.push(pageClosing(s, all));
    const annex = pageAnnex(s, all, adv);
    const pages = [...all, annex].filter((p) => p.id !== 'annex' || s.options.includeAnnex || true);   // el anexo siempre existe: lista las omisiones
    const included = pages.filter((p) => p.status === 'included');
    included.forEach((p, i) => { p.number = i + 1; });
    return {
      schema: SCHEMA, schemaVersion: SCHEMA_VERSION, generatedAt: s.generatedAt || null, app: s.app || null,
      context: { channel: s.channel, year: s.run ? s.run.year : null, cutoff: s.run ? s.run.cutoff : null, method: s.run && s.run.method ? s.run.method.id : null },
      options: s.options, pages, included: included.map((p) => p.id), omitted: pages.filter((p) => p.status === 'omitted').map((p) => ({ id: p.id, title: p.title, reason: p.reason })),
      total: included.length
    };
  }

  FP.reportBuilder = { SCHEMA, SCHEMA_VERSION, ORDER, TAG, NA, MATERIAL_SPREAD, build, fmt, FMT, closes, clean, advise };
})(typeof window !== 'undefined' ? window : globalThis);
