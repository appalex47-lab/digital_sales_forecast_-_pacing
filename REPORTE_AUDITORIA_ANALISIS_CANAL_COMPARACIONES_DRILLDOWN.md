# REPORTE — Auditoría integral del módulo Análisis: canal, comparaciones y drill-down

Base auditada: `RevNavigator-Analisis-R3-base-con-mejoras-R2.zip` (carpeta `p33fix-reincorporacion`).
Regla seguida: **primero auditar, después modificar**. La auditoría se hizo leyendo el código y midiendo la línea base con datos de 4 canales **antes** de tocar nada.

---

## 1. Arquitectura encontrada

El módulo Análisis («Evolución y patrones», vista `analisis`) tiene esta cadena:

| Capa | Archivos | Función |
|---|---|---|
| Datos | `js/products/productStore.js` (IndexedDB: `productDays` por día×canal, `productRollups`) | `aggregate({from,to,channel,groupBy,filter})`, `skuTrace`. **Ya soportaba canal.** |
| Orquestación | `js/app.js` → `ensureTrendAnalysis()` | Construye períodos, agrega por entidad, llama a los motores, guarda en `state.an`. |
| Motores (puros) | `js/analytics/`: `trendEngine`, `patternEngine`, `shareMixEngine`, `contributionEngine`, `actionPriorityEngine` (+`riskOpportunityEngine`), `trendForecastEngine`, `cohortEngine`, `analysisNarrativeEngine`, `temporalEngine` | Reciben series/filas; **ninguno conoce el canal**. |
| UI | `js/ui/trend-view.js` | Presenta `state.an`. |
| IA | `cohereAnalysisAssistant.js`, acción `an-ai` | Reciben resultados ya calculados. |

Flujo real: `Datos → aggregate(channel:'total') → series por entidad → trendEngine → patternEngine → (comparación) → shareMix → prioridades → contribución → forecast → cohortes → narrativa`.

**Dónde estaban el período, el canal y la comparación**
- Período: `an.periodType`, `an.focusKey`, `an.periodCount`. Se calculaba con funciones locales duplicadas dentro de `ensureTrendAnalysis` (`shift`, `rangeFor`, `periodKey`) además de `FP.temporalEngine`.
- Canal: **no existía** (`state.an` no tenía campo de canal).
- Comparación: `an.comparison` = `previous` | `year_ago`; usada en tres sitios con lógicas distintas (parche parcial de filas, Share/Contribución, chips temporales).

**`channel: 'total'` fijo dentro de Análisis** (los de otros módulos —Pacing, Forecast anual, Diagnóstico, Recovery— tienen su propio selector y no se tocaron):

| # | Lugar (base) | Uso |
|---|---|---|
| 1 | `ensureTrendAnalysis` — serie por período | agregación histórica |
| 2 | `ensureTrendAnalysis` — comparación parcial | base equivalente |
| 3 | `ensureTrendAnalysis` — `aggregateRevenue` (chips DoD/WoW/MoM/YoY, estacionalidad) | totales temporales |
| 4–5 | `ensureTrendAnalysis` — rama `year_ago` (base y actual) | Share/Contribución |
| 6–8 | `enrichPriorityEvidence` (3 llamadas a `aggregate`) | pistas de prioridades |
| 9 | acción `an-ai` | `channel: { id: 'total', label: 'Total' }` en el payload de la narrativa IA |

**Elementos con/sin drill-down (base):** solo había «Leer» → tarjeta de la entidad (trayectoria + evidencia). KPI, Share & Mix, Contribución, Forecast y Cohortes **no** tenían drill-down; no había salida a canal, producto, detalle temporal ni registro origen.

---

## 2. Problemas encontrados

Medidos con datos de 4 canales, octubre **parcial** (1–5) — ver §10/§11 para la metodología.

| ID | Problema | Evidencia medida (base) |
|---|---|---|
| P1 | No hay selector de canal; todo es Total | 9 agregaciones fijas |
| P2 | Con octubre parcial, **Share/Contribución/Prioridades comparan septiembre completo vs octubre 1–5** | Sep completo $403,008.05 vs Oct 1–5 $85,982.10 → contribución **−$317,025.95** (falsa). El chip MoM decía +23.96 % (correcto) → la pantalla se contradecía |
| P3 | «Mismo período año anterior» **compara contra el mes anterior** (`shift(..., periodType, -1)` en vez de `year`) | Con `year_ago` el resultado era idéntico a `previous` |
| P4 | El foco parcial se etiqueta **«Octubre 2026 · completo»** | `partial:false`, `to: 2026-10-31` |
| P5 | `shiftRange` desborda fin de mes (31-mar −1 mes = 3-mar) | Chip MoM de **septiembre completo** daba $403,065.67 (−0.01 %); lo correcto es $416,246.78 (−3.18 %) |
| P6 | La serie de patrones/forecast/cohortes **incluía el período parcial** como si fuera un mes | Caída falsa (octubre parcial vs mes completo) en patrones y forecast |
| P7 | `contributionEngine.compensation.positiveDelta/negativeDelta` sumaba solo el top-8 | Con >8 entidades Σ ≠ variación total |
| P8 | `enrichPriorityEvidence` con nivel «Canal» pasaba `filter:{channel}` que el store ignora | La pista mostraba el total, no la entidad |
| P9 | Acciones `an-comparison`, `an-level`, `an-focus`… dejaban Share/Contribución/Cohortes del contexto anterior visibles hasta recalcular | contexto viejo en pantalla |
| P10 | Clave de caché sin canal ni rango de datos | recálculo omitido al cambiar de datos |
| P11 | Faltante de comparación mostrado como «—» (ambiguo) y sin etiqueta «actual vs comparación» | — |
| P12 | Cohortes rotuladas «Retención» (suena a clientes) y narrativa «retenidas» | el archivo no trae cliente |
| P13 | Payload IA con canal fijo `Total` | narrativa IA sin canal |

## 3. Causa raíz

1. `temporalEngine.clampRange` **no estaba exportado**: `app.js` hacía `TE.clampRange ? … : range` y caía al rango sin recortar → el foco nunca era parcial (P4) y la rama «parcial» sólo corregía filas.
2. La comparación estaba **repartida en tres implementaciones** (parche parcial sólo `previous`; «dos últimos períodos de `totalSeries`» para Share/Contribución/Prioridades; chips con `temporalEngine`) → P2, P3, P6.
3. `temporalEngine.add/shiftRange` usaba `setUTCMonth` sin acotar el día → P5.
4. No existía un objeto de contexto único: canal, período y comparación vivían en variables sueltas → P1, P9, P10, P13.

