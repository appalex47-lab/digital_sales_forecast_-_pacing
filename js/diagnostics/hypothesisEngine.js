/**
 * hypothesisEngine.js — Hipótesis por reglas (Fase 5).
 *
 * Cadena obligatoria: HECHO → DRIVER → SEÑAL → HIPÓTESIS. Nunca se salta un paso:
 *  - Una hipótesis siempre cita señales existentes (relatedSignals) y un driver matemático.
 *  - Si el driver no tiene señales localizadas (p. ej. CR baja pero no hay segmentos), la hipótesis
 *    es genérica: "existe un deterioro en alguna etapa que requiere localizarse", sin nombrar causas.
 *  - Todas quedan en estado "Requiere investigación". Nada aquí es una causa ni una recomendación.
 * Cohere (opcional) solo puede reformular estas piezas con la evidencia estructurada.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;
  const M = () => FP.metrics;
  const fin = (v) => M().isFiniteNumber(v);
  const RANK = { high: 3, medium: 2, low: 1 };

  const maxPriority = (sigs) => sigs.reduce((a, s) => (RANK[s.relevance.priority] > RANK[a] ? s.relevance.priority : a), 'low');
  const lower = (s) => (/^[A-ZÁÉÍÓÚ][a-záéíóúñ]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  function generateHypotheses({ level1, signals, availability = {} }) {
    const out = [];
    let seq = 0;
    const falling = level1.gap.abs < 0;
    const wantDir = falling ? 'deterioration' : 'improvement';
    const move = falling ? 'caída' : 'mejora';
    const add = (h) => out.push({ id: `h${++seq}`, status: 'requires_investigation', statusLabel: 'Requiere investigación', source: 'rules', ...h });
    // Solo dimensiones operativas localizan un driver (segmentos cargados y canal). Semana, día de la
    // semana y tipo de día describen el calendario, no un lugar del negocio: quedan como señales.
    const LOCALIZING = (s) => s.dimension && !['week', 'dayOfWeek', 'dayType', 'date'].includes(s.dimension);
    const segSignals = (metric) => signals.filter((s) => s.level === 2 && s.kind === 'segment_change' && s.metric === metric &&
      s.direction === wantDir && s.relevance.priority !== 'low' && LOCALIZING(s));

    const TEMPLATES = {
      conversionRate: {
        local: (s) => `La ${move} del CR en ${s.dimensionLabel.toLowerCase()} ${s.label} podría estar contribuyendo al ${falling ? 'deterioro' : 'avance'} del CR total.`,
        mech: falling ? 'Menor conversión con el mismo volumen reduce pedidos y venta.' : 'Mayor conversión con el mismo volumen aumenta pedidos y venta.',
        validate: (s) => [`Revisar el embudo de ${s.label} por etapa (búsqueda, producto, carrito, checkout, pago).`,
          'Confirmar si el cambio coincide con cambios de sitio o app, precios, inventario o promociones en esas fechas.'],
        generic: falling ? 'Existe un deterioro en alguna etapa del proceso de conversión que requiere localizarse.' : 'Alguna etapa del proceso de conversión mejoró; falta localizar cuál.',
        genericValidate: ['Revisar el funnel por etapa.', 'Cargar segmentos (dispositivo, tipo de cliente, fuente) para localizar dónde ocurre.']
      },
      trafficVolume: {
        local: (s) => `${falling ? 'Menos' : 'Más'} volumen desde ${s.dimensionLabel.toLowerCase()} ${s.label} podría explicar parte de la ${move} del volumen total.`,
        mech: falling ? 'Menos sesiones o contactos con la misma conversión reduce pedidos.' : 'Más sesiones o contactos con la misma conversión aumenta pedidos.',
        validate: (s) => [`Revisar inversión, posicionamiento y disponibilidad de ${s.label}.`, 'Comparar contra la estacionalidad del año anterior en las mismas fechas.'],
        generic: falling ? 'Llegó menos volumen del esperado y el origen todavía no está localizado.' : 'Llegó más volumen del esperado y el origen todavía no está localizado.',
        genericValidate: ['Revisar el volumen por fuente o campaña.', 'Cargar segmentos por fuente o dispositivo para localizarlo.']
      },
      aov: {
        local: (s) => `Un ticket ${falling ? 'menor' : 'mayor'} en ${s.dimensionLabel.toLowerCase()} ${s.label} podría explicar parte de la ${move} del AOV.`,
        mech: falling ? 'Pedidos de menor valor reducen la venta con los mismos pedidos.' : 'Pedidos de mayor valor aumentan la venta con los mismos pedidos.',
        validate: (s) => [`Revisar mezcla de productos, precios y descuentos en ${s.label}.`, 'Revisar artículos por pedido del segmento.'],
        generic: falling ? 'El ticket promedio bajó; falta localizar si es por mezcla, precio, descuentos o artículos por pedido.' : 'El ticket promedio subió; falta localizar si es por mezcla, precio o artículos por pedido.',
        genericValidate: ['Revisar mezcla por categoría y precios promedio.', 'Cargar segmentos por categoría o artículos por pedido.']
      }
    };

    // 1. Drivers que empujan en la dirección de la brecha (negativos si cae, positivos si sube)
    const pushing = level1.drivers.filter((d) => fin(d.contribution) && (falling ? d.contribution < 0 : d.contribution > 0))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    pushing.forEach((d) => {
      const t = TEMPLATES[d.driver];
      const l1sig = signals.find((s) => s.level === 1 && s.metric === d.driver);
      const local = segSignals(d.driver).slice(0, 2);
      if (local.length) {
        local.forEach((s) => add({
          driver: d.driver, evidenceLevel: 'localized', hypothesis: t.local(s), priority: maxPriority([s, ...(l1sig ? [l1sig] : [])]),
          evidence: [l1sig ? l1sig.evidence : `${d.label}: contribución ${FP.format.currency(d.contribution, 0)}.`, s.evidence],
          mechanism: t.mech, validationNeeded: t.validate(s), relatedSignals: [...(l1sig ? [l1sig.id] : []), s.id] }));
      } else if (l1sig) {
        add({ driver: d.driver, evidenceLevel: 'general', hypothesis: t.generic, priority: l1sig.relevance.priority,
          evidence: [l1sig.evidence], mechanism: t.mech, validationNeeded: t.genericValidate, relatedSignals: [l1sig.id] });
      }
    });

    // 2. Artículos por pedido (solo si hay dato)
    const ipo = signals.filter((s) => s.metric === 'itemsPerOrder' && s.direction === wantDir && s.relevance.priority !== 'low').slice(0, 1);
    ipo.forEach((s) => add({ driver: 'aov', evidenceLevel: 'localized',
      hypothesis: `Canastas ${falling ? 'más pequeñas' : 'más grandes'} (${lower(s.metricLabel)} en ${s.label}) podrían estar asociadas al cambio del AOV.`,
      priority: s.relevance.priority, evidence: [s.evidence], mechanism: 'Menos artículos por pedido reduce el ticket si el precio por artículo no cambia.',
      validationNeeded: ['Revisar artículos por pedido por categoría.', 'Revisar cambios en promociones de volumen o umbrales de envío.'], relatedSignals: [s.id] }));

    // 3. Señales secundarias de clientes (no sustituyen al driver principal)
    const cust = signals.filter((s) => ['newCustomers', 'returningCustomers', 'customers'].includes(s.metric) && s.direction === wantDir &&
        (s.relevance.priority !== 'low' || Math.abs(s.deltaPct || 0) >= 0.1))
      .concat(signals.filter((s) => s.dimension === 'customer_type' && s.metric === 'revenue' && s.direction === wantDir && s.relevance.priority !== 'low'))
      .slice(0, 1);
    cust.forEach((s) => add({ driver: null, evidenceLevel: 'secondary',
      hypothesis: `Señal adicional: ${lower(s.metricLabel)} en ${s.label} ${falling ? 'bajó' : 'subió'}. Su relación con la brecha requiere análisis; no reemplaza al driver principal.`,
      priority: s.relevance.priority, evidence: [s.evidence], mechanism: 'Cambios en la base de clientes pueden mover volumen, conversión o ticket.',
      validationNeeded: ['Revisar adquisición y retención del segmento en esas fechas.', 'Cruzar con el driver principal antes de concluir.'], relatedSignals: [s.id] }));

    // 3b. Señales en sentido contrario a la brecha: no se ocultan aunque no sean el driver principal
    const opposite = falling ? 'improvement' : 'deterioration';
    signals.filter((s) => s.level === 2 && s.kind === 'segment_change' && s.direction === opposite && LOCALIZING(s) &&
      s.relevance.priority === 'high' && ['conversionRate', 'aov', 'trafficVolume', 'newCustomers', 'itemsPerOrder'].includes(s.metric))
      .filter((s) => falling ? false : true)
      .slice(0, 2).forEach((s) => add({ driver: null, evidenceLevel: 'counter_signal',
        hypothesis: `Aunque el total ${falling ? 'bajó' : 'subió'}, ${lower(s.metricLabel)} en ${s.dimensionLabel.toLowerCase()} ${s.label} ${s.direction === 'deterioration' ? 'empeoró' : 'mejoró'} (${FP.format.signedPercent(s.deltaPct, 1)}): señal a vigilar.`,
        priority: 'medium', evidence: [s.evidence], mechanism: 'Un deterioro localizado puede quedar compensado en el total por mejoras en otros segmentos.',
        validationNeeded: [`Revisar ${s.label} por separado antes de que el efecto crezca.`], relatedSignals: [s.id] }));

    // 4. Eventos y cambios de mezcla relevantes
    signals.filter((s) => s.dimension === 'dayType' && s.value !== 'Regular' && s.metric === 'revenue' && s.relevance.priority !== 'low').slice(0, 1).forEach((s) => add({
      driver: null, evidenceLevel: 'localized',
      hypothesis: `El periodo de ${s.label} tuvo un desempeño distinto a la referencia (${FP.format.signedPercent(s.deltaPct, 1)}).`,
      priority: s.relevance.priority, evidence: [s.evidence], mechanism: 'Un evento con desempeño distinto al esperado mueve la venta del periodo.',
      validationNeeded: ['Comparar mecánica, fechas y cobertura del evento contra la referencia.'], relatedSignals: [s.id] }));
    const rateDown = pushing.some((d) => d.driver === 'conversionRate' || d.driver === 'aov');
    if (rateDown) signals.filter((s) => s.kind === 'mix_shift' && s.relevance.priority !== 'low').slice(0, 1).forEach((s) => add({
      driver: null, evidenceLevel: 'localized',
      hypothesis: `El cambio de mezcla en ${s.dimensionLabel.toLowerCase()} (${s.label}) podría estar moviendo el CR o el AOV total aunque cada segmento no cambie.`,
      priority: s.relevance.priority, evidence: [s.evidence], mechanism: 'Si crece el peso de un segmento con menor conversión o ticket, el total baja.',
      validationNeeded: ['Comparar el efecto mezcla contra el efecto tasa en el árbol de drivers.'], relatedSignals: [s.id] }));

    // 5. Datos atípicos: validar antes de interpretar
    signals.filter((s) => s.kind === 'anomaly').slice(0, 2).forEach((s) => add({
      driver: null, evidenceLevel: 'data_quality', hypothesis: `El dato de ${s.label} podría ser atípico o un error de carga.`,
      priority: s.relevance.priority, evidence: [s.evidence], mechanism: 'Un valor extremo puede distorsionar la brecha y los drivers.',
      validationNeeded: ['Verificar el dato en la fuente antes de interpretarlo.'], relatedSignals: [s.id] }));

    return out.sort((a, b) => RANK[b.priority] - RANK[a.priority]).slice(0, 8).map((h, i) => ({ ...h, id: `h${i + 1}` }));
  }

  FP.hypothesisEngine = { generateHypotheses };
})(typeof window !== 'undefined' ? window : globalThis);
