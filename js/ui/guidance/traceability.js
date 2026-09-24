/**
 * traceability.js — Cadena trazable de una acción (Fase 7).
 * Solo lectura: arma los nodos plan → forecast → gap → driver → señal → hipótesis → escenario →
 * acción → impacto simulado → medición con lo que ya guardaron los motores. No altera datos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const fin = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * @param {object} action   acción del plan
   * @param {object} ctx      { scenarios: [], measurements: [], signals?: [] }
   * @returns [{ id, kind, state, title, value, detail, source, linkedTo }]
   */
  function chain(action, { scenarios = [], measurements = [], signals = [] } = {}) {
    if (!action) return [];
    const sc = scenarios.find((s) => s.scenarioId === action.scenarioId) || null;
    const ms = measurements.filter((m) => m.actionId === action.actionId);
    const last = ms.length ? ms[ms.length - 1] : null;
    const out = sc && sc.outputs ? sc.outputs : null;
    const sigIds = action.signalIds || (sc && sc.links ? sc.links.signalIds : []) || [];
    const sigs = signals.filter((s) => sigIds.includes(s.id));
    const node = (id, kind, state, title, value, detail, source) => ({ id, kind, state, title, value, detail, source });
    const nodes = [
      node('plan', 'Plan', 'plan', 'Plan del periodo', out && out.plan ? out.plan.revenue : null, sc ? sc.context.period.label : '', 'Plan original / archivo importado'),
      node('forecast', 'Forecast', 'forecast', 'Base al simular (real + forecast)', out && out.base ? out.base.revenue : null,
        sc && sc.context.forecastMethod ? `Método ${sc.context.forecastMethod.id}` : '', 'Forecast de Fase 3 al momento del escenario'),
      node('gap', 'Brecha', null, 'Falta para el plan', out && out.gap ? out.gap.gapBefore : null, out && out.gap && out.gap.noGap ? 'Sin brecha en el periodo' : '', 'Plan − base'),
      node('driver', 'Driver', null, action.driver || (sc && sc.links.driver) || '—', null, sc && sc.links.hypothesisDriver && sc.links.hypothesisDriver !== sc.links.driver ? `La hipótesis es sobre ${sc.links.hypothesisDriver}` : '', 'Atribución de Nivel 1'),
      node('signal', 'Señal', null, sigIds.length ? `${sigIds.length} señal(es): ${sigIds.join(', ')}` : 'Sin señales ligadas', null,
        sigs.map((s) => s.evidence).join(' · '), 'Motor de señales'),
      node('hypothesis', 'Hipótesis', null, action.hypothesisId || '—', null, action.hypothesis || '', 'Requiere investigación'),
      node('scenario', 'Escenario', 'scenario', sc ? `${sc.scenarioId} · ${sc.name}` : '—', null, sc ? JSON.stringify(sc.inputs) : '', sc ? `Simulación del ${sc.createdAt.slice(0, 10)}` : ''),
      node('action', 'Acción', null, `${action.actionId} · ${action.title}`, null, `${action.status}${action.owner ? ` · ${action.owner}` : ''}`, 'Plan de acción'),
      node('impact', 'Impacto simulado', 'scenario', 'Venta incremental simulada', action.expectedImpact ? action.expectedImpact.incrementalValue : null,
        action.expectedImpact && fin(action.expectedImpact.recoveryPercent) ? `${(action.expectedImpact.recoveryPercent * 100).toFixed(1)} % del gap` : '', 'Escenario (cálculo determinístico)'),
      node('observed', 'Resultado observado', 'observed', last ? last.statement : 'Sin medición', last ? last.observedImpact.value : null,
        last ? `${last.observedDays} de ${last.windowDays} días con real` : '', last ? `Medición del ${last.measurementDate}` : '')
    ];
    return nodes.map((n, i) => ({ ...n, linkedTo: nodes[i + 1] ? nodes[i + 1].id : null }));
  }

  FP.traceability = { chain };
})(typeof window !== 'undefined' ? window : globalThis);