---

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/analytics/analysisContext.js` | **Nuevo.** Contexto único (canal + período + comparación + nivel + métrica). |
| `js/analytics/temporalEngine.js` | `add` acota el día; `shiftRange` (período completo→período completo; parcial→mismos días acotados, `truncated`); `comparisonRanges` (duración equivalente sólo si el foco es parcial); exporta `clampRange`, `spanDays`. |
| `js/app.js` | `ensureTrendAnalysis` reescrito sobre el contexto; `enrichPriorityEvidence`; `sumMap`; `resetAnalysis`; `openDrill/loadDrill`; acciones `an-channel`, `an-drill*`; estado `an.channel`; payload `an-ai`. |
| `js/ui/trend-view.js` | Selector de canal, barra de contexto, KPIs con detalle, N/A, panel «Detalle y trazabilidad», conciliación, notas de cohortes y forecast, botones de detalle. |
| `js/analytics/contributionEngine.js` | `compensation` sobre la lista completa; `counts`. |
| `js/analytics/analysisNarrativeEngine.js` | Acepta `context`; canal y comparación en el resumen y en el primer hecho; «con continuidad». |
| `js/ai/cohereAnalysisAssistant.js` | `scope` incluye canal y rango de comparación. |
| `css/design-system.css` | Estilos de contexto, KPI-botón, detalle, métricas. |
| `index.html`, `selftest-harness.html` | Carga de `analysisContext.js`. |
| `tools/test-phase33-r3-baseline31.js` | Actualizada: verificaba el **texto** del parche viejo («sólo previous»); ahora verifica la nueva estructura (ver §15). |
| `tools/test-analysis-context.js`, `tools/regression/an_common.py`, `batch_an.py`, `batch_an_ui.py`, `an_baseline.py` | Pruebas nuevas. |
| `ARCHITECTURE.md`, `UX_GUIDE.md` | Notas añadidas. |

## 5. Funciones modificadas

`temporalEngine.add`, `shiftRange`, `comparisonRanges` · `ensureTrendAnalysis` (reescrita), `enrichPriorityEvidence`, `an-focus/-comparison/-level/-period-type/-period-count/-select/-clear-selection`, `an-ai` · `contributionEngine.analyze` · `analysisNarrativeEngine.build` · `cohereAnalysisAssistant` (contexto) · `trendView.render/filters/selectedCard/contributionPanel/shareMixPanel/priorityPanel/forecastPanel/cohortPanel`.
Nuevas: `analysisContext.build/normChannel/channelLabel/rangeLabel/pctChange`, `resetAnalysis`, `sumMap`, `openDrill`, `loadDrill`, `drillPanel`, `contextBar`, `reconLine`.

---

## 6. Metodología de comparación

Una sola función (`FP.analysisContext.build`) decide período actual y de comparación; `ensureTrendAnalysis` agrega **una vez** cada lado y todos los módulos leen de ahí.

| Granularidad | `previous` | `year_ago` |
|---|---|---|
| Mes | MoM: mes anterior | YoY: mismo mes del año anterior |
| Semana | WoW: semana anterior | YoY: misma semana |
| Día | DoD: día anterior | YoY: mismo día |
| Año | YoY: año anterior | YoY |

- **Período completo → período completo** (Mar 1–31 vs Feb 1–28, sin desborde).
- Etiqueta siempre visible: **«Período actual vs Período de comparación»**: `Oct 1–5 vs Sep 1–5`; con años distintos `Oct 1–5, 2026 vs Oct 1–5, 2025`.
- Cambio %: `pctChange(actual, base)` → `null` si falta un lado o la base es 0 → se muestra **N/A**.
- Los chips DoD/WoW/MoM/YoY muestran su propio rango.

## 7. Metodología de drill-down

Ruta: **KPI → variación → señal → explicación → entidad → canal → producto → SKU → detalle temporal → registro fuente**, siempre con Canal + Período + Comparación + Nivel + Métrica (barra de contexto dentro del detalle).

1. Entradas: 4 KPI, fila de Patrones, tarjetas de Mix, filas de Contribución, tarjetas de Prioridades, filas de Forecast.
2. Panel: regla que lo señala (patrón, señal avanzada, severidad, score, períodos y cambios período a período, umbrales usados) → resumen (actual, comparación, Δ$, Δ%, participación y pp) → **por canal** (Σ canales = total) → **siguiente nivel** (categoría → subcategoría → producto → SKU; Σ hijos = total) → **detalle temporal** (cerrados + período en curso marcado) → **registros fuente** (fecha, canal, venta, pedidos, unidades, **archivo y fila**; Σ = total del SKU).
3. «Ver solo este canal» cambia el canal conservando entidad, período y comparación.
4. Cada tabla muestra su conciliación («✓ = total», «✓ = detalle», «⚠ no concilia»).

## 8. Reglas de canal

- Opciones: **Total digital, Ecommerce, App, WhatsApp, Llamadas** (`state.an.channel`, única fuente de verdad; `normChannel` rechaza valores no válidos).
- **Total = Σ de los cuatro canales reales**; no existe un quinto canal ficticio (verificado por día/período/producto/categoría).
- El canal entra en: serie histórica, comparación, chips temporales, estacionalidad, Share, Contribución, Prioridades (y su evidencia), Forecast, Cohortes, Narrativa, detalle, payload IA.
- Cambiar el canal descarta **todo** resultado derivado antes de recalcular.
- Un producto que no vende por un canal no aparece en ese canal (ni como 0 ni como −100 %).
- Entidad con ventas en el período de comparación y ninguna en el actual, **dentro de un canal que sí tiene ventas**: se trata como $0 real, marcada «sin ventas en el período actual».

## 9. Reglas de períodos parciales

- El foco parcial se **marca** (`partial`, «parcial · hasta AAAA-MM-DD») y se compara contra **los mismos días** del período previo (Oct 1–5 vs Sep 1–5; semana en curso vs mismos días de la anterior; YTD vs mismo YTD).
- Si el destino tiene menos días (p. ej. 30 días vs febrero) se acota y se avisa (`truncated`).
- Patrones, forecast y cohortes se calculan **sólo sobre períodos cerrados**; el período en curso aparece como «En curso (parcial) · no entra en patrones».
- Nunca se compara parcial contra completo.

---

## 10. Pruebas realizadas

Datos: dataset **sintético de 4 canales** (8 productos, 3 categorías; 1-sep-2025 → 5-oct-2026; 10,072 SKU-día) cargado por la importación real de la app. Incluye casos límite: producto sin ventas en Llamadas, sin ventas en App, producto nuevo sólo en octubre, producto que cae mes a mes, producto sin venta App en octubre, Llamadas sin domingo. La verdad se calcula **aparte, en Python, desde el CSV**.

| Suite | Qué prueba | Resultado |
|---|---|---|
| `tools/test-analysis-context.js` | contexto, DoD/WoW/MoM/YoY, parciales, fin de mes, bisiesto, N/A, contribución con 30 entidades, Σ shares | **23/23** |
| `tools/regression/batch_an.py` | por canal×nivel: ventas por entidad vs verdad, totales, Σ canales = Total, YoY, períodos completos/semana/día/año, N/A, cambio de canal sin contexto viejo, UI, forecast/cohortes cerrados, drill completo hasta registro, regresión Productos | **79/79** |
| `tools/regression/batch_an_ui.py` | desborde 320–1920 px, nombres accesibles, encabezados, contraste AA, teclado | **6/6** |
| `FP.selfTest.run()` (motor) | cálculos del producto | **224/224** (igual que la base) |
| `battery.py` + `compare.py` (19 vistas × 3 anchos, T1–T10, 7 exports; **no incluye la vista Análisis**, que cubren las suites de arriba) | regresión de TODO lo demás contra el zip original | **TODO EN VERDE** |
| `spacing.py` | ritmo vertical | 0 pares < 8 px |
| Pruebas node históricas del módulo (Fase 14/15/23/24/25/26/27, patrones) | contratos de motores/narrativa/IA | iguales que en la base |

## 11. Resultados de pruebas (cifras)

Octubre parcial, Total (verdad = cálculo independiente):

| | Base | Corregido | Verdad |
|---|---|---|---|
| Actual (Oct 1–5) | $85,982.10 | $85,982.10 | $85,982.10 |
| Comparación | Sep **completo** $403,008.05 | Sep 1–5 $69,365.39 | $69,365.39 |
| Variación / contribución | **−$317,025.95** | **+$16,616.71** | +$16,616.71 |
| YoY etiqueta | comparaba contra mes anterior | Oct 1–5 2025 = $65,121.90 | $65,121.90 |
| MoM Sep completo | $403,065.67 (−0.01 %) | $416,246.78 (−3.18 %) | $416,246.78 |

Los 5 contextos (Total + 4 canales) × 2 niveles (producto, categoría) coinciden con la verdad en cada entidad, actual y comparación (≈ 20 comprobaciones de entidad, 0 diferencias > $0.02).

## 12. Reconciliaciones

- Total = Ecommerce + App + WhatsApp + Llamadas: actual y comparación (B8) y **por producto** (B9).
- Σ entidades = total del canal (actual y comparación) en los 5 contextos (B3).
- Σ contribuciones = variación total = actual − comparación en los 5 contextos (B5); `positiveDelta + negativeDelta = total` (unit test con 30 entidades).
- Σ participación actual = 1 y base = 1 (unit test).
- Detalle: Σ canales = total del producto; Σ SKU = total del producto; cada mes del detalle temporal = verdad; Σ registros fuente del período actual = total del SKU; cada registro (fecha, canal, venta) existe en el archivo, con archivo y fila (G1–G8).
- KPI → detalle del total: por canal y por categoría suman el total (G10).
- «Ver solo este canal» conserva entidad/período/comparación y las cifras = verdad del canal (G9).
- La pantalla muestra «✓ Conciliado» en Contribución.

## 13. Regresiones verificadas

Productos/Categorías (`FP.productAnalysis.run` por canal = verdad, H1); Inicio, Productos, Pacing, Calidad y Análisis sin errores de página (H2); batería completa de las 19 vistas distintas de Análisis contra el zip original (tablas, controles y textos idénticos); carga de archivos y almacenamiento (T1–T10 de la batería, importación del archivo de 4 canales por el flujo real); navegación; filtros globales; selftest 224/224. No se modificó el comportamiento de otros módulos.

## 14. Limitaciones

1. **No se probó con tu archivo real de 4 canales**: no venía en el zip ni en los adjuntos (sólo `tools/real-data-product-aug-sep.json`, una instantánea de resultados, no un archivo de ventas). Se usó el dataset sintético descrito. Hace falta que lo corras con el archivo real.
2. No se probó rendimiento con archivos de 100 MB / 300 000 líneas; el detalle usa un recorrido por día (`groupBy:'date'`) más una agregación por canal/hijo, por lo que en archivos muy grandes puede tardar segundos.
3. No existe exportación de Evolución/Patrones; `analysisExport`/`analysisPackage` pertenecen a Diagnóstico y toman su propio canal. No se modificaron.
4. Con el selector en un canal y «Analizar por: Canal», sólo hay una entidad (esperado).
5. Una entidad sin filas en un período de un canal con ventas se interpreta como $0 real; el archivo no distingue «sin venta» de «sin dato».
6. La cohorte se define por el primer período con actividad **dentro de la ventana analizada**, no por la fecha de alta del producto; no es retención de clientes (el archivo no tiene cliente).
7. `shareMixEngine`: el umbral `significantPp = 0.01` se compara contra puntos porcentuales (0.01 pp ≈ cualquier cambio). Es una inconsistencia de unidad preexistente; **no se cambió** porque reclasificaría ganadores/perdedores y requiere tu criterio.
8. Con 2 años de historia, granularidad «Año» no produce filas de patrón (requiere ≥ 3 períodos cerrados); sí produce Share/Contribución.
9. Pruebas `test-phase20-diagnostic.js`, `test-phase21-*.js` fallan igual en la base: tienen rutas fijas a `/tmp/rev14`; no relacionadas.
10. `selftest-harness.html` del zip no corre en ninguna de las dos versiones (error de carga preexistente); el selftest se ejecutó dentro de la app (224/224).

## 15. Decisiones técnicas

- **Un contexto único puro** (`analysisContext`) en lugar de parchar cada panel: evita volver a divergir.
- **Patrones sobre períodos cerrados**; el período en curso se muestra aparte con comparación equivalente.
- **`resetAnalysis`** centraliza el descarte de resultados derivados al cambiar cualquier parte del contexto.
- N/A en vez de 0 %/−100 % cuando falta un lado de la comparación; −100 % sólo cuando el canal tiene ventas y la entidad no (marcado).
- Se **actualizó `test-phase33-r3-baseline31.js`**: sus 10 comprobaciones eran de texto fuente del parche anterior (p. ej. «sólo `previous`»); ahora comprueban las mismas intenciones con la estructura nueva (incluyendo que aplica a `previous` **y** `year_ago`). No se relajó ninguna intención.
- Cohortes: texto «continuidad» y aviso explícito de que son de producto/entidad.
- No se cambió `significantPp` (ver Limitación 7) ni el diseño general de Evolución.
- No se cambió el modelo de datos ni el store: ya soportaban canal.

## 16. Criterios de aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | aparecen los cuatro canales | ✅ | F1 |
| 2 | Total funciona | ✅ | B1–B3, B8 |
| 3 | cada canal modifica realmente los análisis | ✅ | B1–B5 por canal, E2 |
| 4 | no existen `channel:'total'` indebidos | ✅ | los 9 de Análisis eliminados; los restantes pertenecen a otros módulos con su selector |
| 5 | DoD | ✅ | unit + C4 día |
| 6 | WoW | ✅ | unit + C4 semana |
| 7 | MoM | ✅ | B4, C3 |
| 8 | YoY | ✅ | C1, C2 |
| 9 | parciales comparados correctamente | ✅ | B1–B2, C4, unit |
| 10 | sin comparaciones ficticias | ✅ | D1–D3 |
| 11 | sin NaN/Infinity | ✅ | unit (share/pct), D2; revisión de pantalla |
| 12 | contribuciones reconcilian | ✅ | B5, unit |
| 13 | Share & Mix reconcilia | ✅ | B3, unit |
| 14 | patrones usan la serie correcta | ✅ | F5 (sólo cerrados) |
| 15 | patrones avanzados con evidencia | ✅ | G1b |
| 16 | cohortes respetan su metodología | ✅ | F3, F5 |
| 17 | forecast respeta canal y período | ✅ | F4, F5 |
| 18 | narrativa usa datos reales | ✅ | B7 (canal y comparación en el texto; cifras de los motores) |
| 19 | señales importantes con drill-down | ✅ | G11 |
| 20 | drill-down conserva canal y período | ✅ | G5, G7, G9 |
| 21 | desde KPI hasta dato origen | ✅ | G10 → G1–G8 |
| 22 | filtros no mezclan contextos | ✅ | E1, E2 |
| 23 | Productos y Categorías siguen funcionando | ✅ | H1, batería |
| 24 | pruebas con datos reales | ⚠️ **Parcial** | Carga real por la importación de la app y 4 canales **sintéticos**; **falta tu archivo real** (Limitación 1) |
| 25 | resultados documentados | ✅ | este reporte |

(El criterio 24 queda abierto hasta que se ejecute con el archivo real.)


---

## Adenda · Métrica, Volumen·Precio·Mezcla, Puente al plan y umbral de Share & Mix (2026-10-07)

**Qué se agregó (mismo contexto único: canal + período + comparación equivalente):**
1. **Selector de métrica** (`#an-metric`: Venta · Pedidos · Unidades). Σ entidades = total en las tres; cada cambio de métrica descarta todo resultado derivado (como el canal). *Ticket promedio no se incluye:* no es aditivo (un promedio de promedios no concilia) y requiere método propio. Con Pedidos, un pedido con varios productos cuenta en cada producto (así viene en el archivo), por lo que Σ pedidos por producto ≠ pedidos únicos del negocio.
2. **Volumen · Precio · Mezcla** (`js/analytics/pvmEngine.js`, panel `#an-pvm`). Precio = venta ÷ unidades (realizado). Por entidad continua: Precio = (P1−P0)·U1 · Volumen = (ΣU1−ΣU0)·s0·P0 · Mezcla = (U1−ΣU1·s0)·P0. Entidades que sólo venden en un período → «Nuevas / Perdidas» (efecto = venta actual / −venta base); con venta pero sin unidades válidas → «Sin unidades». Identidad exacta Σ = Δ venta (se muestra «✓ Conciliado»).
3. **Puente al plan** (`js/analytics/planBridgeEngine.js`, panel `#an-bridge`). Brecha = Real − Meta. Por canal sin supuestos (la meta es por día y canal). Por producto: la meta no existe por producto → se asume que pedía crecer parejo sobre la venta base (supuesto escrito en pantalla); Σ aportes = brecha. Si no hay meta para el período/canal, o el plan cargado es de otro año, dice por qué y no inventa. Cobertura parcial de la meta se avisa. Si el archivo de productos y «Venta real» difieren > 1 %, se avisa.
4. **Umbral de Share & Mix** recalibrado: «estable» si |Δ participación| < **0.25 pp** (antes 0.01 pp: casi cualquier variación se clasificaba como ganar/perder). En el dataset sintético (Sep-2026 vs Ago-2026, producto): de 7 entidades, 7 clasificadas antes → 3 ahora (4 «estables»).
5. Detalles visuales: título/período de «Contexto temporal» ya no se pegan; encabezados «Cambio $» sin «$» cuando la métrica es Pedidos/Unidades; etiqueta YoY con año (p. ej. «Oct 1–5, 2026 vs Oct 1–5, 2025»); «Por SKU».

