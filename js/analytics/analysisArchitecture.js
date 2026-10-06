/**
 * analysisArchitecture.js — Fase 15.
 * Contrato de navegación analítica: Hecho → Driver → Señal → Hipótesis → Proyección → Ciclo de vida.
 * No calcula métricas; define responsabilidades y orden para evitar duplicaciones entre módulos.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const layers = [
    { id: 'fact', order: 1, label: 'HECHO', question: '¿Qué pasó y cuánto?', modules: ['Evolución y Patrones', 'Lectura de Entidad'], purpose: 'Describe el movimiento observado sin atribuir causas.' },
    { id: 'driver', order: 2, label: 'DRIVER', question: '¿Qué variable lo explica matemáticamente?', modules: ['Mix Intelligence'], purpose: 'Explica cómo cambió la composición del negocio; la contribución matemática queda como capacidad interna para reconciliar y explicar movimientos, no como módulo independiente.' },
    { id: 'signal', order: 3, label: 'SEÑAL', question: '¿Dónde ocurre y merece investigarse?', modules: ['Prioridades de acción'], purpose: 'Prioriza arrastre, compensación y señales que merecen revisión.' },
    { id: 'hypothesis', order: 4, label: 'HIPÓTESIS', question: '¿Qué podría estar explicándolo?', modules: ['¿Por qué? Diagnóstico'], purpose: 'Formula explicaciones posibles y separa evidencia de información faltante.' },
    { id: 'projection', order: 5, label: 'PROYECCIÓN', question: '¿Qué puede pasar después?', modules: ['Forecast'], purpose: 'Proyecta trayectoria sin convertir hipótesis en hechos.' },
    { id: 'lifecycle', order: 6, label: 'CICLO DE VIDA', question: '¿Cómo se comporta a través del tiempo?', modules: ['Cohortes'], purpose: 'Distingue nuevos, retenidos, reactivados y perdidos.' }
  ];
  function get(id) { return layers.find(x => x.id === id) || null; }
  function validate() {
    const ids = layers.map(x => x.id);
    const orders = layers.map(x => x.order);
    return { ok: ids.length === 6 && new Set(ids).size === ids.length && orders.every((x, i) => x === i + 1), ids };
  }
  FP.analysisArchitecture = Object.freeze({ layers: Object.freeze(layers), get, validate, version: '28.0' });
})(typeof window !== 'undefined' ? window : globalThis);
