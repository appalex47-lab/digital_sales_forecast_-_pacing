# Auditoría arquitectónica y validación del roadmap

Fecha: 25 de septiembre de 2026 · Versión auditada: 0.9.1 (Fase 8.1.1) · Contrato de datos 1.8.0
Alcance: **auditoría de solo lectura, sin código.** No se modificó ni un archivo. Ningún cambio se implementó ni se
propone implementar en este documento; toda "preparación recomendada" queda anotada para autorización posterior.

---

## 1. Estado actual (lo que existe realmente)

| Área | Existe | Evidencia |
|---|---|---|
| Configuración central congelada | Sí | `config/config.js`, ~700 líneas, `deepFreeze` al cargar |
| Calendario ISO | Sí | `calendar/calendar.js` |
| Fórmula única (venta = volumen × CR × AOV) | Sí | `calculations/metrics.js` |
| Metas, plan, estacionalidad, plan congelado | Sí | `forecast/planningEngine.js`, `calculations/seasonality.js`, `weights.js` |
| Carga CSV, normalización, calidad, duplicados | Sí | `import/*`, `quality/*`, `data/data-store.js` |
| Pacing, forecast (4 métodos) | Sí | `forecast/forecastEngine.js`, `forecastMethods.js`, `performanceIndex.js` |
| Reforecast / recovery | Sí | `forecast/reforecastEngine.js`, `futureWeights.js` |
| Diagnóstico, señales, hipótesis | Sí | `diagnostics/*` (atribución secuencial y Shapley) |
| Escenarios, acciones, medición | Sí | `scenarios/*`, `actions/*`, `impact/*` |
| Experiencia guiada (Fase 7) | Sí | `ui/guidance/*` + `config/guidanceConfig.js` |
| IndexedDB + repositorio + migración | Sí | `storage/idb.js`, `repository.js`, `migration.js` |
| Categoría → Producto → SKU, con estado/sucursal/entrega y funnel GA4 | Sí | `products/*` (Fase 8.1.1) |
| Cohere (opcional, solo redacción) | Sí | `ai/cohereClient.js`, `cohereDiagnostic.js`, `cohereActions.js` |
| Exports | 6 archivos | planning, forecast, reforecast, analysis (+ `categoryProduct` opcional), action_plan, category_product_analysis |
| Pruebas | 136 síncronas + 22 asíncronas | `calculations/self-test.js`, `storage/storage-tests.js` — todas pasando |
| **BUSINESS_CONTEXT** | **No existe** | Ningún archivo ni objeto con ese nombre; el "contexto de negocio" hoy vive repartido en `config.js` (canales, moneda, dimensiones) |
| Canales configurables en ejecución | No (8.3 pausada) | `config.channels` es un arreglo fijo de 4 |
| Modelo de métricas configurable | No (8.5 pausada) | `metricKeys` fijo de 5; productos con 3+4 métricas fijas |
| Estructura geográfica configurable | Parcial | Fase 8.1.1 agregó estado (32 fijos de México) y sucursal (dinámica) para productos; no existe para el resto de la app |
| Narrativa ejecutiva, paquete de análisis, App 1, PowerPoint, automatización | No | Solo en el roadmap |

Tamaño: 89 archivos JS, 31 vistas/entradas de guía, ~1.3 MB de código y documentación.

---

## 2. Arquitectura actual

```
config.js (congelado) ──┬── calendar ── metrics ── data-model
                        │
Carga:  csv → normalize → validation → import → data-store (histórico, plan, actual, segmentos)
        productImport → productStore (venta con estado/sucursal/entrega + funnel GA4, IndexedDB)
                        │
Almacenamiento: app.js → storage enrutado (repository) ─┬─ localStorage (preferencias, banderas)
                                                        └─ IndexedDB (kv: datos de la app; product*: productos)
                        │
Motores: planningEngine → forecastEngine → reforecastEngine → diagnosticEngine → scenario/recovery → actions/impact
             (plan)        (actual, forecast)  (requerido)       (drivers, señales)      (simulado)       (observado)
                                                                       ↑
                                                        productAnalysis (categoría/geografía → SKU)
                        │
Exports: planning → forecast → reforecast → analysis (+categoryProduct) → action_plan ; category_product (aparte)
Imports: analysis_export y reforecast_export (los lee Recovery Center)
                        │
UI: app.js (estado + acciones + render) → 17 vistas de datos/motor → capa de guía (navegación, contexto, ayuda, tour, modos)
```