**Pruebas nuevas:** `tools/test-pvm-bridge.js` (19: casos conocidos + 200 corridas aleatorias que concilian), `tools/regression/batch_pvm.py` (59: PVM por canal × nivel contra implementación independiente en Python, perdido/nuevo, puente total y por canal con un archivo de Plan cargado por la importación real, sin plan, plan de otro año, comparación sin datos, métricas, pantalla). Suites previas sin regresión: `batch_an` 79/79, `batch_an_ui`, node (fases 23–27, 33, arquitectura, prioridades), batería T1–T10 + comparación contra la base: TODO EN VERDE.

**No verificado:** datos reales de 4 canales (criterio 24 sigue abierto); unidades reales (el archivo real puede traer presentaciones distintas por SKU que distorsionen «precio»); que el supuesto «crecer parejo» sea el reparto que usa tu plan; revisión visual en navegadores distintos de Chromium.


---

## Adenda 2 · Tendencia de productos: «la historia» (2026-10-07)

`js/analytics/trendStoryEngine.js` (`FP.trendStoryEngine`) responde, por entidad: **cuándo creció, cuándo cayó, cómo está ahora, si es estable o volátil y cómo se compara**.
1. **Estado actual** (columna «Ahora» + filtro «Estado actual»): usa el período en curso contra el comparable equivalente. Sin ventas / Inactivo / Nuevo / Reactivado / Subiendo / Cayendo / En línea. Si viene en caída y sigue cayendo, dice «continúa la caída».
2. **Línea de venta con fases** (reemplaza a la gráfica de % como principal; la de % queda en «Ver crecimiento % por período»): bandas de fase, máximo, mínimo y último cerrado; la línea se corta donde no hubo venta.
3. **Fases** (zigzag): un giro se confirma cuando el movimiento contrario supera max(10 %, 1.5 × la variación típica propia). Lo que no llega al umbral es «estable». Meses sin venta = episodio «sin ventas», no caída gradual.
4. **Estable / moderada / volátil** según la variación típica propia (mediana de |cambio período a período|): ≤ 5 % estable, > 15 % volátil. Aviso de lectura poco confiable si vende poco frente a lo típico (< 25 % de la mediana), tiene meses sin venta (cobertura < 70 %) o < 6 meses con venta.
5. **Contexto**: contra el total del canal y contra su categoría (últimos 6 períodos, en pp; ±5 pp = «similar»). A nivel Categoría sólo contra el total.
6. **Qué se movió**: volumen y precio de la entidad (Σ = Δ venta; sólo métrica Venta y con unidades válidas).
Pruebas: `tools/test-trend-story.js` (21, incl. 300 series aleatorias), `tools/regression/batch_story.py` (15, verdad en Python). Corregidos durante la revisión visual: la columna nueva rompía el ancho de la tabla (filas de 201 px → 63 px) y «Ahora» marcaba «En línea» a un producto en caída sostenida.
**No verificado:** umbrales (10 %, 1.5×, 5 %/15 %, 25 %) elegidos por criterio, no calibrados con tus datos reales; el patrón «clásico» (p. ej. «Crecimiento desacelerando») puede contradecir «Ahora» cuando el producto dejó de vender: conviven y falta unificarlos.

