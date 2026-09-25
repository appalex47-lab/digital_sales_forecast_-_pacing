# ARCHITECTURE.md — Digital Sales Forecast & Pacing

Documento de referencia para todas las fases. Antes de modificar cualquier módulo, léelo completo.
Versión de la app: 0.9.1 (Fase 8.1.1). Versión del contrato de datos: **1.8.0**.
Guía de experiencia: `UX_GUIDE.md`.
Diccionario de campos: `DATA_DICTIONARY.md`.

Fases:
- **Fase 0** (secciones 1–9): arquitectura base, modelo Plan / Actual / Forecast, motor matemático.
- **Fase 1** (secciones 10–18): carga CSV, normalización, validación, calidad, cobertura, almacenamiento y exportación.
- **Fase 2** (secciones 19–29): estacionalidad, pesos, distribución de metas y plan distribuido.
- **Fase 3** (secciones 30–40): actual vs plan, pacing, gap, performance index, forecast y versiones.
- **Fase 4** (secciones 41–50): reforecast dinámico, redistribución del gap, recuperación y drivers.
- **Fase 5** (secciones 51–61): brecha → driver → señal → hipótesis, Cohere opcional y analysis_export.json.
- **Fase 6** (secciones 62–73): escenarios, recuperación, plan de acción, impacto simulado vs observado, Recovery Center.
- **Fase 7** (secciones 74–82): capa de UX guiada: navegación agrupada, Inicio, contexto y siguiente paso, ayuda, glosario, recorrido, modos Ejecutivo/Analista, trazabilidad visible.

---

## 1. Estructura de archivos

```
/index.html                     Estructura, navegación por vistas y orden de carga de scripts
/ARCHITECTURE.md                Este documento
/DATA_DICTIONARY.md             Diccionario de todos los campos del modelo            (Fase 1)
/css/styles.css                 Tokens (variables CSS) y componentes
/tools/idb-proof.html           Prueba técnica de IndexedDB (Fase 8, paso 14); no la usa la app
/tools/idb-proof.js             Lógica de la prueba (base separada 'fp-idb-proof')
/js/
  config/guidanceConfig.js      Contenidos de ayuda, glosario, grupos, recorrido (solo texto)   (Fase 7)
  config/config.js              Canales (+ alias), métricas, tolerancias, calendario, storage,
                                campos de importación, tipos de dato, catálogo de errores
  calendar/calendar.js          Fechas UTC, semana (punto único), atributos de día, periodos
  calculations/metrics.js       Núcleo matemático, derivación, validación, agregación, gap
  calculations/weights.js       Estadística robusta: mediana, MAD, winsorizado, encogimiento   (Fase 2)
  calculations/seasonality.js   Perfiles de estacionalidad por canal                         (Fase 2)
  calculations/gap.js           Gap, cumplimiento, gap forecast, semáforo de pacing           (Fase 3)
  calculations/pacing.js        Fecha de referencia, corte, estados temporales, acumulados    (Fase 3)
  calculations/self-test.js     Pruebas del motor (red de no-regresión)
  data/data-model.js            DailyRecord, Targets, Dataset, consultas y resúmenes
  data/data-store.js            Modelo canónico: colecciones, lotes, duplicados, consolidación  (Fase 1)
  data/mock-data.js             Datos de prueba determinísticos y casos límite (solo QA)
  data/mock-csv.js              Archivos CSV de prueba: 11 casos + 4 datasets generados (Fase 1)
  events/events.js              Entidades de eventos comerciales e hitos
  forecast/forecast.js          Registro de versiones: Original Plan inmutable, reforecasts
  forecast/distribution.js      Reparto exacto por mayor residuo (centavos / unidades)        (Fase 2)
  forecast/planningEngine.js    Motor de planeación: anual → mensual → semanal → diario       (Fase 2)
  forecast/performanceIndex.js  Índices actual ÷ plan por ventana y métrica                   (Fase 3)
  forecast/forecastMethods.js   Métodos A–D de proyección de un día                           (Fase 3)
  forecast/forecastEngine.js    Motor central: plan → actual → pacing → gap → forecast        (Fase 3)
  forecast/forecastVersioning.js Snapshots inmutables, forecast change, accuracy              (Fase 3)
  forecast/futureWeights.js     Pesos futuros = venta del plan original (salida de Fase 2)    (Fase 4)
  forecast/reforecastEngine.js  Pendiente, redistribución, recuperación, drivers, confianza   (Fase 4)
  forecast/reforecastVersioning.js Versiones rf_vN, evolución y reforecast change             (Fase 4)
  diagnostics/attribution.js    Atribución secuencial y Shapley de venta = volumen × CR × AOV (Fase 5)
  diagnostics/driverEngine.js   Pares actual/referencia por comparación, Nivel 1 y Nivel 2  (Fase 5)
  diagnostics/signalEngine.js   Señales, relevancia y prioridad de investigación, anomalías (Fase 5)
  diagnostics/hypothesisEngine.js Hipótesis por reglas ligadas a señales                    (Fase 5)
  diagnostics/diagnosticEngine.js runDiagnostic: orquesta la cadena y la confianza de datos (Fase 5)
  ai/cohereClient.js            Llamada compartida a Cohere (extraída de cohereDiagnostic)  (Fase 6)
  ai/cohereDiagnostic.js        Redacción opcional de hipótesis con Cohere + validación     (Fase 5)
  ai/cohereActions.js           Líneas de acción posibles con Cohere + validación           (Fase 6)
  scenarios/scenarioValidation.js Entradas, bloques y restricciones de escenarios           (Fase 6)
  scenarios/scenarioEngine.js   Contexto, simulación por canal y segmento, persistencia     (Fase 6)
  scenarios/recoveryEngine.js   Cálculo inverso, runRecoveryAnalysis, contextos importados   (Fase 6)
  impact/impactCalculator.js    Impacto simulado (estructura expectedImpact)                (Fase 6)
  impact/impactMeasurement.js   Impacto observado: baseline vs escenario vs real            (Fase 6)
  actions/actionLibrary.js      Catálogo configurable de acciones posibles                  (Fase 6)
  actions/actionPlan.js         Plan de acción, estados, historial, prioridad descriptiva   (Fase 6)
  actions/actionTracking.js     Mediciones append-only                                      (Fase 6)
  storage/storage.js            Persistencia con adaptadores (localStorage / memoria)
  storage/idb.js                Envoltura mínima de IndexedDB (primitivas)                    (Fase 8.1)
  storage/repository.js         Repositorio: esquema IndexedDB, caché kv, almacenamiento enrutado (Fase 8.1)
  storage/migration.js          Migración no destructiva localStorage → IndexedDB con verificación (Fase 8.1)
  storage/storage-tests.js      Pruebas asíncronas de almacenamiento y volumen (en el navegador)   (Fase 8.1)
  products/productStore.js      Contrato, bloques día × canal, duplicados, persistencia, consultas (Fase 8.1)
  products/productImport.js     Carga de productos por partes (vista previa, validación, resumen)  (Fase 8.1)
  products/productAnalysis.js   Categoría → Producto: participación, contribución, señales         (Fase 8.1)
  export/categoryProductExport.js category_product_analysis_export.json                          (Fase 8.1)
  data/mock-products.js         Archivos de prueba de productos (solo QA)                         (Fase 8.1)
  ui/product-view.js            Vista Categoría → Producto y revisión de archivos de productos    (Fase 8.1)
  calculations/targetAssistant.js Propuesta de metas desde la venta real de un año base
  import/csv.js                 CSV → RAW (parser RFC 4180, separador, BOM, stringify)      (Fase 1)
  import/normalize.js           Reglas de normalización: fecha, número, canal, tipo de día (Fase 1)
  import/import.js              Pipeline: staging, mapeo, registro canónico, selección      (Fase 1)
  quality/validation.js         Reglas de validación, issues estructurados, duplicados     (Fase 1)
  quality/coverage.js           Cobertura temporal/canal/métrica y resumen de calidad      (Fase 1)
  export/export.js              forecast_export.json + exportaciones de Fase 1 + descargas
  export/planningExport.js      Contrato de planning_export.json                              (Fase 2)
  export/forecastExport.js      forecast_export.json de Fase 3 (superconjunto del de Fase 0)  (Fase 3)
  export/reforecastExport.js    reforecast_export.json                                        (Fase 4)
  export/analysisExport.js      analysis_export.json                                          (Fase 5)
  export/actionPlanExport.js    action_plan_export.json                                       (Fase 6)
  ui/format.js                  Número → texto (único lugar); nunca NaN/Infinity
  ui/ui.js                      Render de Resumen y motor; utilidades compartidas
  ui/import-view.js             Vista Carga de datos                                        (Fase 1)
  ui/quality-view.js            Vista Calidad de datos                                      (Fase 1)
  ui/data-view.js               Vista Datos normalizados                                    (Fase 1)
  ui/seasonality-view.js        Vista Estacionalidad                                        (Fase 2)
  ui/planning-view.js           Vista Plan: metas, vista previa, cierre, plan distribuido   (Fase 2)
  ui/planning-config-view.js    Vista Configuración de planeación y comparación de métodos  (Fase 2)
  ui/chart.js                   Gráfico de líneas SVG compartido y acumulados              (Fase 4)
  ui/pacing-view.js             Pacing & Forecast: tablero, tendencia, periodos, eventos    (Fase 3)
  ui/forecast-view.js           Pacing & Forecast: índices, métodos, alertas, versiones     (Fase 3)
  ui/reforecast-view.js         Recovery & Reforecast                                       (Fase 4)
  ui/diagnostic-view.js         ¿Por qué? Diagnóstico: hecho, drivers, árbol, señales, hipótesis (Fase 5)
  ui/recovery-center.js         Recovery Center: contexto, brecha, drivers, árbol trazable, E/S (Fase 6)
  ui/scenario-view.js           Simulador, cálculo inverso, escenarios guardados, comparación (Fase 6)
  ui/action-plan-view.js        Catálogo, plan de acción, IA y seguimiento                  (Fase 6)
  ui/guidance/contextEngine.js  Estado de la app, siguiente paso, descripción de vista       (Fase 7)
  ui/guidance/navigation.js     Grupos, submenú, migas, barra de contexto, filtros, modos   (Fase 7)
  ui/guidance/help.js           Íconos de ayuda, panel, glosario, etiquetas de estado       (Fase 7)
  ui/guidance/tour.js           Recorrido guiado de 10 pasos                                (Fase 7)
  ui/guidance/traceability.js   Cadena plan → … → medición de una acción (solo lectura)     (Fase 7)
  ui/guidance/home-view.js      Inicio / centro de control                                  (Fase 7)
  ui/guidance/measure-view.js   Medir y aprender (vista global de acciones y mediciones)    (Fase 7)
  ui/guidance/help-view.js      ¿Cómo funciona? y ¿cómo leer un diagnóstico?                (Fase 7)
  ui/guidance/diagnostic-guide.js ¿Por qué está pasando? + árbol visual de drivers          (Fase 7)
  app.js                        Orquestador: estado, acciones, persistencia, arranque
```

Diferencias respecto a la propuesta inicial, con motivo:

- **Scripts clásicos con namespace `FP`** en lugar de módulos ES6. Los módulos ES6 no cargan
  al abrir `index.html` con doble clic (`file://`) por la política CORS del navegador; los
  scripts clásicos funcionan igual en `file://` y en GitHub Pages, sin servidor ni build.
  Cada archivo es un IIFE que registra un único objeto: `FP.config`, `FP.calendar`,
  `FP.metrics`, `FP.dataModel`, `FP.events`, `FP.forecast`, `FP.storage`, `FP.importer`,
  `FP.exporter`, `FP.mock`, `FP.selfTest`, `FP.format`, `FP.ui`, `FP.app`.
- **`/js/forecast` y `/js/events`** existen desde ya porque el versionado y las entidades
  de eventos forman parte del contrato de datos, aunque sus algoritmos lleguen después.
- **`ui/format.js`** separado de `ui.js`: todas las vistas futuras (dashboard, pacing,
  gráficos) formatearán igual.
- **`calculations/self-test.js`** y **`data/mock-data.js`**: permiten comprobar la
  arquitectura en el navegador sin datos reales. Nada del núcleo depende de ellos.
- **Fase 1 agrega la carpeta `/js/quality`** (validación y cobertura) separada de `/js/import`
  (lectura y normalización): leer un dato y juzgar su calidad son responsabilidades distintas,
  y la cobertura se usará también sobre datos que no vienen de CSV.

## 2. Modelo de datos

### 2.1 DailyRecord (un día × un canal)

```js
{
  id: "2026-09-23|ecommerce",          // llave única: date|channel
  // Atributos de calendario (FP.calendar.getDateAttributes)
  date: "2026-09-23", year: 2026, month: 9, quarter: 3, fortnight: 2,
  week: 39, weekYear: 2026, weekKey: "2026-W39",
  weekOfMonth: 4, weekOfMonthLabel: "W4",
  dayOfWeek: "Wednesday", dayOfWeekIndex: 3, dayOfYear: 266, isWeekend: false,
  // Negocio
  channel: "ecommerce",
  dayType: "regular",                  // regular | holiday | event | campaign | special
  holiday: null, event: null, season: null,
  // Estados (nunca se mezclan)
  plan:     { revenue, orders, trafficVolume, conversionRate, aov },
  actual:   { revenue, orders, trafficVolume, conversionRate, aov },
  forecast: { revenue, orders, trafficVolume, conversionRate, aov },
  // Origen de cada valor, por estado
  sources:  { plan: {revenue: "input", …}, actual: {revenue: "observed", conversionRate: "calculated", …}, forecast: {…} },
  // Resultado de FP.metrics.validateBlock por estado
  validation: { plan: {status, checks, issues}, actual: {…}, forecast: {…} }
}
```

Orígenes (`sources`): `observed` dato real cargado; `input` dato capturado/planeado;
`model` producido por el motor de forecast; `calculated` derivado por identidad matemática.

### 2.2 Targets (metas jerárquicas)

```js
{
  year: 2026, currency: "MXN",
  annual:    { revenue, orders, trafficVolume, conversionRate, aov },
  byChannel: { ecommerce: {…}, app: {…}, whatsapp: {…}, llamadas: {…} },
  byMonth:   { "2026-09": { total: {…}, byChannel: { ecommerce: {…} } } },   // futuro
  byWeek:    { "2026-W39": { total, byChannel } },                             // futuro
  byDay:     { "2026-09-23": { total, byChannel } },                           // futuro
  updatedAt: "ISO"
}
```

Jerarquía: META ANUAL → CANAL → MES → SEMANA → DÍA. La suma de hijos se valida contra el
padre con `FP.metrics.validateHierarchy(parent, children)`. En Fase 0 solo se valida
canales vs total. La distribución automática no existe todavía.

### 2.3 Dataset

```js
{ schemaVersion: "1.0.0", year: 2026, meta: { source, label, createdAt }, records: { [id]: DailyRecord } }
```

### 2.4 Versionado de plan/forecast (`FP.forecast`)

```js
registry = { schemaVersion, year, currentVersionId, versions: [
  { id: "original-plan", type: "original_plan", label: "Original Plan", locked: true, values: { [recordId]: Block } },
  { id: "reforecast-01", type: "reforecast", basedOn: "original-plan", reason: null, values: {…} },
  …
]}
```

- El Original Plan se crea una sola vez con `lockOriginalPlan()` y queda congelado
  (`Object.freeze` profundo). Un segundo intento lanza error.
- Cualquier redistribución futura crea una versión nueva con `addVersion()`; nunca edita otra.
- `record.forecast` es la vista materializada de la versión vigente (`currentVersionId`).
- `reason` queda reservado para vincular un reforecast con el diagnóstico/acción que lo motivó.