Rasgos estructurales relevantes para el roadmap:

1. **Un solo objeto de configuración, congelado al cargar.** Varios módulos derivan constantes de él en tiempo de
   carga (`CSV_CONTRACTS`, `CHANNEL_ALIASES` en `import.js`). No hay hoy un mecanismo de "reconfigurar y recalcular"
   sin recargar la página.
2. **Los motores iteran sobre `config.channelIds` y `config.metricKeys`.** Centralizado, pero los datos guardados
   (versiones de plan, forecast, reforecast, escenarios) fijan esos canales/métricas en el momento de guardarse.
3. **Formatos binarios posicionales en IndexedDB y en `packed-v1`** (localStorage): las métricas se guardan por
   posición numérica, no por nombre. Ya se migró una vez (v1→v2 de productos, Fase 8.1.1) separando venta y funnel;
   la migración fue automática, no destructiva y verificada con datos reales.
4. **El catálogo de dimensiones del diagnóstico ya es una lista abierta** (`config.diagnostics.dimensions`, 16
   entradas con alias): el diagnóstico ya no asume solo canal/día — esto es una base reutilizable para 8.4.
5. **Productos ya distingue "canal" de "ubicación física"**: canal (ecommerce/app/whatsapp/llamadas) es dónde se
   vendió; estado/sucursal/tipo de entrega son dónde se atendió el pedido. Esta separación, pedida explícitamente
   en 8.1.1, es exactamente el principio que el punto 10 del prompt maestro exige para 8.4.
6. **La capa de guía (Fase 7) ya es data-driven**: `GROUPS`, `VIEWS`, `HELP`, `TRIGGERS`, `EXPLAINERS`, `TOUR`,
   `ANALYST_ONLY` son arreglos de configuración en `guidanceConfig.js`, no lógica dispersa en cada vista.

---

## 3. Fases ya implementadas

### Fase 7 — Experiencia guiada
Navegación en 6 grupos (Inicio, Planear, Monitorear, Diagnosticar, Recuperar, Medir y aprender), Inicio como centro
de control, siguiente paso determinista (sin IA), filtros persistentes de canal/periodo/comparación, convención
visual Plan/Actual/Forecast/Reforecast/Escenario/Observado, ayuda contextual con glosario, recorrido guiado de 10
pasos, modos Ejecutivo/Analista. Todo vive en `config/guidanceConfig.js` + `ui/guidance/*` (contextEngine,
navigation, help, tour, home-view, measure-view, help-view, diagnostic-guide, traceability). Terminada y estable.

### Fase 8.1 / 8.1.1 — Categoría → Producto
- **8.1:** migración de datos grandes de localStorage a IndexedDB (no destructiva, verificada, idempotente),
  carga de productos, análisis Categoría → Producto → SKU.
- **8.1.1:** separación en dos archivos —venta (con estado, sucursal, tipo de entrega) y funnel de GA4 por
  artículo (sin esas tres dimensiones, porque ocurre antes del checkout)—, con migración automática del esquema
  v1→v2 verificada contra una instalación real (127,200 renglones, sin pérdida de datos).
- No se reabre esta fase. Se documentan aquí sus contratos porque las fases activas dependen de ellos (§5, §8).

---

## 4. Roadmap futuro entendido

Confirmado: **8.2 → 8.4 → 9.1 → 9.2 → 10 → 11 → 12** es el roadmap activo (orden propuesto, no regla técnica —
ver §10 y §12, donde se examina si 11→12 es una dependencia real).

