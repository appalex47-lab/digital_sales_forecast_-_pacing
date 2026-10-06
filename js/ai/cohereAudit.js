/**
 * cohereAudit.js — Fase H1 · registro de transparencia de las consultas a Cohere (solo en esta sesión, solo en memoria).
 * Cada consulta que SALE del navegador deja una línea: para qué, qué modelo, cuántas columnas y ejemplos se enviaron, cuáles se protegieron y cómo terminó.
 * NUNCA guarda valores de ejemplo ni la respuesta: solo nombres de columnas, conteos, tamaños y estado. No se persiste ni se exporta.
 * Una consulta que no salió (sin API key o sin red disponible en el navegador) no se registra: no hubo nada que transparentar.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const MAX = 100;
  const entries = [];
  let seq = 0;

  /** @param {{purpose, model, status, ok, columns?, chars?, ms?}} e  columns: [{ header, examplesSent, protected }] */
  function record(e) {
    const cols = Array.isArray(e.columns) ? e.columns.map((c) => ({ header: String(c.header || '').slice(0, 120), examplesSent: Number(c.examplesSent) || 0, protectedReason: c.protected ? String(c.protected) : null })) : [];
    entries.push({
      id: ++seq, at: new Date().toISOString(), purpose: String(e.purpose || 'Consulta'), model: String(e.model || ''), status: String(e.status || ''), ok: Boolean(e.ok),
      columnsSent: cols.length, examplesSent: cols.reduce((a, c) => a + c.examplesSent, 0), protectedColumns: cols.filter((c) => c.protectedReason).map((c) => ({ header: c.header, reason: c.protectedReason })),
      columns: cols, chars: Number(e.chars) || 0, ms: Number(e.ms) || 0
    });
    if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  }
  FP.aiAudit = { record, list: () => entries.slice().reverse(), clear: () => { entries.length = 0; }, count: () => entries.length, MAX };
})(typeof window !== 'undefined' ? window : globalThis);
