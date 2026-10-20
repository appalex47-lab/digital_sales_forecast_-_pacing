/**
 * cohereAnalysisAssistant.js — Fase 27 · Asistente conversacional de Análisis.
 *
 * Cohere interpreta preguntas libres sobre resultados YA calculados por los motores
 * de Análisis. No recibe CSV crudo, no calcula métricas nuevas y no puede inventar
 * cifras. El contexto se construye desde HECHO, DRIVER, SEÑAL y CICLO DE VIDA.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  const SYSTEM_RULES = [
    'Eres el asistente conversacional de análisis comercial de RevNavigator.',
    'Responde en español de México, con lenguaje ejecutivo y claro.',
    'Solo puedes usar la evidencia del contexto estructurado que recibes.',
    'NO recibes datos crudos y NO debes recalcular, sumar, restar, promediar ni estimar cifras.',
    'No inventes entidades, períodos, cifras, patrones, causas ni duración.',
    'Distingue siempre entre HECHO, DRIVER matemático, SEÑAL e HIPÓTESIS.',
    '“Contribuye”, “arrastra” o “compensa” describen matemáticamente el movimiento; no significan causalidad.',
    'Cuando preguntes por tiempo, usa únicamente patternStartPeriod, patternEndPeriod y patternDurationPeriods disponibles.',
    'Cuando preguntes qué crece o cae, prioriza impacto monetario comparable y después persistencia/patrón.',
    'Cuando preguntes por participación, usa Mix Intelligence y no confundas share con contribución monetaria.',
    'Si la evidencia no permite responder, dilo explícitamente y explica qué dato falta.',
    'Devuelve únicamente JSON con: answer, evidence, nextQuestion, limitations.',
    'answer debe ser una respuesta directa y breve. evidence debe contener de 0 a 5 elementos con entity, reason y source.',
    'No uses lenguaje causal como “la causa es”, “esto demuestra” o “se debe a”.',
    'Si el contexto trae "panorama", contiene un resumen por nivel (categoría, subcategoría, producto, estado, ciudad, sucursal, tipo de entrega) con el mismo período y comparación. Úsalo para preguntas por nivel o de panorama general.',
    'Para un panorama general recorre los niveles disponibles en este orden: total, categoría y subcategoría, producto, geografía (estado y ciudad), sucursal y entrega. Máximo 6 puntos breves, cada uno con sus cifras tal cual vienen en el contexto.',
    'Si un nivel trae available=false, dilo en limitations (no hay datos en ese nivel) y no lo analices. Si currentPartial es true, aclara que el período actual está incompleto y que la comparación es descriptiva.',
    'NUNCA calcules porcentajes, diferencias ni sumas: usa solo los campos ya calculados (delta, deltaPct, sharePct, totalDeltaPct, top3ShareOfDecline). Si no hay un campo para la cifra que quieres, descríbela sin número.',
    'top3ShareOfDecline describe concentración de la caída entre entidades; no es causa ni explicación.'
  ].join('\n');

  const RESPONSE_SCHEMA = {
    type: 'object', required: ['answer', 'evidence'],
    properties: {
      answer: { type: 'string' },
      evidence: { type: 'array', items: { type: 'object', required: ['entity', 'reason', 'source'], properties: { entity: { type: 'string' }, reason: { type: 'string' }, source: { type: 'string' } } } },
      nextQuestion: { type: 'string' },
      limitations: { type: 'array', items: { type: 'string' } }
    }
  };

  function cleanEntity(r) {
    return String(r?.entity || r?.key || '').trim();
  }
  function rowShape(r) {
    return {
      entity: cleanEntity(r),
      current: finite(r?.currentValue) ? r.currentValue : null,
      previous: finite(r?.previousValue) ? r.previousValue : null,
      delta: finite(r?.recentAbsoluteChange) ? r.recentAbsoluteChange : (finite(r?.impact) ? r.impact : null),
      changePct: finite(r?.percentageChange) ? r.percentageChange : null,
      cumulativePct: finite(r?.cumulativeChange) ? r.cumulativeChange : null,
      pattern: r?.pattern || null,
      direction: r?.direction || null,
      start: r?.patternStartPeriod || r?.startPeriod || null,
      end: r?.patternEndPeriod || r?.endPeriod || null,
      duration: finite(r?.patternDurationPeriods) ? r.patternDurationPeriods : (finite(r?.consecutivePeriods) ? r.consecutivePeriods : 0),
      confidence: r?.confidence || null
    };
  }
  function topRows(rows, predicate, n = 12) {
    return (Array.isArray(rows) ? rows : []).filter(predicate).sort((a, b) => Math.abs(b.recentAbsoluteChange || b.impact || 0) - Math.abs(a.recentAbsoluteChange || a.impact || 0)).slice(0, n).map(rowShape);
  }

  function buildContext(state) {
    const a = state?.an || {};
    const rows = Array.isArray(a.rows) ? a.rows : [];
    const p = a.priorities || {};
    const c = a.contribution || {};
    const s = a.share || {};
    const co = a.cohort || {};
    const t = a.temporal || {};
    const f = a.forecast || {};
    const drag = (p.drag || []).slice(0, 12).map(rowShape);
    const compensate = (p.compensate || []).slice(0, 12).map(rowShape);
    const decline = topRows(rows, r => r.direction === 'decline' || (r.recentAbsoluteChange || 0) < 0);
    const growth = topRows(rows, r => r.direction === 'growth' || (r.recentAbsoluteChange || 0) > 0);
    const shareWinners = (s.winners || []).slice(0, 12).map(r => ({ entity: cleanEntity(r), baselineShare: r.baselineShare, currentShare: r.currentShare, deltaPp: r.shareChangePp, rankBaseline: r.rankBaseline, rankCurrent: r.rankCurrent, status: r.status }));
    const shareLosers = (s.losers || []).slice(0, 12).map(r => ({ entity: cleanEntity(r), baselineShare: r.baselineShare, currentShare: r.currentShare, deltaPp: r.shareChangePp, rankBaseline: r.rankBaseline, rankCurrent: r.rankCurrent, status: r.status }));
    const contribPositive = (c.positive || []).slice(0, 12).map(rowShape);
    const contribNegative = (c.negative || []).slice(0, 12).map(rowShape);
    const lostSet = new Set((co.lifecycle?.lost || []).map(String));
    const lostByValue = rows.filter(r => lostSet.has(cleanEntity(r))).sort((a,b) => Math.abs(b.previousValue||0)-Math.abs(a.previousValue||0)).slice(0,12).map(rowShape);
    const recurrent = co.summary || {};
    const forecastRows = Array.isArray(f?.items) ? f.items.slice(0, 10).map(x => ({ entity: cleanEntity(x), pattern: x.pattern || null, next: x.forecast?.[0] || null })) : [];
    return {
      scope: { selection: (a.context && a.context.filter && Object.keys(a.context.filter).length) ? a.context.filter : null, channel: a.context ? { id: a.context.channel, label: a.context.channelLabel } : { id: a.channel || 'total', label: 'Total digital' }, comparisonRange: a.comparisonInfo ? { current: a.comparisonInfo.current, baseline: a.comparisonInfo.baseline, text: a.comparisonInfo.text, partial: a.comparisonInfo.partial, available: a.comparisonInfo.comparable } : null, level: a.level || null, periodType: a.periodType || null, periodCount: a.periodCount || null, focus: t.focus || null, comparison: s.comparisonLabel || null },
      total: { current: finite(t.currentTotal) ? t.currentTotal : null, baseline: finite(c.totalBaseline) ? c.totalBaseline : null, delta: finite(c.totalDelta) ? c.totalDelta : null, direction: c.direction || null },
      hecho: { declines: decline, growth, lost: lostByValue },
      driver: { contributionPositive: contribPositive, contributionNegative: contribNegative, positiveDelta: c.compensation?.positiveDelta ?? null, negativeDelta: c.compensation?.negativeDelta ?? null, concentration: c.concentration || null },
      mix: { winners: shareWinners, losers: shareLosers, newCount: s.newEntities?.length ?? null, lostCount: s.lostEntities?.length ?? null, hhi: s.hhi ?? null },
      signal: { drag, compensate, balance: p.totals?.balance ?? null },
      lifecycle: { summary: recurrent, latestPeriod: co.lifecycle?.latestPeriod || null, previousPeriod: co.lifecycle?.previousPeriod || null },
      projection: { forecast: forecastRows },
      note: 'Las listas son una muestra priorizada para conversación; la app conserva el cálculo completo en sus motores.'
    };
  }

  function contextNumbers(ctx) {
    const out = new Set();
    const walk = (v) => {
      if (finite(v)) {
        out.add(String(v));
        if (Math.abs(v) <= 1 && v !== 0) out.add(String(v * 100));
      } else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      else if (typeof v === 'string') {
        const matches = v.match(/-?\d+(?:[.,]\d+)?/g) || [];
        matches.forEach(x => { out.add(x.replace(',', '.')); });
      }
    };
    walk(ctx);
    return [...out];
  }

  /**
   * Cifras que aparecen en el texto de Cohere, con su valor ya escalado si usa «mil», «millones», «K» o «M»
   * (p. ej. «-$207 mil» = -207000). `signed` es true si el texto trae signo explícito: sin signo se compara el valor absoluto,
   * porque en español la dirección va en la frase («cayó $207,046») y el contexto guarda -207046.
   */
  const UNIT_SCALE = { mil: 1e3, miles: 1e3, k: 1e3, K: 1e3, 'millón': 1e6, millon: 1e6, millones: 1e6, M: 1e6, MM: 1e6 };
  function numberTokens(text) {
    const out = [], re = /([-\u2212])?\s?\$?\s?(\d[\d,]*(?:\.\d+)?)(\s?%)?(?:\s?(millones|millón|millon|miles|mil|MM|M|K|k)(?![\wáéíóúñ]))?/g;
    let m;
    while ((m = re.exec(text))) {
      const raw = m[2].replace(/,/g, ''), v = Number(raw); if (!Number.isFinite(v)) continue;
      const scale = (!m[3] && m[4]) ? UNIT_SCALE[m[4]] : 1, dec = (raw.split('.')[1] || '').length;
      const count = !m[1] && !m[3] && scale === 1 && !/\$/.test(m[0]) && /^\d{1,2}$/.test(raw) && v <= 10;   // conteo suelto («3 categorías»): no es una cifra de dinero ni de porcentaje
      out.push({ count, value: (m[1] ? -1 : 1) * v * scale, signed: Boolean(m[1]), tol: scale > 1 ? 0.5 * Math.pow(10, -dec) * scale : 0.05, at: m.index });
    }
    return out;
  }
  function matchedValues(tok, allowed) {
    return allowed.filter((x) => {
      if (tok.signed && !(x === 0 || Math.sign(x) === Math.sign(tok.value))) return false;
      const d = tok.signed ? Math.abs(x - tok.value) : Math.abs(Math.abs(x) - Math.abs(tok.value));
      return d < tok.tol || (Math.abs(x) > 1 && d / Math.abs(x) < 0.005);
    });
  }
  const UP_RE = /(?<![\wáéíóúñ])(subi[óo]|sube|suben|creci[óo]|crece|crecen|aument[óo]|aumenta|aumentan|gan[óo]|gana|ganan|mejor[óo]|mejora|increment[óo]|incrementa)(?![\wáéíóúñ])/i;
  const DOWN_RE = /(?<![\wáéíóúñ])(cay[óo]|cae|caen|baj[óo]|baja|bajan|disminuy[óo]|disminuye|perdi[óo]|pierde|pierden|descendi[óo]|redujo|reduce|decreci[óo]|retrocedi[óo]|retrocede)(?![\wáéíóúñ])/i;
  /** Frase (entre puntos, punto y coma o saltos de línea) donde está la cifra. */
  function sentenceAt(text, i) {
    const a = Math.max(text.lastIndexOf('.', i - 1), text.lastIndexOf(';', i - 1), text.lastIndexOf('\n', i - 1)), b = [text.indexOf('. ', i), text.indexOf(';', i), text.indexOf('\n', i)].filter((x) => x >= 0);
    return text.slice(a + 1, b.length ? Math.min(...b) : text.length);
  }
  /**
   * Cifra sin signo que en el contexto solo existe en negativo (una caída) y la frase dice que SUBIÓ (sin verbo de bajada): contradicción clara.
   * No se revisa el lado contrario: «cayó a $806,081» es válido (el valor actual es positivo) y los montos actuales no tienen dirección.
   */
  function directionConflict(tok, matches, text) {
    if (tok.signed || !matches.length || matches.some((x) => x > 0)) return false;
    const sent = sentenceAt(text, tok.at); return UP_RE.test(sent) && !DOWN_RE.test(sent);
  }

  function validateResponse(parsed, ctx) {
    if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim()) return { ok: false, errors: ['La respuesta de Cohere no contiene una respuesta válida.'] };
    const text = `${parsed.answer}\n${(parsed.evidence || []).map(e => `${e.entity} ${e.reason} ${e.source}`).join('\n')}`;
    if (/la causa es|esto demuestra|se debe a|caus[oó]\s/i.test(text)) return { ok: false, errors: ['La respuesta usa lenguaje causal no permitido.'] };
    const allowed = contextNumbers(ctx).map(Number).filter(Number.isFinite);
    const toks = numberTokens(text), invalid = toks.filter((tok) => !tok.count && !matchedValues(tok, allowed).length).map((tok) => (tok.signed ? '-' : '') + String(Math.abs(tok.value)));
    const conflict = toks.filter((tok) => directionConflict(tok, matchedValues(tok, allowed), text)).map((tok) => Math.abs(tok.value));
    if (!invalid.length && conflict.length) return { ok: false, errors: [`Cohere describe como subida una cifra que en los datos es una caída: ${conflict.slice(0, 3).join(', ')}.`] };
    if (invalid.length) return { ok: false, errors: [`Cohere introdujo cifras no presentes en el contexto: ${invalid.slice(0, 5).join(', ')}.`] };
    return { ok: true, errors: [] };
  }

  async function ask(question, state, { apiKey, model, fetchImpl, panorama = null } = {}) {
    const q = String(question || '').trim();
    if (!q) return { ok: false, status: 'invalid', result: null, errors: ['Escribe una pregunta.'] };
    const context = buildContext(state);
    if (panorama) context.panorama = panorama;
    const user = JSON.stringify({ question: q, context }, null, 2);
    const call = async (extra) => {
      const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Asistente conversacional de Análisis' }, system: SYSTEM_RULES, user: extra ? `${user}\n\n${extra}` : user, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl });
      if (!r.ok) return { fail: { ok: false, status: r.status, result: null, errors: r.errors || ['No se pudo consultar Cohere.'] } };
      const parsed = FP.cohereClient.parseJson(r.text);
      if (!parsed.ok) return { fail: { ok: false, status: 'invalid', result: null, errors: ['Cohere respondió en un formato no válido.'] } };
      return { r, parsed, v: validateResponse(parsed.value, context) };
    };
    let t = await call(null); if (t.fail) return t.fail;
    // Una sola repetición cuando Cohere cita cifras que no están en el contexto: se le dice cuáles y se vuelve a validar igual de estricto.
    if (!t.v.ok && /cifras|subida/.test(t.v.errors[0] || '')) {
      const t2 = await call(`Tu respuesta anterior fue rechazada: ${t.v.errors.join(' ')} Responde de nuevo usando ÚNICAMENTE cifras que aparezcan tal cual en el contexto (no calcules porcentajes ni diferencias). Si no hay una cifra para algo, descríbelo sin número.`);
      if (t2.fail) return t2.fail; t = t2;
    }
    const { r, parsed, v } = t;
    if (!v.ok) return { ok: false, status: 'invalid', result: null, errors: v.errors };
    return { ok: true, status: 'ok', result: parsed.value, model: r.model, context };
  }

  FP.cohereAnalysisAssistant = { SYSTEM_RULES, RESPONSE_SCHEMA, buildContext, validateResponse, ask };
})(typeof window !== 'undefined' ? window : globalThis);