- **8.2 Business Setup** — "¿Qué tipo de negocio estoy analizando y cómo funciona?"
- **8.4 Dimensiones, geografía y estructura operativa** — "¿Cómo está estructurado mi negocio?"
- **9.1 UX pedagógica** — "Aprender mientras uso la herramienta" (amplía Fase 7)
- **9.2 Narrativa ejecutiva** — "Convertir el análisis en una historia ejecutiva"
- **10 Paquete de análisis** — "Consolidar el conocimiento analítico de la plataforma"
- **11 Integración con App 1** — tráfico, conversión y producto
- **12 PowerPoint** — presentaciones ejecutivas, módulo dentro de esta misma app

**Pausadas / fuera del roadmap activo:** 8.3 (canales configurables), 8.5 (modelo de métricas configurable), 13
(automatización e inteligencia). No se implementan; se preserva la posibilidad de implementarlas después sin
rehacer arquitectura (ver hardcodes §7 y precondiciones §11).

---

## 5. Matriz de dependencias

| Fase | Depende de | Extiende | Contratos que toca | Riesgo |
|---|---|---|---|---|
| **8.2** Business Setup | Nada bloqueante (puede leer `config.js` como semilla) | Ninguno existente; es nuevo | Ninguno si es aditivo; **alto si reemplaza `config.js`** | Medio — el riesgo está en *cómo* se integra (§9), no en construirlo |
| **8.4** Dimensiones/geografía | 8.2 (idealmente ya tiene el vocabulario del negocio) + reutiliza el patrón ya construido en `productStore` (estado/sucursal/entrega) y `diagnostics.dimensions` | `products/*`, `diagnostics.dimensions`, filtros de Fase 7 | `category_product_analysis_export.json`, posiblemente `analysis_export.json` | Alto si la geografía debe aplicar a canales sin producto (hoy la geografía vive solo en `productStore`) |
| **9.1** UX pedagógica | Fase 7 (obligatorio: debe extenderla, no sustituirla) | `guidanceConfig.js`, `ui/guidance/*` | Ninguno de datos; sí el contrato interno `describe()`/siguiente paso del context engine | Bajo si se trata como dato de configuración adicional; **Alto si se crea una segunda navegación paralela** |
| **9.2** Narrativa ejecutiva | Datos ya calculados (Fases 3–8.1.1) + Cohere para redacción | Modo Ejecutivo (Fase 7), `analysisExport`, `categoryProductExport` | Lee, no escribe, los exports existentes | Bajo si respeta "la IA no calcula"; Medio si empieza a mezclar redacción con cifras nuevas |
| **10** Paquete de análisis | Todos los exports existentes (6) | `export/*` | Todos — como consumidor, no como modificador | Medio: si "empaquetar" implica tocar la forma de un export existente, rompe a quien ya lo consume (Recovery Center importa 2 de ellos) |
| **11** Integración App 1 | Exports (probablemente `category_product_analysis_export.json` y `analysis_export.json`) | Nada de la UI necesariamente | Los exports que decida consumir App 1 | Alto si App 1 espera *escribir* datos aquí (fuente de verdad doble); Bajo si solo lee exports |
| **12** PowerPoint | 9.2 (narrativa) y 10 (paquete) — **no 11**, ver §10 | Modo Ejecutivo, exports | Ninguno nuevo si consume lo ya empaquetado | Bajo técnicamente; Medio operativo (librería de generación en el navegador, tamaño de archivo) |

Severidad: Bajo/Medio/Alto según probabilidad de romper algo existente × costo de revertirlo. "Crítico" no aplica a
ninguna fase activa hoy porque ninguna toca todavía los dos puntos que sí lo serían (`metricKeys` posicional y la
lista fija de canales) — esos siguen protegidos mientras 8.3/8.5 estén pausadas.

---

## 6. Riesgos de regresión (por tipo)

**Riesgo funcional** (algo deja de funcionar)
- 8.4: si la geografía se generaliza fuera de `productStore` tocando `dataStore` o los motores de Fases 0–6, podría
  afectar cálculos de plan/forecast que hoy no conocen geografía.
