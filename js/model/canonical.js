/**
 * canonical.js — Fase B · modelo canónico extensible, registro de perfiles de dataset y detección determinística.
 *
 * Decisión de arquitectura (Fase 0): el contrato interno de la app NO se renombra (los 7 exports y el paquete dependen de él).
 * Este módulo es una CAPA DE VOCABULARIO: cada campo canónico (snake_case del mapa maestro) dice a qué campo interno corresponde
 * (`app`), y se puede ampliar sin tocar los módulos existentes. Convenciones:
 *   - conversion_rate es PROPORCIÓN 0–1 (la UI la muestra como %); aov y montos en la moneda del archivo (sin conversión).
 *   - sessions ↔ trafficVolume: en Ecommerce y App son sesiones; en WhatsApp y Llamadas el volumen son contactos.
 *   - users / new_users NO son sumables entre filas (GA4): additive:false; el traductor de GA4 los excluye a propósito.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});
  const C = () => FP.config;

  const F = (name, o) => ({ name, type: 'number', role: 'metric', required: false, nullable: true, unit: null, semanticGroup: null,
    additive: true, allowedDerivations: [], validationProfile: null, app: null, synonyms: [], ...o });
  const D = (name, group, o = {}) => F(name, { type: 'string', role: 'dimension', semanticGroup: group, additive: null, validationProfile: 'text', ...o });

  /** Campos canónicos (grupos A–E del documento de la Fase B, más los que la app ya usa). */
  const FIELDS = [
    // A · tráfico y adquisición
    F('date', { type: 'date', role: 'time', semanticGroup: 'time', additive: null, validationProfile: 'date', app: 'date', synonyms: ['fecha', 'date', 'dia', 'day'] }),
    D('channel', 'acquisition', { app: 'channel', synonyms: ['canal', 'channel', 'canal_de_venta'] }),
    D('platform', 'acquisition', { synonyms: ['plataforma', 'platform'] }),
    D('source', 'acquisition', { app: 'segment:source', synonyms: ['fuente', 'source', 'fuente_de_la_sesion', 'session_source'] }),
    D('medium', 'acquisition', { app: 'segment:medium', synonyms: ['medio', 'medium', 'medio_de_la_sesion', 'session_medium'] }),
    D('source_medium', 'acquisition', { synonyms: ['fuente/medio_de_la_sesion', 'fuente_medio', 'session_source/medium', 'source/medium', 'fuente/medio'] }),
    D('campaign', 'acquisition', { app: 'segment:campaign', synonyms: ['campana', 'campaign', 'campana_de_la_sesion', 'session_campaign'] }),
    D('landing_page', 'acquisition', { app: 'segment:landing', synonyms: ['landing', 'landing_page', 'pagina_de_destino', 'pagina_de_destino_y_cadena_de_consulta', 'pagina_de_destino_+_cadena_de_consulta', 'landing_page_+_query_string'] }),
    D('device', 'acquisition', { app: 'segment:device', synonyms: ['dispositivo', 'device', 'categoria_de_dispositivo', 'device_category'] }),
    D('country', 'geography', { synonyms: ['pais', 'country'] }),
    D('region', 'geography', { app: 'product:region', synonyms: ['region', 'estado', 'state', 'provincia'] }),
    D('city', 'geography', { app: 'product:city', synonyms: ['ciudad', 'city', 'municipio'] }),
    F('sessions', { unit: 'count', semanticGroup: 'traffic', validationProfile: 'count', app: 'trafficVolume', synonyms: ['sesiones', 'sessions', 'traffic_volume', 'trafico', 'visitas', 'volumen'] }),
    F('users', { unit: 'count', semanticGroup: 'traffic', additive: false, validationProfile: 'count', synonyms: ['usuarios', 'users', 'total_de_usuarios', 'total_users', 'usuarios_activos'] }),
    F('new_users', { unit: 'count', semanticGroup: 'traffic', additive: false, validationProfile: 'count', synonyms: ['usuarios_nuevos', 'new_users'] }),
    // B · conversión y ventas
    F('orders', { unit: 'count', semanticGroup: 'sales', validationProfile: 'count', app: 'orders', synonyms: ['pedidos', 'orders', 'ordenes', 'compras', 'compras_en_comercio_electronico', 'ecommerce_purchases'] }),
    F('transactions', { unit: 'count', semanticGroup: 'sales', validationProfile: 'count', synonyms: ['transacciones', 'transactions'] }),
    F('units', { unit: 'count', semanticGroup: 'sales', validationProfile: 'count', app: 'product:units', synonyms: ['unidades', 'units', 'piezas', 'cantidad', 'quantity'] }),
    F('revenue', { unit: 'currency', semanticGroup: 'sales', validationProfile: 'currency', app: 'revenue', synonyms: ['venta', 'ventas', 'revenue', 'sales', 'importe', 'monto', 'ingresos', 'ingresos_por_compras', 'ingresos_derivados_de_las_compras', 'purchase_revenue'] }),
    F('target_revenue', { unit: 'currency', semanticGroup: 'plan', validationProfile: 'currency', app: 'plan:revenue', synonyms: ['meta_venta', 'meta', 'plan_venta', 'target', 'presupuesto', 'budget'] }),
    F('conversion_rate', { unit: 'ratio', semanticGroup: 'sales', additive: false, validationProfile: 'ratio', app: 'conversionRate', allowedDerivations: ['conversion_rate'], synonyms: ['conversion_rate', 'cr', 'tasa_de_conversion', 'conversion'] }),
    F('aov', { unit: 'currency', semanticGroup: 'sales', additive: false, validationProfile: 'currency', app: 'aov', allowedDerivations: ['aov'], synonyms: ['aov', 'ticket', 'ticket_promedio', 'average_order_value'] }),
    D('currency', 'sales', { synonyms: ['moneda', 'currency', 'divisa'] }),
    F('cost', { unit: 'currency', semanticGroup: 'marketing', validationProfile: 'currency', synonyms: ['costo', 'cost', 'gasto', 'inversion', 'spend'] }),
    // C · productos
    D('product_id', 'product', { role: 'id', app: 'product:sku', synonyms: ['sku', 'product_id', 'id_producto', 'id_del_articulo', 'item_id', 'codigo_producto'] }),
    D('product_name', 'product', { app: 'product:product', synonyms: ['producto', 'product_name', 'nombre_producto', 'nombre_del_articulo', 'item_name'] }),
    D('category', 'product', { app: 'product:category', synonyms: ['categoria', 'category', 'item_category'] }),
    D('brand', 'product', { app: 'product:brand', synonyms: ['marca', 'brand', 'item_brand'] }),
    F('product_revenue', { unit: 'currency', semanticGroup: 'product', validationProfile: 'currency', synonyms: ['venta_producto', 'item_revenue', 'ingresos_del_articulo'] }),
    F('product_orders', { unit: 'count', semanticGroup: 'product', validationProfile: 'count', synonyms: ['pedidos_producto'] }),
    F('item_views', { unit: 'count', semanticGroup: 'product', validationProfile: 'count', app: 'product:views', synonyms: ['vistas_ficha', 'vistas', 'item_views', 'articulos_vistos', 'view_item'] }),
    F('add_to_cart', { unit: 'count', semanticGroup: 'product', validationProfile: 'count', app: 'product:addToCart', synonyms: ['agregados_carrito', 'add_to_cart', 'articulos_agregados_al_carrito'] }),
    F('checkout', { unit: 'count', semanticGroup: 'product', validationProfile: 'count', app: 'product:beginCheckout', synonyms: ['inicio_checkout', 'begin_checkout', 'articulos_en_el_checkout'] }),
    F('item_purchases', { unit: 'count', semanticGroup: 'product', validationProfile: 'count', synonyms: ['compras_ga4', 'item_purchases', 'articulos_comprados'] }),
    // D · clientes
    D('customer_id', 'customer', { role: 'id', synonyms: ['customer_id', 'id_cliente', 'cliente_id', 'client_id'] }),
    D('customer_type', 'customer', { app: 'segment:customer_type', synonyms: ['tipo_cliente', 'customer_type', 'nuevo/recurrente', 'new/returning'] }),
    F('new_customer', { unit: 'count', semanticGroup: 'customer', app: 'extra:newCustomers', synonyms: ['clientes_nuevos', 'new_customers'] }),
    F('returning_customer', { unit: 'count', semanticGroup: 'customer', app: 'extra:returningCustomers', synonyms: ['clientes_recurrentes', 'returning_customers'] }),
    D('order_id', 'sales', { role: 'id', synonyms: ['order_id', 'id_pedido', 'pedido_id', 'transaction_id', 'id_transaccion', 'folio'] }),
    // E · tiempo y procedencia
    F('period_start', { type: 'date', role: 'meta', semanticGroup: 'provenance', additive: null, synonyms: ['inicio_periodo', 'period_start'] }),
    F('period_end', { type: 'date', role: 'meta', semanticGroup: 'provenance', additive: null, synonyms: ['fin_periodo', 'period_end'] }),
    D('source_id', 'provenance', { role: 'meta' }), D('source_type', 'provenance', { role: 'meta' }), D('dataset_type', 'provenance', { role: 'meta' }),
    F('imported_at', { type: 'datetime', role: 'meta', semanticGroup: 'provenance', additive: null }),
    F('retrieved_at', { type: 'datetime', role: 'meta', semanticGroup: 'provenance', additive: null })
  ];
  const BY_NAME = new Map(FIELDS.map((f) => [f.name, f]));

  /** Perfiles de dataset: identificadores, esperados, opcionales, métricas/dimensiones compatibles, derivaciones y mínimos. */
  const P = (id, label, o) => ({ id, label, identifiers: [], expected: [], optional: [], metrics: [], dimensions: [], derivations: [], consistency: [], minimum: [], appTarget: null, ...o });
  const PROFILES = [
    P('ga4_segments', 'GA4 · tráfico y conversión por dimensión', { identifiers: ['date', 'platform', 'sessions'], expected: ['orders', 'revenue', 'device', 'source_medium', 'campaign', 'landing_page', 'customer_type'], optional: ['users', 'new_users'],
      metrics: ['sessions', 'orders', 'revenue'], dimensions: ['device', 'source', 'medium', 'campaign', 'landing_page', 'customer_type'], derivations: ['conversion_rate', 'aov'], minimum: ['date', 'sessions'], appTarget: 'segments' }),
    P('ga4_traffic', 'GA4 · tráfico', { identifiers: ['date', 'sessions'], expected: ['users', 'new_users'], optional: ['device', 'source', 'medium', 'campaign', 'country', 'region', 'city', 'orders', 'revenue', 'platform'],
      metrics: ['sessions', 'users', 'new_users'], dimensions: ['device', 'source', 'medium', 'campaign', 'country', 'region', 'city'], derivations: ['conversion_rate'], minimum: ['date', 'sessions'], appTarget: 'segments' }),
    P('ecommerce_sales', 'Venta diaria por canal', { identifiers: ['date', 'channel', 'revenue'], expected: ['orders', 'sessions'], optional: ['conversion_rate', 'aov'],
      metrics: ['revenue', 'orders', 'sessions'], dimensions: ['channel'], derivations: ['conversion_rate', 'aov'], consistency: ['orders<=sessions', 'aov=revenue/orders'], minimum: ['date', 'channel', 'revenue'], appTarget: 'actual' }),
    P('sales_plan', 'Plan o meta por día y canal', { identifiers: ['date', 'channel', 'target_revenue'], expected: [], optional: [],
      metrics: ['target_revenue'], dimensions: ['channel'], minimum: ['date', 'channel', 'target_revenue'], appTarget: 'plan' }),
    P('segments_file', 'Segmentos (formato propio)', { identifiers: ['date', 'channel', 'dimension_col', 'segment_col'], expected: ['revenue', 'orders', 'sessions'], optional: ['new_customer', 'returning_customer'],
      metrics: ['revenue', 'orders', 'sessions'], derivations: ['conversion_rate', 'aov'], minimum: ['date', 'dimension_col', 'segment_col'], appTarget: 'segments' }),
    P('product_sales', 'Venta por producto', { identifiers: ['date', 'product_id'], expected: ['product_name', 'category', 'revenue', 'units', 'orders'], optional: ['brand', 'region', 'city', 'channel'],
      metrics: ['revenue', 'units', 'orders'], dimensions: ['category', 'brand', 'region', 'city', 'channel'], derivations: ['aov'], minimum: ['date', 'product_id'], appTarget: 'products' }),
    P('product_funnel', 'Embudo por producto (GA4 artículos)', { identifiers: ['date', 'product_id', 'item_views'], expected: ['add_to_cart', 'checkout', 'item_purchases'], optional: ['product_name', 'platform', 'channel'],
      metrics: ['item_views', 'add_to_cart', 'checkout', 'item_purchases'], dimensions: ['product_id'], minimum: ['date', 'product_id'], appTarget: 'products' }),
    P('orders', 'Pedidos / transacciones', { identifiers: ['order_id', 'revenue'], expected: ['date', 'customer_id'], optional: ['product_id', 'channel', 'units'],
      metrics: ['revenue', 'units'], dimensions: ['channel'], derivations: ['aov'], minimum: ['order_id'] }),
    P('customers', 'Clientes', { identifiers: ['customer_id'], expected: ['customer_type'], optional: ['new_customer', 'returning_customer', 'date'], minimum: ['customer_id'] }),
    P('marketing_performance', 'Desempeño de marketing', { identifiers: ['date', 'campaign', 'cost'], expected: ['sessions', 'orders', 'revenue'], optional: ['source', 'medium'], minimum: ['date', 'campaign'] }),
    P('financial_summary', 'Resumen financiero', { identifiers: ['revenue', 'cost'], expected: ['period_start', 'period_end', 'date'], optional: [], minimum: ['revenue'] }),
    P('generic_tabular', 'Tabla genérica', { minimum: [] })
  ];
  const PROFILE = new Map(PROFILES.map((p) => [p.id, p]));

  const key = (s) => FP.normalize && FP.normalize.simplify ? FP.normalize.simplify(String(s)).replace(/\s+/g, '_') : String(s).toLowerCase().trim().replace(/\s+/g, '_');
  /** Encabezado → campo canónico (por nombre, sinónimos del modelo y sinónimos ya configurados en la carga). */
  function canonicalOf(header) {
    const k = key(header).replace(/_+/g, '_');
    if (k === 'dimension' || k === 'dimension_col') return 'dimension_col';
    if (k === 'segmento' || k === 'segment') return 'segment_col';
    for (const f of FIELDS) if (f.name === k || f.synonyms.some((s) => key(s) === k)) return f.name;
    const imp = FP.importer && FP.importer.suggestField ? FP.importer.suggestField(header) : null;   // reusa los sinónimos de la carga
    if (imp) { const f = FIELDS.find((x) => x.app === imp); if (f) return f.name; if (imp === 'dimension') return 'dimension_col'; if (imp === 'segment') return 'segment_col'; }
    return null;
  }

  /**
   * Detección determinística del tipo de dataset. Puntaje = (2·identificadores + esperados) / máximo posible, + 0.05 por opcional presente
   * (los opcionales suman, nunca restan; tope 1).
   * Si el segundo perfil queda a menos de 0.10, la clasificación es ambigua: se baja la confianza y se listan alternativas.
   * Por debajo de 0.40 el resultado es «generic_tabular» (no bloquea la carga).
   */
  function detectDataset(headers, { expectedTarget = null } = {}) {
    const mapped = new Map(); const unknown = [];
    headers.forEach((h) => { const c = canonicalOf(h); if (c) mapped.set(c, h); else unknown.push(h); });
    const has = (n) => mapped.has(n) || (n === 'source_medium' && (mapped.has('source') || mapped.has('medium')));
    const scored = PROFILES.filter((p) => p.id !== 'generic_tabular').map((p) => {
      const ids = p.identifiers.filter(has), exp = p.expected.filter(has), opt = p.optional.filter(has);
      const max = 2 * p.identifiers.length + p.expected.length;
      const raw = Math.min(1, (max ? (2 * ids.length + exp.length) / max : 0) + 0.05 * opt.length);
      const score = ids.length === p.identifiers.length ? raw : raw * 0.6;   // sin todos los identificadores, el perfil pierde peso
      return { id: p.id, score: Math.round(score * 100) / 100, matched: [...ids, ...exp, ...opt], missing: [...p.identifiers, ...p.expected].filter((n) => !has(n)) };
    }).sort((a, b) => b.score - a.score);
    const top = scored[0];
    if (!top || top.score < 0.4) {
      return { datasetType: 'generic_tabular', label: PROFILE.get('generic_tabular').label, confidence: top ? Math.round((1 - top.score) * 100) / 100 : 1,
        matchedFields: [...mapped.keys()], missingRecommendedFields: [], alternatives: scored.slice(0, 2).map((x) => ({ datasetType: x.id, confidence: x.score })),
        unknownHeaders: unknown, detectionMethod: 'deterministic', ambiguous: false, targetMismatch: false };
    }
    // empate o casi empate: la confianza del elegido y de las alternativas baja igual (×0.75), así ninguna parece más segura que otra
    const alternatives = scored.slice(1).filter((x) => x.score >= 0.4 && top.score - x.score < 0.1).map((x) => ({ datasetType: x.id, confidence: Math.round(x.score * 0.75 * 100) / 100 }));
    const confidence = Math.round((alternatives.length ? top.score * 0.75 : top.score) * 100) / 100;
    const target = PROFILE.get(top.id).appTarget;
    return { datasetType: top.id, label: PROFILE.get(top.id).label, confidence, matchedFields: top.matched, missingRecommendedFields: top.missing,
      alternatives, unknownHeaders: unknown, detectionMethod: 'deterministic', ambiguous: alternatives.length > 0,
      targetMismatch: Boolean(expectedTarget && target && expectedTarget !== target && !(expectedTarget === 'historical' && target === 'actual')), expectedTarget, suggestedTarget: target };
  }

  /** Procedencia de una celda de la app según el vocabulario del mapa: original, normalized, derived, quarantined o unavailable. */
  function provenanceOf(cell) {
    if (!cell) return { type: 'unavailable' };
    if (cell.source === 'quarantined') return { type: 'quarantined', rule: cell.rule || null, raw: cell.raw };
    if (cell.source === 'calculated') return { type: 'derived', note: cell.note || null };
    if (cell.source === 'observed') {
      const raw = cell.raw === undefined || cell.raw === null ? null : String(cell.raw).trim();
      return { type: raw !== null && raw !== String(cell.value) ? 'normalized' : 'original', raw };
    }
    return { type: 'unavailable', reason: cell.source };
  }

  FP.canonical = { FIELDS, field: (n) => BY_NAME.get(n) || null, PROFILES, profile: (id) => PROFILE.get(id) || null, canonicalOf, detectDataset, provenanceOf,
    appToCanonical: (appKey) => (FIELDS.find((f) => f.app === appKey) || {}).name || null };
})(typeof window !== 'undefined' ? window : globalThis);
