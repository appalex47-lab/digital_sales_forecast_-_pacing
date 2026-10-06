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
    'No uses lenguaje causal como “la causa es”, “esto demuestra” o “se debe a”.'
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
      scope: { level: a.level || null, periodType: a.periodType || null, periodCount: a.periodCount || null, focus: t.focus || null, comparison: s.comparisonLabel || null },
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

  function validateResponse(parsed, ctx) {
    if (!parsed || typeof parsed.answer !== 'string' || !parsed.answer.trim()) return { ok: false, errors: ['La respuesta de Cohere no contiene una respuesta válida.'] };
    const text = `${parsed.answer}\n${(parsed.evidence || []).map(e => `${e.entity} ${e.reason} ${e.source}`).join('\n')}`;
    if (/la causa es|esto demuestra|se debe a|caus[oó]\s/i.test(text)) return { ok: false, errors: ['La respuesta usa lenguaje causal no permitido.'] };
    const nums = FP.narrativeEngine?.numbersIn ? FP.narrativeEngine.numbersIn(text) : [];
    const allowed = contextNumbers(ctx).map(Number).filter(Number.isFinite);
    const invalid = nums.filter(tok => {
      const n = Number(String(tok).replace(/,/g, ''));
      if (!Number.isFinite(n)) return false;
      return !allowed.some(x => Math.abs(x - n) < 0.05 || (Math.abs(x) > 1 && Math.abs(x - n) / Math.abs(x) < 0.005));
    });
    if (invalid.length) return { ok: false, errors: [`Cohere introdujo cifras no presentes en el contexto: ${invalid.slice(0, 5).join(', ')}.`] };
    return { ok: true, errors: [] };
  }

  async function ask(question, state, { apiKey, model, fetchImpl } = {}) {
    const q = String(question || '').trim();
    if (!q) return { ok: false, status: 'invalid', result: null, errors: ['Escribe una pregunta.'] };
    const context = buildContext(state);
    const user = JSON.stringify({ question: q, context }, null, 2);
    const r = await FP.cohereClient.chatJson({ audit: { purpose: 'Asistente conversacional de Análisis' }, system: SYSTEM_RULES, user, schema: RESPONSE_SCHEMA, apiKey, model, fetchImpl });
    if (!r.ok) return { ok: false, status: r.status, result: null, errors: r.errors || ['No se pudo consultar Cohere.'] };
    const parsed = FP.cohereClient.parseJson(r.text);
    if (!parsed.ok) return { ok: false, status: 'invalid', result: null, errors: ['Cohere respondió en un formato no válido.'] };
    const v = validateResponse(parsed.value, context);
    if (!v.ok) return { ok: false, status: 'invalid', result: null, errors: v.errors };
    return { ok: true, status: 'ok', result: parsed.value, model: r.model, context };
  }

  FP.cohereAnalysisAssistant = { SYSTEM_RULES, RESPONSE_SCHEMA, buildContext, validateResponse, ask };
})(typeof window !== 'undefined' ? window : globalThis);