## Adenda 3 · Limpieza de la página Análisis y línea de tendencia (2026-10-08)

**Línea de tendencia («si sigue así») en «Venta por período y fases».** `FP.trendStoryEngine.outlook()`: recta de mínimos cuadrados sobre los últimos ≤6 períodos CERRADOS consecutivos con venta (mínimo 4), proyección a 3 períodos con banda de rango (±1.5·σ residual con ajuste por distancia, piso en 0). Dirección «al alza / a la baja / sin tendencia clara» sólo si la pendiente es significativa (|t| ≥ 2) y el cambio ajustado supera 6 %. Confianza por backtest de la MISMA regla un período adelante (error medio ≤10 % alta, ≤20 % media, si no baja; baja un nivel por razones: poca historia, producto volátil, vende poco, meses lejos de la recta, no mejora a repetir el último mes). No proyecta si el período en curso no tuvo ventas o el último cierre es 0. Si el período en curso contradice la tendencia se avisa. **No es un pronóstico**: no considera estacionalidad, promociones, inventario ni precio. Umbrales (6 períodos, 10 %/20 %, |t| ≥ 2) son supuestos iniciales pendientes de calibración con datos reales.

**Limpieza.** Página sin selección: 13,069 px → ~6,200 px. Se retiró «Cómo leer este análisis», el bloque de contexto temporal largo y el resumen de comparaciones; «Patrón/Señal/Anomalía/Impacto» pasaron a «Más filtros» (plegado); 4 KPIs (se quitaron entidades visibles, crecen/caen, anomalías, patrones → una línea sobre la tabla); sin columna «Duración»; el nombre de la entidad es el enlace al detalle; lectura de entidad sin recuadro de 6 métricas duplicadas; «Prioridades de acción» se fusionó en «Contribución» (columnas Persist. y Primera pista; el motor sigue calculándose); Mix muestra 3 y 3; Forecast anterior quedó plegado al final; se retiró el panel de Cohortes (el motor sigue disponible); el resumen ejecutivo se movió arriba y se acortó (detalle por capa plegado); en el detalle, «Detalle temporal» y «Registros fuente» están plegados.