- 9.1: si se reescribe `contextEngine`/`navigation` en vez de extenderlos, se arriesga el "siguiente paso" y los
  breadcrumbs que ya funcionan.

**Riesgo de datos** (se pierden, transforman o interpretan mal)
- 8.2: si Business Setup se guarda de forma que compita con `config.js` en vez de alimentarlo, dos lugares pueden
  decir cosas distintas del mismo negocio — la doble fuente de verdad que el prompt maestro pide evitar.
- 8.4: si se cambia la llave de `productDays` (hoy fecha × canal) para incluir geografía a nivel de partición, hace
  falta otra migración de esquema (ya hay un precedente exitoso en 8.1.1, pero es trabajo real, no gratis).

**Riesgo de contrato** (un export deja de ser compatible)
- 10 y 11: cualquier fase que necesite un campo que un export no tiene hoy debe **agregarlo**, nunca renombrar o
  quitar uno existente. Recovery Center importa `analysis_export.json` y `reforecast_export.json` por nombre de
  campo, no por posición, así que agregar campos es seguro; quitar o renombrar no lo es.

**Riesgo UX** (confunde o duplica flujos)
- 9.1: el riesgo más probable de todo el roadmap. "UX pedagógica" y "Experiencia guiada" (Fase 7) apuntan al mismo
  terreno; sin disciplina, 9.1 puede terminar siendo una segunda capa de ayuda que compite con la primera.
- 8.2: si el negocio se configura en una pantalla nueva desconectada de "Metas y motor" (donde hoy vive la
  configuración), el usuario tendrá que aprender dos lugares para lo mismo.

**Riesgo arquitectónico** (bloquea fases futuras)
- 8.2: la forma en que se declare Business Setup decide si 8.3/8.5 (pausadas) siguen siendo viables después. Un
  Business Setup que fije "4 canales" dentro de sí mismo sería peor que el `config.channels` actual, no mejor.
- 11↔12: declarar una dependencia dura entre ambas sin necesidad limitaría poder entregar PowerPoint antes de tener
  lista la integración con App 1 (§10).

---

## 7. Hardcodes detectados y su impacto futuro

| Elemento | Dónde | Clasificación | Impacto si no se toca ahora |
|---|---|---|---|
| Canales (id, color, alias, `trafficLabel`) | `config.channels` (4 fijos) | Necesario actualmente (8.3 pausada) | Ninguno mientras 8.3 no se active; 8.2/8.4 no deberían asumir que siempre son estos 4 |
| `'ecommerce'` como canal por defecto | `app.js` (2 líneas), `planning-view.js`, `reforecast-view.js` | Candidato a abstracción futura | Bajo hoy; si 8.3 se activa algún día, sustituir por "primer canal activo" |
| `metricKeys` (5 fijas) y su posición en `packed-v1` | `config.js`, `data-store.js` | Necesario actualmente (8.5 pausada) | Crítico solo si 8.5 se activa sin antes cambiar el formato de guardado a "por nombre" |
| Métricas de producto (venta: 3; funnel: 4) y su posición en `productDays`/`productFunnel` | `config.products`, `productStore.js` | Necesario actualmente | Mismo riesgo que el anterior, ya materializado una vez (v1→v2) y resuelto con una migración; replicable |
| 32 estados de México + 2 tipos de entrega | `config.products.states/deliveries` | Riesgo arquitectónico para negocios fuera de México o sin tipo de entrega | Si 8.4 generaliza geografía a otros negocios, este catálogo fijo de México debe volverse configurable, no copiarse a otras partes de la app |
| "Sucursal" como concepto de producto | `productStore.js` (dimensión `branch`) | Riesgo arquitectónico si se asume que "sucursal" es un concepto universal | Un negocio sin ubicaciones físicas (servicios digitales puros) no debería tener que declarar sucursales |
| Moneda `MXN` | `config.currency` | Configurable | Candidato directo para Business Setup |
| Terminología en español fija en ~20 vistas | `ui/*`, `guidanceConfig.js` | Candidato a abstracción futura | Alto costo de refactor si algún día se requiere otro idioma o terminología del negocio; no bloquea 8.2/8.4/9.x |
| Catálogo de acciones de recuperación | `config.recovery.actionLibrary` | Ya configurable (el usuario puede agregar) | Ninguno |
| Patrones de señales A–G (tráfico/CR/funnel) | `productAnalysis.js` | Necesario actualmente | Si 8.5 generaliza métricas, los patrones deberían expresarse en términos de "driver genérico", no de nombres fijos |