### 2.5 Eventos e hitos (`FP.events`)

```js
event     = { id: "hot-sale-2026", name, startDate, endDate, type: "commercial_event", channels: null, impactWeight: null, notes }
milestone = { id, date, type: "milestone", title, description, channel: null, impact: null }
```
`channels: null` significa todos los canales.

## 3. Relaciones matemáticas

```
Pedidos = traffic_volume × CR
Venta   = Pedidos × AOV = traffic_volume × CR × AOV
CR      = Pedidos ÷ traffic_volume
AOV     = Venta ÷ Pedidos
```

`traffic_volume` significa sesiones (Ecommerce, App), mensajes/contactos (WhatsApp) o
llamadas (Llamadas). El motor es común; la etiqueta visible sale de `config.channels[].trafficLabel`.

Reglas del motor (`FP.metrics`):

1. Ninguna función devuelve `NaN` ni `Infinity`. Lo inválido o indefinido es `null`.
   `safeDivide` devuelve `null` si el divisor es 0, nulo o no numérico.
2. `toNumberOrNull` acepta `'$1,250.50'`, `'1,000'`, `'1.25%'` (→ 0.0125). Texto no numérico
   → `null` y se reporta como error `numeric_input`.
3. CR se almacena como fracción (0.0125 = 1.25 %).
4. `deriveBlock` completa huecos sin sobrescribir lo cargado y marca lo derivado como `calculated`.
5. `validateBlock` revisa: negativos, volumen 0 con pedidos, pedidos 0 con venta, CR > 100 %,
   y las cuatro identidades con tolerancias de `config.tolerances`. Si un valor cargado no
   cuadra, se conserva y se genera `warning`.
6. Agregación: se suman solo métricas aditivas (venta, pedidos, volumen); CR y AOV se
   recalculan desde las sumas. **Nunca se promedian ratios.**
7. `calcGap(reference, value)` → `{ abs, pct, attainment }`, todo nulo-seguro.

## 4. Responsabilidades de cada módulo y dependencias

Orden de carga (cada módulo solo usa los anteriores):

| # | Módulo | Responsabilidad | Depende de |
|---|--------|-----------------|------------|
| 1 | config | Definiciones de negocio y parámetros | — |
| 2 | calendar | Fechas, semanas, periodos | config |
| 3 | metrics | Cálculo, derivación, validación, agregación | config |
| 4 | data-model | Crear/validar/consultar registros y metas | config, calendar, metrics |
| 5 | events | Eventos e hitos | config, calendar, metrics |
| 6 | forecast | Versionado (sin algoritmos) | config |
| 7 | storage | Persistencia local | config |
| 8 | csv | Texto CSV → filas RAW; filas → CSV | config |
| 9 | normalize | Texto → valor normalizado con estado | config, calendar |
| 10 | validation | Reglas de calidad, issues, duplicados | config, metrics |
| 11 | import | Pipeline stage → process → selectRows | csv, normalize, validation, metrics, calendar |
| 12 | data-store | Colecciones, lotes, consolidación | config, data-model, import |
| 13 | coverage | Cobertura y resumen de calidad | config, calendar, metrics, data-store |
| 14 | export | Contratos y descargas | config, metrics, data-model, forecast, data-store, coverage, csv |
| 15 | mock-data | Datos de prueba Fase 0 | data-model, calendar, events |
| 16 | mock-csv | Archivos CSV de prueba | csv, calendar, config, mock-data |
| 17 | self-test | Pruebas del motor | todos los anteriores |
| 18 | format | Presentación de números | config, metrics |
| 19 | ui | Render Resumen + utilidades | todo lo anterior |
| 20 | import-view, quality-view, data-view | Vistas de Fase 1 | ui, format y módulos de datos |
| 21 | app | Estado y acciones | todo lo anterior |

Los módulos acceden a sus dependencias en tiempo de llamada (`FP.x`), no al cargarse.

Reglas de capa:
- **UI no calcula**: pide resúmenes a `dataModel` y formatea con `format`.
- **Cálculos no tocan el DOM ni el storage.**
- **Solo `app.js` modifica el estado** y decide cuándo persistir.
- **Solo `config.js` declara** canales, métricas, tolerancias y claves.
- **Solo `calendar.getWeekInfo()` define qué es una semana.**
- **Solo `normalize.js` convierte texto de archivo en valores** (fechas, números, canales).
- **Solo `validation.js` decide qué es un problema de calidad** y con qué severidad.
- **La UI nunca lee el CSV original**: muestra `staged.parsed` (RAW) solo para mapear y la
  vista previa sale de registros canónicos.

## 5. Contrato de datos

> Fase 1 reemplazó las tablas 5.1 y 5.2 por los contratos de `config.dataTypes` y los
> sinónimos de `config.importFields` (ver §12). `FP.importer.CSV_CONTRACTS` sigue existiendo
> por compatibilidad y ahora se deriva de esa configuración. Las tablas quedan como referencia histórica.

### 5.1 CSV histórico (`FP.importer.CSV_CONTRACTS.historical`)

| Columna | Destino | Requerida | Alias aceptados |
|---|---|---|---|
| fecha | date (YYYY-MM-DD) | sí | date, dia |
| canal | channel | sí | channel |
| venta | actual.revenue | sí | revenue, actual_revenue |
| pedidos | actual.orders | sí | orders, actual_orders |
| traffic_volume | actual.trafficVolume | sí | volumen, sesiones, actual_traffic_volume |
| conversion_rate | actual.conversionRate | no | cr, actual_conversion_rate |
| aov | actual.aov | no | ticket_promedio, actual_aov |
| evento | event (→ dayType event) | no | event |
| festivo | holiday (→ dayType holiday) | no | holiday |
| temporada | season | no | season |

### 5.2 CSV de plan (`CSV_CONTRACTS.plan`)

`fecha, canal, plan_revenue` (requeridas), `plan_orders, plan_traffic_volume,
plan_conversion_rate, plan_aov` (opcionales).

Canales se normalizan con `CHANNEL_ALIASES` (ej. "e-commerce", "web" → ecommerce; "wa" → whatsapp;
"call center" → llamadas). `conversion_rate` se acepta como fracción o con `%`.

Flujo esperado para la fase de carga CSV:
`leer archivo → filas → validateHeaders() → mapRow() → dataModel.createDailyRecord()/setBlock() → upsertRecord()`.

### 5.3 forecast_export.json (`FP.exporter.buildForecastExport`)

```json
{
  "schema": "forecast_export",
  "schemaVersion": "1.0.0",
  "generatedAt": "ISO",
  "source": { "app": "Digital Sales Forecast & Pacing", "version": "0.1.0" },
  "period": { "year": 2026, "start": "2026-09-01", "end": "2026-09-30", "granularity": "day", "currency": "MXN", "locale": "es-MX" },
  "channels": [{ "id": "ecommerce", "label": "Ecommerce", "traffic_volume_label": "Sesiones" }],
  "metrics_definition": [{ "key": "revenue", "label": "Venta", "kind": "currency", "additive": true, "formula": "traffic_volume * conversion_rate * aov" }],
  "targets": { "annual": {}, "byChannel": {} },
  "records": [{
    "date": "2026-09-01", "channel": "ecommerce", "week": "2026-W36",
    "day_type": "regular", "holiday": null, "event": null, "season": null,
    "plan":     { "revenue": 0, "orders": 0, "traffic_volume": 0, "conversion_rate": 0, "aov": 0 },
    "actual":   { "...": "..." },
    "forecast": { "...": "..." },
    "gap": { "actual_vs_plan": { "revenue": { "reference": 0, "value": 0, "abs": 0, "pct": 0, "attainment": 0 } } },
    "validation_status": { "plan": "ok", "actual": "warning" }
  }],
  "records_total": 120,
  "events": [], "milestones": [],
  "forecast_versions": [{ "id": "original-plan", "type": "original_plan", "locked": true }],
  "current_forecast_version": "original-plan",
  "integration": {
    "counterpart_file": "analysis_export.json",
    "join_keys": ["date", "channel"],
    "loop": ["forecast", "actual", "gap", "diagnosis", "hypothesis", "action", "reforecast"]
  }
}
```

La app de diagnóstico (`analysis_export.json`) debe poder unirse por `date` + `channel`.

## 6. Convenciones de nombres

- **Interno (JS):** camelCase → `trafficVolume`, `conversionRate`, `dayType`.
- **Externo (CSV, JSON exportado):** snake_case → `traffic_volume`, `conversion_rate`, `day_type`.
  La traducción vive en `config.metrics[k].csv` y en `exporter.toContractBlock()`.
- **Estados:** `plan`, `actual`, `forecast` (UI: Plan, Real, Forecast).
- **Canales:** `ecommerce`, `app`, `whatsapp`, `llamadas` (ids en minúscula, sin acentos).
- **Llaves de periodo:** año `2026`, mes `2026-09`, semana `2026-W39`, día `2026-09-23`.
- **Fechas:** siempre string `YYYY-MM-DD`, operadas en UTC.
- **Storage:** `fp.v1:<clave>:<año>` (ej. `fp.v1:dataset:2026`), guardadas en sobre
  `{ schemaVersion, savedAt, data }`.
- **Funciones:** `create*` construye, `validate*` revisa sin modificar, `calc*` calcula,
  `render*` pinta, `hydrate*` reconstruye desde storage.

## 7. Cómo agregar módulos futuros

1. Crear el archivo en la carpeta de su capa (ej. `js/forecast/seasonality.js`).
2. Usar el mismo patrón IIFE y registrar un solo objeto (`FP.seasonality`).
3. Agregar el `<script>` en `index.html` **después** de sus dependencias y antes de `ui.js`.
4. Reutilizar `FP.metrics` para toda operación numérica y `FP.calendar` para toda fecha.
5. Si necesita parámetros, agregarlos a `config.js` (no constantes locales).
6. Agregar pruebas en `self-test.js`.
7. Documentarlo en las secciones 1 y 4 de este archivo.

Destinos previstos por fase:
- Estacionalidad y pesos → `js/forecast/seasonality.js` (usa `dayType`, `dayOfWeek`, `month`, `fortnight`, eventos).
- Distribución de metas → `js/forecast/distribution.js` (llena `targets.byMonth/byWeek/byDay`).
- Pacing → `js/forecast/pacing.js` (usa `calcGap`, `summarize`).
- Reforecast → `js/forecast/reforecast.js` (crea versiones con `addVersion`).
- Carga CSV → lector en `js/import/`, pasando por `validateHeaders` y `mapRow`.
- Descarga JSON → `js/export/` usando `buildForecastExport` sin `sampleSize`.

## 8. Cómo evitar romper funcionalidades existentes

- Correr la app y confirmar **"120 de 120 pruebas correctas"** (o el total vigente) antes y
  después de cada cambio. Fase 0 aportó 24; Fase 1, 19; Fase 2, 16; Fase 3, 14; Fase 4, 14; Fase 5, 12; Fase 6, 14; Fase 7, 7. Las pruebas se agregan; nunca se borran ni se relajan.
- Los casos límite deben seguir mostrando "Coincide" en todas las filas.
- No renombrar funciones, campos ni llaves de storage. Si es inevitable: dejar alias del
  nombre anterior, subir `schemaVersion` y documentar en §9.
- No duplicar lógica: si se necesita un cálculo nuevo, va en `metrics.js`.
- No escribir sobre el Original Plan bloqueado. Desde Fase 1, `record.plan` del Dataset
  consolidado refleja el último plan importado; el Original Plan congelado no cambia (§16).
- No leer ni guardar CSV crudo como fuente: todo pasa por `stage → process → commitBatch`.
- No convertir inválidos en cero ni adivinar fechas ambiguas.
- No eliminar duplicados automáticamente.
- No sobrescribir valores con origen `observed` o `input`.
- No promediar CR ni AOV en ninguna agregación.
- Probar abriendo `index.html` directo (`file://`) y en GitHub Pages.

## 9. Registro de cambios del contrato

| Versión | Fase | Cambio |
|---|---|---|
| 1.0.0 | 0 | Contrato inicial: DailyRecord, Targets, Dataset, versiones, eventos, hitos, CSV, forecast_export. |
| 1.6.0 (sin cambio) | 7 | Fase 7 solo agrega presentación. Nueva clave local `uxSettings` (modo, contexto, vistas visitadas, paso del recorrido); no entra a ningún export. Vistas nuevas `#inicio`, `#medir`, `#ayuda`; la vista inicial pasa a ser Inicio. Única lógica tocada: ninguna de motores. |
| 1.7.0 | 8.1 | Aditivo: IndexedDB `fp-data` (stores kv, productDays, productRollups, productCatalog, productBatches, meta); claves localStorage `storageMigration`, `productSettings`; `config.storageDb`, `config.products`; `category_product_analysis_export.json`; `analysis_export.json` gana el campo opcional `categoryProduct`. Los datos grandes de la app pasan a IndexedDB con la misma forma de sobre; localStorage se conserva como respaldo. |
| 1.6.0 | 6 | Aditivo: `config.recovery` (drivers, objetivos, tipos de escenario, restricciones, estados, catálogo); claves `recoverySettings`, `scenarios:<año>`, `actionPlan:<año>`, `actionLibraryCustom`; `action_plan_export.json`. La llamada de red a Cohere se extrajo a `ai/cohereClient.js` sin cambiar el comportamiento del diagnóstico. |
| 1.5.0 | 5 | Aditivo: tipo de dato `segments` (clave `segmentsData`) con campos `dimension`, `segment` y métricas extra (`customers`, `newCustomers`, `returningCustomers`, `items`, también aceptadas en otros tipos); error `INVALID_NUMBER`; `config.diagnostics`; claves `diagnosticSettings` y `cohereApiKey` (solo si el usuario pide recordarla); `analysis_export.json`. Reforecast: se calcula también el horizonte alterno para mostrarlos lado a lado. El formato `packed-v1` agrega un elemento opcional al final (compatible). |
| 1.4.0 | 4 | Aditivo: `config.reforecast`; claves `reforecastSettings` y `reforecasts:<año>`; corrida `reforecast_run`; versiones `rf_vN`; `reforecast_export.json`. El gráfico SVG de Pacing se extrajo a `ui/chart.js` sin cambiar su salida. Plan, forecast y sus versiones solo se leen. |
| 1.3.0 | 3 | Aditivo: `config.forecast`, `pacingStatusLabels`; claves `forecastSettings` y `forecasts:<año>`; corrida `forecast_run`; snapshots `forecast-<año>-vN`; `forecast_export.json` de Fase 3 como superconjunto del de Fase 0 (mismas claves + secciones nuevas). El plan (Fase 2) solo se lee. |
| 1.2.0 | 2 | Aditivo: `config.planning`, `confidenceLevels`, `planValueSources`; claves `planningSettings` y `plans:<año>`; `calendar.getCalendarDay`; alias `calculate*` e `isApproximatelyEqual` en metrics; celdas de plan `{value, source, status, confidence}`; `planning_export`. `consolidate()` acepta `planFallback` (plan distribuido original) para días sin plan importado. |
| 1.1.0 | 1 | Aditivo, sin romper 1.0.0: CanonicalRecord con celdas `{value, source}`; colecciones historical/plan/actual con lotes; catálogo de errores; `config.channels[].aliases`, `config.importFields`, `config.dataTypes`, `config.errorTypes`, `config.import`; claves de storage `historicalData`, `planData`, `actualData`, `settings` (empaquetadas); exportaciones `normalized_data`, `data_errors`, `data_quality`, `consolidated_data`. El Dataset de Fase 0 pasa de guardarse a derivarse (`consolidate`); la clave `dataset:<año>` se migra una vez y se elimina. |


---

# FASE 1 — Datos, carga y validación

## 10. Flujo de importación