**Verificación.** test-trend-story 36/36 (incluye 15 de outlook y 300 series aleatorias), batch_story 18/18 (T1: proyección en pantalla = cálculo independiente en Python), batch_an, batch_pvm 59, batch_an_ui y batería+comparación contra la base en verde. Tests que revisaban paneles retirados se reescribieron (architecture-15, phase25, priorities-14, batch_an F3/F4/G8/G11).

## Adenda 4 · Detalle que no terminaba, aviso de llave duplicada y borrado en Recovery (2026-10-08)

**«Cargando detalle…» sin fin.** No se reprodujo con datos de prueba (327 combinaciones nivel × canal × métrica × entidad, sin fallas). Causa más probable con datos reales: el detalle hacía ~15 lecturas completas del rango (total, 8 por canal, hijos, historia diaria completa, registros) y cada una recorre todos los bloques día × canal; además `keysIn` deserializaba cada bloque sólo para listar llaves. Y había un camino que se salía sin avisar (`return` si faltaba el contexto) dejando «Cargando…» para siempre. Cambios: `productStore.aggregateScan` (una pasada por rango: total, canal y siguiente nivel de cada bloque leído una vez; sin funnel porque Venta/Pedidos/Unidades no lo usan), `idb.keys` (sólo llaves), detalle temporal tomado de las series que el análisis ya calculó cuando es posible, fase B (temporal y registros) en segundo plano con la pantalla ya útil, mensaje con motivo y botón «Reintentar» si falla, y salida de emergencia a los 90 s. Las cifras son idénticas al método anterior (prueba D1 contra agregados independientes en todos los productos).

