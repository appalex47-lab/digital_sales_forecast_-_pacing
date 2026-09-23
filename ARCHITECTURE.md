# ARCHITECTURE.md — Digital Sales Forecast & Pacing

Documento de referencia para todas las fases. Antes de modificar cualquier módulo, léelo completo.
Versión de la app: 0.2.0 (Fase 1). Versión del contrato de datos: **1.1.0**.
Diccionario de campos: `DATA_DICTIONARY.md`.

Fases:
- **Fase 0** (secciones 1–9): arquitectura base, modelo Plan / Actual / Forecast, motor matemático.
- **Fase 1** (secciones 10–18): carga CSV, normalización, validación, calidad, cobertura, almacenamiento y exportación.

---

## 1. Estructura de archivos

```
/index.html                     Estructura, navegación por vistas y orden de carga de scripts
/ARCHITECTURE.md                Este documento
/DATA_DICTIONARY.md             Diccionario de todos los campos del modelo            (Fase 1)
/css/styles.css                 Tokens (variables CSS) y componentes
/js/
  config/config.js              Canales (+ alias), métricas, tolerancias, calendario, storage,
                                campos de importación, tipos de dato, catálogo de errores
  calendar/calendar.js          Fechas UTC, semana (punto único), atributos de día, periodos
  calculations/metrics.js       Núcleo matemático, derivación, validación, agregación, gap
  calculations/self-test.js     Pruebas del motor (red de no-regresión)
  data/data-model.js            DailyRecord, Targets, Dataset, consultas y resúmenes
  data/data-store.js            Modelo canónico: colecciones, lotes, duplicados, consolidación  (Fase 1)
  data/mock-data.js             Datos de prueba determinísticos y casos límite (solo QA)
  data/mock-csv.js              Archivos CSV de prueba: 11 casos + 4 datasets generados (Fase 1)
  events/events.js              Entidades de eventos comerciales e hitos
  forecast/forecast.js          Registro de versiones: Original Plan inmutable, reforecasts
  storage/storage.js            Persistencia con adaptadores (localStorage / memoria)
  import/csv.js                 CSV → RAW (parser RFC 4180, separador, BOM, stringify)      (Fase 1)
  import/normalize.js           Reglas de normalización: fecha, número, canal, tipo de día (Fase 1)
  import/import.js              Pipeline: staging, mapeo, registro canónico, selección      (Fase 1)
  quality/validation.js         Reglas de validación, issues estructurados, duplicados     (Fase 1)
  quality/coverage.js           Cobertura temporal/canal/métrica y resumen de calidad      (Fase 1)
  export/export.js              forecast_export.json + exportaciones de Fase 1 + descargas
  ui/format.js                  Número → texto (único lugar); nunca NaN/Infinity
  ui/ui.js                      Render de Resumen y motor; utilidades compartidas
  ui/import-view.js             Vista Carga de datos                                        (Fase 1)
  ui/quality-view.js            Vista Calidad de datos                                      (Fase 1)
  ui/data-view.js               Vista Datos normalizados                                    (Fase 1)
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

- Correr la app y confirmar **"43 de 43 pruebas correctas"** (o el total vigente) antes y
  después de cada cambio. Fase 0 aportó 24; Fase 1, 19. Las pruebas se agregan; nunca se borran ni se relajan.
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