```
Archivo CSV
  │ FileReader (UTF-8; si hay caracteres rotos, reintenta Windows-1252)
  ▼
csv.parse()            RAW: encabezados + filas de TEXTO con número de línea
  ▼
importer.stage()       sugiere mapeo, detecta formato de fechas         ← aún no toca el modelo
  ▼  (el usuario corrige mapeo, tipo de dato, opciones)
importer.process()     normaliza cada celda, construye registro canónico,
                       valida, detecta duplicados (archivo + almacenado)
  ▼  (vista previa, errores, resumen; el usuario confirma)
dataStore.commitBatch() guarda registros seleccionados + lote con TODOS sus issues
  ▼
dataStore.consolidate() Dataset día × canal (Fase 0) para Resumen y forecast futuro
coverage.summarize()    calidad y cobertura
```

- **Staging**: `state.staging.items` guarda los archivos en revisión (en memoria, no se persisten).
  Se admiten varios archivos a la vez y de distintos tipos (importación múltiple).
- Al confirmar un archivo se revalida contra lo guardado en ese momento y los pendientes
  se reprocesan (pueden duplicar lo recién importado).
- **Qué filas entran** (`importer.selectRows`):
  - sin fecha o canal válidos → nunca (no tienen llave);
  - con errores en métricas → solo si el usuario activa "Importar también filas con errores";
    el valor inválido se guarda como `invalid` con su texto original;
  - válidas y con advertencias → siempre.
- Las filas que no entran quedan registradas en `batch.issues` con `rowImported: false`.

## 11. Reglas de normalización (`FP.normalize`)

Cada función devuelve `{ status: ok | missing | invalid | ambiguous, value, raw, note }`.

**Fechas → `YYYY-MM-DD`**
- Año primero (`2026-9-1`, `2026/09/01`, `2026.09.01`) siempre se acepta y se reescribe.
- Se ignora una hora al final (`2026-09-21 00:00`).
- Año al final con `/`, `-` o `.`:
  - opción `DMY` o `MDY` elegida por el usuario → se aplica;
  - automático → solo si es inequívoca (un número > 12, o día = mes), con advertencia `NON_ISO_DATE`;
  - ambas lecturas posibles (`03/04/2026`) → `AMBIGUOUS_DATE` (error). **Nunca se adivina.**
- Años de 2 dígitos, texto y fechas imposibles (`2026-02-30`, `32/01/2026`, `2026-15-20`) → `INVALID_DATE`.
- `detectDateFormat()` revisa todas las fechas del archivo y sugiere un formato con su razón;
  la UI ofrece aplicarlo, pero el usuario decide.

**Números** (formato `dot` 1,234.56 por defecto; `comma` 1.234,56 opcional)
- Se quitan `$`, `MXN`, `USD`, espacios y espacios no separables.
- Separador de miles solo válido en grupos de 3 (`1,5` es inválido en `dot`).
- Negativos con `-` o contables `(2,500)`.
- `%` solo se acepta en CR y se divide entre 100.
- Vacío → `missing`. Texto → `invalid`. **Nunca se convierte a 0.**
- Nota: `FP.metrics.toNumberOrNull` (Fase 0) sigue siendo permisivo para uso interno; los
  archivos siempre pasan por `normalizeNumber`, que es estricto.

**Canales**: minúsculas, sin acentos, separadores unificados; se comparan contra
`config.channels[].aliases`. Todo lo demás → `INVALID_CHANNEL` (no se acepta en silencio).

**Tipo de día**: `regular/normal`, `festivo/holiday`, `evento/event`, `campaña/campaign`,
`especial/special`. Si falta, se infiere: con evento → `event`; con festivo → `holiday`; si no → `regular`.

**Encabezados**: minúsculas, sin acentos, todo lo no alfanumérico → `_`
(`"Meta Venta ($)"` → `meta_venta`), y se buscan en `config.importFields[].synonyms`.

## 12. Mapeo de columnas y contratos por tipo

Campos canónicos (`config.importFields`): `date, channel, revenue, orders, trafficVolume,
conversionRate, aov, event, holiday, season, dayType, notes`. Sinónimos incluidos, entre otros:
`fecha/date`, `venta/ventas/revenue/sales/meta_venta`, `pedidos/orders/ordenes/meta_pedidos`,
`sesiones/sessions/traffic/traffic_volume/mensajes/llamadas/meta_traffic_volume`,
`conversion_rate/cr/meta_conversion_rate`, `aov/ticket_promedio/meta_aov`, `tipo_dia`, `observaciones`.

| Tipo | Obligatorias | Plantilla |
|---|---|---|
| historical | fecha, canal, venta, pedidos, traffic_volume | fecha, canal, venta, pedidos, traffic_volume, conversion_rate, aov, evento, festivo, temporada, tipo_dia |
| plan | fecha, canal, meta_venta | fecha, canal, meta_venta, meta_pedidos, meta_traffic_volume, meta_conversion_rate, meta_aov |
| actual | fecha, canal, venta, pedidos, traffic_volume | fecha, canal, venta, pedidos, traffic_volume, conversion_rate, aov, evento, festivo, temporada, observaciones |

- El mapeo se sugiere; el usuario puede cambiar o ignorar cualquier columna.
- Falta una columna obligatoria → `MISSING_REQUIRED_COLUMN`; dos columnas al mismo campo →
  `DUPLICATE_MAPPING`. Ambos bloquean la importación.
- Cualquier tipo acepta cualquier campo canónico (p. ej. un plan con columna de evento).
- Plantillas: solo encabezados, UTF-8 con BOM para que Excel respete acentos.

## 13. Modelo canónico (CanonicalRecord)

```js
{
  key: "2026-09-21|ecommerce|actual",     // fecha + canal + tipo de dato
  dataType: "historical" | "plan" | "actual",
  date: "2026-09-21", channel: "ecommerce",
  dayType: "regular", holiday: null, event: null, season: null, notes: null,
  metrics: {
    revenue:        { value: 820000,  source: "observed" },
    orders:         { value: 410,     source: "observed" },
    trafficVolume:  { value: 24500,   source: "observed" },
    conversionRate: { value: 0.01673, source: "calculated" },
    aov:            { value: null,    source: "invalid", raw: "abc" }
  },
  status: "valid" | "warning" | "error",
  issueCounts: { error: 0, warning: 1 },
  provenance: { batchId: "bat-…", fileName: "actual_sep.csv", row: 2 }
}
```

**Estado de cada métrica (`source`)**
| source | Significado | value |
|---|---|---|
| observed | Venía en el archivo y se pudo leer | número (puede ser 0) |
| calculated | No venía; se derivó con el motor de Fase 0 | número |
| missing | No venía y no se puede derivar | null (+ `note` si la razón es división entre 0) |
| invalid | Venía pero no se pudo leer | null + `raw` con el texto original |

- **Falta de dato ≠ cero**: `0` es `observed`; celda vacía es `missing`.
- `raw` también se guarda cuando un valor observado se limpió (`"$500,000"` → 500000).
- Negativos quedan `observed` (y con error), pero **no** se usan para derivar otras métricas.
- Derivación: `FP.metrics.deriveBlock` (Fase 0). Solo rellena `missing`; jamás toca `observed` ni `invalid`.

**Colecciones y lotes** (`FP.dataStore`)
```js
store = {
  historical: { batches: [Batch], records: [CanonicalRecord] },
  plan:       { … },
  actual:     { … }
}
Batch = { id, dataType, fileName, importedAt, rowCount, accepted, rejected, includeErrorRows,
          settings, mapping, delimiter, summary, issues: [Issue + {batchId, fileName, dataType, rowImported}],
          origin? ("mock-fase0" | "migration") }
```

**Histórico vs actual**: ambos son venta real, pero viven separados. El histórico alimentará la
estacionalidad; el actual es el periodo en curso. No se mezclan en la consolidación.

## 14. Reglas de validación y estructura de errores

```js
Issue = { type, severity: "error" | "warning", row, field, message, value, key }
```
`row` = línea del archivo (el encabezado es la 1). `field` = encabezado original de la columna.
Catálogo en `config.errorTypes` (severidad por defecto):

| Tipo | Sev. | Cuándo |
|---|---|---|
| MISSING_DATE / INVALID_DATE / AMBIGUOUS_DATE | error | fecha vacía / imposible o ilegible / ambigua |
| NON_ISO_DATE | warning | fecha no ISO interpretada automáticamente |
| FUTURE_DATE | warning | histórico o actual con fecha posterior a hoy |
| MISSING_CHANNEL / INVALID_CHANNEL | error | canal vacío / no reconocido |
| INVALID_REVENUE / INVALID_ORDERS / INVALID_TRAFFIC | error | texto no numérico (warning si pedidos o volumen no son enteros) |
| NEGATIVE_REVENUE / NEGATIVE_ORDERS / NEGATIVE_TRAFFIC | error | valor negativo |
| INVALID_CONVERSION_RATE | error | CR ilegible, negativo o > 1 (sugiere si venía en %) |
| INVALID_AOV | error | AOV ilegible o negativo |
| MISSING_VALUE | warning | celda vacía en columna obligatoria |
| MATHEMATICAL_INCONSISTENCY | warning | CR o AOV cargados fuera de tolerancia; venta 0 con pedidos |
| MATHEMATICAL_INCONSISTENCY | **error** | pedidos con volumen 0; pedidos > volumen; venta con 0 pedidos |
| DUPLICATE_RECORD | warning | misma llave en el archivo o ya almacenada |
| INVALID_DAY_TYPE | warning | tipo_dia no reconocido (se infiere) |
| MALFORMED_ROW | warning | fila con distinto número de columnas que el encabezado |
| MISSING_REQUIRED_COLUMN / DUPLICATE_MAPPING | error | mapeo incompleto o repetido (bloquea) |

**Tolerancia**: `config.import.DATA_VALIDATION_TOLERANCE` = 0.01 (1 % relativo). Editable en
Carga de datos; se guarda en `settings.tolerance` y se registra en cada lote. Es el único
lugar donde vive ese valor. (Las tolerancias de `config.tolerances` de Fase 0 siguen
gobernando la tabla de validación del Resumen.)

**Estado del registro**: `error` si tiene algún issue error; `warning` si solo advertencias; si no, `valid`.

**Duplicados** (llave fecha + canal + tipo): se marca la segunda aparición dentro del archivo y
toda fila cuya llave ya esté guardada. **Nunca se eliminan**. La vista consolidada usa la carga
más reciente (`resolveLatest`); el usuario resuelve quitando el archivo sobrante.

## 15. Cobertura y calidad (`FP.coverage`)

- **Temporal**: rango = primera a última fecha de la colección; días disponibles = fechas con al
  menos un registro; cobertura = disponibles ÷ esperados.
- **Por canal**: días con registro del canal ÷ días del rango. Canales sin datos = canales con 0 días.
- **Por métrica**: % de registros (uno por llave) con valor, separando observado y calculado.
- Registros con venta 0 se reportan aparte: cuentan como cubiertos.
- **Estado general** (el peor entre colecciones con datos), siempre con texto:
  - `Datos no válidos`: filas rechazadas o registros importados con error;
  - `Datos con advertencias`: advertencias, duplicados, fechas faltantes o canales faltantes;
  - `Datos listos`: nada de lo anterior;
  - `Sin datos`.

## 16. Consolidación y relación con Fase 0

`dataStore.consolidate(store, año)` crea el Dataset de Fase 0: un DailyRecord por fecha + canal,
`plan` desde planData y `actual` desde actualData (última carga en duplicados; solo valores
`observed`, lo calculado se re-deriva con el mismo motor, los `invalid` no pasan). Así la tabla
de validación, el export `forecast_export` y cualquier módulo de Fase 0 funcionan sobre datos reales.

- El botón "Generar datos de prueba" (Fase 0) ahora pasa por el pipeline como dos lotes con
  `origin: "mock-fase0"`, que se reemplazan al volver a generarlos.
- Migración: si existe la clave antigua `dataset:<año>` y no hay datos importados, se importa
  una vez como lotes `origin: "migration"` y la clave se elimina.
- El Original Plan congelado de Fase 0 no se modifica al importar planes.

## 17. Estrategia de almacenamiento

| Clave (`fp.v1:…`) | Contenido | Alcance |
|---|---|---|
| `historicalData`, `planData`, `actualData` | colección empaquetada `packed-v1` | global (cruza años) |
| `settings` | tolerancia, formato de fecha y número, incluir filas con error | global |
| `targets:<año>`, `versions:<año>`, `events:<año>`, `milestones:<año>` | Fase 0 | por año |

- Formato `packed-v1`: cada registro como arreglo (`[fecha, canal, tipo_día, …, [valor, código_origen, raw?, note?] × 5]`),
  ~5× más compacto que JSON plano; ida y vuelta sin pérdida (probado en self-test).
- No se guarda el CSV crudo; sí se guarda por lote el mapeo, las opciones y todos los issues.
- Si localStorage se llena o no existe, la app avisa y sigue en memoria; el usuario puede exportar el JSON.

## 18. Estrategia de exportación

| Archivo | Esquema | Contenido |
|---|---|---|
| `normalized_data_<fecha>.json` | `normalized_data` | lotes y registros canónicos de las tres colecciones (celdas con `value`/`source`/`raw`) |
| `data_errors_<fecha>.json` | `data_errors` | catálogo + todos los issues, incluidos los de filas no importadas |
| `data_quality_<fecha>.json` | `data_quality` | resumen de calidad y cobertura |
| `consolidated_data_<fecha>.json` | `consolidated_data` | por año, el `forecast_export` de Fase 0 sobre el Dataset consolidado |
| `normalized_<tipo>_<fecha>.csv` | — | CSV plano de una colección, con columna `_source` por métrica |
| `plantilla_<tipo>.csv` | — | solo encabezados |

Todos los JSON llevan `schema`, `schemaVersion`, `generatedAt` y `source`. Salida en snake_case.
Las descargas usan Blob + enlace temporal (`exporter.download`), válidas en GitHub Pages y `file://`.
El CSV normalizado usa `csv.stringify`, reutilizable para futuras exportaciones CSV.


---

# FASE 2 — Estacionalidad, pesos y distribución de metas

Pregunta que responde: *dada la meta y el histórico, ¿cómo debería repartirse en el tiempo y por canal?*
No proyecta cierre ni hace reforecast.

## 19. Módulos y responsabilidades

| Módulo | Responsabilidad | No hace |
|---|---|---|
| `calculations/weights.js` | Estadística robusta pura: media, mediana, MAD, límites de extremos, winsorizado, media recortada, encogimiento, `normalizeWeights`, niveles de confianza | No sabe de canales ni fechas |
| `calculations/seasonality.js` | Perfil por canal: pesos mensuales, día de semana, día del mes, eventos, festivos, temporadas, supuestos de CR y AOV por mes | No distribuye metas |
| `forecast/distribution.js` | `distributeTarget` (mayor residuo), `normalizeDistribution`, `exactSum` | No conoce el negocio |
| `forecast/planningEngine.js` | `generatePlan`, `generateAnnualPlan`, `generateMonthlyPlan`, `generateWeeklyPlan`, `generateDailyPlan`, `validatePlanClosure`, `compareMethods`, versionado del plan | No hace forecast |
| `export/planningExport.js` | `planning_export.json` | — |
| `calendar.getCalendarDay` | Día de calendario completo (ver §27) | — |

Las fórmulas de métricas siguen en un solo lugar (`metrics.js`). Fase 2 agregó alias con los nombres
del brief (`calculateOrders`, `calculateRevenue`, `calculateConversionRate`, `calculateAOV`,
`calculateTrafficVolume`, `calculateOrdersFromRevenue`) que apuntan a las mismas funciones, e
`isApproximatelyEqual(a, b, tol)` con tolerancia técnica configurable.