**Llave duplicada.** La llave real del archivo de venta es fecha · canal · SKU + estado · sucursal · entrega · ciudad (+ «otra dimensión» si se mapea); el aviso sólo mostraba tres campos, por eso parecía falso. Ahora muestra la llave completa y, en conflicto, qué métrica difiere (valor y fila de cada una) y la salida. Comportamiento sin cambios: duplicado exacto → se conserva una vez; conflicto → se conserva la primera y NO se suma la segunda. Si el archivo es por línea de pedido, esto subestima la venta (ver pendientes).

**Borrar en Recovery Center.** Escenarios guardados (botón «Borrar»), acciones del plan (con sus mediciones e historial) y acciones propias del catálogo («Quitar»). Nunca el catálogo base ni las propuestas por IA. Confirmación en cada caso; al borrar un escenario las acciones ligadas se conservan sin escenario (queda nota en su historial) y la cadena de versiones se repara. Los ids nuevos se calculan por máximo existente (antes por conteo: tras borrar podían repetirse y mezclar vínculos).

**Verificación.** batch_drill 9/9, batch_rcdel 14/14, batch_dupkey 5/5, más batch_an, batch_an_ui, batch_story, batch_pvm y batería+comparación en verde.

## Adenda 5 · Cuadre entre Diagnóstico, Categoría → Producto y Análisis (2026-10-08)

**Hallazgo.** Con el mismo canal y periodo, las cifras del periodo actual coincidían en los tres módulos, pero la **referencia** no: Análisis comparaba contra el periodo de calendario anterior (ago 1–31), Diagnóstico › productos y la vista Producto contra «los N días inmediatamente anteriores» (ago 2–31), y el titular de Diagnóstico solo cuenta los días×canal con dato en ambos periodos (ago 1–30; actual 395,889 contra 403,008 de las categorías). Además, un mes en curso (oct 1–5) se comparaba con ventanas distintas.

**Cambio.** `productAnalysis.baselinePeriod` usa la misma definición que `temporalEngine`: mes o año completos → mes/año anterior de calendario; periodo en curso desde el inicio del periodo (`periodType` que lleva `fromDiagnosis`) → se acota al último día con datos de producto y se compara con los mismos días del periodo anterior (oct 1–5 → sep 1–5). Rangos libres siguen usando los N días inmediatamente anteriores. Diagnóstico › productos muestra ahora el periodo de referencia con fechas y una **nota de cuadre** contra el titular (coincide / no coincide y por qué: días sin dato en uno de los periodos o fechas distintas entre archivos).

**Prueba.** `batch_xmod.py` (51 comprobaciones): Sep total/ecommerce/llamadas y Oct parcial total/app; categorías, productos y totales de Diagnóstico, Producto y Análisis (mix y patrones) contra verdad calculada aparte en Python. Falla en la versión anterior (referencia ago 2–31).

## Adenda 6 · Tráfico y conversión: «Qué explica el cambio de la venta» (2026-10-08)

**Qué se añadió.** Con el mismo periodo, canal y referencia que Diagnóstico, la página parte el cambio de la venta en tráfico, conversión y ticket (`FP.trafficConversionEngine`, función pura; vista en `js/ui/segments-decomp-view.js`):
- titular («La venta bajó −$59,000 (−4.0 %)») y cascada tráfico → conversión → ticket → total; los tres efectos suman exacto el cambio;
- «Qué mirar primero»: hasta 4 frases deterministas ordenadas por monto (conversión del segmento que más restó con su % del efecto, tráfico, tráfico extra que convierte peor, ticket);
- mezcla del CR total: cuánto se movió dentro de los segmentos y cuánto por cambio de mezcla de tráfico;
- tabla de todos los segmentos con barras divergentes de escala común, efecto dominante en negritas y marca «distinguible del azar / no concluyente» (prueba z de dos proporciones al 95 %) en el efecto conversión; poco volumen (mayor entre 500 sesiones y 1 % del tráfico) se agrupa en «Otros»;
- «Todas las dimensiones»: efectos totales y segmento que más restó/sumó por dimensión, con enlace para abrirla.

**Casos límite.** Segmento nuevo → todo tráfico; desaparecido → tráfico negativo; base sin pedidos → el cambio se atribuye a conversión; hoy sin pedidos → conversión absorbe; sin sesiones, pedidos o venta en un periodo → se excluye y se avisa; sin periodo base → mensaje, sin efectos inventados.

**Se retiró** la tabla «Ganadores/Perdedores» (top 3) por redundante; su contenido está en la tabla completa. «Qué cambió» pasó a llamarse «CR semanal» (solo la tendencia). La marca de «no concluyente» frente al CR del total, la oportunidad estimada y los rankings no cambian.

**Pruebas.** `tools/test-traffic-conversion.js` (20, Node: cifras contra Python, casos límite, frases) y `batch_decomp.py` (16, navegador: titular, cascada, tabla, frases, mezcla, resumen por dimensión, sin periodo base, sin desborde 390–1920 px); `batch_u.py` actualizado a la tabla nueva.

**Limitación conocida.** El orden tráfico → conversión → ticket es una convención: otro orden cambia las cifras por segmento (no el total). No se probó con un export real de GA4.

## Adenda 7 · Robustez de Análisis y Tráfico y conversión (2026-10-08)

**Pruebas deterministas.** `battery.py` y los lotes que dependían de la fecha corren con reloj fijo (2026-10-07); la línea base de la batería se regeneró desde el árbol anterior con ese reloj. Los lotes y pruebas Node que dependían de rutas externas (`/tmp`, `/mnt/data`) ahora se marcan **OMITIDA** con el motivo, en lugar de fallar.

**Patrones · materialidad.** La tabla de patrones oculta entidades que pesan menos de X % del total (en el periodo actual o en la base; por defecto 0.5 %, opciones 0 / 0.1 / 0.5 / 1 / 2 %) y lo dice («N ocultas por materialidad»). Contribución y origen **no** se filtra. Prueba: `batch_mat.py` (11).

**Evolución · temporada y confianza.** La proyección (mensual) compara con el mismo mes del año anterior (`seasonRef`; se carga un mes extra) y avisa si la tendencia lineal se aparta más de 15 % de la temporada. La confianza sale del error de un backtest (MAPE) frente a un pronóstico ingenuo, con umbrales visibles. Pruebas: `test-trend-story.js` (43), `batch_proj.py` (5).

