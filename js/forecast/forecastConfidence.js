/**
 * forecastConfidence.js — Fase 3 · Confianza del cierre estimado (solo lectura, determinista).
 *
 * Dice qué tan SÓLIDA es la base de la estimación del cierre de un periodo, no qué tan probable es acertar: no es una probabilidad ni un
 * intervalo estadístico. Cuatro factores, cada uno Alta / Media / Baja, y una regla fija que los combina (visible en la interfaz):
 *
 *  1 · Cobertura   — días con venta real ÷ días del periodo. Cuantos más días reales, menos se proyecta.          ≥60 % Alta · ≥35 % Media · menos Baja
 *                    Si hay 2 o más días pasados sin venta real (se proyectan), la cobertura no pasa de Media.
 *  2 · Estabilidad — los últimos 7 días con venta real contra los 21 anteriores (promedio diario; 7 y 21 días son semanas completas,
 *                    así el día de la semana no distorsiona).                                                       ≤10 % Alta · ≤25 % Media · más Baja
 *  3 · Rango       — separación de los métodos de forecast al cierre del año, como % de la meta (la misma lectura de «Método sugerido»).
 *                                                                                                                 <2 % Alta · <5 % Media · más Baja
 *  4 · Historia    — días comparables de los índices que usa el método: ≥90 Alta · 28 a 89 Media · menos Baja. El método A (plan tal cual) no usa índices:
 *                    este factor no aplica y los otros se reparten su peso.
 *
 * Regla: Alta = 1, Media = 0.5, Baja = 0; promedio ponderado (cobertura 30 %, estabilidad 25 %, rango 25 %, historia 20 %; sobre los factores que aplican).
 *   ≥ 0.75 → Alta · ≥ 0.40 → Media · menos → Baja.
 *   Topes: con cobertura Baja no pasa de Media; con algún factor Baja no pasa de Media; con dos o más factores Baja el resultado es Baja.
 *
 * Periodo ya cerrado y completo, o que no empieza: no hay estimación que calificar (status `closed` / `future`). Un periodo cerrado con días sin venta real
 * cargada sí se califica: esos días se proyectan.
 * No cambia ninguna fórmula del motor: solo lee `run` (FP.forecastEngine.runForecast).
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);
  const LABEL = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  const PTS = { alta: 1, media: 0.5, baja: 0 };
  const WEIGHTS = { cobertura: 0.30, estabilidad: 0.25, rango: 0.25, historia: 0.20 };
  const NAMES = { cobertura: 'Días con venta real', estabilidad: 'Estabilidad de los últimos 7 días', rango: 'Separación entre métodos', historia: 'Historia disponible' };
  const T = { cobAlta: 0.60, cobMedia: 0.35, estAlta: 0.10, estMedia: 0.25, rngAlta: 0.02, rngMedia: 0.05, hisAlta: 90, hisMedia: 28, cutAlta: 0.75, cutMedia: 0.40 };
  const spct = (v) => `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(1)} %`;
  const pct1 = (v) => `${(v * 100).toFixed(1)} %`;
  const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  function seriesOf(run, channel) {
    if (!run || !run.total) return null;
    return channel && channel !== 'total' ? (run.channels && run.channels[channel]) || null : run.total;
  }
  function periodOf(series, period) {
    if (!series || !period) return null;
    if (period.type === 'year') return series.annual || null;
    const list = period.type === 'week' ? series.weeks : series.months;
    return Array.isArray(list) ? list.find((x) => x.key === period.key) || null : null;
  }
  const revOf = (d) => (d && d.counted && d.actual && fin(d.actual.revenue) ? d.actual.revenue : null);

  function cobertura(p) {
    const days = p.days || 0, counted = p.countedDays || 0;
    if (!days) return null;
    const r = counted / days;
    let level = r >= T.cobAlta ? 'alta' : r >= T.cobMedia ? 'media' : 'baja';
    const miss = p.missingActualDays || 0;
    if (miss >= 2 && level === 'alta') level = 'media';
    return { id: 'cobertura', level, value: r, detail: `${counted} de ${days} días con venta real${miss ? `; ${miss} día(s) pasados sin venta real se proyectan` : ''}` };
  }

  /** Últimos 7 días con venta real contra los 21 anteriores, por promedio diario. Sin datos suficientes devuelve null (el factor no se califica). */
  function estabilidad(series) {
    const days = (series && series.days) || [];
    let last = null; for (let i = days.length - 1; i >= 0; i--) { if (revOf(days[i]) !== null) { last = days[i].date; break; } }
    if (!last) return null;
    const rec0 = addDays(last, -6), prev0 = addDays(last, -27), prev1 = addDays(last, -7);
    const rec = [], prev = [];
    days.forEach((d) => { const v = revOf(d); if (v === null) return; if (d.date >= rec0 && d.date <= last) rec.push(v); else if (d.date >= prev0 && d.date <= prev1) prev.push(v); });
    if (rec.length < 5 || prev.length < 14) return { id: 'estabilidad', level: 'baja', value: null, detail: `Hay pocos días con venta real para medir la estabilidad (${rec.length} recientes, ${prev.length} anteriores)` };
    const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length, a1 = avg(rec), a0 = avg(prev);
    if (!(a0 > 0)) return null;
    const ch = a1 / a0 - 1, dev = Math.abs(ch);
    return { id: 'estabilidad', level: dev <= T.estAlta ? 'alta' : dev <= T.estMedia ? 'media' : 'baja', value: ch, detail: `Los últimos 7 días promedian ${spct(ch)} contra los 21 anteriores` };
  }

  function rango(run, channel, advisor) {
    let adv = null; try { adv = advisor && advisor.advise({ run, channel, metric: 'revenue' }); } catch (e) { adv = null; }
    const r = adv && adv.range;
    if (!r || !fin(r.spreadPct)) return null;
    return { id: 'rango', level: r.spreadPct < T.rngAlta ? 'alta' : r.spreadPct < T.rngMedia ? 'media' : 'baja', value: r.spreadPct, detail: `Los métodos de forecast se separan ${pct1(r.spreadPct)} de la meta al cierre del año` };
  }

  function historia(series) {
    const c = series && series.confidence;
    if (!c) return null;   // método A: no usa índices
    const level = c === 'excellent' ? 'alta' : c === 'sufficient' ? 'media' : 'baja';
    const txt = { excellent: `${T.hisAlta} días comparables o más`, sufficient: `entre ${T.hisMedia} y ${T.hisAlta - 1} días comparables`, limited: `menos de ${T.hisMedia} días comparables`, insufficient: 'falta al menos un índice' }[c] || String(c);
    return { id: 'historia', level, value: null, detail: `Índices con ${txt}` };
  }

  /**
   * @param {{run:object, channel?:string, period:{type:'year'|'month'|'week', key:string}, advisor?:object}} p
   * @returns {{status:'ok'|'closed'|'future'|'no_data', level?:string, label?:string, score?:number, factors?:object[], reasons?:string[], note?:string}}
   */
  function assess({ run, channel = 'total', period, advisor }) {
    const series = seriesOf(run, channel), p = periodOf(series, period);
    if (!series || !p || !p.days) return { status: 'no_data' };
    // Cerrado y completo: la cifra es real. Cerrado pero con días sin venta real cargada: esos días se proyectan y la estimación sí se califica.
    if (p.status === 'closed' && !(p.missingActualDays > 0)) return { status: 'closed', note: 'El periodo ya cerró: la cifra es real, no una estimación.' };
    if (p.status === 'future') return { status: 'future', note: 'El periodo todavía no empieza: no hay base para calificar la estimación.' };
    const adv = advisor || FP.methodAdvisor;
    const factors = [cobertura(p), estabilidad(series), rango(run, channel, adv), historia(series)].filter(Boolean)
      .map((f) => ({ ...f, label: NAMES[f.id], levelLabel: LABEL[f.level] }));
    if (!factors.length) return { status: 'no_data' };
    const wsum = factors.reduce((s, f) => s + WEIGHTS[f.id], 0);
    const score = factors.reduce((s, f) => s + WEIGHTS[f.id] * PTS[f.level], 0) / wsum;
    let level = score >= T.cutAlta ? 'alta' : score >= T.cutMedia ? 'media' : 'baja';
    const bajas = factors.filter((f) => f.level === 'baja'), reasons = [];
    if (level === 'alta' && bajas.length) { level = 'media'; reasons.push('Con un factor en Baja, la confianza no pasa de Media.'); }
    if (bajas.length >= 2 && level !== 'baja') { level = 'baja'; reasons.push('Con dos o más factores en Baja, la confianza es Baja.'); }
    return { status: 'ok', level, label: LABEL[level], score, factors, reasons,
      note: 'Mide qué tan sólida es la base de la estimación del cierre, no la probabilidad de acertar.' };
  }

  FP.forecastConfidence = { assess, LABEL, WEIGHTS, THRESHOLDS: T, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
