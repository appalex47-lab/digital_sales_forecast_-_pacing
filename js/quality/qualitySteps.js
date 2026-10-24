/**
 * qualitySteps.js — Fase 3.2 · Calidad de datos paso a paso (lógica pura, sin DOM).
 *
 * Convierte lo que la pantalla de Calidad de datos YA calcula (cobertura, errores y cuarentena, salud, disponibilidad de análisis) en un recorrido de
 * cinco pasos con un estado cada uno y un «Qué hacer ahora». No hay reglas nuevas de calidad: solo agrupa las que existen. El paso 5 (confianza del
 * forecast) solo cuenta los meses cerrados con venta real y muestra la regla vigente; la calibración con el historial llega en una fase posterior.
 *
 * Entrada `m` (todo opcional):
 *   empty        true si todavía no hay datos importados
 *   loaded       etiquetas de los tipos de dato con archivos cargados
 *   gaps         frases de huecos de cobertura (fechas o canales faltantes)
 *   missingDates fechas sin ningún registro
 *   rejected, errors, warnings, duplicates, quarantined   conteos de la carga
 *   health       { score: 0-100|null, worst: 'texto del componente que más bajó'|null }
 *   analyses     { total, available, firstMissing: { label, todo }|null }
 *   forecast     { closedMonths, min }
 * Salida: { steps: [{ n, question, status, tone, label, look, todo, note }], now: { n, question, text, view }|null }
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const LOOK = {
    1: 'Los archivos cargados por tipo de dato y las fechas sin registro por canal.',
    2: 'Errores, advertencias y valores en cuarentena.',
    3: 'El puntaje de salud por tipo de dato, sus componentes y el registro de importaciones.',
    4: 'Qué análisis están disponibles con lo que cargaste y cuáles no.',
    5: 'Cuánto se equivoca el cierre estimado cuando sale Alta, Media o Baja, y con cuántos meses cerrados cuenta la app.'
  };
  const TODO = {
    1: 'Cargar lo que falte.',
    2: 'Corregir en el archivo y volver a importarlo.',
    3: 'Atender primero el componente que más puntos bajó.',
    4: 'Cargar el archivo que desbloquea el siguiente análisis.',
    5: 'Nada hasta tener 12 meses cerrados; la calibración con tu historial llega en una fase posterior.'
  };
  const QUESTION = {
    1: '¿Llegó todo?', 2: '¿Se cargó bien?', 3: '¿Qué tan sana está cada carga?', 4: '¿Qué puedo analizar?', 5: '¿Qué tan confiable es mi forecast?'
  };
  const TONE = { listo: 'ok', revisar: 'warning', pendiente: 'na', aprendiendo: 'na' };

  function step(n, status, label, note, extra) {
    return Object.assign({ n, question: QUESTION[n], status, tone: TONE[status], label, look: LOOK[n], todo: TODO[n], note: note || '' }, extra || {});
  }

  function build(m) {
    m = m || {};
    const empty = Boolean(m.empty);
    const steps = [];

    // 1 · ¿Llegó todo?
    const gaps = Array.isArray(m.gaps) ? m.gaps : [];
    if (empty) steps.push(step(1, 'pendiente', 'Pendiente', 'Todavía no hay datos importados.', { action: 'Todavía no hay datos importados. Carga tus archivos para empezar.', view: 'carga' }));
    else if (gaps.length || num(m.missingDates) > 0) {
      const first = gaps[0] || `${plural(num(m.missingDates), 'fecha sin ningún registro', 'fechas sin ningún registro')}.`;
      steps.push(step(1, 'revisar', 'Revisar', first, { action: `${first} Mira «Fechas faltantes por canal» y carga lo que falte.`, view: 'carga' }));
    } else steps.push(step(1, 'listo', 'Listo', `${(m.loaded || []).join(', ') || 'Los archivos'} sin huecos de fechas ni canales.`));

    // 2 · ¿Se cargó bien?
    const parts = [];
    if (num(m.rejected)) parts.push(plural(num(m.rejected), 'fila rechazada', 'filas rechazadas'));
    if (num(m.errors)) parts.push(plural(num(m.errors), 'registro con error', 'registros con errores'));
    if (num(m.warnings)) parts.push(plural(num(m.warnings), 'advertencia', 'advertencias'));
    if (num(m.duplicates)) parts.push(plural(num(m.duplicates), 'llave duplicada', 'llaves duplicadas'));
    if (num(m.quarantined)) parts.push(plural(num(m.quarantined), 'valor en cuarentena', 'valores en cuarentena'));
    const avisos = num(m.rejected) + num(m.errors) + num(m.warnings) + num(m.duplicates) + num(m.quarantined);
    if (empty) steps.push(step(2, 'pendiente', 'Pendiente', 'Sin datos que revisar todavía.'));
    else if (avisos > 0) steps.push(step(2, 'revisar', `Revisar · ${plural(avisos, 'aviso', 'avisos')}`, `${parts.join('; ')}.`, { action: `Hay ${plural(avisos, 'aviso', 'avisos')} en la carga (${parts.join('; ')}). Revisa lo que quedó fuera y corrige el archivo.` }));
    else steps.push(step(2, 'listo', 'Listo', 'Sin rechazos, errores, advertencias, duplicados ni valores en cuarentena.'));

    // 3 · ¿Qué tan sana está cada carga?
    const hs = m.health && typeof m.health.score === 'number' ? m.health.score : null;
    if (empty || hs === null) steps.push(step(3, 'pendiente', 'Pendiente', 'Sin puntaje todavía.'));
    else if (hs >= 90) steps.push(step(3, 'listo', `Listo · ${hs}/100`, 'Ningún componente baja de lo esperado.'));
    else {
      const worst = m.health.worst ? `Lo que más bajó: ${m.health.worst}` : 'Hay componentes con puntos perdidos.';
      steps.push(step(3, 'revisar', `Revisar · ${hs}/100`, worst, { action: `La salud general es ${hs}/100. ${worst}` }));
    }

    // 4 · ¿Qué puedo analizar?
    const an = m.analyses || {}, tot = num(an.total), av = num(an.available);
    if (empty || !tot) steps.push(step(4, 'pendiente', 'Pendiente', 'Sin información para saber qué se puede analizar.'));
    else if (av >= tot) steps.push(step(4, 'listo', `Listo · ${av} de ${tot}`, 'Todos los análisis están disponibles.'));
    else {
      const fm = an.firstMissing && an.firstMissing.label ? `${an.firstMissing.label}${an.firstMissing.todo ? `: ${an.firstMissing.todo}` : ''}` : `${plural(tot - av, 'análisis', 'análisis')} con límites o sin información.`;
      steps.push(step(4, 'revisar', `Parcial · ${av} de ${tot}`, fm, { action: `${av} de ${tot} análisis disponibles. ${fm}` }));
    }

    // 5 · ¿Qué tan confiable es mi forecast? (solo lectura en esta fase)
    const fc = m.forecast || {}, min = num(fc.min) || 12, cm = num(fc.closedMonths);
    if (cm < min) steps.push(step(5, 'aprendiendo', `Aprendiendo · ${cm} de ${min} meses`, `La app cuenta ${plural(cm, 'mes cerrado', 'meses cerrados')} con venta real; necesita ${min} para calibrar.`));
    else steps.push(step(5, 'listo', `Historial suficiente · ${cm} meses`, `Hay ${cm} meses cerrados con venta real. La calibración con tu historial llega en una fase posterior.`));

    // Qué hacer ahora: el primer paso de 1 a 4 que pida algo
    const act = steps.slice(0, 4).find((s) => s.status === 'revisar' || (s.status === 'pendiente' && s.n === 1));
    const now = act ? { n: act.n, question: act.question, text: act.action || act.note, view: act.view || null } : null;
    return { steps, now };
  }

  FP.qualitySteps = { build, QUESTION, LOOK, TODO };
})(typeof window !== 'undefined' ? window : globalThis);