**Proyección vs meta.** Para el total, la proyección del cierre se compara con la meta (`planForRange`). `batch_proj.py`.

**Diagnosticar desde Análisis.** Botones «Diagnosticar esto / este periodo» en Lectura de la entidad y Contribución: trasladan canal, comparación (periodo anterior / año anterior) y periodo al Diagnóstico por el contexto persistente de la app (`state.ux.ctx` + `navigation.applyContext`). Semana y día abren el mes que los contiene y la app lo avisa. No cambia el Análisis.

**Exportaciones puntuales.** «Descargar CSV» (contribución: entidad, rol, ranking, base, actual, cambio, % cambio, aporte, peso, Δ share, con periodo/comparación/canal/métrica en el encabezado; respeta la materialidad vigente) y «Descargar lectura» (texto de la entidad). Son descargas independientes: **no** forman parte de los 7 exports del paquete de análisis. Prueba: `batch_diag_export.py` (7), cifras contra cálculo aparte.

**Tráfico y conversión · calidad del tráfico.** `trafficConversionEngine.qualityChecks` marca (máx. 3, solo segmentos sobre el umbral de sesiones): sesiones sin ningún pedido; tráfico que se duplicó o más con CR menor a la mitad del propio; segmento nuevo con CR menor a la mitad del total. El aviso dice «puede ser tráfico no humano, campaña de baja intención o etiquetado» y que la app no lo confirma. El cruce **Dispositivo × Fuente/medio** ya existía como dimensión; se verificó que descompone y cuadra, y que las celdas chicas van a «Otros». Pruebas: `test-traffic-conversion.js` (23), `batch_dxsrc.py` (7).

**Limitaciones.** Los umbrales de calidad (×2 de tráfico, mitad del CR) y los de tendencia/temporada son convenciones sin calibrar con datos reales. No hay detección real de bots (solo patrón aritmético). Nada se probó con un export real de GA4.

## Adenda 8 · Prueba con el export real de GA4 (2026-10-09)

**Archivo.** `Segmentos_2026.csv`: 750,000 filas, 93.8 MB, 1 ene – 30 sep 2026, plataformas web / Android / iOS (web → Ecommerce; Android e iOS → App), fechas en español con «sept». Importa en ~26 s (418,674 filas de segmentos tras agregar).

**Hallazgos y correcciones.**
1. **Página de inicio «/» rechazada.** `normalizeSegment` convertía «/» en llave vacía (todo símbolo desaparece al normalizar) y la fila se descartaba con «Falta el segmento»: 289 filas, ~24 % de las sesiones y ~50 % de la venta de la dimensión Landing. Ahora los segmentos hechos solo de símbolos reciben una llave determinista (`sym_<códigos>`) y la etiqueta sigue siendo «/».
2. **Variantes de texto que colisionan.** 1,311 landings (y algunos valores de medio/campaña) eran distintos para GA4 pero iguales para la app (mayúsculas, «/» final, signos: `?q=Mounjaro` / `?q=mounjaro`). El almacén conserva una fila por llave (la última), así que la vista perdía el resto: en Landing, ~1 % de las sesiones y de la venta. El traductor GA4 ahora **suma** las variantes que comparten llave (día, canal, dimensión, llave) y rotula con la de más sesiones. La ruta de CSV genérico no cambia: sigue avisando duplicados sin sumar (punto «llave duplicada», pendiente de decisión).
3. Antes: 289 rechazadas, 1,259 duplicados. Después: 0 rechazadas, 0 duplicados.

**Comprobación.** `batch_real_ga4.py` (19): para agosto y septiembre, 7 dimensiones × 2 canales, las sesiones, pedidos y venta de la app = CSV leído aparte, y los totales de efectos (tráfico, conversión, ticket) de Tráfico y conversión = cálculo independiente en Python (14 de 14 combinaciones). Se omite si el archivo no está (variable `GA4_REAL`). `tools/test-ga4-segments-keys.js` (7) cubre las colisiones con datos mínimos.

**Efecto del orden de los efectos (cifras reales, Ecommerce, dimensión Fuente, Δ venta +$132,754 en todos).** Tráfico → conversión → ticket (el de la app): tráfico −$786,030 · conversión +$574,766 · ticket +$344,018. Otros órdenes: tráfico entre −$766,053 y −$1,088,592, conversión entre +$534,011 y +$877,328, ticket entre +$275,627 y +$384,773. El signo no cambia en ningún orden; la magnitud sí (hasta ~±35 % en un efecto). En App: conversión entre +$2.82 M y +$3.37 M.

**Efecto del mínimo de sesiones (cifras reales).** Con el 1 % en Ecommerce (3,727 sesiones): Fuente deja 4 segmentos + «Otros» (95); Landing deja 4 páginas + «Otros» (9,030), que reúne el 64 % del tráfico. Los efectos totales dependen de la granularidad: tráfico en Fuente con mínimo 50 = −$360,950; con el 1 % = −$786,030 (la mezcla dentro de «Otros» se absorbe en su conversión). Δ total no cambia. En App (631 sesiones) casi no hay diferencia. Se añadió un aviso cuando «Otros» reúne ≥ 25 % del tráfico.

**Otros cambios del día.** (a) Materialidad también en la tabla de Contribución, con aviso de cuántas entidades oculta y cuánto suman; el cambio neto y la concentración siguen contando todas. (b) Los hallazgos de «Qué mirar primero» con monto menor al 2 % de la suma de los tres efectos ya no se muestran (p. ej. «−$247» como «el 100 % de lo que restó la conversión»). (c) Los botones de Diagnosticar/descargar llevan borde para leerse como botones.

**Limitaciones.** Solo se probó el periodo ago→sep 2026 en Ecommerce y App; no se contrastó contra la interfaz de GA4. El orden de efectos y el mínimo de sesiones siguen siendo convenciones (ahora con cifras reales a la vista). No hay detección de bots: el aviso de calidad solo marca patrones aritméticos (ej.: 4,061 sesiones sin pedidos en una ficha, 37,387 en «Sin dato (not set)»).

## Adenda 9 · Mínimo de sesiones elegible y «Sumar filas con la misma llave» (2026-10-09)