Ninguno de estos se tocó. Se listan para que 8.2/8.4 sepan qué encontrarán si necesitan leer o coexistir con ellos.

---

## 8. Contratos que deben protegerse

| Contrato | Genera | Consume hoy | Consumirá | Campos críticos | Cambio que rompería algo |
|---|---|---|---|---|---|
| Modelos internos (registros canónicos, bloques de producto) | data-store, productStore | todos los motores | 8.2–8.4 | orden de métricas en `packed-v1` y en `productDays`/`productFunnel` | reordenar o quitar una métrica sin migración |
| `planning_export.json` | planningExport | nadie internamente | 10, 11, 12 | `metadata.algorithmVersion`, `targets`, `daily_plan[].cells` | renombrar canales o celdas |
| `forecast_export.json` | forecastExport | nadie internamente | 10, 11, 12 | claves heredadas de Fase 0 + `forecast`, `gaps` | quitar las claves heredadas |
| `reforecast_export.json` | reforecastExport | Recovery Center (import) | 10, 11, 12 | `schema`, `reforecast.<canal>.daily[]`, `remainingTarget.total` | cambiar la forma de `daily` o los nombres de canal |
| `analysis_export.json` | analysisExport | Recovery Center (import) | 9.2, 10, 11, 12 | `schema`, `plan/actual/forecast`, `level1Drivers`, `level2Signals`, `hypotheses`, `categoryProduct` (opcional) | renombrar drivers o bloques |
| `action_plan_export.json` | actionPlanExport | nadie internamente | 10, 11, 13 | `traceability[]`, separación simulado/observado | mezclar impacto simulado con observado |
| `category_product_analysis_export.json` | categoryProductExport | nadie internamente | 9.2, 10, 11, 12 | `rows[].share/contribution/status`, `rules` | cambiar la semántica de participación o contribución |
| Esquema IndexedDB (`fp-data`, hoy v2) | repository.js | toda la app | 8.4 (si agrega dimensiones a productos) | claves de cada store, índices | cambiar una llave de store sin ruta de migración (ya hay precedente v1→v2 para replicar) |
| Estado de migración (`storageMigration` en localStorage) | migration.js | app.js al arrancar | 8.2 (si agrega más datos "grandes") | `status`, `keys[]` | marcar `verified` sin verificación real |

**BUSINESS_CONTEXT no es un contrato existente — nace con 8.2.** Debe diseñarse desde el inicio con `schemaVersion`
propio, como los demás.

---

## 9. Relación Fase 7 → Fase 9.1

Fase 7 ya resolvió, con datos y no con código disperso: navegación agrupada (`GROUPS`), metadatos de cada vista
(`VIEWS`), ayuda por término (`HELP` + `TRIGGERS`), explicadores por vista (`EXPLAINERS`), recorrido guiado (`TOUR`),
detalle por modo (`ANALYST_ONLY`), y un motor de contexto/siguiente paso sin IA (`contextEngine.js`).

**Lo que 9.1 debe reutilizar tal cual:** `GROUPS`/`VIEWS` (no crear una segunda navegación), el motor de siguiente
paso (no crear un segundo "qué sigue"), el sistema de ayuda por id (`HELP`/`TRIGGERS`) como *formato* para contenido
nuevo, y los modos existentes como base.

**Lo que 9.1 puede ampliar sin romper nada:**
- Agregar contenido más profundo a las entradas de `HELP` ya existentes (un campo opcional más, no una estructura
  paralela).
