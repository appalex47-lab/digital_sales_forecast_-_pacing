/**
 * diagnosticArchitecture.js — Contrato de la capa HIPÓTESIS.
 * No calcula cifras. Define la cadena de evidencia y garantiza que las hipótesis
 * nunca se presenten como causas demostradas.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const STAGES = [
    { id: 'fact', label: 'HECHO', question: '¿Qué pasó y cuánto?' },
    { id: 'driver', label: 'DRIVER', question: '¿Qué variable lo explica matemáticamente?' },
    { id: 'signal', label: 'SEÑAL', question: '¿Dónde ocurre y merece investigarse?' },
    { id: 'hypothesis', label: 'HIPÓTESIS', question: '¿Qué podría estar explicándolo?' }
  ];
  function validateRun(run) {
    const errors = [];
    if (!run || run.status !== 'ok') errors.push('No hay un diagnóstico comparable listo.');
    if (run && !Array.isArray(run.level1Drivers)) errors.push('Faltan drivers de Nivel 1.');
    if (run && !Array.isArray(run.signals)) errors.push('Faltan señales.');
    if (run && !Array.isArray(run.hypotheses)) errors.push('Faltan hipótesis.');
    if (run && Array.isArray(run.hypotheses)) {
      run.hypotheses.forEach((h, i) => {
        if (!Array.isArray(h.relatedSignals) || !h.relatedSignals.length) errors.push(`Hipótesis ${i + 1} no cita señales.`);
        if (!h.validationNeeded || !h.validationNeeded.length) errors.push(`Hipótesis ${i + 1} no indica qué validar.`);
        if (h.status !== 'requires_investigation') errors.push(`Hipótesis ${i + 1} no está marcada como requiere investigación.`);
      });
    }
    return { ok: !errors.length, errors };
  }
  FP.diagnosticArchitecture = { STAGES, validateRun };
})(typeof window !== 'undefined' ? window : globalThis);
