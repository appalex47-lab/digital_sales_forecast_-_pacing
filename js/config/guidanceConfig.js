/**
 * guidanceConfig.js — Contenidos de la capa de guía (Fase 7).
 *
 * Solo texto y estructura: grupos de navegación, metadatos de cada vista, entradas de ayuda
 * y glosario, convenciones de estados, explicadores por vista, recorrido guiado y criterios de
 * detalle para los modos Ejecutivo / Analista. No contiene lógica de negocio ni cálculos.
 *
 * Entrada de ayuda: { id, title, shortDescription, detailedDescription, howToRead, formula,
 *                     interpretation, caveats, nextStep, state?,
 *                     purpose, whenToUse, decision, related[]  ← Fase 9.1 (pedagogía; mismos objetos, sin sistema paralelo) }
 *
 * Correspondencia con las 8 preguntas pedagógicas (Fase 9.1):
 *   ¿Qué es? shortDescription · ¿Para qué sirve? purpose · ¿Cómo funciona? detailedDescription ·
 *   ¿Cómo se calcula? formula · ¿Qué significa? interpretation/howToRead · ¿Cuándo usarlo? whenToUse ·
 *   ¿Qué NO significa? caveats · ¿Qué decisión ayuda a tomar? decision
 * Los textos pueden usar {{sale}}, {{order}}, {{customer}}, {{product}}, {{location}}: se resuelven con la
 * terminología del Business Context (Fase 8.2) al mostrarse.
 */