1. **Selector «Mínimo de sesiones por segmento»** (Segmentos · Descomposición). Opciones: Automático (el mayor entre 500 y el 1 % del tráfico) o 25, 50, 100, 250, 500, 1,000, 2,500, 5,000. Se recuerda por dimensión. Cambia qué segmentos se ven por separado y cuáles van a «Otros»; el Δ venta total no cambia, pero el reparto entre tráfico, conversión y ticket sí (agrupar absorbe la mezcla).
2. **Sumar filas con la misma llave** (Carga · opciones de lectura, activo por defecto, solo archivos de ventas de productos). En un archivo transaccional (varias filas por SKU, fecha y canal) las filas con la misma llave se suman en vez de marcarse duplicado/conflicto. Se informa cuántas filas se sumaron en cuántas llaves y cómo apagarlo. Con la opción apagada, el comportamiento anterior no cambia.
3. **Tráfico a revisar.** Las dos fichas que la persona considera «tráfico raro» (una landing con 4,061 sesiones y sin pedidos; «Sin dato (not set)» con 37,387 sesiones y sin pedidos) las marca la app con «Revisa la calidad de este tráfico». Que sean bots o un problema de etiquetado es un juicio de la persona; la app no lo verifica.
4. **Pruebas.** `batch_sumkey.py` (SK1–SK10), `batch_dxsrc.py` (MS-1..6), `batch_real_ga4.py` (R-6/R-7 con el CSV real y mínimo 250). Corrección en la propia prueba R-6: agrupaba por texto de la etiqueta y no por la llave normalizada que usa la app (141 variantes de texto distintas por día). Regresión: 47 lotes, 0 fallos; Node 26 + 43 + 7 ok; batería y comparación en verde.

## Adenda 10 · Inicio con resumen general (2026-10-09)
1. **Qué se hizo.** Cuatro bloques debajo de «¿Qué está pasando?» (que queda idéntico): Por qué cambió la venta, Dónde mirar hoy, Cómo va cada canal y Confianza de los datos. Nuevo `homeSummaryEngine.js` (solo compone motores existentes) y `home-summary-view.js`; `home-view.js` solo inserta el HTML. Titular: días exactos contra días exactos (decisión del usuario).
2. **Decisiones por defecto (a validar).** El estado por canal usa las etiquetas de pacing ya configuradas; elegir un canal en la tabla cambia el Canal de Inicio; el desplegable «De dónde sale…» se queda; el aviso de calidad va dentro de «Dónde mirar hoy».
3. **Limitaciones.** «Total digital» no separa tráfico/conversión/ticket si algún canal no trae sesiones. «Dónde mirar hoy» usa solo Segmentos (no hay productos/categorías todavía: el análisis de producto es asíncrono y pesado). No se midió el tiempo de cálculo de Inicio con la carga completa de productos.
4. **Pruebas.** `batch_home_summary.py` (H0–H10): cascada, días comparados, canales y segmentos contra un cálculo aparte; R-8/R-9 con el export real (el aviso marca la ficha `/saba-buenas-noches-…` y «Sin dato (not set)»).

## Adenda 11 · Plan de simplificación y Fase 1: Inicio simplificado (2026-10-09)
1. **Plan.** `PLAN_DE_SIMPLIFICACION.md`: ocho fases con la regla «no se omite ningún dato» (lo esencial arriba, «Ver más» plegado, «Metodología y ayuda»).
2. **Fase 1 construida.** «Lo esencial» + desplegables. Altura de Inicio con datos de prueba: ~3,280 px → ~1,720 px con todo cerrado; el contenido sigue en la página.
3. **Garantía.** `compare.py` contra la línea base anterior (abre todos los `<details>`): ninguna palabra, tabla ni control desaparece (solo se permiten palabras nuevas). `batch_home_summary.py` H11–H15 comparan lo esencial con las tarjetas y la cascada.
4. **Pruebas ajustadas.** Las que asumían las tarjetas visibles ahora abren «Ver más» (como la persona) o leen `textContent`; el orden esperado de R-15 pasó a lo esencial → todas las cifras → recorrido → preparación → siguiente paso.

## Adenda 12 · Fase 2: marco global limpio (2026-10-09)
Cambios: fase del encabezado al pie; etiqueta del siguiente paso (`monitor_recovery`) = nombre de la pantalla a la que lleva; ficha de calidad solo en el encabezado (la barra de contexto conserva la frase y el enlace). Prueba nueva `batch_marco.py` (M1–M4). Regresión: 48 lotes, 0 fallos; batería y comparación en verde. No se hizo el caso «el siguiente paso apunta a la misma pantalla»: ya estaba cubierto por la condición existente (`next.view !== view`).

## Adenda 13 · Fase 3: Pacing y Forecast, y venta real en Inicio (2026-10-09)
1. **Inicio.** «¿Cómo voy?» muestra ahora la **venta real en $** del periodo (acumulada a la fecha) y, debajo, el plan a la fecha. Sale de las mismas cifras de Pacing (`p.actualToDate.revenue`, `p.planToDate.revenue`). Prueba H16 contra una suma aparte (Ecommerce y App).
2. **Pacing & Forecast.** Orden nuevo: encabezado → **la respuesta** (cifras del total y tabla por canal) → alertas → fecha de referencia, método y métrica (compactos, visibles porque cambian la respuesta) → gráfico → **«Ver más»** plegado: Pacing por periodo, Índices de desempeño, Métodos, Eventos y festivos, Versiones, Parámetros. Los ids no cambian (`#fc-kpis`, `#fc-channels`, `#fc-periods`, …), así que el recorrido guiado y las acciones siguen igual.
3. **Garantía.** `compare.py` abriendo todos los `<details>` contra la línea base: no desaparece ninguna palabra, tabla ni control. Sin corrida (sin plan) el bloque «Ver más» se oculta, porque no habría nada que detallar.
4. **Pruebas.** `batch_pacing3.py` (P1–P6): orden, seis desplegables cerrados, respuesta y ajustes visibles, tablas completas al abrir (13 filas de periodos, 4 métodos), cambio de métrica con lo abierto sigue abierto, total = suma de canales.
5. **Límites.** Falta probar con personas reales y no se midió el móvil de esta vista. «Pacing por periodo» pasó a «Ver más» por decisión del plan: si resulta una consulta frecuente, es candidata a volver arriba.