## 20. Modelo de estacionalidad (`FP.seasonality`)

Por canal y sobre venta **observada** del histórico (Fase 1, un registro por llave):

```
venta(día) ≈ base(año, mes) × F_díaSemana × F_calendario × F_evento × F_temporada
```

- **base(año, mes)**: promedio de los días regulares (sin evento ni festivo) de ese mes y año.
  Quita tendencia y efecto mensual para que los demás factores no los absorban.
- **Peso mensual**: índice de venta diaria del mes ÷ promedio anual, solo en **años completos**
  (cada mes con ≥ `monthMinCoverage` de días). Años parciales no cuentan para el mensual pero sí
  para los demás factores. Al distribuir se multiplica por los días del mes del año planeado,
  así febrero bisiesto recibe su día extra.
- **Día de la semana**: ratio día ÷ base, agrupado lunes…domingo, excluye días con evento o
  festivo, centro robusto; los 7 factores promedian 1. Cada canal tiene los suyos.
- **Día del mes (calendario)**: ratio ÷ F_díaSemana agrupado por día 1…31. Solo se aplica si el
  efecto supera `calendarEvidenceZ` errores estándar **y** `calendarMinEffect`; además se encoge.
  **No se asume quincena**: aparece solo si los datos la muestran. Se resumen segmentos inicio (1–3),
  quincena (14–16) y fin (28–31) como referencia.
- **Eventos y festivos**: ratio de los días marcados contra base × F_díaSemana, por nombre.
  Festivos sin muestra propia usan el factor "Festivo (general)". Acotados a `eventFactorBounds`.
- **Temporadas**: contraste contra días del mismo mes sin temporada. Si la temporada cubre meses
  completos no hay contraste; el efecto ya está en el peso mensual y el factor queda en 1 (se informa).
- **CR y AOV por mes**: razón de sumas (Σpedidos ÷ Σvolumen, Σventa ÷ Σpedidos) del histórico;
  si el mes no tiene datos, el promedio del canal; si no hay nada, el supuesto manual; si tampoco,
  `insufficient_data`.

**Eventos del año planeado**: vienen de planData/actualData del año (evento, festivo, temporada,
tipo_dia) y de los eventos configurados (Fase 0). **No se inventan**: un evento sin histórico
recibe factor 1 y se marca.

## 21. Suavizado y robustez (`FP.weights`)

1. **Calcular** los ratios históricos (copias; los registros originales no se tocan).
2. **Detectar extremos**: fuera de mediana ± k·σ̂, con σ̂ = MAD × 1.4826 (`outlierMadK`, default 3).
3. **Suavizar** según `smoothing`: `winsorized_mean` (recorta al límite y promedia, default),
   `trimmed_mean` (`trimShare`), `median` o `none`.
4. **Encoger hacia 1** según muestra: `f = 1 + (f_raw − 1) × n / (n + shrinkageK)`. Grupos con menos de
   `minSamples` no se aplican (factor 1, confianza insuficiente).
5. **Normalizar** de nuevo (día de semana promedia 1; los pesos diarios de cada mes suman 1).

## 22. Suficiencia y confianza

| Componente | Base de la confianza | Umbrales (configurables) |
|---|---|---|
| General / mensual | años completos | ≥3 excelente, ≥2 suficiente, ≥1 limitada, <1 insuficiente (`yearThresholds`) |
| Día de semana | observaciones | 104 / 52 / 8 (`sampleThresholds.dayOfWeek`) |
| Día del mes | observaciones | 36 / 24 / 12 (`sampleThresholds.calendar`) |
| Eventos | años en que ocurrió + `minSamples` días | 3 / 2 / 1 (`eventYearThresholds`) |

Con confianza insuficiente el componente **no se usa como si fuera robusto**: se omite (factor 1) o,
en el mensual, se reparte por días (`fallback`). La confianza viaja en cada celda del plan.

## 23. Distribución y prioridad de fuentes

```
Meta anual por canal (Original Target) — nunca se modifica
  ↓  meses explícitos se fijan; el remanente se reparte con peso mensual (o por días si no hay histórico)
Meta mensual
  ↓  días explícitos (planData) se fijan; el remanente se reparte con el peso diario
Plan diario
  ↓  agregación
Plan semanal (ISO) y totales
```

Peso diario (método D):

```
w(día) = F_díaSemana^α₁ × F_calendario^α₂ × F_evento^α₃ × F_temporada^α₄
w_normalizado = w / Σ w (del mes)
meta_día = meta_mes × w_normalizado      (repartido exacto con mayor residuo)
```

α = `componentWeights` (0 a 1). En el mensual, α mezcla el peso histórico con el reparto por días.

Prioridad (de mayor a menor), cada valor guarda su `source`:
1. meta diaria importada (`explicit_plan`), si `useExplicitPlan` está activo;
2. meta mensual explícita (`user_target`, o un mes completo importado → `explicit_plan`);
3. peso histórico mensual (`historical_seasonality`);
4. peso histórico diario (`historical_seasonality`);
5. reparto estándar por días (`fallback`).

La historia solo reparte lo que el usuario no definió. Si lo importado supera la meta del mes, el
remanente es 0 y se reporta un conflicto (no se ajusta la meta).

**Meta anual del canal**: la del usuario (Resumen → Meta anual). Si no hay y el plan importado cubre
todo el año, su suma. Si no hay ninguna, el canal queda `no_target` (no se reparte la meta total por
mezcla histórica en esta fase).

**Semanas**: ISO 8601. Son agregación de días, no un nivel de reparto, para que una semana que cruza
meses nunca rompa el cierre mensual; cada semana informa su desglose por mes.

## 24. Cierre exacto (`FP.distribution`)

Método del mayor residuo (Hamilton) en unidades enteras: centavos para dinero, unidades para pedidos y
volumen. Se asigna `floor(total × peso)` y las unidades sobrantes van, una por parte, a los mayores
residuos. Resultado: **Σ partes = total exacto**, sin tocar la meta y sin cargar el redondeo a un
solo día. Por eso una diferencia en el cierre nunca es de redondeo: es real (p. ej. plan importado ≠ meta).

`validatePlanClosure` verifica con `isApproximatelyEqual` (tolerancia técnica): Σ meses = meta anual,
Σ días = meta mensual por mes, Σ plan del canal = meta del canal, Σ canales = meta digital, y la
coherencia pedidos ↔ venta ÷ AOV y volumen ↔ pedidos ÷ CR.

## 25. Pedidos, volumen, CR y AOV

```
meta de venta del mes + AOV supuesto (histórico del mes)  → pedidos del mes (enteros)
pedidos del mes + CR supuesto (histórico del mes)          → volumen del mes (enteros)
pedidos y volumen se reparten a los días en proporción a la venta (mayor residuo)
CR diario = pedidos ÷ volumen;  AOV diario = venta ÷ pedidos   (recalculados: identidad exacta)
```

Sin AOV o CR (sin histórico ni supuesto manual): pedidos y volumen quedan `null` con status
`insufficient_data`. **Nunca 0.** Si el supuesto viene del promedio del canal (el mes no tiene datos) o de un supuesto manual, el status es `calculated_with_assumption`.

## 26. Celda del plan y trazabilidad

```js
plan.revenue = { value: 257308.84, source: "historical_seasonality", status: "calculated", confidence: "limited" }
```

| source | Significado |
|---|---|
| explicit_plan | venía en el plan importado |
| user_target | meta capturada por el usuario |
| historical_seasonality | repartido con pesos históricos |
| historical_average | supuesto de CR/AOV del histórico |
| calculated | derivado con las fórmulas del motor |
| user_assumption | supuesto manual de CR/AOV |
| fallback | reparto estándar por días |
| insufficient_data | no se pudo calcular (value null) |

status: `loaded`, `calculated`, `calculated_with_assumption`, `insufficient_data`.

**Auditoría** (`plan.audit`): `generatedAt`, `algorithmVersion` (`planning-v1`), `historicalPeriod`
(modo, desde/hasta, años completos, registros), `channels`, `distributionMethod`, `components`,
`assumptions`, `settings` usados y `confidence` por canal y general. Con esto un plan se reproduce.

## 27. Calendario

`calendar.getCalendarDay(date, tags)` devuelve los atributos de Fase 0 más `dayOfWeekLabel`,
`dayOfMonth`, `daysInMonth`, `daysFromMonthEnd`, `weekStart`, `weekEnd` (lunes y domingo de la semana
ISO), `isLeapYear`, `holiday`, `isHoliday`, `event`, `season`, `dayType`. La semana sigue definida
solo en `getWeekInfo` (ISO 8601); `month` es siempre el mes del día.

## 28. Plan vs forecast, versiones e integridad

- La vista Plan genera una **vista previa** (no se guarda) con meta, método, histórico y confianza.
- "Guardar": la **primera** versión del año es el **Plan distribuido original** y se congela
  (`Object.freeze` profundo, `type: original_distributed_plan`). Las siguientes son **Revisiones**
  (`plan_revision`). Nada se sobrescribe. Se guardan en `plans:<año>` (formato compacto por día).
- El Original Target (metas) y el Original Plan de Fase 0 no se modifican.
- `consolidate()` usa el plan original distribuido como `record.plan` en los días sin plan
  importado, así Resumen compara plan vs real con el plan distribuido.
- Para la siguiente fase: `FP.planning.getOriginalPlan(registry)` entrega la línea base; el
  forecast deberá generarse como versión **independiente** sin tocar `plan`.

## 29. Configuración, comparación y exportación

- **Configuración de planeación** (`planningSettings`): método aplicado, periodo histórico
  (anterior al año planeado, todo o personalizado), respetar plan importado, suavizado, k de
  extremos, encogimiento, mínimo de muestras, cobertura mínima por mes, intensidad de cada
  componente y supuestos manuales de CR/AOV. Valores por defecto solo en `config.planning`.
- **Comparación de métodos** A (uniforme), B (mensual), C (mensual + día de semana), D (histórico +
  calendario + eventos): cobertura, confianza y diferencia vs histórico (WAPE mensual y diario al
  repartir el último año completo y compararlo con lo ocurrido). Es ajuste dentro de muestra: sirve
  para comparar métodos entre sí. **La app no elige ganador**; se marca el método en uso.
- **`planning_export.json`**: `metadata` (versión, auditoría), `targets`, `annual_plan`,
  `total_digital`, `monthly_plan`, `weekly_plan`, `daily_plan` (celdas con source/status/confidence),
  `seasonality`, `assumptions`, `validation`. Pensado para que el diagnóstico lo lea en una fase futura.

**No implementado (por diseño)**: reforecast, redistribución del gap, forecast diario dinámico,
escenarios, simulación, diagnóstico, Cohere/IA, GA4, conexión con la app de diagnóstico,
`analysis_export.json`. Cohere nunca calculará metas, pesos ni métricas.


---

# FASE 3 — Actual vs plan, pacing y forecast

Responde: ¿qué debíamos vender (plan), qué vendimos (actual), cómo vamos (pacing/gap), qué proyectamos
cerrar (forecast) y qué tan lejos queda de la meta (forecast gap)? No responde qué hacer para recuperar.

## 30. Tres estados separados

| Estado | Fuente | Regla |
|---|---|---|
| plan | Plan distribuido **original** de Fase 2 (congelado). Si no existe, el plan importado (planData) del Dataset consolidado | Solo lectura. El motor copia valores; nunca escribe sobre el objeto del plan (probado en self-test) |
| actual | actualData (última carga por llave) + historicalData del mismo año en días sin actual (`useHistoricalAsActual`) | Observado o calculado; nunca inválido. Faltante ≠ 0 |
| forecast | día contado → su actual; día no contado → proyección del método sobre el plan diario | Vive en su propio campo y en versiones propias |

## 31. Fecha de referencia, corte y periodos (`FP.pacing`)

- `referenceDate` (Parámetros; vacío = fecha del dispositivo). Fijarla reproduce un análisis pasado.
- `todayStatus`: `completed` → corte = referencia; `in_progress` → corte = referencia − 1 (la carga de
  hoy es parcial: se muestra como "parcial, no cuenta").
- Día: `past` / `today` / `future` respecto a la referencia. **Contado** = día ≤ corte con venta real.
- Periodo (mes, semana, año, evento): `closed` (todos sus días ≤ corte), `current`, `future`.
- Días cerrados sin real: no entran al pacing, se proyectan con el método y generan alerta.

## 32. Pacing y gap (`FP.gap`, `FP.pacing`)

```
gap           = actual − plan
gapPct        = (actual − plan) ÷ plan          (plan 0 → null)
cumplimiento  = actual ÷ plan                   (plan 0 → null)
forecastGap   = forecast − plan del periodo completo
```

- **Gap a la fecha** compara el actual contra el plan de **los mismos días contados**. Como el plan
  diario viene ponderado (Fase 2), el plan acumulado nunca es "días transcurridos ÷ días totales".
- **Gap esperado al cierre** (forecast gap) es otra cosa y vive en otro campo.
- Capa explícita `gap`: `dailyGap`, `cumulativeGap`, `monthlyGap`, `annualGap`, `forecastGap`.
- CR y AOV del periodo = razón de sumas. Sumas estrictas: si un día trae la métrica en null, el total es
  null (datos insuficientes), nunca cero.
- **Semáforo** (`pacingThresholds`, configurable): cumplimiento ≥ `aboveFrom` (101 %) → Arriba del plan;
  ≥ `onPlanFrom` (99 %) → En plan; menor → Debajo del plan; sin dato → Datos insuficientes. Es un estado
  matemático, no un juicio sobre la causa.

## 33. Performance index (`FP.performanceIndex`)

`calculatePerformanceIndex(rows, { metric, from, to })` = Σactual ÷ Σplan sobre los días comparables de la
ventana. CR: (Σpedidos ÷ Σvolumen)real ÷ (Σpedidos ÷ Σvolumen)plan; AOV igual con venta ÷ pedidos.
Ventanas (`config.forecast.windows`), todas terminando en el corte: acumulado del año, mes en curso,
últimos 7, 14 y 28 días. Se calculan por canal, total digital y métrica. Suficiencia: ≥ `minComparableDays`
días y ≥ `minWindowCoverage` de cobertura; si no, `insufficient_data` y valor null (nunca 1 ni 0 por defecto).
La app muestra acumulado y reciente juntos; **no decide cuál es la correcta**.

## 34. Métodos de forecast (`FP.forecastMethods`)

| Método | Día no contado | Supuestos |
|---|---|---|
| A · Plan restante (baseline) | forecast = plan del día | ninguno |
| B · Performance acumulada | venta, pedidos y volumen = plan × su índice YTD; CR y AOV desde las sumas | índices YTD |
| C · Performance reciente | igual con la ventana `recentWindow` (28 días) | índices recientes |
| D · Por drivers | volumen = plan_vol × iVol; CR = plan_CR × iCR; AOV = plan_AOV × iAOV; **pedidos = volumen × CR; venta = pedidos × AOV** | ventana por driver (`driverWindows`) |

- **Sin doble conteo**: en D los índices solo tocan los drivers primarios (volumen, CR, AOV) y pedidos y
  venta se derivan. Nunca venta = plan × iVol × iCR × iAOV × iVenta.
- Todos conservan el patrón diario del plan (estacionalidad de Fase 2): nunca "restante ÷ días restantes".
- Índice sin datos suficientes → ese driver usa 1 (plan) y el día queda marcado `fallback` con el motivo.
- La app compara A–D (forecast, diferencia vs plan, supuestos, confianza) y **no elige ganador**.
- Confianza: A no aplica; B–D según el mínimo de días comparables de sus índices (≥90 excelente, ≥28 suficiente, menor limitada; sin índice, insuficiente).

## 35. Forecast por nivel