(function (root) {
  'use strict';
  const FP = (root.FP = root.FP || {});

  /* ---------- Navegación agrupada ---------- */

  const GROUPS = [
    { id: 'inicio', label: 'Inicio', views: ['inicio'] },
    { id: 'planear', label: 'Planear', verb: 'Planea',
      description: 'Describe el negocio, prepara datos, metas, estacionalidad y el plan distribuido.',
      views: ['negocio', 'carga', 'calidad', 'datos', 'resumen', 'estacionalidad', 'plan', 'configuracion'] },
    { id: 'monitorear', label: 'Monitorear', verb: 'Compara y proyecta',
      description: 'Plan contra actual, gap, cumplimiento, forecast y alertas.', views: ['pacing'] },
    { id: 'diagnosticar', label: 'Diagnosticar', verb: 'Diagnostica',
      description: 'Qué driver explica la brecha, dónde ocurre y qué hipótesis investigar.', views: ['diagnostico', 'producto'] },
    { id: 'recuperar', label: 'Recuperar', verb: 'Simula y actúa',
      description: 'Reforecast, escenarios y plan de acción.', views: ['reforecast', 'recovery'] },
    { id: 'medir', label: 'Medir y aprender', verb: 'Mide',
      description: 'Seguimiento, baseline vs escenario vs observado, trazabilidad y aprendizajes.', views: ['medir'] }
  ];

  /** Metadatos de vista: título, grupo, propósito, entradas de ayuda relacionadas y requisitos. */
  const VIEWS = {
    inicio: { title: 'Inicio', group: 'inicio', purpose: 'Centro de control: qué está pasando, contra qué se compara y qué sigue.',
      help: ['plan', 'actual', 'forecast', 'gap', 'forecastGap', 'recoveryPressure'] },
    carga: { title: 'Carga de datos', group: 'planear', purpose: 'Importar histórico, plan, venta real y segmentos. Nada se guarda sin revisión.',
      help: ['historico', 'actual', 'plan', 'segmentos'] },
    calidad: { title: 'Calidad de datos', group: 'planear', purpose: 'Qué tan completos y confiables son los datos cargados.',
      help: ['dataQuality', 'cobertura'] },
    datos: { title: 'Datos normalizados', group: 'planear', purpose: 'El modelo canónico con el origen de cada métrica (cargada, calculada, faltante, inválida).',
      help: ['observado', 'calculado'] },
    negocio: { title: 'Negocio', group: 'planear', purpose: 'Qué tipo de negocio estás analizando y cómo funciona: contexto que la herramienta usa para interpretar.',
      help: ['businessContext', 'terminologia', 'factoresNegocio'] },
    resumen: { title: 'Metas y motor', group: 'planear', purpose: 'Meta anual por canal, validación de identidades y pruebas del motor.',
      help: ['meta', 'plan', 'revenue'] },
    estacionalidad: { title: 'Estacionalidad', group: 'planear', purpose: 'Patrones históricos por mes, día de la semana, día del mes y eventos.',
      help: ['estacionalidad', 'confianza'] },
    plan: { title: 'Plan', group: 'planear', purpose: 'La meta repartida en meses, semanas y días, con cierre exacto.',
      help: ['meta', 'plan', 'planOriginal'] },
    configuracion: { title: 'Configuración de planeación', group: 'planear', purpose: 'Método, periodo histórico, suavizado y comparación de métodos.',
      help: ['estacionalidad', 'confianza'] },
    pacing: { title: 'Pacing & Forecast', group: 'monitorear', purpose: 'Cómo vamos contra el plan y dónde terminaríamos.',
      help: ['pacing', 'gap', 'cumplimiento', 'forecast', 'forecastGap', 'performanceIndex'] },
    diagnostico: { title: '¿Por qué? Diagnóstico', group: 'diagnosticar', purpose: 'Qué variable matemática explica la brecha, dónde ocurre y qué investigar.',
      help: ['hecho', 'driver', 'senal', 'hipotesis', 'atribucion'] },
    producto: { title: 'Categoría → Producto', group: 'diagnosticar', purpose: 'Qué categorías, productos y SKU explican el crecimiento, el deterioro o la brecha.',
      help: ['participacion', 'contribucion', 'observado', 'calculado', 'senal'] },
    reforecast: { title: 'Recovery & Reforecast', group: 'recuperar', purpose: 'Qué tendría que venderse en los días restantes para conservar la meta original.',
      help: ['reforecast', 'forecast', 'recoveryPressure', 'surplus'] },
    recovery: { title: 'Recovery Center', group: 'recuperar', purpose: 'Hipótesis → escenario → acción → impacto simulado → resultado observado.',
      help: ['hipotesis', 'escenario', 'accion', 'impactoEsperado', 'impactoObservado'] },
    medir: { title: 'Seguimiento y aprendizaje', group: 'medir', purpose: 'Acciones, mediciones y la cadena completa de cada una.',
      help: ['baseline', 'impactoEsperado', 'impactoObservado', 'trazabilidad'] },
    ayuda: { title: '¿Cómo funciona?', group: 'ayuda', purpose: 'Cómo usar la herramienta, cómo leer un diagnóstico y glosario.', help: [] }
  };

  /* ---------- Convenciones de estados (nunca equivalentes) ---------- */

  const STATES = {
    plan: { label: 'Plan', short: 'Lo que originalmente se esperaba alcanzar.' },
    actual: { label: 'Actual', short: 'Lo que realmente ocurrió.' },
    forecast: { label: 'Forecast', short: 'Proyección de cierre basada en la información disponible.' },
    reforecast: { label: 'Reforecast', short: 'Distribución requerida de lo que falta para conservar el objetivo original.' },
    scenario: { label: 'Escenario', short: 'Simulación hipotética de qué ocurriría si cambian determinadas variables.' },
    observed: { label: 'Observado', short: 'Resultado posteriormente registrado.' }
  };

  /* ---------- Ayuda y glosario ---------- */

  const e = (id, title, shortDescription, o = {}) => ({ id, title, shortDescription, detailedDescription: '', howToRead: '',
    formula: '', interpretation: '', caveats: '', nextStep: '', purpose: '', whenToUse: '', decision: '', related: [], ...o });

  const HELP = [
    e('businessContext', 'Contexto del negocio', 'Descripción estructurada del negocio: qué vende, cómo vende, cómo compra su cliente, cómo se organiza y qué términos usa.',
      { howToRead: 'Alimenta la configuración al arrancar la app (moneda, nombre, terminología). Es la única fuente de esos datos.',
        caveats: 'No cambia canales, métricas, fórmulas, forecast, diagnóstico ni datos cargados.', glossary: true }),
    e('terminologia', 'Terminología', 'Cómo llama el negocio a la venta, al pedido, al cliente, al producto y a la ubicación.',
      { caveats: 'Por ahora es contexto; los textos de la app no se reemplazan todavía.' }),
    e('factoresNegocio', 'Factores relevantes', 'Aspectos del negocio que conviene revisar al interpretar resultados (precio, inventario, promociones…).',
      { caveats: 'Son contexto, no causas. Un factor marcado no explica un resultado por sí mismo.', glossary: true }),
    e('participacion', 'Participación', 'Qué proporción representa una categoría, producto o SKU del total del periodo.', { formula: 'Participación = venta del grupo ÷ venta total',
      howToRead: 'Dice cuánto pesa. Un grupo grande puede no explicar ningún cambio.', caveats: 'No es lo mismo que contribución.', glossary: true }),
    e('contribucion', 'Contribución', 'Cuánto aporta un grupo a la variación total contra la referencia.', { formula: 'Contribución = Δ venta del grupo ÷ Δ venta total',
      howToRead: 'Dice cuánto explica del cambio. Puede pasar de 100 % cuando otros grupos compensan en sentido contrario.',
      caveats: 'Es una atribución matemática, no una causa.', glossary: true }),
    e('sku', 'SKU', 'Código único de un producto en una presentación específica. La unidad mínima de análisis es día × canal × SKU.', { glossary: true }),
    e('units', 'Unidades', 'Piezas vendidas (puede ser mayor que los pedidos si un pedido lleva varias piezas).', { glossary: true }),
    e('views', 'Vistas de ficha', 'Vistas de la ficha del producto en GA4 (item_views). No existe en canales sin ficha web, como WhatsApp o Llamadas.', { glossary: true }),
    e('funnel', 'Funnel de producto', 'Vista de ficha → agregado al carrito → inicio de checkout → compra, por artículo en GA4. Ocurre antes de elegir sucursal o tipo de entrega.', { glossary: true }),
    e('cartRate', 'Vista → carrito', 'Agregados al carrito ÷ vistas de ficha.', { formula: 'agregados al carrito ÷ vistas', glossary: true }),
    e('checkoutRate', 'Carrito → checkout', 'Inicios de checkout ÷ agregados al carrito.', { formula: 'inicios de checkout ÷ agregados al carrito', glossary: true }),
    e('purchaseRate', 'Checkout → compra', 'Compras de GA4 ÷ inicios de checkout.', { formula: 'compras GA4 ÷ inicios de checkout', glossary: true }),
    e('trackingCoverage', 'Cobertura de tracking', 'Compras registradas en GA4 ÷ unidades realmente vendidas. Sirve para detectar pérdida de medición, no para medir venta.',
      { formula: 'compras GA4 ÷ unidades reales', caveats: 'Un valor bajo sugiere que GA4 no está registrando todas las compras, no que hubo menos venta.', glossary: true }),
    e('estadoProducto', 'Estado (producto)', 'Estado de la República donde se fincó el pedido, definido en el checkout.', { glossary: true }),
    e('sucursal', 'Sucursal', 'Sucursal donde se fincó el pedido, sea para recolección o como origen del envío a domicilio.', { glossary: true }),
    e('tipoEntrega', 'Tipo de entrega', 'Envío a domicilio o recolección en sucursal. Se define en el checkout, después de la vista de ficha.',
      { caveats: 'Por eso el CR y el funnel no están disponibles al ver por estado, sucursal o tipo de entrega.', glossary: true }),
    e('revenue', 'Venta', 'Importe vendido en el periodo.', { formula: 'Venta = Volumen × CR × AOV = Pedidos × AOV',
      howToRead: 'Compárala siempre contra una referencia (plan, año anterior, forecast).',
      caveats: 'Una venta menor no dice por sí sola si faltó volumen, conversión o ticket: para eso está el diagnóstico.', glossary: true }),
    e('orders', 'Pedidos', 'Número de órdenes.', { formula: 'Pedidos = Volumen × CR', glossary: true,
      caveats: 'En el plan y en escenarios los pedidos se derivan; no se capturan a mano.' }),
    e('trafficVolume', 'Volumen', 'Sesiones (Ecommerce, App), mensajes o contactos (WhatsApp) o llamadas (Llamadas).',
      { formula: 'Dato cargado; en escenarios: Volumen × (1 + Δ%)', glossary: true,
        interpretation: 'Más volumen con la misma conversión y ticket produce más venta, en proporción.',
        caveats: 'El volumen de cada canal mide cosas distintas: no se comparan entre canales.' }),
    e('conversionRate', 'CR (conversión)', 'Proporción del volumen que terminó en pedido.', { formula: 'CR = Pedidos ÷ Volumen', glossary: true,
      howToRead: 'Se expresa en %. Sus cambios se leen en puntos porcentuales (pp): de 2.10 % a 2.30 % es +0.20 pp, que es +9.5 % relativo.',
      interpretation: 'Una caída del CR indica que una menor proporción del volumen terminó convirtiéndose en pedido.',
      caveats: 'No demuestra por sí sola la causa de la caída. En periodos se calcula como razón de sumas, nunca como promedio de días.' }),
    e('aov', 'AOV (ticket promedio)', 'Venta promedio por pedido.', { formula: 'AOV = Venta ÷ Pedidos', glossary: true,
      interpretation: 'Un AOV menor significa pedidos más chicos: menos artículos, mezcla distinta o precios más bajos.',
      caveats: 'No distingue entre esas explicaciones; los segmentos (categoría, items) ayudan a localizarla.' }),
    e('meta', 'Meta (Original Target)', 'La meta anual que la empresa estableció por canal.', { caveats: 'La app nunca la modifica para que "cuadre".' }),
    e('plan', 'Plan', STATES.plan.short, { state: 'plan', glossary: true,
      detailedDescription: 'La meta repartida en meses, semanas y días con los pesos de estacionalidad (Fase 2), o el plan importado.',
      caveats: 'El primer plan guardado queda congelado como Plan original; nada lo sobrescribe.' }),
    e('planOriginal', 'Plan original congelado', 'La primera versión guardada del plan distribuido.', { caveats: 'Las siguientes se guardan como revisiones.' }),
    e('actual', 'Actual', STATES.actual.short, { state: 'actual', glossary: true,
      detailedDescription: 'Venta real cargada. Solo cuenta hasta la fecha de corte; un día en curso con carga parcial no cuenta como cerrado.' }),
    e('forecast', 'Forecast', STATES.forecast.short, { state: 'forecast', glossary: true,
      detailedDescription: 'Actual acumulado + proyección de los días restantes con el método elegido (plan restante, performance acumulada, reciente o por drivers).',
      howToRead: '¿Dónde terminaríamos si continúa el comportamiento proyectado?',
      caveats: 'Forecast no es el objetivo. Es una estimación del cierre basada en la información disponible.' }),
    e('reforecast', 'Reforecast', STATES.reforecast.short, { state: 'reforecast', glossary: true,
      detailedDescription: 'Meta original − actual acumulado = pendiente; el pendiente se reparte en los días futuros con los pesos del plan.',
      howToRead: '¿Qué tendría que ocurrir en los días restantes para conservar la meta original?',
      caveats: 'No es una estimación de lo que ocurrirá: es un requerimiento. Lo esperado es el forecast.' }),
    e('gap', 'Gap', 'Diferencia entre el actual y el plan de los mismos días.', { formula: 'Gap = Actual − Plan (a la fecha)', glossary: true,
      interpretation: 'Negativo: vamos debajo del plan acumulado.', caveats: 'No es lo mismo que el gap forecast (al cierre).' }),
    e('forecastGap', 'Gap forecast', 'Diferencia esperada al cierre.', { formula: 'Gap forecast = Forecast − Meta del periodo',
      caveats: 'Depende del método de forecast elegido.' }),
    e('cumplimiento', 'Cumplimiento', 'Actual como porcentaje del plan de los mismos días.', { formula: 'Cumplimiento = Actual ÷ Plan' }),
    e('pacing', 'Pacing', 'Ritmo contra el plan: plan acumulado esperado vs actual acumulado.', { glossary: true,
      caveats: 'Usa el plan diario ponderado, no días transcurridos ÷ días totales. Un día aislado no indica una caída estructural.' }),
    e('performanceIndex', 'Performance index', 'Actual ÷ plan en una ventana (acumulado, mes, 7, 14 o 28 días).',
      { caveats: 'La app muestra acumulado y reciente juntos y no decide cuál es "correcta".' }),
    e('recoveryPressure', 'Presión de recuperación (Recovery Pressure)', 'Cuánto está el requerimiento por encima o debajo del plan de esos mismos días.',
      { formula: 'Requerido ÷ Plan de los días restantes − 1', glossary: true, interpretation: '+14 % significa que los días restantes necesitan 14 % más que su plan original.',
        caveats: 'Es descriptiva; no es una recomendación ni una probabilidad.' }),
    e('surplus', 'Surplus', 'Exceso de actual sobre la meta.', { caveats: 'No compensa el pendiente de otro canal.' }),
    e('driver', 'Driver', 'Variable matemática relacionada con el resultado (volumen, CR o AOV).', { glossary: true,
      interpretation: '"Volumen representa la mayor contribución matemática a la brecha bajo el método seleccionado".',
      caveats: 'Una gran contribución matemática no es la causa operativa.' }),
    e('atribucion', 'Atribución', 'Reparto de la brecha de venta entre volumen, CR y AOV.', { formula: 'Secuencial o Shapley; Σ contribuciones = brecha',
      caveats: 'Depende del método elegido; la app lo indica.' }),
    e('hecho', 'Hecho', 'Algo directamente observado en los datos.', { glossary: true }),
    e('senal', 'Señal', 'Comportamiento que merece investigación.', { glossary: true,
      caveats: 'No es causalidad demostrada. Su relevancia combina impacto, peso del segmento y confianza.' }),
    e('hipotesis', 'Hipótesis', 'Explicación posible que todavía requiere validación.', { glossary: true,
      caveats: 'Nunca se presenta como hecho. Sin evidencia localizada, la hipótesis es genérica y dice qué validar.' }),
    e('escenario', 'Escenario', STATES.scenario.short, { state: 'scenario', glossary: true,
      caveats: 'Este resultado es una simulación matemática. No representa una predicción ni garantiza que el cambio pueda alcanzarse.' }),
    e('accion', 'Acción', 'Algo que una persona o equipo decide hacer.', { glossary: true,
      caveats: 'Un escenario no es una acción. La acción se liga a un escenario y a una hipótesis; nada se ejecuta desde la app.' }),
    e('impactoEsperado', 'Impacto esperado', 'Resultado matemático del escenario (simulado).', { glossary: true,
      formula: 'Venta escenario − venta base; gap después = gap antes − incremento' }),
    e('impactoObservado', 'Impacto observado', 'Resultado registrado después de ejecutar una acción.', { state: 'observed', glossary: true,
      caveats: 'Se lee como "consistente / no consistente con el escenario"; nunca "la acción causó".' }),
    e('baseline', 'Baseline', 'La base contra la que se mide: el forecast de esos días al momento de simular.', { glossary: true }),
    e('trazabilidad', 'Trazabilidad', 'Recorrer plan → actual → gap → driver → señal → hipótesis → escenario → acción → medición.'),
    e('observado', 'Dato observado', 'Venía en el archivo y se pudo leer.'),
    e('calculado', 'Dato calculado', 'No venía; la app lo derivó con las fórmulas del motor.'),
    e('historico', 'Histórico', 'Venta real de periodos anteriores; alimenta la estacionalidad.'),
    e('segmentos', 'Segmentos', 'Desglose por dimensión (dispositivo, fuente, tipo de cliente…). Solo existe si se carga.'),
    e('dataQuality', 'Calidad de datos', 'Estado de los datos cargados: listos, con advertencias o no válidos.',
      { caveats: 'Un problema en una dimensión no bloquea el resto.' }),
    e('cobertura', 'Cobertura', 'Días con dato ÷ días esperados.'),
    e('estacionalidad', 'Estacionalidad', 'Patrón histórico de reparto por mes, día de la semana, día del mes y eventos.'),
    e('confianza', 'Confianza', 'Solidez de los insumos de un cálculo.', { caveats: 'No es una probabilidad de que algo ocurra ni de que una hipótesis sea cierta.' }),
    // Fase 9.1: conceptos de la metodología que no tenían entrada propia
    e('diagnostico', 'Diagnóstico', 'Proceso para entender por qué el resultado se separó de la referencia.', { glossary: true,
      detailedDescription: 'Brecha → driver matemático → descomposición por segmento → señales → hipótesis → investigación.',
      caveats: 'Diagnóstico no es "ver qué bajó": una variable que bajó no es necesariamente la que explica la brecha.' }),
    e('recovery', 'Recovery (recuperación)', 'Cálculo de qué tendría que cambiar para recuperar la meta o reducir una brecha.', { glossary: true,
      detailedDescription: 'Gap → variable objetivo → cambio requerido → escenario → acción.',
      caveats: 'Recovery no explica por qué ocurrió algo. Es una necesidad matemática, no una garantía de que el cambio sea alcanzable.' }),
    e('metodologia', 'Metodología', 'La cadena completa: meta → plan → real → pacing → forecast → diagnóstico → señales → hipótesis → recovery → escenarios → acción → observado.',
      { caveats: 'Cada paso responde una pregunta distinta; no se saltan pasos para llegar a una conclusión.' })
  ];

  /*
   * Fase 9.1 — Pedagogía de los conceptos prioritarios. Se fusiona en las mismas entradas de HELP (una sola fuente).
   * Solo agrega los campos pedagógicos; no cambia definiciones ni fórmulas existentes.
   */
  const PEDAGOGY = {
    meta: { purpose: 'Fijar el punto contra el que se mide todo lo demás.', whenToUse: 'Al inicio del año o cuando la empresa redefine objetivos.',
      decision: 'Cuánto hay que lograr por canal.', related: ['plan', 'gap', 'reforecast'], detailedDescription: 'Se captura una vez por canal y el total debe cuadrar.' },
    plan: { purpose: 'Saber cuánto debería llevarse a cada fecha, no solo al cierre.', whenToUse: 'Después de fijar la meta y antes de medir el avance.',
      decision: 'Si el ritmo de cada día o semana es razonable según la estacionalidad.', related: ['meta', 'estacionalidad', 'pacing'],
      interpretation: 'Un plan diario alto en una fecha no es un error: refleja la estacionalidad histórica.' },
    actual: { purpose: 'Registrar lo que realmente pasó para compararlo contra el plan.', whenToUse: 'Cada vez que haya nueva venta real cargada.',
      decision: 'Hasta qué fecha es confiable el análisis.', related: ['pacing', 'gap', 'dataQuality'],
      caveats: 'Un día sin real no es un día en cero: queda fuera del pacing hasta que se cargue.' },
    pacing: { purpose: 'Saber si se va arriba o debajo del plan de los días transcurridos.', whenToUse: 'En el seguimiento diario o semanal.',
      decision: 'Si hace falta diagnosticar una brecha o si se va en línea.', related: ['gap', 'cumplimiento', 'forecast'],
      detailedDescription: 'Compara el actual acumulado contra el plan acumulado de los mismos días, ponderado por la estacionalidad del plan.',
      formula: 'Cumplimiento = Actual a la fecha ÷ Plan a la fecha', interpretation: 'Debajo de 100 % significa que se lleva menos de lo planeado para esos días.' },
    forecast: { purpose: 'Separar lo que ya pasó de lo que se espera que pase.', whenToUse: 'Para anticipar el cierre y decidir si hace falta actuar antes de que termine el periodo.',
      decision: 'Si el cierre esperado alcanza la meta o si hay que activar recovery.', related: ['forecastGap', 'reforecast', 'escenario'],
      formula: 'Forecast = Actual de los días contados + Σ proyección de los días restantes (método A, B, C o D)',
      interpretation: 'Si el comportamiento usado como referencia se mantiene, el cierre sería aproximadamente este.' },
    reforecast: { purpose: 'Saber cuánto tendría que producir cada día restante para conservar la meta.', whenToUse: 'Cuando el forecast no alcanza la meta.',
      decision: 'Qué tan exigente es recuperar y en qué días se concentra el esfuerzo.', related: ['forecast', 'recoveryPressure', 'recovery'],
      formula: 'Pendiente = Meta − Actual; se reparte en los días futuros con los pesos del plan' },
    gap: { purpose: 'Cuantificar cuánto se desvía el acumulado del plan.', whenToUse: 'Siempre que se lea el pacing.',
      decision: 'Si la desviación es suficiente para diagnosticar.', related: ['forecastGap', 'diagnostico'] },
    diagnostico: { purpose: 'Localizar qué variable y en qué segmento se origina la brecha, para investigar lo correcto.',
      whenToUse: 'Cuando el gap o el gap forecast no son despreciables.', decision: 'Qué investigar primero.', related: ['driver', 'senal', 'hipotesis'],
      interpretation: 'El AOV puede explicar la mayor parte matemática de una caída de {{sale}} y, a la vez, una caída de {{customers}} nuevos puede ser una señal adicional a investigar; una no causa la otra.' },
    driver: { purpose: 'Saber qué palanca matemática (volumen, CR o AOV) mueve el resultado.', whenToUse: 'Primer paso del diagnóstico.',
      decision: 'En qué palanca enfocar la investigación.', related: ['atribucion', 'senal', 'hipotesis'],
      detailedDescription: 'Factor matemático que explica la variación según el modelo Venta = Volumen × CR × AOV.' },
    senal: { purpose: 'Indicar dónde investigar.', whenToUse: 'Después de identificar el driver.', decision: 'Qué segmento o patrón revisar.',
      related: ['driver', 'hipotesis'], detailedDescription: 'Patrón observado que merece investigación: una caída localizada, un cambio de mezcla o una anomalía.',
      caveats: 'Una señal indica dónde investigar, pero no demuestra causalidad.' },
    hipotesis: { purpose: 'Convertir señales en preguntas concretas que se pueden validar.', whenToUse: 'Después de tener señales.',
      decision: 'Qué validar antes de proponer una acción.', related: ['senal', 'escenario', 'accion'] },
    escenario: { purpose: 'Cuantificar qué pasaría si cambia un driver, antes de decidir.', whenToUse: 'Con una hipótesis que sugiere una palanca.',
      decision: 'Cuánto del gap podría recuperarse con un cambio dado.', related: ['recovery', 'forecast', 'impactoObservado'],
      detailedDescription: 'Simulación de "qué pasaría si": aplica un cambio a volumen, CR o AOV y recalcula con la misma fórmula.',
      caveats: 'No es un forecast ni una predicción: es una condición supuesta. Tampoco es lo que ocurrió (eso es el observado).' },
    accion: { purpose: 'Convertir un escenario en algo que alguien ejecuta y se puede medir.', whenToUse: 'Cuando un escenario ligado a una hipótesis es razonable.',
      decision: 'Quién hace qué, cuándo y con qué métrica se mide.', related: ['escenario', 'impactoObservado'] },
    impactoObservado: { purpose: 'Aprender si lo que ocurrió fue consistente con lo simulado.', whenToUse: 'Cuando termina la ventana de medición de una acción.',
      decision: 'Si repetir, ajustar o descartar una acción.', related: ['baseline', 'escenario', 'accion'] },
    recovery: { purpose: 'Saber qué tendría que cambiar para cerrar la brecha.', whenToUse: 'Cuando el forecast no alcanza la meta.',
      decision: 'Qué palanca simular y cuánto tendría que moverse.', related: ['reforecast', 'escenario', 'accion'] },
    revenue: { purpose: 'Medir el resultado del negocio.', decision: 'Si el resultado va en línea con la meta.', related: ['trafficVolume', 'conversionRate', 'aov'],
      interpretation: 'Si un driver sube 10 % y los otros dos no cambian, la venta sube 10 %. Si dos cambian, sus efectos se multiplican.' },
    conversionRate: { purpose: 'Medir qué tan bien el volumen se convierte en {{orders}}.', related: ['trafficVolume', 'aov', 'driver'] },
    aov: { purpose: 'Medir el valor promedio de cada {{order}}.', related: ['conversionRate', 'revenue'] },
    trafficVolume: { purpose: 'Medir cuántas oportunidades de venta hubo.', related: ['conversionRate', 'revenue'] }
  };
  Object.entries(PEDAGOGY).forEach(([id, add]) => {
    const h = HELP.find((x) => x.id === id);
    if (!h) return;
    Object.entries(add).forEach(([k, v]) => { if (k === 'caveats' && h.caveats) h.caveats = `${h.caveats} ${v}`; else if (!h[k] || (Array.isArray(h[k]) && !h[k].length)) h[k] = v; });
  });

  /*
   * Fase 9.1 — Guía de los métodos de forecast. Nombre y descripción NO se repiten aquí: se leen de
   * config.forecast.methods (misma fuente que usa el motor). Aquí solo va lo pedagógico, y sus textos se
   * redactaron leyendo forecastMethods.js (A plan restante, B índice YTD, C índice de ventana reciente,
   * D índices por driver con pedidos y venta derivados).
   */
  const METHOD_GUIDE = {
    A: { uses: 'El plan de cada día restante, sin ajuste.', assumption: 'Los días que faltan se comportarán exactamente como se planeó.',
      divergesWhen: 'Si el año va arriba o abajo del plan, A no lo refleja en lo que falta.', limitation: 'Ignora el desempeño observado; es la referencia neutral.' },
    B: { uses: 'El plan de cada día restante × índice acumulado del año (actual ÷ plan desde el 1 de enero), por venta, pedidos y volumen.',
      assumption: 'El desempeño relativo al plan de todo el año se mantendrá.', divergesWhen: 'Si el desempeño reciente es distinto al del año, B tarda en reflejarlo.',
      limitation: 'Un inicio de año muy distinto pesa en todo el resto del año.' },
    C: { uses: 'El plan de cada día restante × índice de la ventana reciente configurada (por defecto, últimos 28 días).',
      assumption: 'El desempeño reciente relativo al plan se mantendrá.', divergesWhen: 'Si las últimas semanas fueron atípicas (evento, promoción), C las extiende a todo lo que falta.',
      limitation: 'Es más sensible a cambios recientes y también a ruido o anomalías.' },
    D: { uses: 'Volumen, CR y AOV del plan de cada día × el índice de cada driver en su propia ventana; pedidos y venta se derivan.',
      assumption: 'Cada palanca mantiene su propio desempeño relativo (por defecto: volumen con 28 días; CR y AOV con el acumulado del año).',
      divergesWhen: 'Si las palancas se mueven en sentidos opuestos, D lo refleja y B o C pueden compensarlo sin mostrarlo.',
      limitation: 'Depende de tener volumen, CR y AOV; si un índice no tiene datos, ese día usa el plan.' }
  };

  /* Fase 9.1 — La metodología completa, en orden. Cada paso apunta a una entrada de HELP y a una vista existente. */
  const METHODOLOGY = [
    { id: 'meta', label: 'Meta', question: '¿Qué quiero alcanzar?', help: 'meta', view: 'resumen' },
    { id: 'plan', label: 'Plan', question: '¿Cómo debería distribuirlo?', help: 'plan', view: 'plan' },
    { id: 'real', label: 'Real', question: '¿Qué ocurrió?', help: 'actual', view: 'carga' },
    { id: 'pacing', label: 'Pacing', question: '¿Cómo voy?', help: 'pacing', view: 'pacing' },
    { id: 'forecast', label: 'Forecast', question: '¿Dónde terminaría si sigo así?', help: 'forecast', view: 'pacing' },
    { id: 'diagnostico', label: 'Diagnóstico', question: '¿Por qué estoy en esta situación?', help: 'diagnostico', view: 'diagnostico' },
    { id: 'senales', label: 'Señales', question: '¿Dónde debo investigar?', help: 'senal', view: 'diagnostico' },
    { id: 'hipotesis', label: 'Hipótesis', question: '¿Qué podría explicarlo?', help: 'hipotesis', view: 'diagnostico' },
    { id: 'recovery', label: 'Recovery', question: '¿Qué tendría que cambiar?', help: 'recovery', view: 'reforecast' },
    { id: 'escenarios', label: 'Escenarios', question: '¿Qué pasaría si…?', help: 'escenario', view: 'recovery' },
    { id: 'accion', label: 'Acción', question: '¿Qué voy a hacer?', help: 'accion', view: 'recovery' },
    { id: 'observado', label: 'Observado', question: '¿Qué terminó ocurriendo?', help: 'impactoObservado', view: 'medir' },
    { id: 'narrativa', label: 'Narrativa', question: '¿Cómo lo explico?', help: null, view: null, upcoming: true }
  ];

  /** Paso de la metodología que corresponde a cada vista (para "estás aquí"). */
  const VIEW_STEP = { resumen: 'meta', plan: 'plan', estacionalidad: 'plan', configuracion: 'plan', carga: 'real', calidad: 'real', datos: 'real',
    pacing: 'forecast', reforecast: 'recovery', diagnostico: 'diagnostico', producto: 'senales', recovery: 'escenarios', medir: 'observado', negocio: 'meta', inicio: 'pacing' };

  /* Fase 9.1 — Microlearning: una idea por evento real, una sola vez, solo en modo Aprendiz. */
  const LESSONS = [
    { id: 'plan', event: 'plan-saved', text: 'El plan reparte la meta según la estacionalidad: por eso no todos los días valen lo mismo.', help: 'plan' },
    { id: 'real', event: 'data-committed', text: 'Un día sin real no es un día en cero: queda fuera del pacing hasta que se cargue.', help: 'actual' },
    { id: 'pacing', event: 'pacing-seen', text: 'El pacing compara el acumulado real contra el plan de los mismos días, no contra la meta del año.', help: 'pacing' },
    { id: 'forecast', event: 'forecast-seen', text: 'El forecast no es una meta: es una proyección que cambia si el comportamiento cambia.', help: 'forecast' },
    { id: 'method', event: 'method-changed', text: 'Cambiar de método cambia el forecast, no los datos: cada método supone algo distinto sobre lo que falta.', help: 'forecast' },
    { id: 'signal', event: 'signal-seen', text: 'Una señal indica dónde investigar, pero no demuestra causalidad.', help: 'senal' },
    { id: 'recovery', event: 'reforecast-seen', text: 'El requerimiento de recuperación es una necesidad matemática, no una garantía de que sea alcanzable.', help: 'reforecast' },
    { id: 'scenario', event: 'scenario-saved', text: 'Un escenario simula una condición; no representa lo que realmente ocurrió.', help: 'escenario' },
    { id: 'observed', event: 'measured', text: 'El observado se compara contra baseline y escenario; "consistente" no quiere decir "la acción lo causó".', help: 'impactoObservado' },
    { id: 'geo', event: 'product-geo-seen', text: 'La geografía de productos muestra dónde se movió la venta de un producto, no por qué, y solo aplica al análisis de productos.', help: 'estadoProducto' }
  ];

  /* Fase 9.1 — Modos de experiencia: un solo selector y un solo estado (state.ux.mode). */
  const MODES = [['learner', 'Aprendiz'], ['analyst', 'Analista'], ['exec', 'Ejecutivo']];

  /**
   * Ajuste post-9.1: preparación de datos. Etiquetas de los 3 requisitos bloqueantes (sin ellos no hay
   * pacing/forecast que mostrar) y 3 recomendados (no bloquean, pero afectan la confiabilidad). La
   * lógica y el cálculo del porcentaje viven en contextEngine.dataReadiness; esto es solo el texto.
   */
  const READINESS = {
    items: [
      { id: 'targets', label: 'Meta anual definida', view: 'resumen', blocking: true },
      { id: 'plan', label: 'Plan distribuido', view: 'plan', blocking: true },
      { id: 'actual', label: 'Venta real cargada', view: 'carga', blocking: true },
      { id: 'coverage', label: 'Cobertura reciente de venta real', view: 'carga', blocking: false },
      { id: 'historical', label: 'Histórico cargado (mejora la estacionalidad)', view: 'carga', blocking: false },
      { id: 'quality', label: 'Sin errores de calidad', view: 'calidad', blocking: false }
    ],
    tierLabels: { ok: 'Listo para resultados confiables', warning: 'Funciona, con menos confiabilidad', error: 'Probablemente incompleto para resultados útiles' },
    note: 'Qué tan completa está la información necesaria para que plan, pacing y forecast sean confiables. No mide el desempeño del negocio.'
  };

  /** Palabras en etiquetas de la interfaz que activan un ícono de ayuda (en orden). */
  const TRIGGERS = [
    [/^presi[oó]n/i, 'recoveryPressure'], [/gap forecast|forecast gap/i, 'forecastGap'], [/^reforecast/i, 'reforecast'],
    [/^forecast/i, 'forecast'], [/^gap/i, 'gap'], [/^cumplimiento/i, 'cumplimiento'], [/^cr\b/i, 'conversionRate'],
    [/^aov/i, 'aov'], [/^volumen/i, 'trafficVolume'], [/^pedidos/i, 'orders'], [/^venta\b/i, 'revenue'],
    [/^meta\b/i, 'meta'], [/^plan\b/i, 'plan'], [/^actual\b/i, 'actual'], [/^surplus/i, 'surplus'],
    [/^driver/i, 'driver'], [/^señales?/i, 'senal'], [/^hipótesis/i, 'hipotesis'], [/^baseline/i, 'baseline'],
    [/^recuperación requerida/i, 'reforecast'], [/^performance index/i, 'performanceIndex'],
    [/^unidades/i, 'units'], [/^vistas de ficha/i, 'views'], [/^vista → carrito/i, 'cartRate'], [/^carrito → checkout/i, 'checkoutRate'],
    [/^checkout → compra/i, 'purchaseRate'], [/^cobertura de tracking/i, 'trackingCoverage'], [/^tipo de entrega/i, 'tipoEntrega'],
    [/^sucursal/i, 'sucursal'], [/^estado$/i, 'estadoProducto'], [/^diagn[oó]stico/i, 'diagnostico'], [/^escenario/i, 'escenario'],
    [/^pacing/i, 'pacing']
  ];

  /* ---------- Explicadores por vista ---------- */

  const EXPLAINERS = {
    pacing: { title: 'Cómo leer esta vista', flow: ['Plan', 'Actual', 'Forecast', 'Gap forecast'],
      learn: { method: 'El pacing usa el plan diario (con estacionalidad) para saber cuánto debía llevarse a la fecha. El forecast suma al actual la proyección de los días restantes con el método elegido.',
        assumptions: ['Solo cuentan los días con real hasta la fecha de corte.', 'Los cuatro métodos conservan el patrón diario del plan.', 'Ningún método se declara "mejor".'],
        example: 'Ejemplo ilustrativo: si a la fecha el plan acumulado es 100 y el real 95, el cumplimiento es 95 % y el gap −5; el forecast con el método A sumaría a esos 95 el plan de los días restantes.',
        limits: 'Un forecast depende del método: métodos distintos pueden dar cierres distintos con los mismos datos.', related: ['pacing', 'forecast', 'forecastGap', 'reforecast'] },
      points: ['Plan: lo que se esperaba a la fecha y al cierre.', 'Actual: lo que ocurrió hasta el corte.',
        'Forecast: dónde terminaríamos si continúa el comportamiento proyectado (no es el objetivo).',
        'Gap forecast: forecast − meta. El gap "a la fecha" compara solo los días transcurridos.'] },
    reforecast: { title: 'Forecast no es reforecast',
      learn: { method: 'Meta − actual acumulado = pendiente. El pendiente se reparte en los días futuros con los pesos del plan; la presión compara ese requerimiento contra el plan original de esos días.',
        assumptions: ['Los días con real quedan congelados.', 'El surplus de un canal no compensa a otro.'],
        example: 'Ejemplo ilustrativo: meta 100, actual 60 → pendiente 40. Si el plan de los días restantes era 35, la presión es +14 %.',
        limits: 'No dice si ese ritmo es alcanzable: para eso se simulan escenarios.', related: ['reforecast', 'recoveryPressure', 'recovery', 'escenario'] },
      flow: ['Meta original', 'Actual acumulado', 'Pendiente', 'Distribución futura requerida', 'Presión de recuperación'],
      points: ['Forecast: ¿dónde terminaríamos si continúa lo proyectado?', 'Reforecast: ¿qué tendría que ocurrir en los días restantes para conservar la meta original?',
        'El reforecast es un requerimiento, no un pronóstico.'] },
    diagnostico: { title: 'Brecha → driver → señal → hipótesis', flow: ['Hecho', 'Driver', 'Señal', 'Hipótesis'],
      learn: { method: 'Brecha → driver matemático (atribución de la brecha a volumen, CR y AOV) → descomposición por segmento → señales → hipótesis → investigación.',
        assumptions: ['La atribución cierra exacta: la suma de contribuciones es igual a la brecha.', 'Las señales se priorizan por impacto, peso del segmento y confianza.'],
        example: 'Ejemplo ilustrativo: la venta cae y el AOV explica la mayor parte matemática; además caen los clientes nuevos. Lo correcto: "AOV es el driver principal; la caída de clientes nuevos es una señal adicional a investigar". No: "la caída de clientes nuevos causó la caída".',
        limits: 'Driver, señal e hipótesis no son equivalentes: el driver es matemático, la señal dice dónde mirar y la hipótesis es una explicación por validar.', related: ['driver', 'senal', 'hipotesis', 'atribucion'] },
      points: ['Hecho: algo observado en los datos.', 'Driver: variable matemática relacionada con el resultado.',
        'Señal: comportamiento que merece investigación, no una causa demostrada.', 'Hipótesis: explicación posible que requiere validación.'] },
    recovery: { title: 'Hipótesis, escenario, acción y resultado son cosas distintas', flow: ['Hipótesis', 'Escenario', 'Acción', 'Resultado observado'],
      learn: { method: 'Gap → variable objetivo → cambio requerido → escenario → acción. El escenario usa la misma fórmula (volumen × CR × AOV) con el cambio supuesto.',
        assumptions: ['El escenario no modifica plan, actual, forecast ni reforecast.', 'El cálculo inverso da la magnitud requerida; no juzga si es alcanzable.'],
        example: 'Ejemplo ilustrativo: si el CR sube de 2.10 % a 2.30 % (+0.20 pp) y lo demás no cambia, la venta de los días simulados sube 9.5 %.',
        limits: 'Forecast = lo que se espera; escenario = lo que pasaría si…; observado = lo que ocurrió después de actuar. No son intercambiables.', related: ['recovery', 'escenario', 'accion', 'impactoObservado'] },
      points: ['Hipótesis: una posible explicación.', 'Escenario: una simulación; su impacto es matemático, no una predicción.',
        'Acción: algo que alguien decide hacer (dueño, métrica, fechas).', 'Resultado observado: lo que después ocurrió, comparado contra baseline y escenario.'] },
    negocio: { title: 'Contexto, no configuración de cálculo', flow: ['Contexto del negocio', 'Arranque de la app', 'Configuración', 'Motores'],
      points: ['Describe el negocio una vez; la app lo lee al arrancar y de ahí toma moneda, nombre y terminología.',
        'Canales, métricas, fórmulas, forecast, diagnóstico y datos cargados no cambian.',
        'Geografía y catálogo se describen de forma conceptual; su estructura real llega en fases posteriores.',
        'Los factores del negocio son contexto para investigar, nunca causas.'] },
    producto: { title: 'Participación no es contribución', flow: ['Negocio', 'Canal', 'Categoría', 'Subcategoría', 'Producto', 'SKU'],
      learn: { method: 'Se compara el periodo contra una referencia (periodo anterior o año anterior). La geografía (región, estado, ciudad, {{location}}) y el tipo de entrega permiten ver dónde se movió cada {{product}}.',
        assumptions: ['La geografía es exclusiva del análisis de productos: no cambia plan, forecast ni diagnóstico general.', 'El funnel ocurre antes del checkout: no tiene geografía.'],
        example: 'Ejemplo ilustrativo: una categoría cae 20 % y el 70 % de esa caída está en dos estados; eso dice dónde investigar, no por qué.',
        limits: 'Una diferencia geográfica no demuestra una causa.', related: ['participacion', 'contribucion', 'estadoProducto', 'sucursal', 'tipoEntrega'] },
      points: ['Participación: cuánto pesa un grupo en la venta del periodo.', 'Contribución: cuánto explica del cambio contra la referencia (periodo anterior o año anterior).',
        'Venta, pedidos, unidades y vistas son observados; CR y AOV son calculados. Sin vistas no hay CR por producto; sin pedidos no hay AOV.',
        'Los patrones (tráfico, CR, AOV) son señales para investigar, no causas.'] },
    medir: { title: 'Un escenario no es una acción', flow: ['Escenario', 'Acción', 'Responsable', 'Métrica', 'Medición'],
      learn: { method: 'Sobre los mismos días se comparan baseline (lo esperado sin la acción), escenario (lo simulado) y observado (lo que ocurrió).',
        assumptions: ['La lectura es "consistente / no consistente con el escenario".'], example: 'Ejemplo ilustrativo: baseline 100, escenario 110, observado 108 → realización del 80 %: consistente con el escenario.',
        limits: 'Consistente no significa que la acción lo causó: otros factores pueden haber cambiado.', related: ['baseline', 'impactoObservado', 'accion'] },
      points: ['La medición compara baseline, escenario y observado en los mismos días.', 'La lectura es "consistente / no consistente con el escenario"; nunca "la acción causó".'] }
  };

  /* ---------- Recorrido guiado ---------- */

  const TOUR = [
    { id: 'meta', view: 'resumen', target: '#targets-form', title: 'Meta',
      what: 'La meta anual por canal: el Original Target.', why: 'Todo se mide contra ella y nunca se modifica.',
      lookFor: 'Que el total y los canales estén capturados y cuadren.', next: 'Revisar cómo vamos contra el plan.' },
    { id: 'plan', view: 'plan', target: '#view-plan', title: 'Plan', chapter: 'Planear',
      what: 'La meta repartida en meses, semanas y días con la estacionalidad.', why: 'Dice cuánto debería llevarse en cada fecha, no solo al cierre.',
      lookFor: 'Que los días fuertes y débiles tengan sentido para el negocio.', next: 'Cargar la venta real.' },
    { id: 'real', view: 'carga', target: '#view-carga', title: 'Real', chapter: 'Monitorear',
      what: 'La venta que realmente ocurrió, cargada desde archivos.', why: 'Sin real no hay pacing ni forecast.',
      lookFor: 'Que la calidad de datos no tenga errores y la fecha de corte sea la esperada.', next: 'Ver cómo vamos contra el plan.' },
    { id: 'pacing', view: 'pacing', target: '#fc-channels', title: 'Pacing',
      what: 'Plan acumulado vs actual acumulado por canal.', why: 'Dice si vamos arriba o debajo del plan de los días transcurridos.',
      lookFor: 'Canales con cumplimiento menor a 100 % y su gap.', next: 'Ver el forecast de cierre.' },
    { id: 'forecast', view: 'pacing', target: '#fc-kpis', title: 'Forecast',
      what: 'Dónde terminaríamos si continúa el comportamiento proyectado.', why: 'Separa lo que ya pasó de lo que se espera.',
      lookFor: 'El método en uso y el gap forecast.', next: 'Cuantificar la brecha.' },
    { id: 'gap', view: 'reforecast', target: '#rf-summary', title: 'Gap y recuperación',
      what: 'Plan, forecast y reforecast requerido lado a lado.', why: 'Muestra lo esperado vs lo necesario.',
      lookFor: 'Recuperación requerida y presión de recuperación.', next: 'Entender qué driver explica la brecha.' },
    { id: 'drivers', view: 'diagnostico', target: '#dx-level1', title: 'Drivers',
      what: 'Atribución de la brecha a volumen, CR y AOV.', why: 'Indica qué variable matemática pesa más.',
      lookFor: 'El driver principal y los offsets positivos.', next: 'Localizar dónde ocurre.' },
    { id: 'senales', view: 'diagnostico', target: '#dx-signals', title: 'Señales',
      what: 'Cambios relevantes por segmento, mezcla y anomalías.', why: 'Localizan dónde investigar.',
      lookFor: 'Prioridad alta con peso grande en la base.', next: 'Leer las hipótesis.' },
    { id: 'hipotesis', view: 'diagnostico', target: '#dx-hyps', title: 'Hipótesis',
      what: 'Explicaciones posibles ligadas a señales.', why: 'Convierten señales en preguntas a validar.',
      lookFor: 'Qué validar en cada una.', next: 'Simular un escenario.' },
    { id: 'recovery', view: 'reforecast', target: '#rf-summary', title: 'Recovery', chapter: 'Recuperar',
      what: 'Qué tendría que cambiar para recuperar la meta.', why: 'No explica por qué pasó: calcula lo que haría falta.',
      lookFor: 'El requerimiento y la presión de recuperación.', next: 'Simular un escenario.' },
    { id: 'escenario', view: 'recovery', target: '#rc-simulator', title: 'Escenario',
      what: 'Simulación de qué pasaría si cambia un driver.', why: 'Cuantifica cuánto del gap podría recuperarse.',
      lookFor: 'Venta incremental simulada y gap restante.', next: 'Plantear una acción.' },
    { id: 'accion', view: 'recovery', target: '#rc-library', title: 'Acción',
      what: 'Actividad concreta ligada a una hipótesis y un escenario.', why: 'Lo que alguien decide hacer, con responsable y métrica.',
      lookFor: 'Driver, área responsable y ventana de medición.', next: 'Medir el resultado.' },
    { id: 'medicion', view: 'medir', target: '#mx-actions', title: 'Medición',
      what: 'Baseline vs escenario vs observado.', why: 'Permite aprender qué fue consistente con lo simulado.',
      lookFor: 'Consistencia y factores que afectan la comparación.', next: 'Volver a monitorear.' }
  ];

  /* ---------- Modos Ejecutivo / Analista ---------- */

  /** Selectores de bloques técnicos que el modo Ejecutivo colapsa (nunca se eliminan). */
  const ANALYST_ONLY = [
    '#view-resumen [aria-labelledby="t-edge"]', '#view-resumen [aria-labelledby="t-engine"]', '#view-resumen [aria-labelledby="t-validation"]',
    '#view-pacing #fc-indices', '#view-pacing #fc-methods', '#view-pacing #fc-params',
    '#view-reforecast #rf-drivers', '#view-reforecast #rf-audit',
    '#view-diagnostico #dx-tree', '#view-diagnostico #dx-confidence',
    '#view-recovery #rc-inverse', '#view-configuracion'
  ];

  const HOW_IT_WORKS = [
    ['Planea', 'Carga datos, captura la meta y distribúyela con la estacionalidad.', 'plan'],
    ['Compara', 'Pacing: plan acumulado contra actual.', 'pacing'],
    ['Proyecta', 'Forecast de cierre y reforecast requerido.', 'pacing'],
    ['Diagnostica', 'Driver, señal e hipótesis.', 'diagnostico'],
    ['Simula', 'Escenarios de recuperación.', 'recovery'],
    ['Actúa', 'Plan de acción ligado a la evidencia.', 'recovery'],
    ['Mide', 'Baseline vs escenario vs observado.', 'medir']
  ];

  const READ_DIAGNOSIS = [
    '¿Qué tan grande es la brecha?', '¿Qué variable matemática explica parte de ella?', '¿Qué señales aparecen?',
    '¿Qué hipótesis vale investigar?', '¿Qué escenario puedo simular?', '¿Qué acción voy a medir?'
  ];

  // Capítulos del recorrido (para retomarlo por partes, no todo en una sesión)
  const CH = { meta: 'Planear', plan: 'Planear', real: 'Monitorear', pacing: 'Monitorear', forecast: 'Monitorear', gap: 'Monitorear',
    drivers: 'Diagnosticar', senales: 'Diagnosticar', hipotesis: 'Diagnosticar', recovery: 'Recuperar', escenario: 'Recuperar', accion: 'Recuperar', medicion: 'Medir' };
  TOUR.forEach((t) => { t.chapter = t.chapter || CH[t.id] || null; });

  FP.guidanceConfig = { GROUPS, VIEWS, STATES, HELP, TRIGGERS, EXPLAINERS, TOUR, ANALYST_ONLY, HOW_IT_WORKS, READ_DIAGNOSIS, READINESS,
    PEDAGOGY, METHOD_GUIDE, METHODOLOGY, VIEW_STEP, LESSONS, MODES };
})(typeof window !== 'undefined' ? window : globalThis);
