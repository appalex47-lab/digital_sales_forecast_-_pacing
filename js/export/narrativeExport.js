/**
 * narrativeExport.js — narrative_export.json (Fase 9.2).
 * Empaqueta la narrativa ya construida (claims con nivel de certeza, fuente y cifras) más, si existe,
 * la redacción de Cohere ya validada. No toca planning/forecast/reforecast/analysis/action_plan/
 * category_product_analysis_export — es un archivo nuevo, aditivo, pensado para que la futura Fase 10
 * (Analysis Package) lo consuma sin tener que rearmar la narrativa.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  function buildNarrativeExport(n, { ai = null } = {}) {
    return {
      schema: 'narrative_export', schemaVersion: C().schemaVersion, generatorVersion: n.schemaVersion,
      metadata: { app: C().app.name, version: C().app.version, generatedAt: n.generatedAt },
      period: n.period, channel: n.channel, comparison: n.comparison, businessContext: n.businessContext,
      readyToNarrate: n.readyToNarrate,
      executiveSummary: n.executiveSummary,
      sections: n.sections,
      claims: n.claims,
      assumptions: n.assumptions,
      note: n.note,
      ai: ai && ai.ok ? { model: ai.model, summary: ai.result.summary, narrative: ai.result.narrative, missingInfo: ai.result.missingInfo,
        note: 'Redacción de Cohere validada contra las cifras de "claims"; nunca reemplaza el cálculo determinístico.' } : null,
      provenance: n.claims.map((c) => ({ id: c.id, level: c.level, source: c.source }))
    };
  }

  FP.narrativeExport = { buildNarrativeExport };
})(typeof window !== 'undefined' ? window : globalThis);