```
forecast del día      = actual (contado) | proyección del método (no contado)
forecast del mes      = Σ días → cerrado: = actual; en curso: actual acumulado + forecast de días restantes; futuro: Σ proyección
forecast del año      = Σ meses (cerrados reales + en curso + futuros con su estacionalidad)
forecast del total    = Σ canales día por día (el índice del total se muestra, no se usa para proyectar)
```

Cada canal se proyecta con sus propios índices: cambiar el real de Ecommerce no mueve App (probado).
Semanas ISO: agregación de días; una semana que cruza meses se reporta completa en ambos meses.

## 36. Motor central (`FP.forecastEngine`)

- `runForecast({ year, store, planVersion, dataset, events, settings })` → `forecast_run` con `channels`,
  `total`, `comparison` (A–D), `events`, `alerts`, `plan` (fuente, versión), `referenceDate`, `cutoff`,
  `method`, `settings` efectivos y `algorithmVersion` (`forecast-v1`).
- `generateForecast({ run | …, channel, period: { type: year|month|week, key }, method })` → la API del brief:
  `{ plan, actual, gap, performance, forecast, forecastGap, assumptions, method, confidence }`.
- Eventos: etiquetas del año desde planData, actualData, historicalData del año (si cuenta como real) y
  eventos configurados. Por evento: plan, actual, gap, forecast y una observación descriptiva
  ("durante el periodo se observó un gap de X %"). **No se asume causalidad.**
- Alertas descriptivas (`config.forecast.alerts`): gap creciente o decreciente (racha de N días), performance
  reciente distinta a la acumulada, forecast alejado del plan, días pasados sin real. Sin recomendaciones.

## 37. Versionado, cambio y accuracy (`FP.forecastVersioning`)

- "Guardar forecast" crea `{ forecastVersion: 'vN', generatedAt, referenceDate, cutoff, todayStatus,
  algorithmVersion, method, plan, assumptions, results }` congelado. Nunca se sobrescribe. Se guarda en
  `forecasts:<año>` (resultados por mes y anuales por canal; los diarios se regeneran).
- **Forecast change**: forecast actual vs la última versión (del mismo método si existe).
- **Accuracy** (preparado): para cada versión solo se evalúan meses que estaban abiertos en su fecha de
  corte y hoy ya cerraron completos, así nunca se usa información que no existía. Error, APE, MAPE, bias y
  accuracy = 1 − MAPE. Sin meses evaluables: `insufficient_data`.

## 38. Vista Pacing & Forecast

Controles (fecha de referencia, atajo "último día con real", día completo o en curso, método, métrica),
tablero total y por canal (meta, plan a la fecha, actual, cumplimiento, gap, forecast, gap forecast, estado),
tendencia acumulada en SVG (plan, actual, forecast y línea de corte), tablas por mes, semana y día (con
"todos los canales"), índices por ventana, comparación de métodos, alertas, eventos, versiones y parámetros.
El selector de métrica aplica a Revenue, Orders, Traffic, CR y AOV.

## 39. forecast_export.json

Superconjunto del contrato de Fase 0: conserva `schema, schemaVersion, generatedAt, source, period,
channels, metrics_definition, targets, records[]` (ahora con `forecast` lleno) y agrega `metadata`,
`referenceDate`, `forecastVersion`, `plan`, `actual`, `pacing`, `forecast`, `gaps`, `performance`,
`assumptions`, `method_comparison`, `forecast_change`, `events`, `alerts`. Pensado para la futura app de
diagnóstico (gap → driver → hipótesis → acción); no hay integración automática.

## 40. Fuera de alcance (por diseño)

Reforecast dinámico con redistribución del gap, escenarios, recomendaciones, diagnóstico, Cohere/IA
(nunca calculará forecast, gap, índices ni métricas), GA4 y conexión automática con el diagnóstico.
La siguiente fase leerá `plan` + `actual` + `forecast` + `gap` y creará el reforecast como versión nueva,
sin tocar el plan original.


---

# FASE 4 — Reforecast dinámico y recuperación

Pregunta: *con lo que ya ocurrió, ¿qué tendría que venderse en cada día futuro para llegar a la meta
original?* Solo matemática; no diagnóstico, hipótesis ni recomendaciones.

## 41. Tres realidades separadas

| Estado | Qué es | Dónde vive |
|---|---|---|
| plan | Lo que debíamos vender. Nunca cambia | Plan distribuido original (Fase 2), solo lectura |
| forecast | Lo que estimamos que ocurrirá (actual + proyección del método) | `forecast_run` (Fase 3) |
| reforecast | Lo que **tendría** que ocurrir para conservar la meta: real congelado + pendiente redistribuido | `reforecast_run` (Fase 4) |

Reforecast ≠ forecast: un reforecast requerido de $100M con forecast de $94M no significa que se venderán $100M.

## 42. Flujo (`FP.reforecastEngine.runReforecast`)

```
1 leer plan original     2 leer actual acumulado (días contados ≤ corte)
3 identificar periodo abierto (horizonte)        4 pendiente = max(0, meta − actual); surplus = max(0, actual − meta)
5 pesos futuros (FP.futureWeights)   6 excluir días cerrados   7 normalizar sobre los días restantes
8 repartir el pendiente al centavo (mayor residuo)   9 validar actual + Σ requerido = meta
10 pedidos y volumen requeridos por AOV y CR   11 guardar versión (FP.reforecastVersioning)
```

Se ejecuta por canal de forma independiente; el total digital es la suma de canales día por día.
El pendiente de un canal no se compensa con el surplus de otro. Se recalcula automáticamente cuando
cambia el forecast (nuevo real, plan, año, fecha de referencia o ajustes): actual → pacing → gap →
forecast → reforecast, sin tocar el plan.

## 43. Horizonte del pendiente (`config.reforecast.horizon`)

| Horizonte | Pendiente | Días que lo reciben | Meses futuros | Cierra |
|---|---|---|---|---|
| `year` (default) | meta anual del canal − actual YTD | todos los días futuros del año | reciben requerido | la meta anual |
| `month` | meta del mes en curso − actual del mes | días futuros del mes en curso | = plan original | la meta del mes |

**Ajuste posterior (Fase 5):** el default sigue siendo `year`, pero la vista calcula siempre los dos
horizontes y los muestra lado a lado (meta, actual, forecast, requerido, días y presión del año y del mes en
curso). El selector solo decide cuál alimenta las tablas y el gráfico. Así el gap de meses cerrados nunca
desaparece de la vista y la cifra operativa del mes siempre está a mano. Razón: con el modo año, un gap se
reparte más en los meses de mayor peso (Buen Fin, diciembre); ver ambos evita que el requerimiento parezca
"alcanzable después".

Con `month` se sigue literalmente la lógica "meses cerrados = actual; mes actual = actual + requerido;
meses futuros = plan". El año solo cierra si los meses cerrados no dejaron gap; esa diferencia se ve
en el reforecast anual y no se esconde. Con `year` el gap de meses cerrados sí se redistribuye y el año cierra.

## 44. Pesos futuros (`FP.futureWeights`)

`Seasonality Engine → Plan distribuido → Future Weights → Reforecast Engine`. No hay lógica de
estacionalidad nueva: el peso futuro de un día es su venta en el plan original, que es exactamente
meta_mes × peso diario normalizado de Fase 2.

```
peso_normalizado(d) = plan(d) / Σ plan(días futuros del horizonte)
requerido(d)        = pendiente × peso_normalizado(d)
```

- Cada peso lleva la fuente y confianza de su celda del plan (`historical_seasonality`, `fallback`, `explicit_plan`).
- Peso 0 → el día recibe 0, salvo `zeroWeightFloor` > 0 (mínimo explícito: múltiplo del peso promedio).
- Sin pesos utilizables → `uniform_future_distribution` (configurable), confianza limitada.
- Nunca "pendiente ÷ días restantes" si los días tienen pesos distintos.

## 45. Días congelados, parciales y pasados sin real

- Día contado (≤ corte con real): **congelado**; su reforecast es el actual y nunca se redistribuye.
- Día de referencia en curso (`todayStatus = in_progress`, el mismo ajuste de Fase 3): no está cerrado;
  recibe requerimiento y su real parcial se muestra como avance, sin descontarse del pendiente.
- Día pasado sin real: no se puede vender ni congelar con un valor; queda en null, no recibe
  requerimiento, se cuenta aparte y baja la confianza.
- Sin días futuros (referencia al final del periodo): el pendiente queda reportado (alcanzado o no) y el requerido es 0.

## 46. Métricas de recuperación

| Métrica | Fórmula | Nota |
|---|---|---|
| Remaining target | max(0, meta − actual acumulado) | por canal, mes, semana y año (`targetRemaining`) y del horizonte |
| Surplus | max(0, actual − meta) | se registra aparte; los días futuros se conservan con requerido 0 |
| Surplus vs plan a la fecha | max(0, actual − plan acumulado) | adelanto contra el plan; reduce el pendiente |
| Recuperación requerida | Σ requerido de los días futuros | venta que tendría que ocurrir |
| Recovery gap | requerido − plan original de esos mismos días | + = hay que recuperar; − = hay margen |
| Recovery pressure | requerido ÷ plan de esos días − 1 | descriptiva, no una recomendación |
| Venta adicional requerida | meta − forecast del periodo | escenario de recuperación: lo necesario vs lo esperado |

Para pedidos, volumen, CR y AOV la presión compara el requerido de cada métrica contra el plan.

## 47. Drivers, escenarios y realismo

- **Cadena**: venta requerida ÷ AOV → pedidos requeridos ÷ CR → volumen requerido. Fuente de AOV y CR
  (`assumptionSource`): plan original del día (default), forecast del día o real acumulado del año; se registra.
  Sin AOV o CR: pedidos y volumen null (`insufficient_data`), nunca 0.
- **Qué tendría que cambiar** (vs forecast): venta adicional, pedidos adicionales con AOV constante,
  volumen adicional con CR y AOV constantes.
- **Escenarios** (solo matemáticos, base = forecast de los mismos días): A volumen requerido con CR y AOV
  del forecast; B CR requerido con volumen y AOV del forecast; C AOV requerido con volumen y CR del forecast.
  No se elige ninguno ni se asignan probabilidades.
- **Realismo**: requerido vs histórico de los mismos días del calendario en años anteriores (CR y AOV
  como razón de sumas; volumen como promedio por año), junto al forecast y al plan.

## 48. Confianza

Componentes: pesos futuros (confianza de la estacionalidad del plan; limitada si hay reparto estándar o
uniforme), días futuros, días con real en el horizonte, días pasados sin real y consistencia de métricas
(AOV y CR disponibles). El nivel es el más bajo de los componentes. **No es una probabilidad de alcanzar la meta.**

## 49. Versiones, evolución y simulación

- "Guardar reforecast" crea `{ reforecastVersion: 'rf_vN', generatedAt, referenceDate, cutoff, simulated,
  horizon, method: 'future_weighted_distribution', planVersion, forecastVersion, assumptionSource, results,
  validation }` congelado en `reforecasts:<año>`. `forecastVersion` apunta a la última versión guardada del
  forecast si coincide en fecha y método; si no, se anota que el forecast se calculó al momento.
- **Evolución**: versión, referencia, horizonte, forecast, reforecast, gap forecast, requerido, presión y cambio.
- **Reforecast change** = requerido actual − requerido de la versión anterior (y el mismo cálculo del cierre).
  Se marca cuando el horizonte difiere. No se interpreta la causa.
- **Simulación**: fecha de referencia temporal para la vista. Recalcula forecast y reforecast ignorando el
  real posterior, sin modificar datos ni la fecha de referencia de Pacing. Las versiones guardadas desde una
  simulación quedan marcadas `simulated`.

## 50. Exportación y conexión futura

`reforecast_export.json`: `metadata, referenceDate, plan, actual, forecast, reforecast (horizonte, anual,
meses, semanas, diario con peso normalizado), remainingTarget, surplus, recoveryGap, recoveryPressure,
driverRequirements, versions, reforecastChange, assumptions, confidence, validation`.
Preparado para: plan → actual → gap → forecast → reforecast → requerimiento por driver → diagnóstico.
Fuera de alcance: diagnóstico, hipótesis, recomendaciones, IA (Cohere nunca calculará valores), atribución
causal, campañas y conexión definitiva con la app de diagnóstico.


---

# FASE 5 — Diagnóstico de drivers: brecha → driver → señal → hipótesis

Pregunta: *¿qué variables explican la diferencia entre el resultado y su referencia?* Regla central:
primero demostrar la brecha, después cuantificar el driver, después encontrar la señal, después formular
la hipótesis. Nunca saltarse pasos. Termina en "qué validar"; no hay acciones ni recomendaciones.

## 51. Hecho, driver, señal, hipótesis

| Pieza | Qué es | Ejemplo de redacción |
|---|---|---|
| Hecho | Dato observado | "Venta actual $5.5 M vs $5.46 M plan (+1.1 %)" |
| Driver | Variable con contribución matemática | "Volumen representa la mayor contribución matemática a la brecha observada bajo el método seleccionado" |
| Señal | Comportamiento cuantificado que merece investigación | "Dispositivo Mobile · CR 0.80 % vs 0.89 % (−10.3 %), peso 45.7 %" |
| Hipótesis | Explicación posible, siempre "requiere investigación" | "La caída de CR en Mobile podría estar contribuyendo…" |

Nunca "X es la causa" ni "el problema está en X".

## 52. Comparaciones (`FP.driverEngine`)

Todas se reducen a **pares diarios** `{ date, channel, current, baseline }`; el resto del motor es el
mismo para todas (sin duplicar código). El usuario elige; nunca se mezclan.

| Comparación | Días | current | baseline |
|---|---|---|---|
| actual_vs_plan | contados del periodo | actual | plan de esos días |
| forecast_vs_plan | todos los del periodo | forecast (Fase 3) | plan |
| actual_vs_previous | contados | actual | actual del periodo anterior equivalente (mes: mismo día del mes anterior; semana: 7 días antes; año: año anterior) |
| actual_vs_yoy | contados | actual | actual del mismo día del año anterior |
| reforecast_vs_forecast | futuros del horizonte | requerido (Fase 4) | forecast |

Periodo: mes, semana ISO o año. Canal: total o uno. Métrica: venta (volumen × CR × AOV) o pedidos (volumen × CR).
Botones "Diagnosticar gap" (Pacing & Forecast) y "Diagnosticar recuperación" (Reforecast) abren el
diagnóstico ya configurado con forecast vs plan o requerido vs forecast.

## 53. Nivel 1 — atribución (`FP.attribution`)

Venta = volumen × CR × AOV (pedidos = volumen × CR), con CR y AOV como razón de sumas del periodo.

- **Secuencial** (default, orden configurable `attributionOrder`):
  volumen = (T1 − T0)·CR0·AOV0; CR = T1·(CR1 − CR0)·AOV0; AOV = T1·CR1·(AOV1 − AOV0).
  Suma telescópica: cierra exacto. Depende del orden (se informa).
- **Shapley** (simétrico): promedio de las contribuciones secuenciales sobre todos los órdenes. También cierra.
- Validación: Σ contribuciones = current − baseline (tolerancia técnica); se muestra.
- **Driver principal** = mayor contribución absoluta. **Contribuciones negativas** y **offsets positivos**
  se muestran por separado para ver compensaciones.

## 54. Nivel 2 — descomposición por dimensión

Estructura genérica por grupo: `{ dimension, value, metric, current, baseline, delta, deltaPct, contribution, exposure }`.

- Dimensiones **core** (siempre disponibles): canal (en total digital), tipo de día / evento, día de la semana, semana ISO.
- Dimensiones de **segmentos** (tipo de dato opcional `segments`): device, source, medium, campaign,
  landing, geography, customer_type, category, product, search, checkout, payment, delivery, discount y
  cualquier otra que venga en el archivo. `config.diagnostics.dimensions` dice qué drivers ayuda a explicar cada una.