- Agregar un tercer modo ("Aprendiz") como un valor más de `state.ux.mode`, reutilizando el mismo interruptor que
  hoy alterna Ejecutivo/Analista, no un sistema de modos nuevo.
- Microlearning: puede vivir como una extensión de `TOUR` (pasos opcionales adicionales) o de `EXPLAINERS`, no como
  una librería de tours independiente.
- Trazabilidad de cálculos: ya existe `ui/guidance/traceability.js`; 9.1 debería extenderlo, no duplicar su lógica
  de recorrido de la cadena plan→actual→gap→driver→señal→hipótesis→escenario→acción→medición.
- Explicar configuraciones: una vez exista Business Setup (8.2), sus valores pueden alimentar `EXPLAINERS` con datos
  reales del negocio en vez de ejemplos genéricos — otra razón para que 8.2 preceda a 9.1 en la práctica, algo que
  el roadmap ya respeta con su orden.

**Conclusión, tal como pide el punto 14 del prompt maestro: 9.1 amplía la Fase 7; no la reemplaza.** Criterio de
cierre concreto para cuando llegue esa fase: si al terminar `guidanceConfig.js` tiene más campos pero sigue siendo
el único archivo de configuración de guía, y `ui/guidance/*` creció pero no se duplicó, la fase se hizo bien.

---

## 10. Relación Fase 11 ↔ Fase 12

El prompt maestro pide explícitamente no asumir que 12 depende de 11. Con la arquitectura actual:

**Qué necesita realmente 12 (PowerPoint):** datos ya calculados y ya redactados. Concretamente: los 6 exports
existentes + lo que produzca 9.2 (narrativa) + lo que produzca 10 (paquete, si decide reorganizar esos exports en
una forma más fácil de recorrer). Nada de esto requiere que exista una integración con una app externa.

**Qué necesita realmente 11 (App 1):** una forma de que otra aplicación lea (o eventualmente escriba) datos de
tráfico, conversión y producto. Su necesidad natural son los exports de producto y diagnóstico — no la narrativa ni
el empaquetado para presentación.

**Qué pueden compartir:** el paquete de la Fase 10, si se diseña como una capa neutral sobre los exports (sin
opiniones de "esto es para PowerPoint" ni "esto es para App 1"), sirve a ambas.

**¿Existe una dependencia real?** No una dependencia dura. Hay una dependencia de **orden recomendable, no
obligatorio**: es más simple construir 12 después de 10 (para no leer 6 exports sueltos) y después de 9.2 (para
tener texto, no solo cifras). Pero 12 no necesita esperar a 11.

**Componente intermedio que convendría estabilizar primero:** el "paquete de análisis" de la Fase 10 — si se
construye bien una sola vez, tanto 11 como 12 lo consumen sin duplicar lógica de lectura de exports.

**Observación, no una decisión tomada:** con esto en cuenta, podría evaluarse si 12 se ejecuta en paralelo a 11, o
incluso antes, una vez completas 9.2 y 10 — sin que esto reordene el roadmap sin autorización explícita del usuario.

---

## 11. Precondiciones arquitectónicas (recomendadas, no implementadas)

- **Antes de 8.2:** decidir explícitamente que Business Setup **alimenta** valores de `config.js` en el arranque
  (un "config bootstrap" que lee Business Setup y construye la configuración congelada a partir de él) en vez de
  vivir como una configuración paralela. Esto es la diferencia entre una fuente de verdad y dos.
- **Antes de 8.4:** decidir si la geografía debe generalizarse más allá de productos (por ejemplo, si el negocio
  necesita ver *todo* — plan, forecast, diagnóstico — por región) o si basta con que viva donde ya vive (productos).
  Esto cambia si 8.4 es una extensión de `productStore` o un concepto transversal nuevo.
- **Antes de 9.1:** ninguna precondición técnica — es la fase más segura de construir con lo que existe hoy.
- **Antes de 9.2:** confirmar qué se considera "listo para narrar" (¿solo forecast/gap/drivers, o también
  productos y escenarios?) para no forzar a Cohere a redactar sobre datos que aún no tienen la calidad suficiente.