- **Data-driven**: solo se muestran dimensiones con datos; las demás se listan como "no disponible en los
  datos actuales". Nunca se crean Mobile/Desktop, nuevos/recurrentes, etc. si no existen.
- Contribución por grupo: atribución del driver dentro de cada grupo. La diferencia entre la contribución
  del driver y la suma de sus grupos se muestra como **efecto mezcla** (cambio de participación entre grupos),
  así el árbol siempre cierra con el Nivel 1.
- Segmentos contra plan o forecast: no existen segmentos de plan, así que la referencia de los segmentos es
  el año anterior (se etiqueta "vs año anterior"). En reforecast vs forecast no aplica (el requerido no tiene desglose).

## 55. Clientes y métricas extra

Si el archivo trae `clientes`, `clientes_nuevos`, `clientes_recurrentes` o `items`, se calculan por segmento
(incluido tipo de cliente) junto a venta, pedidos, volumen, CR, AOV e items por pedido. Una caída de clientes
nuevos aparece como **señal adicional** y nunca sustituye al driver principal (prueba 6).

## 56. Señales (`FP.signalEngine.detectSignals`)

Tipos: cambio de driver (Nivel 1), cambio por segmento, cambio de mezcla (participación), métricas de
clientes y anomalías diarias.

```
señal = { id, kind, level, metric, dimension, value, label, current, baseline, delta, deltaPct,
          direction, relevance: { impact, exposure, confidence, score, priority }, evidence, reference }
```

- **Relevancia** no es solo el %: `score = impact × exposure × confidence`.
  impact = |contribución| ÷ max(|brecha|, 1 % de la base); exposure = peso del segmento en la base;
  confidence por días observados. Una caída de 50 % en 0.2 % del negocio pesa menos que una de 5 % en 40 % (probado).
- **Prioridad de investigación** alta / media / baja por umbrales (`signals.priority`). Significa "mira aquí primero", no "culpable".
- Umbrales mínimos: cambio 3 %, exposición 2 %, mezcla 3 pp.
- **Anomalías**: día fuera de mediana ± 3.5·MAD·1.4826 o con ratio ≥ 3× (o ≤ 1/3) contra la base. Se marcan
  "posible anomalía"; nunca se eliminan.

## 57. Hipótesis (`FP.hypothesisEngine`)

`{ id, hypothesis, priority, evidence, mechanism, validationNeeded, relatedSignals, driver, status: 'requires_investigation', source: 'rules'|'cohere' }`

- Siempre cita señales existentes y un driver. Si el driver no tiene señales localizadas, la hipótesis es
  genérica ("existe un deterioro en alguna etapa del proceso de conversión que requiere localizarse";
  validar: funnel por etapa). Sin datos de customer_type no hay hipótesis de nuevos vs recurrentes.
- La vista de evidencia expande cada hipótesis: señales → datos → comparación → mecanismo → qué validar.

## 58. Cohere (`FP.cohereDiagnostic`, opcional)

```
JavaScript → cálculos → drivers → señales → [Cohere] → redacción de hipótesis
```

- Payload: `{ period, comparison, channel, revenueGap, level1Drivers, level2Signals, dataQuality, constraints }`.
  Cohere no recibe ni calcula métricas nuevas.
- Respuesta: JSON `{ hypotheses: [{ id, hypothesis, priority, justification, relatedSignals, mechanism, investigation }] }`
  con `response_format` de esquema. Se valida: JSON parseable, campos obligatorios, prioridades permitidas y
  `relatedSignals` existentes (las inventadas se descartan; si una hipótesis se queda sin señales, se descarta).
- Reglas del sistema: solo evidencia dada, no inventar datos, dimensiones ni causas, distinguir hecho de
  hipótesis, expresar incertidumbre, no convertir correlación en causalidad, no cambiar cálculos ni prioridades.
- Falla de red, timeout, sin key, JSON inválido → "Análisis con IA no disponible"; el diagnóstico matemático
  y las hipótesis por reglas siguen completos (pruebas 8 y 9).
- La API key la escribe el usuario; se guarda en este navegador solo si él lo marca, y nunca se exporta.
  Endpoint `https://api.cohere.com/v2/chat`, modelo configurable.

## 59. Data confidence

Componentes: cobertura de días, observaciones, calidad de datos (estado de Fase 1), consistencia entre
segmentos y total (la suma de segmentos contra la venta total), tamaño de muestra. Nivel = el más bajo.
No es la probabilidad de que una hipótesis sea cierta.

## 60. Recuperación (desde Reforecast)

Con reforecast vs forecast el diagnóstico descompone qué drivers tendrían que cambiar para cerrar el
requerido y lo expresa como volumen, CR y AOV requeridos (con los otros dos constantes), además de pedidos
adicionales con AOV constante y volumen adicional con CR constante. Es matemática, no recomendación.

## 61. analysis_export.json (`FP.analysisExport`)

`schema, schemaVersion, metadata, comparison, period, channel, plan, actual, forecast, reforecast, gap,
level1Drivers, mainDriver, level2, level2Signals, hypotheses, aiAnalysis, recovery, dataQuality, assumptions,
attributionMethod, validation, generatedAt`. Pensado para la app "Diagnóstico de brecha de ventas";
no hay conexión automática ni ciclo acción → impacto → reforecast todavía.

`runDiagnostic({ period, channel, comparison, metric, method, run, rf, store, quality })` devuelve
`{ result, gap, level1Drivers, level2, driverTree, level2Signals, signals, hypotheses, recovery, confidence,
availability, assumptions, validation }` y solo lee copias: plan, actual, forecast y reforecast no cambian (prueba 10).


---

# FASE 6 — Escenarios de recuperación y plan de acción

Cadena: plan → actual → gap → driver → señal → hipótesis → **escenario → acción → impacto simulado →
seguimiento (observado)**. La app diagnostica, simula, propone, registra y mide. No ejecuta nada.

## 62. Hipótesis, escenario, acción e impacto

| Pieza | Qué es | Dónde vive |
|---|---|---|
| Hipótesis | Explicación posible, requiere validación | Fase 5 (`diagnosis.hypotheses`) |
| Escenario | Simulación cuantitativa: "¿qué pasaría si CR +0.15 pp?" | `scenarios:<año>` (inmutable, versionado) |
| Acción | Actividad concreta de una persona o equipo | `actionPlan:<año>` |
| Impacto simulado | Resultado matemático del escenario | `scenario.expectedImpact`, copiado en la acción |
| Impacto observado | Resultado real medido después | `actionPlan.measurements` |

Simulado y observado nunca se mezclan (campos, etiquetas "Simulado" / "Observado" y colores distintos).

## 63. Scenario Engine (`FP.scenarioEngine`)

**Contexto** (`buildContext`): canal (o total), periodo (año, mes, semana, día o rango) y `applyTo`.
Por día: base = real si el día está contado, forecast (método en uso de Fase 3) si no; plan original del día;
`editable` = día no cerrado (default) o todo el periodo (modo retrospectivo). También trae el reforecast del
periodo (Fase 4) y las participaciones de segmentos.

**Fórmulas** (día por día, usando `FP.metrics.calculateOrders` y `calculateRevenue`, sin duplicar):
```
volumen' = volumen × (1 + Δvol%)
CR'      = CR + Δpp            (o CR × (1 + Δ%))       ← pp y % nunca se confunden
AOV'     = AOV × (1 + Δ%)       (o AOV + Δ$)
pedidos' = volumen' × CR'
venta'   = pedidos' × AOV'
```
Pedidos y venta siempre se derivan. Escenarios combinados aplican los tres cambios a la vez (con interacción).

**Segmentos (Nivel 2)**: solo dimensiones y segmentos presentes en los datos de segmentos. La exposición se
estima con su participación en los últimos `segmentShareDays` (28) días con datos (volumen, pedidos y venta por
separado); el cambio se aplica a esa parte del día y el incremento se suma al canal. Se registra como supuesto.

**Canales**: cada canal se simula por separado; total digital = Σ canales. Un escenario de App no toca Ecommerce.

**Gap** (convención "falta para el plan", positivo = falta):
```
gapBefore = plan del periodo − base del periodo
gapAfter  = gapBefore − venta incremental simulada
recovery% = incremental ÷ gapBefore      (sin brecha: no aplica)
```

**Persistencia**: `saveScenario` guarda `{ scenarioId (SC_001_v1), family, version, supersedes, name, type, createdAt,
context, target, inputs, links (hypothesisId, signalIds, driver, hypothesisDriver), outputs, expectedImpact,
assumptions, warnings, days }` congelado. Editar crea `SC_001_v2` con `supersedes`; la v1 no cambia. `days` guarda
la base y el valor simulado de cada día editable para medir después contra el real.
Tipos: Base, Conservador, Intermedio, Agresivo, Personalizado (etiquetas, no predicciones).

## 64. Validación (`FP.scenarioValidation`)

Errores que bloquean: NaN, Infinity, bajas de más de 100 %, CR resultante > 100 % o < 0, cualquier valor negativo,
variable no disponible (sin volumen, CR o AOV en la base), segmento inexistente, periodo sin días editables.
Advertencias siempre visibles: cambios que exceden `maxTrafficIncrease` (%), `maxCRIncrease` (pp; un cambio en % se
convierte con el CR base) o `maxAOVIncrease` (%). Presupuesto, capacidad, inventario y fecha se registran como
restricciones de referencia (no entran al cálculo).

## 65. Recovery Engine (`FP.recoveryEngine`)

**Cálculo inverso** con I = gap × objetivo (10, 25, 50, 75, 100 %) sobre los días editables:
```
A solo volumen : Δvol% = I ÷ R          B solo CR : Δpp = I ÷ Σ(volumen_d × AOV_d)       C solo AOV : Δ% = I ÷ R
D, E, F dos drivers : mismo x relativo, (1 + x)² = 1 + I ÷ R        G tres drivers : (1 + x)³ = 1 + I ÷ R
```
R = venta base editable. Cada alternativa se re-simula y se marca: posible / no posible (p. ej. CR > 100 %) /
excede restricción. Con restricciones definidas se muestra el recovery máximo dentro de ellas. No se ordenan como
mejor o peor.

**API principal**: `runRecoveryAnalysis({ ctx, diagnosis, constraints, scenarioStore, actionPlan, customActions, targetPct })`
→ `{ context, gap, drivers, signals, hypotheses, scenarios, recoveryOptions, actions, catalog, reforecast, mainDriver,
assumptions, dataQuality }`. El diagnóstico de origen se corre con la comparación elegida (default forecast vs plan)
para mes, semana o año.

## 66. Relación con analysis_export.json y reforecast_export.json

- `contextFromAnalysisExport`: lee gap, drivers, señales e hipótesis; arma un contexto **agregado** del periodo con
  la parte ya ocurrida (actual) y la restante (forecast − actual) como editable. Permite escenarios y acciones.
- `contextFromReforecastExport`: lee el detalle diario (real congelado, forecast futuro, plan), gap restante,
  requerimiento, días disponibles y presión, en el periodo del horizonte y los cuatro canales.
- Los contextos importados se marcan en pantalla y no modifican los datos de la app.

## 67. Action Library (`FP.actionLibrary`)

Catálogo configurable (`config.recovery.actionLibrary` + acciones propias en `actionLibraryCustom`):
`{ actionId, name, description, driver, applicableChannels, applicableSignals, requiredData, ownerArea,
measurementMetric, defaultWindowDays }`. Se filtra por driver y canal; si pide datos que no existen (p. ej.
`customer_type`) se marca, no se oculta. Es un catálogo de acciones **posibles**, no recomendaciones.

## 68. Action Plan (`FP.actionPlan`)

Una acción solo se crea desde un escenario guardado ligado a una hipótesis (la cadena no se salta).
`{ actionId, title, description, catalogId, source (catalog|cohere), hypothesisId, hypothesis, scenarioId, signalIds,
driver, channel, period, owner, status, priority, expectedImpact, measurement, startDate, endDate, notes, createdAt, history }`.
Estados: proposed, approved, in_progress, completed, measuring, validated, rejected, cancelled. Cada cambio de campo o
estado se agrega a `history`; nada se borra.
**Prioridad descriptiva**: impacto simulado (recovery ≥ 25 % alto, ≥ 10 % medio), exposición (peso del alcance en la
venta digital), urgencia (días al fin del periodo ≤ 14 alta, ≤ 45 media), evidencia (hipótesis localizada = alta),
restricciones. Nunca "mejor acción".

## 69. Impact Measurement (`FP.impactMeasurement`, `FP.actionTracking`)

Sobre los mismos días de la ventana de la acción y solo donde ya hay real:
```
baseline = base guardada en el escenario (forecast de esos días al simular)
escenario = valor simulado guardado
observado = real cargado después
realización = (observado − baseline) ÷ (escenario − baseline)
≥ 0.8 consistente · ≥ 0.2 parcialmente consistente · menor no consistente · sin real: sin datos
```
Lectura: "El resultado observado es consistente / no consistente con el escenario". Factores listados: eventos y
festivos de la ventana, otros drivers que se movieron ≥ 5 %, días sin real, y mix / promociones / precio / canal como
no medidos. Nunca "la acción causó". Mediciones append-only en `actionPlan.measurements`.

## 70. Cohere en esta fase (`FP.cohereActions`)

Recibe `{ hypothesis, driver, signals, scenario, availableDimensions, dataQuality, constraints, catalog }` y devuelve
`{ actions: [{ actionId, action, rationale, relatedDriver, relatedSignals, informationNeeded }] }`. Se valida: JSON,
driver permitido (volumen, CR, AOV), señales existentes (las inventadas se descartan). No calcula venta, CR, AOV,
volumen, gap ni impacto, no modifica plan ni actual y no afirma causalidad. Falla o JSON inválido → "Análisis con IA
no disponible" y el resto del módulo sigue. Una propuesta de IA entra al plan solo si el usuario la agrega y queda
marcada como tal. La llamada de red es la misma de Fase 5 (`FP.cohereClient`).

## 71. Recovery Center (vista)

Contexto (canal, periodo, aplicar a días no cerrados o todo el periodo, diagnóstico de origen, restricciones,
importar/exportar) → brecha (plan, actual, forecast, forecast gap, reforecast requerido, presión) → drivers e hipótesis →
simulador → "¿qué tendría que cambiar?" → "¿cuánto del gap puedo recuperar?" (suma simple de escenarios marcada como
tal, sin interacción) con líneas plan / actual / forecast / reforecast / escenarios y tabla comparativa → catálogo e IA →
plan de acción → seguimiento → **cadena de trazabilidad** por acción (brecha → driver → señal → hipótesis → escenario →
acción → impacto simulado → resultado observado), cada nodo con su origen. Las cifras de la brecha muestran su origen
al pasar el cursor; el simulador tiene "¿De dónde salen estas cifras?".

## 72. action_plan_export.json

`schema, schemaVersion, metadata, period, channel, comparison, gap, drivers, signals, hypotheses, scenarios,
recoveryOptions, actions, measurements, traceability[] (actionId → gap, driver, signalIds, hypothesisId, scenarioId,
simulatedImpact, measurementIds, lastObserved), assumptions, dataQuality, generatedAt`.

## 73. Integridad y fuera de alcance

Escenarios, acciones y mediciones nunca modifican plan, actual, forecast base ni reforecast base (probado).
Fuera de alcance: envío de emails, automatización de campañas, ejecución de acciones, Google Ads, Meta Ads, GA4 en
tiempo real, CRM, Magento, A/B automático, causalidad automática, machine learning, optimización de presupuesto.


---

# FASE 7 — Experiencia guiada, navegación contextual y ayuda

Principio: *la aplicación ya sabe calcular; ahora enseña a leer, interpretar y recorrer lo que calcula.*
Esta fase es una capa de presentación: no cambia motores, fórmulas, contratos, exports ni el plan original.
Detalle para el usuario en `UX_GUIDE.md`.

## 74. Navegación agrupada

| Grupo | Vistas existentes a las que apunta |
|---|---|
| Inicio | `#inicio` (nuevo, centro de control) |
| Planear | Carga, Calidad, Datos normalizados, Metas y motor (`#resumen`), Estacionalidad, Plan, Configuración |
| Monitorear | Pacing & Forecast |
| Diagnosticar | ¿Por qué? Diagnóstico |
| Recuperar | Recovery & Reforecast, Recovery Center |
| Medir y aprender | `#medir` (nuevo: acciones, mediciones, cadena y aprendizajes de todos los canales) |
| ¿Cómo funciona? | `#ayuda` (nuevo) |

Las vistas y sus hashes no cambian (los enlaces viejos siguen funcionando). El menú muestra grupos y un submenú del
grupo activo; cada grupo recuerda la última vista visitada. Migas: Inicio › Grupo › Vista (› detalle).

## 75. Motor de contexto y siguiente paso (`FP.contextEngine`)

`collectStatus(state)` arma un estado plano y congelable (datos, meta, plan, real, forecast, reforecast, diagnóstico,
escenarios, acciones, mediciones, vistas visitadas) **leyendo** lo que ya calcularon los motores; no calcula métricas.
`describe(view, status)` → `{ whereAmI, whatAmISeeing, whatDoesItMean, whatShouldIInvestigate, nextStep, availableActions }`.
`headline(status)` produce frases descriptivas (sin scores). `requirements(view, status)` alimenta los estados vacíos.

`getNextStep(status)` evalúa reglas en orden fijo y devuelve la primera que aplica:
cargar datos → revisar calidad (si hay filas inválidas) → capturar meta → configurar plan → cargar real del año →
revisar pacing → revisar drivers (si hay brecha) → buscar evidencia (diagnóstico sin hipótesis) → simular recuperación →
plantear acción → configurar seguimiento → monitorear. Sin IA.

## 76. Sistema de ayuda (`FP.help`, `FP.guidanceConfig`)

Una sola estructura de entrada: `{ id, title, shortDescription, detailedDescription, howToRead, formula, interpretation,
caveats, nextStep, state? }` (37 entradas: métricas, estados, conceptos de diagnóstico y recuperación). Un solo componente
la muestra como ícono "?", panel lateral, glosario con búsqueda y explicadores por vista. `decorate()` agrega el ícono a
encabezados y etiquetas conocidos (21 disparadores) sin tocar el HTML de las vistas. Escape cierra el panel.

## 77. Convención de estados

Plan, Actual, Forecast, Reforecast, Escenario y Observado tienen etiqueta con **texto**, color y estilo de borde (sólido, contorno,
punteado, doble, rayado), con definición corta en Inicio, glosario y ayuda. Nunca dependen solo del color.
Forecast = "¿dónde terminaríamos?"; Reforecast = "¿qué tendría que pasar en los días restantes para conservar la meta?"
(nunca se llama pronóstico).

## 78. Inicio, estados vacíos y calidad visible

Inicio muestra, para canal y periodo elegidos: venta acumulada, meta acumulada, gap, cumplimiento, forecast, gap forecast y
presión de recuperación (tarjetas con estado, comparación, periodo y ayuda), frases descriptivas, el recorrido del sistema
(Planear → … → Aprender, marcado como hecho o pendiente) y el siguiente paso. Si el plan no cubre el periodo elegido, se
explica en vez de cambiar el periodo.
Los estados vacíos dicen qué falta y llevan a la vista correcta. Cuando la calidad de datos tiene advertencias o errores,
la barra de contexto lo muestra en todas las vistas con enlace a Calidad, sin bloquear el resto.

## 79. Filtros persistentes

Contexto compartido `{ channel, periodType, periodKey, comparison }`: al salir de Inicio, Pacing, Reforecast, Diagnóstico
o Recovery Center se lee de sus filtros, y al entrar a otra se aplica si es compatible. Si la vista no admite la
selección (p. ej. "día" en el diagnóstico) se ajusta y se **explica** en la barra; nunca se cambia en silencio.

## 80. Recorrido guiado y modos

- Recorrido opcional de 10 pasos (meta, pacing, forecast, gap, drivers, señales, hipótesis, escenario, acción, medición):
  qué vemos, por qué importa, qué buscar, qué sigue; avanzar, retroceder, salir y retomar; progreso "Paso n de 10"
  (de navegación, no del negocio); resalta el bloque correspondiente.
- **Ejecutivo** colapsa bloques técnicos listados en `ANALYST_ONLY` (métodos, índices, parámetros, auditoría, árbol,
  confianza, cálculo inverso, configuración) y avisa cuántos ocultó con botón para verlos. **Analista** (default) muestra todo.
  No se elimina información.

## 81. Diagnóstico guiado y trazabilidad visible

- "¿Por qué está pasando?": brecha → drivers → señales → hipótesis → información faltante → siguiente investigación,
  con la leyenda Hecho / Driver / Señal / Hipótesis y un árbol visual que solo expande dimensiones existentes.
- `FP.traceability` arma la cadena plan → forecast → gap → driver → señal → hipótesis → escenario → acción → impacto
  simulado → medición de cada acción (solo lectura) para Medir y aprender y el Recovery Center.

## 82. Accesibilidad y responsive

Foco visible, `aria-current` en navegación y migas, `role="progressbar"` en el recorrido, botones con texto, ayuda con
teclado y Escape, estados con texto y forma además de color. El menú de grupos se desplaza horizontalmente en móvil.
Cohere no participa en la navegación ni en la ayuda: todo funciona sin IA.

**Nota de presentación (Fase 7):** `btn--quiet` (texto rojo) queda reservado para acciones destructivas o de
restablecimiento (borrar datos, quitar archivo, restablecer parámetros). Las acciones secundarias neutras usan
`btn--ghost`. La barra de navegación agrupada ocupa el ancho del contenedor y queda alineada con el contenido.


---

# FASE 8 — Preparación: auditoría de almacenamiento y prueba técnica de IndexedDB

Pasos 1 a 4 del alcance confirmado (granularidad diaria, todos los SKU). **Todavía no cambia el
almacenamiento de la app**: se entrega la auditoría, la prueba técnica y el diseño para aprobar.

## 74. Auditoría del almacenamiento actual

Todo pasa por un solo objeto `storage` (FP.storage) en `app.js`: ningún motor ni vista llama a
`localStorage` directamente. Eso permite cambiar el adaptador sin tocar motores.

| Clave (`fp.v1:…`) | Tamaño medido* | Crece con | Destino propuesto |
|---|---|---|---|
| `historicalData` | ~624 KB | días × canales | IndexedDB (store `kv`) |
| `segmentsData` | ~468 KB | días × canales × segmentos | IndexedDB (`kv`) |
| `planData` | ~190 KB (plan diario 2026) | días × canales | IndexedDB (`kv`) |
| `plans:<año>` | ~115 KB | versiones de plan | IndexedDB (`kv`) |
| `actualData` | ~15 KB | días × canales | IndexedDB (`kv`) |
| `forecasts:<año>`, `reforecasts:<año>`, `scenarios:<año>`, `actionPlan:<año>` | 4–10 KB c/u | versiones guardadas (append-only) | IndexedDB (`kv`) |
| `settings`, `planningSettings`, `forecastSettings`, `reforecastSettings`, `diagnosticSettings`, `recoverySettings`, `uxSettings`, `cohereApiKey`, `actionLibraryCustom`, `targets:<año>`, `events:<año>`, `milestones:<año>`, `versions:<año>` | < 1 KB c/u | casi nada | **Se quedan en localStorage** |

\*Sesión de prueba completa: ~1.24 MB de ~5 MB disponibles en localStorage.

## 75. Prueba técnica (tools/idb-proof.html)

Base separada `fp-idb-proof`. Datos sintéticos diarios por SKU. Dos diseños:

- **A · una fila por fecha × canal × SKU** con 5 índices (fecha, SKU, categoría, canal+fecha, categoría+fecha).
- **B · una partición por fecha × canal** con columnas tipadas (todos los SKU del día) + rollup diario por categoría.

Resultados (Chromium, sin interfaz):

| Verificación | A (filas) · 540 mil SKU-días | B (particiones) · 4.38 millones SKU-días (365 d × 3,000 SKU × 4 canales) |
|---|---|---|
| Escribir | 129 s (4,173 filas/s) | **5.0 s** (~875 mil SKU-días/s) |
| Espacio | ~125 MB | **~86 MB** |
| Un día, 4 canales | 259 ms | 6 ms |
| Serie de un SKU (todo el periodo) | 28 ms | 749 ms (año completo) |
| Categoría, 30 días | 651 ms | 2 ms (rollup) · 81 ms recalculado desde SKUs |
| Canal, 30 días | 643 ms | 55 ms |
| Pausa máxima de la interfaz al cargar | 140 ms | 29 ms |
| Persiste tras recargar | Sí | Sí |
| file:// y http(s) | Sí | Sí |

Las 12 verificaciones del alcance pasan con B. **Conclusión: IndexedDB es viable y el diseño B es el recomendado.**
El diseño A se descarta: escribir un año de 3,000 SKU tomaría ~17 minutos.
Falta confirmarlo en el GitHub Pages real (el origen https de la app): abrir `/tools/idb-proof.html` en el sitio.

**Cuello de botella encontrado: la importación, no el almacenamiento.** El pipeline actual de Fase 1 crea un
objeto canónico por fila (~26 mil filas/s y mucha memoria): sirve para día × canal, no para millones de filas.
Leer CSV sí es rápido (~230 mil filas/s). Los productos necesitan una ruta de importación ligera (§77).

## 76. Diseño propuesto (pendiente de aprobación)

```
UI / vistas
   ↓
Servicios de la app (app.js, acciones)
   ↓
Repositorio (FP.repository, asíncrono)
   ├── Preferencias ──▶ FP.storage (localStorage, síncrono)   — sin cambios
   ├── Datos de la app ─▶ IndexedDB store `kv` (se cargan a memoria al arrancar; los motores no cambian)
   └── Productos ──────▶ IndexedDB `productDays` (particiones) + `productRollups` + `productCatalog`
                          (nunca se cargan completos; se consultan por fecha, canal, categoría o SKU)
```

Stores de IndexedDB (base `fp-data`):
- `kv` { key, value, savedAt, schemaVersion } — mismas colecciones empaquetadas que hoy.
- `productDays` clave [fecha, canal] — columnas: índice de SKU, venta, pedidos, unidades, vistas (null = faltante,
  nunca 0) y origen por métrica (observado / faltante / inválido).
- `productRollups` clave [fecha, canal, nivel, clave] — categoría y subcategoría por día.
- `productCatalog` clave sku — categoría, subcategoría, producto, índice.
- `productBatches` — archivos importados, resumen, issues (con ejemplos acotados).
- `meta` — versión del esquema y estado de migración.

## 77. Estrategia de migración y compatibilidad

1. Al arrancar, si IndexedDB está disponible y no hay bandera de migración: copiar cada clave de datos de
   localStorage a `kv`, leerla de vuelta y compararla; si coincide, guardar la bandera `storageMigration`.
2. Desde ese momento los datos se leen de IndexedDB. **localStorage no se borra automáticamente**: queda como respaldo
   hasta que el usuario pulse "Liberar espacio de datos anteriores".
3. Si IndexedDB no está disponible (navegador muy restringido), la app sigue como hoy con localStorage y la capa de
   productos se desactiva con un aviso.
4. El arranque pasa a ser asíncrono solo en la carga inicial; después los motores siguen trabajando en memoria.
5. Se pide almacenamiento persistente (`navigator.storage.persist()`) y se muestra si el navegador lo concedió.

Importación de productos: lectura del archivo por partes, validación ligera por fila con las mismas reglas de
normalización (fecha, número, canal; faltante ≠ 0; inválido ≠ 0), escritura directa en particiones, rollups y
catálogo; vista previa de las primeras filas y errores resumidos por tipo con ejemplos. Recomendado: un archivo por mes.

## 78. Límites a conocer

- Los datos de IndexedDB quedan ligados al navegador, al equipo y al dominio: lo cargado en el GitHub Pages no se ve
  al abrir la app desde el archivo local ni desde otra computadora. Los exports JSON siguen siendo el respaldo portable.
- Si el navegador no concede almacenamiento persistente, puede liberar datos bajo presión de espacio.
- Un año completo de todos los SKU en un solo CSV pesaría cientos de MB: conviene cargar por mes.

## Asistente de metas (ajuste posterior a Fase 7)

En Meta anual, "Calcular metas desde el histórico" (`FP.targetAssistant`) propone las metas del año seleccionado:
venta real del año base por canal (actual si existe para la llave; si no, histórico) × (1 + crecimiento), o un total
fijo; repartido con la mezcla real del año base o con porcentajes capturados (los cuatro, sumando 100 %). El reparto es
exacto en pesos (Σ canales = total). **Solo llena el formulario**: la meta se guarda únicamente con "Guardar metas" y
sigue siendo decisión del negocio. Si el año base tiene menos de 95 % de días con datos en algún canal, se advierte.


---

# FASE 8.1 — IndexedDB, carga de productos y Categoría → Producto

## 79. Arquitectura de almacenamiento (implementada)

```
UI / vistas
  ↓
Servicios (app.js, motores) ─── misma interfaz síncrona save/load/remove/clear
  ↓
Repositorio (FP.repository)
  ├── createRoutedStorage: claves de datos → IndexedDB `kv` (caché en memoria + escritura en cola)
  │                        preferencias y banderas → localStorage (FP.storage)
  └── FP.productStore: productos → productDays / productRollups / productCatalog / productBatches
  ↓
FP.idb (primitivas: open, put, get, getAll, iterate, count, putMany con cesión de hilo)
```

- Arranque asíncrono: `repo.init()` abre `fp-data` y carga `kv` a memoria → migración → carga normal. Los motores
  siguen trabajando en memoria y síncronos: ninguno cambió.
- Datos en IndexedDB (`config.storageDb.dataKeys`): historicalData, planData, actualData, segmentsData, dataset (legado),
  plans, forecasts, reforecasts, scenarios, actionPlan. Se quedan en localStorage: settings, planningSettings,
  forecastSettings, reforecastSettings, diagnosticSettings, recoverySettings, uxSettings, cohereApiKey,
  actionLibraryCustom, targets, events, milestones, versions (Fase 0), storageMigration, productSettings.
- Si IndexedDB no está disponible, todo sigue en localStorage como antes y la capa de productos se desactiva con aviso.
- "Borrar datos guardados" (acción explícita) limpia localStorage de la app e IndexedDB.

### Stores e índices (`fp-data` v1)

| Store | Llave | Índices | Para qué consulta |
|---|---|---|---|
| kv | key | — | datos de la app (mismo sobre `{schemaVersion, savedAt, data}`) |
| productDays | [fecha, canal] | channel_date [canal, fecha] | día, rango, canal + fecha; SKU/producto recorriendo el rango |
| productRollups | [fecha, canal, nivel, clave] | level_key_date [nivel, clave, fecha] | categoría y subcategoría + fecha sin recorrer SKU |
| productCatalog | sku | category, product | atributos del SKU, búsquedas por categoría o producto |
| productBatches | id | — | archivo, mapeo, resumen, issues con ejemplos, conflictos |
| meta | key | — | resumen de productos cargados (fechas, canales, métricas, SKU) |