- **Antes de 10:** fijar en pruebas la forma de cada export existente (por campo, no solo el nombre de `schema`),
  para que empaquetarlos no arriesgue romperlos sin darse cuenta.
- **Antes de 11:** decidir explícitamente si la relación con App 1 es de solo lectura (App 1 lee exports de aquí) o
  bidireccional (App 1 también escribe). Si es bidireccional, hace falta diseñar reconciliación de fuente de verdad
  antes de escribir una sola línea de esa fase.
- **Antes de 12:** confirmar la librería de generación de PowerPoint en el navegador y su compatibilidad con GitHub
  Pages (sin backend), con una prueba técnica previa — igual que se hizo con IndexedDB antes de la Fase 8.

---

## 12. Roadmap validado

El orden propuesto por el usuario es **arquitectónicamente coherente** y no requiere reordenarse por una
incompatibilidad técnica. Con matices:

1. **8.2** — sin bloqueos; requiere la decisión de diseño de §9/§11 (config bootstrap) antes de escribir código.
2. **8.4** — depende conceptualmente de 8.2 (para tener vocabulario del negocio) y técnicamente puede apoyarse en
   el patrón ya construido en `productStore` (estado/sucursal/entrega); requiere decidir su alcance (§11).
3. **9.1** — sin bloqueos técnicos; el único riesgo es de diseño (duplicar Fase 7), no de arquitectura.
4. **9.2** — sin bloqueos; se beneficia de que 8.2 ya exista (terminología del negocio para narrar mejor), pero no
   lo requiere en sentido estricto.
5. **10** — se beneficia de que existan pruebas de contrato de los exports (§11) antes de tocarlos.
6. **11** y **12** — **no tienen dependencia dura entre sí** (§10); el roadmap las enumera en secuencia pero podrían
   evaluarse en paralelo o en otro orden si el negocio lo prioriza así.

No se detectó ninguna fase que deba **preceder** a otra por una razón técnica insalvable, ni ninguna dependencia
faltante que bloquee el roadmap tal como está.

---

## 13. Alertas y contradicciones a resolver antes de implementar

1. **BUSINESS_CONTEXT vs config.js:** el prompt maestro pide explícitamente evitar "dos fuentes de verdad". Hoy
   existe una sola (`config.js`). La primera decisión de 8.2, antes de escribir código, es cómo Business Setup se
   relaciona con ella — esto no es una contradicción todavía, pero es la decisión de más impacto de esta etapa.
2. **La geografía ya existe, pero solo en productos.** 8.4 debe decidir si la extiende o si acepta que, por ahora,
   la estructura operativa vive únicamente donde hay producto — de lo contrario se corre el riesgo de construir una
   segunda representación de "sucursal" o "región" independiente de la que ya existe.
3. **Ningún hallazgo contradice el roadmap en sí.** Las únicas alertas son de secuencia de diseño (arriba), no de
   viabilidad técnica.

---

## 14. Recomendación de secuencia

La auditoría no encontró ninguna razón técnica para no continuar con **8.2 · Business Setup** como siguiente fase,
tal como está definido en el roadmap. Es la fase con menos riesgo de romper algo existente (todo lo que toca es
nuevo) y la que más condiciona el diseño de las siguientes (8.4 la usa como vocabulario; 9.1 y 9.2 se benefician de
tener terminología real del negocio en vez de ejemplos genéricos).

La única recomendación antes de recibir el prompt de 8.2 es que, al definirla, se resuelva explícitamente la
pregunta de §9/§13.1: **Business Setup alimenta `config.js`, o coexiste con él.** Esa respuesta no requiere código
todavía — solo una decisión — y evita que 8.2 tenga que rehacerse cuando el problema se note más adelante.

---

No se implementó, migró ni modificó nada como parte de esta auditoría. Quedo a la espera del siguiente prompt.