Índices descartados a propósito: fecha + SKU y fecha + canal + SKU como índices por fila exigirían una fila por SKU-día
(diseño A de la prueba: 17 min para escribir un año). Con bloques día × canal, la serie de un SKU en un año completo
se obtiene recorriendo 1,460 bloques en ~0.6 s; categoría y subcategoría salen de los resúmenes en milisegundos.
Los resúmenes se guardan porque la consulta más frecuente (categoría × rango) pasa de recorrer millones de celdas a
leer decenas de filas; ocupan una fracción del bloque (categoría + subcategoría por día y canal).

## 80. Migración (no destructiva, idempotente, verificable)

`FP.storageMigration.migrate`: localStorage → copia → IndexedDB → verificación → `verified`. Nunca borra localStorage.
- Estado en localStorage `storageMigration`: `{ schema, status (pending|copying|verified|failed|unavailable), attempts,
  startedAt, finishedAt, keys[{ key, action (copied|kept_newer|skipped), source, target, verified }], error,
  localStorageKept: true }`.
- Verificación leyendo directo de IndexedDB: contenido JSON idéntico + resumen por clave (registros, lotes, fecha
  mínima y máxima, canales, versiones). "Tiene datos" no basta.
- Idempotente: la copia es por clave; repetirla no duplica. Si IndexedDB ya tiene una versión más reciente de una
  clave, no se sobrescribe (`kept_newer`).
- Si falla: la app sigue leyendo y guardando en localStorage; "Reintentar migración" en Categoría → Producto.
- Mientras la migración no esté `verified`, los datos no se enrutan a IndexedDB.

## 81. Contrato de producto (oficial desde el 25-09-2026, Fase 8.1.1)

Dos archivos, cada uno con su propia granularidad, porque **la vista de ficha ocurre antes de elegir sucursal**:

**Productos · venta** (sistema de ventas) — un renglón por fecha × canal × SKU × estado × sucursal × tipo de entrega:
`fecha, canal, sku, codigo_producto, producto, marca, categoria, subcategoria, presentacion, estado, sucursal, tipo_entrega, venta, pedidos, unidades`

**Productos · funnel** (GA4, métricas por artículo) — un renglón por fecha × canal × SKU, sin estado ni sucursal:
`fecha, canal, sku, vistas_ficha, agregados_carrito, inicio_checkout, compras_ga4`

| Campo | Archivo | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| date, channel, sku | ambos | fecha / canal / texto | sí | mismas reglas de Fase 1 |
| state | venta | catálogo fijo (32 estados) | sí | variantes aceptadas (CDMX, Edo. Méx., etc.); no reconocido = rechazo, no se adivina |
| branch | venta | texto | sí | identificador estable; incluye recolección y envío a domicilio |
| delivery | venta | domicilio \| recolección | sí | variantes aceptadas (pickup, click & collect…) |
| productCode, product, category, subcategory, brand, presentation | venta | texto | no | atributos del catálogo |
| extraDimension | venta | texto | no | otra dimensión legítima: se suma por renglón |
| revenue, orders, units | venta | número | ≥ 1 | observadas |
| views, addToCart, beginCheckout, purchasesGa4 | funnel | número | ≥ 1 | observadas; misma unidad GA4 por artículo |

`config.products.dataType` (venta) y `config.products.funnelType` (funnel) declaran encabezados y obligatorios;
`FP.productStore.detectKind` adivina el tipo por las columnas y el usuario puede corregirlo. El archivo de venta es
transaccional: un SKU con vistas que no aparece ese día × canal se interpreta como 0 pedidos (no como faltante) para
el cálculo de CR — ver §90.

## 82. Reglas de métricas y disponibilidad

- Celdas: observed | missing (vacía) | invalid (texto o negativo). En columnas tipadas se guardan como NaN y en la
  salida como null con su estado. **Nunca 0.**
- Estados agregados: available, partial (hay faltantes), missing, invalid, unavailable (la columna no existe o no se
  puede cruzar), not_calculable.
- Venta, pedidos y unidades del archivo de venta = observadas; vistas, agregados al carrito, inicios de checkout y
  compras GA4 del archivo de funnel = observadas. Ninguna se reconstruye ni se sobrescribe con otra fuente.
- CR, AOV y las tres tasas del funnel siempre se marcan `calculated` (ver fórmulas en §90).
- **Estado, sucursal y tipo de entrega ocurren en el checkout, después de la vista de ficha**: al agrupar o filtrar
  por cualquiera de los tres, el funnel completo (vistas, tasas, CR) se reporta `unavailable` con la nota
  correspondiente — no es una falta de datos, es que la pregunta no tiene esa respuesta.

## 83. Duplicados

Llave: fecha + canal + SKU en el funnel; fecha + canal + SKU + estado + sucursal + tipo de entrega en venta
(+ otra dimensión si está mapeada).

| Caso | Regla |
|---|---|
| Duplicado exacto (misma llave y métricas) | se conserva una vez, se cuenta |
| Conflicto (misma llave, métricas distintas) | no se elimina: se conserva la primera fila, la celda se marca y todas las versiones van a `batch.conflicts` y al reporte |
| Multiplicidad válida (misma llave, otra dimensión adicional) | se conservan y se suman en el renglón; se informa |
| Contra lo ya guardado: idéntico | se omite |
| Contra lo ya guardado: distinto | conflicto; por defecto se conserva lo guardado y se marca; "reemplazar" es una corrección explícita del usuario y queda registrada con el valor anterior |

Otras validaciones (venta): SKU, estado, sucursal o tipo de entrega faltantes (rechazo), estado o tipo de entrega no
reconocidos (rechazo, catálogo fijo), fecha o canal inválidos (rechazo), producto, categoría o subcategoría
faltantes, SKU con atributos distintos entre filas, negativos, texto en métricas, filas con columnas de más o de
menos. Nada se corrige en silencio.

## 84. Carga de productos

Integrada a Carga de datos (misma revisión), una tarjeta con los dos archivos: seleccionar → tipo de archivo
detectado (corregible) → vista previa (20 filas normalizadas con estado por métrica) → mapeo → validación del
archivo completo → resumen → confirmación → persistencia → resultado. Técnica: el texto se lee por partes sin crear
un objeto por fila (`FP.productImport.readRow`), normalización con caché, lotes de 10 mil filas con cesión del hilo.
Medido: un mes de venta de 3,000 SKU × 4 canales (410 mil renglones, ~53 MB) se valida y guarda en unos 5 s.
Recomendado: un archivo de venta y uno de funnel por mes. Todos los SKU válidos se guardan: no hay Top N en
almacenamiento.

## 85. Análisis Categoría → Producto (`FP.productAnalysis`)

Negocio → canal → categoría → subcategoría → producto → SKU con drilldown, contra el periodo anterior de igual
duración o el mismo periodo del año anterior (no existe plan por producto).
- Participación = venta del grupo ÷ total del periodo. Contribución = Δ del grupo ÷ Δ total (null si Δ total = 0;
  puede pasar de 100 % cuando otros grupos compensan). No son sinónimos.
- Estado por grupo: crece, cae, estable (< 3 %), nuevo, sin venta.
- Compensación (caídas cubiertas por crecimientos) y concentración (cuántos grupos explican el 80 % del deterioro o
  del crecimiento).
- Patrones A–D (tráfico/CR, §35 del brief) y E–G (en qué paso del funnel cae la conversión: vista→carrito,
  carrito→checkout, checkout→compra) como **señales**, con evidencia y la nota de que no indican causa.
- "Ver por": Categoría (categoría → subcategoría → producto → SKU) o Estado y sucursal (estado → sucursal), más un
  filtro independiente de tipo de entrega. Top N (20, 50, 100 o todos paginado) es solo visual.
- Filtros: periodo, canal (el mismo contexto persistente de Fase 7), categoría/subcategoría/producto/SKU o
  estado/sucursal según la vista, y tipo de entrega.

## 86. Integración con Diagnóstico, exportación y trazabilidad

- "Usar periodo y canal del diagnóstico" lleva el contexto de Fase 5; si el diagnóstico compara contra plan, se
  aclara que productos compara contra el periodo anterior.
- `analysis_export.json` agrega de forma opcional `categoryProduct` (principales contribuciones, compensación y señales)
  cuando el análisis de productos del mismo canal ya se calculó. El resto del contrato no cambia.
- `category_product_analysis_export.json`: schema, versión, fecha, periodo, referencia, corte, filtros, nivel,
  métricas disponibles, reglas, total, filas (participación, contribución, estado, métricas con estado y fuente,
  drivers, señales, SKU, conflictos), compensación, concentración, vínculo con el diagnóstico y archivos de origen.
- Trazabilidad de un SKU: archivo → fila → fecha → canal → SKU → métrica (observada, faltante o inválida) → marca de
  conflicto o de suma por multiplicidad.

## 87. Pruebas y validación

- Síncronas: 136 (122 de Fases 1-7 + 14 de productos, Fase 8.1.1: contrato de dos archivos, estado/sucursal/entrega
  obligatorios, duplicados con la llave ampliada, el funnel no se cruza con geografía, CR con pedidos reales
  implícitos en 0, cobertura de tracking, AOV, fusión con lo guardado, resúmenes por estado y sucursal, participación
  y contribución con funnel, patrones A-G, periodos, migración de esquema v1→v2, integración).
- Asíncronas (`FP.storageTests.run`, botón "Pruebas de almacenamiento"): 22 — las 20 de Fase 8.1 más migración de
  esquema v1→v2 y consultas/persistencia con los dos archivos y las tres dimensiones nuevas. Volumen de referencia:
  4.38 millones de SKU-días (365 × 3,000 × 4) con dimensiones de venta: ~34 s de escritura, sin congelar la interfaz.
- Verificadas aquí en Chromium desde `file://` y `http://` (mismo modelo que GitHub Pages). La validación en
  `https://appalex47-lab.github.io` se hace con el botón de pruebas en ese sitio.

---

# FASE 8.1.1 — Producto por sucursal, estado y tipo de entrega + funnel GA4

Extiende la Fase 8.1 a petición del usuario, antes de cargar datos reales, para no tener que migrar después
(auditoría §85 R5: "decidir si sucursal o geografía importan por producto antes de acumular datos reales").
Las fases 8.3 (canales) y 8.5 (métricas configurables) siguen en pausa: esta fase no las adelanta — las tres
métricas de venta y las cuatro del funnel son listas fijas, igual que en 8.1.

## 88. Por qué dos archivos y no uno

La vista de ficha (GA4) ocurre **antes** de que la persona elija sucursal, estado o tipo de entrega en el checkout:
un paracetamol visto hoy no tiene todavía dirección de entrega. Poner las vistas en el mismo renglón que la
sucursal las repetiría por cada sucursal del SKU y las contaría varias veces. Por eso:

- **Productos · venta**: sistema de ventas, con estado, sucursal y tipo de entrega — porque ahí sí se conocen.
- **Productos · funnel**: GA4 por artículo, sin esas tres dimensiones — porque ahí todavía no existen.

CR y las tres tasas del funnel se calculan a nivel SKU (o categoría/producto), nunca por estado, sucursal o
tipo de entrega: no es una limitación de datos, es que la pregunta no aplica antes del checkout.

## 89. Esquema IndexedDB v2 (`fp-data`, versión 2)

Nuevo store y dimensiones en el bloque de venta:

| Store | Llave | Índices | Novedad |
|---|---|---|---|
| `productFunnel` | [fecha, canal] | channel_date | igual forma que `productDays`, cuatro métricas del funnel |
| `productDays` | [fecha, canal] | channel_date | agrega `stateIdx`, `branchIdx`, `deliveryIdx` (Uint8/Uint16) por renglón |
| `productRollups` | [fecha, canal, nivel, clave] | level_key_date | `nivel` ahora incluye `state`, `branch` y `delivery` además de `category`/`subcategory` |

Catálogos en memoria (`FP.productStore.dims`): `states` (32 fijos + variantes), `deliveries` (2 fijos + variantes),
`branches` (dinámico, se descubre al cargar y se guarda en `meta.productDims`). Los tres se resuelven a un índice
numérico al cargar; nunca se guarda el texto libre en el bloque.

**Migración v1 → v2 (automática, sin pérdida):** al abrir la base con la versión anterior, cada bloque de
`productDays` (4 métricas por SKU-día, sin dimensiones) se separa en un bloque de venta (revenue/orders/units,
estado/sucursal/entrega = "(sin dato)") y uno de funnel (solo vistas; las tres métricas nuevas del funnel quedan
`missing`). No se pierde ningún valor. Al terminar la conversión (`onupgradeneeded`), se marca `productRebuild:
pending` en `meta`; en el siguiente `init()` la app separa `mappedMetrics`/`funnelMetrics` y recalcula todos los
resúmenes con ambos bloques. Esta migración es del esquema de IndexedDB (independiente de la migración
localStorage → IndexedDB de la Fase 8.1, que sigue igual).

## 90. Cálculos que cruzan venta y funnel

- **CR del producto** = Σ pedidos reales ÷ Σ vistas de ficha, en los mismos SKU-días. El archivo de venta es
  transaccional: si el SKU tiene vistas ese día × canal pero no aparece en venta, sus pedidos son 0 implícito
  (se cuenta, no se descarta); si el archivo de venta de ese día × canal no está cargado, la vista se excluye del
  cálculo en vez de asumir 0 (`impliedZero` registra cuántas veces ocurrió lo primero).
- **Tasas del funnel** (todas `calculated`): vista→carrito = agregados ÷ vistas; carrito→checkout = inicios de
  checkout ÷ agregados; checkout→compra = compras GA4 ÷ inicios de checkout.
- **Cobertura de tracking** = compras GA4 ÷ unidades reales, en los mismos SKU-días — señal de pérdida de medición,
  no una métrica de negocio; se avisa cuando cae más de `products.signals.trackingGapPct` (15 %) por debajo de 1.
- **AOV** = venta ÷ pedidos con pedidos > 0 (sin cambios respecto a 8.1).
- Agrupar o filtrar por `state`, `branch` o `delivery` desactiva el cruce con el funnel para ese cálculo
  (`funnelJoinable = false`): CR, vistas y las tres tasas se reportan `unavailable` con la nota correspondiente.

## 91. Señales E–G (funnel)

Además de los patrones A–D (tráfico/CR) de la Fase 8.1, con datos de funnel:
- **E** vistas estables o al alza con menos agregados al carrito por vista (paso vista → carrito).
- **F** carrito estable con menos checkouts por carrito (paso carrito → checkout).
- **G** checkout estable con menos compras por checkout (paso checkout → compra).

Igual que A–D: señales descriptivas con evidencia, nunca una causa.

## 92. UX

- Carga: la tarjeta "Productos · venta" ofrece dos plantillas (venta y funnel); el tipo de archivo se detecta por
  encabezados y es corregible; la revisión muestra estado, sucursal y entrega en la vista previa de venta.
- Categoría → Producto: "Ver por" alterna entre Categoría (categoría→subcategoría→producto→SKU) y Estado y sucursal
  (estado→sucursal), con un filtro independiente de tipo de entrega; al usar geografía o filtrar por entrega se
  explica que el funnel no está disponible ahí.
- Trazabilidad de un SKU: venta y funnel en renglones separados (son archivos distintos), venta con su
  estado/sucursal/entrega.

## 93. Datos de prueba

`FP.mockProducts.generate()` produce los dos archivos coherentes entre sí (600 SKU, 100 sucursales en 10 estados,
funnel solo en canales web). Escenario simulado: en septiembre, Dermocosmética recibe más vistas pero cae su paso
vista→carrito (patrón E); Vitaminas crece en tráfico; la venta a domicilio en Jalisco cae ~18-25 % (verificado en
pantalla). `qualityCase()` cubre estado/sucursal/entrega inválidos o faltantes además de los casos de 8.1.
