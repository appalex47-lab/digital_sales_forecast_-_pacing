# DATA_DICTIONARY.md — Digital Sales Forecast & Pacing

Contrato de datos 1.8.0 (Fases 1 a 8.1.1). Convención: nombres internos en camelCase; en CSV y JSON exportado, snake_case.
"Obligatorio" se refiere a la carga del tipo indicado (H = histórico, P = plan, A = actual).

## 1. Campos de archivo (CSV) → modelo canónico

| Campo canónico | Encabezados aceptados (ejemplos) | Tipo | Obligatorio | Descripción | Cálculo / normalización |
|---|---|---|---|---|---|
| date | fecha, date, dia | fecha `YYYY-MM-DD` | H, P, A | Día del registro | ISO siempre; `DD/MM/AAAA` o `MM/DD/AAAA` solo si es inequívoca o el usuario elige el formato. Ambigua o imposible → error |
| channel | canal, channel | texto (id) | H, P, A | Canal digital | Normalizado a `ecommerce`, `app`, `whatsapp`, `llamadas` vía alias. Otro valor → error |
| revenue | venta, ventas, revenue, sales, meta_venta | número ≥ 0 | H, P, A | Venta en moneda (MXN) | Quita `$`, MXN y separadores de miles. Derivable: pedidos × AOV |
| orders | pedidos, orders, ordenes, meta_pedidos | entero ≥ 0 | H, A | Número de pedidos | Derivable: volumen × CR |
| trafficVolume | traffic_volume, sesiones, sessions, mensajes, llamadas, meta_traffic_volume | entero ≥ 0 | H, A | Sesiones (Ecommerce, App), mensajes/contactos (WhatsApp) o llamadas (Llamadas) | Derivable: pedidos ÷ CR |
| conversionRate | conversion_rate, cr, meta_conversion_rate | fracción 0–1 | No | Tasa de conversión | Acepta `0.0167` o `1.67%`. Calculado: pedidos ÷ volumen. Cargado se compara contra el calculado con tolerancia |
| aov | aov, ticket_promedio, meta_aov | número ≥ 0 | No | Ticket promedio | Calculado: venta ÷ pedidos. Cargado se compara contra el calculado con tolerancia |
| event | evento, event | texto | No | Evento comercial del día | Espacios limpiados. Si existe y no hay tipo de día → `dayType = event` |
| holiday | festivo, holiday, feriado | texto | No | Festivo | Si existe y no hay tipo de día → `dayType = holiday` |
| season | temporada, season | texto | No | Temporada comercial | — |
| dayType | tipo_dia, day_type | enum | No | `regular`, `holiday`, `event`, `campaign`, `special` | Acepta español (festivo, evento, campaña, especial). Si falta, se infiere |
| notes | observaciones, notas, notes | texto | No | Comentario libre (sobre todo en actual) | — |

## 2. CanonicalRecord (registro normalizado)

| Campo | Tipo | Obligatorio | Descripción | Cálculo |
|---|---|---|---|---|
| key | texto | Sí | Llave lógica | `date|channel|dataType` |
| dataType | enum | Sí | `historical`, `plan`, `actual` | Tipo elegido al cargar |
| date | fecha | Sí | Día normalizado | Ver §1 |
| channel | texto | Sí | Canal normalizado | Ver §1 |
| dayType | enum | Sí | Tipo de día | Cargado o inferido (default `regular`) |
| holiday, event, season, notes | texto \| null | No | Atributos del día | Cargados |
| metrics.<métrica>.value | número \| null | Sí | Valor de la métrica | Observado o calculado; null si falta o es inválido |
| metrics.<métrica>.source | enum | Sí | `observed`, `calculated`, `missing`, `invalid` | Ver ARCHITECTURE §13 |
| metrics.<métrica>.raw | texto | No | Texto original | Solo si era inválido o se limpió |
| metrics.<métrica>.note | texto | No | Razón de un faltante | Ej. "No calculable: volumen 0." |
| status | enum | Sí | `valid`, `warning`, `error` | Peor severidad de sus issues |
| issueCounts.error / .warning | entero | Sí | Conteo de issues de la fila | — |
| provenance.batchId | texto | Sí | Lote (archivo) de origen | — |
| provenance.fileName | texto | Sí | Nombre del archivo | — |
| provenance.row | entero | Sí | Línea en el archivo (encabezado = 1) | — |

## 3. Batch (archivo importado)

| Campo | Tipo | Descripción |
|---|---|---|
| id | texto | Identificador del lote |
| dataType | enum | Tipo de dato del archivo |
| fileName | texto | Nombre del archivo |
| importedAt | fecha-hora ISO | Momento de la importación |
| rowCount / accepted / rejected | entero | Filas leídas / importadas / fuera del modelo |
| includeErrorRows | booleano | Si se importaron filas con errores en métricas |
| settings | objeto | Tolerancia, formato de fecha y de número usados |
| mapping | objeto | Encabezado → campo canónico (null = ignorado) |
| delimiter | texto | Separador detectado |
| summary | objeto | Conteos de la validación |
| issues | Issue[] | Todos los issues del archivo, con `rowImported` |
| origin | texto | Opcional: `mock-fase0`, `migration` |

## 4. Issue (error de calidad)

| Campo | Tipo | Descripción |
|---|---|---|
| type | enum | Tipo del catálogo `config.errorTypes` (ver ARCHITECTURE §14) |
| severity | `error` \| `warning` | Severidad aplicada |
| row | entero \| null | Línea del archivo |
| field | texto \| null | Encabezado original (o campo canónico) |
| message | texto | Explicación y, cuando aplica, cómo corregir |
| value | texto \| número \| null | Valor problemático |
| key | texto \| null | Llave del registro, si tiene |
| batchId, fileName, dataType, rowImported | — | Agregados al guardar el lote |

## 5. DailyRecord (vista consolidada, Fase 0)

| Campo | Tipo | Descripción | Cálculo |
|---|---|---|---|
| id | texto | `date|channel` | — |
| date, year, month, quarter, fortnight | — | Atributos de calendario | `FP.calendar.getDateAttributes` |
| week, weekYear, weekKey | — | Semana ISO | `getWeekInfo` (único punto de definición) |
| weekOfMonth, weekOfMonthLabel | — | W1…W5 dentro del mes | días 1–7 = W1, etc. |
| dayOfWeek, dayOfWeekIndex, dayOfYear, isWeekend | — | Día de la semana y del año | — |
| channel, dayType, holiday, event, season | — | Atributos de negocio | Desde el registro canónico |
| plan / actual / forecast | bloque de 5 métricas | Estados separados | plan ← planData; actual ← actualData; forecast vacío hasta fases posteriores |
| sources.<estado>.<métrica> | `observed` \| `input` \| `model` \| `calculated` | Origen en vocabulario de Fase 0 | Plan cargado = `input`; real cargado = `observed` |
| validation.<estado> | objeto | Resultado de `FP.metrics.validateBlock` | Tolerancias de `config.tolerances` |

## 6. Metas (Targets, Fase 0)

| Campo | Tipo | Descripción |
|---|---|---|
| year, currency | — | Año y moneda |
| annual | bloque de métricas | Meta anual total (Fase 0–1: solo `revenue`) |
| byChannel.<canal> | bloque | Meta anual por canal |
| byMonth, byWeek, byDay | mapa periodo → { total, byChannel } | Reservado para la distribución (fase posterior) |
| updatedAt | fecha-hora | Última edición |

## 7. Ajustes de importación (`settings`)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| tolerance | fracción | 0.01 | Tolerancia relativa CR/AOV (`DATA_VALIDATION_TOLERANCE`) |
| dateFormat | `auto` \| `DMY` \| `MDY` | `auto` | Orden de fechas con "/" |
| numberFormat | `dot` \| `comma` | `dot` | 1,234.56 o 1.234,56 |
| includeErrorRows | booleano | false | Importar filas con errores en métricas |

## 8. Relaciones matemáticas

| Métrica | Fórmula | Condición para calcular |
|---|---|---|
| CR | pedidos ÷ volumen | ambos presentes, volumen > 0 |
| AOV | venta ÷ pedidos | ambos presentes, pedidos > 0 |
| Pedidos | volumen × CR | ambos presentes |
| Venta | pedidos × AOV = volumen × CR × AOV | ambos presentes |
| Volumen | pedidos ÷ CR | ambos presentes, CR > 0 |

Las agregaciones suman venta, pedidos y volumen y recalculan CR y AOV desde las sumas; nunca promedian ratios.


---

# Fase 2 — Planeación

## 9. Celda del plan distribuido

| Campo | Tipo | Descripción | Origen | Cálculo | Ejemplo |
|---|---|---|---|---|---|
| value | número \| null | Valor planeado | motor | según métrica (§10) | `257308.84` |
| source | enum | De dónde sale el valor | motor | ver ARCHITECTURE §26 | `historical_seasonality` |
| status | enum | `loaded`, `calculated`, `calculated_with_assumption`, `insufficient_data` | motor | — | `calculated` |
| confidence | enum | `excellent`, `sufficient`, `limited`, `insufficient` | seasonality | umbrales de `config.planning` | `limited` |
| note | texto | Explicación corta | motor | — | `venta ÷ AOV supuesto` |

## 10. Día del plan (`plan.channels.<canal>.days[]`)

| Campo | Tipo | Descripción | Origen | Cálculo | Ejemplo |
|---|---|---|---|---|---|
| date | fecha | Día | calendario | `daysOfYear(año)` | `2026-09-24` |
| month | entero | Mes del día | calendario | — | `9` |
| tag | objeto \| null | Evento, festivo, temporada y tipo de día del año planeado | planData, actualData, eventos configurados | `buildTags` | `{ event: "Hot Sale" }` |
| explicit | objeto \| null | Registro importado que fija el día | planData | — | `null` |
| weightInfo.weight | número | Peso diario antes de normalizar | seasonality | F_díaSemana^α × F_calendario^α × F_evento^α × F_temporada^α | `1.0428` |
| weightInfo.factors | objeto | Factor aplicado por componente | seasonality | — | `{ dayOfWeek: 1.042 }` |
| share | fracción | Participación del día en su mes | motor | peso ÷ Σ pesos del mes | `0.0345` |
| cells.revenue | celda | Venta planeada | explícito o reparto | meta_mes × peso normalizado (mayor residuo, centavos) | `257308.84` |
| cells.orders | celda | Pedidos planeados | calculado | pedidos_mes (venta ÷ AOV) repartidos por venta, enteros | `281` |
| cells.trafficVolume | celda | Volumen planeado | calculado | volumen_mes (pedidos ÷ CR) repartido, enteros | `25735` |
| cells.conversionRate | celda | CR del día | calculado | pedidos ÷ volumen | `0.01092` |
| cells.aov | celda | AOV del día | calculado | venta ÷ pedidos | `915.69` |

## 11. Mes del plan (`months[]`)

| Campo | Tipo | Descripción | Origen | Cálculo | Ejemplo |
|---|---|---|---|---|---|
| key | texto | `AAAA-MM` | calendario | — | `2026-09` |
| target | número | Meta mensual de venta | explícita o reparto | meta anual × peso mensual (mayor residuo) | `7466255.71` |
| source | enum | Origen de la meta mensual | motor | prioridad §23 | `historical_seasonality` |
| share | fracción | Peso aplicado en el año planeado | seasonality | índice diario^α × días del mes, normalizado | `0.0762` |
| histShare | fracción | Participación histórica promedio | seasonality | años completos | `0.0761` |
| confidence | enum | Confianza del peso mensual | seasonality | años completos | `sufficient` |
| explicitDays | entero | Días fijados por el plan importado | planData | — | `0` |
| assumptions.aov / .conversionRate | celda | Supuestos del mes | histórico o usuario | Σventa÷Σpedidos, Σpedidos÷Σvolumen | `916.27` |
| plan | bloque | Totales del mes | agregación | Σ días; CR y AOV desde sumas | — |

## 12. Semana del plan (`generateWeeklyPlan`)

| Campo | Tipo | Descripción | Cálculo | Ejemplo |
|---|---|---|---|---|
| weekKey | texto | Semana ISO | `getWeekInfo` | `2026-W39` |
| weekStart / weekEnd | fecha | Lunes y domingo | ISO | `2026-09-21` / `2026-09-27` |
| crossesMonths | booleano | La semana toca dos meses | — | `false` |
| plan | bloque | Totales de la semana | Σ días | — |
| byMonth[] | lista | Parte de la semana en cada mes | Σ días por mes | `[{ month: "2026-09", days: 7 }]` |

## 13. Perfil de estacionalidad (por canal)

| Campo | Tipo | Descripción | Cálculo | Ejemplo |
|---|---|---|---|---|
| years / completeYears | enteros | Años con dato / años completos | cobertura por mes ≥ `monthMinCoverage` | `[2024, 2025]` |
| sufficiency | enum | Suficiencia general | `yearThresholds` | `sufficient` |
| monthly.index[12] | número | Índice de venta diaria por mes | promedio del mes ÷ promedio anual, robusto entre años | `1.176` (mayo) |
| dayOfWeek.factors[7] | número | Factor lunes…domingo | ratio vs base, winsorizado, promedio 1 | `0.836` (domingo) |
| calendar.factors[31] | número | Factor por día del mes | solo con evidencia; encogido | `1.073` (día 15) |
| events.<clave> | objeto | Evento o festivo: `raw`, `factor`, `samples`, `occurrences`, `years`, `confidence`, `note` | ratio vs base × F_díaSemana, encogido y acotado | Hot Sale `1.390` |
| seasons.<clave> | objeto | Temporada: igual que eventos | contraste dentro del mes | `1.000` |
| metrics.byMonth[12] | objeto | CR y AOV históricos del mes con muestras | razón de sumas | `{ aov: 916.27 }` |

## 14. Auditoría y versiones

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| audit.generatedAt | fecha-hora | Momento de generación | `2026-09-23T21:50:00Z` |
| audit.algorithmVersion | texto | Versión del algoritmo | `planning-v1` |
| audit.historicalPeriod | objeto | Modo, desde/hasta, años completos, registros | `{ completeYears: [2024, 2025] }` |
| audit.distributionMethod | texto | Método aplicado | `D · Histórico + calendario + eventos` |
| audit.assumptions | objeto | CR/AOV usados y su fuente | — |
| audit.confidence | enum | Confianza general | `sufficient` |
| version.type | enum | `original_distributed_plan` (congelado) o `plan_revision` | — |
| version.id | texto | Identificador | `distributed-plan-2026-original` |

## 15. Configuración de planeación (`planningSettings`)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| method | `A`–`D` | `D` | Método aplicado |
| historicalPeriod | objeto | anterior al año planeado | Periodo histórico usado |
| useExplicitPlan | booleano | true | Respetar el plan diario importado |
| smoothing | enum | `winsorized_mean` | Método de suavizado |
| outlierMadK | número | 3 | Umbral de extremos |
| shrinkageK | número | 6 | Encogimiento hacia 1 |
| minSamples | entero | 3 | Mínimo de muestras por grupo |
| monthMinCoverage | fracción | 0.8 | Cobertura para contar un mes como completo |
| componentWeights | objeto | todos 1 | Intensidad de mensual, día de semana, calendario, eventos, temporada |
| assumptions.<canal> | objeto | null | CR y AOV manuales (solo si no hay histórico) |


---

# Fase 3 — Pacing y forecast

## 16. Día de pacing (`run.channels.<canal>.days[]`, igual en `run.total.days[]`)

| Campo | Tipo | Descripción | Origen | Cálculo | Ejemplo |
|---|---|---|---|---|---|
| date, month, weekKey | texto | Día, mes `AAAA-MM`, semana ISO | calendario | — | `2026-09-22`, `2026-09`, `2026-W39` |
| temporal | enum | `past`, `today`, `future` | pacing | vs `referenceDate` | `today` |
| closed | booleano | Día ≤ corte | pacing | — | `true` |
| counted | booleano | Cerrado y con venta real | pacing | — | `true` |
| plan | bloque | Plan del día (5 métricas) | plan original (Fase 2) o planData | copia de solo lectura | `{ revenue: 269268.25 }` |
| actual | bloque \| null | Real del día (solo si está cerrado) | actualData / historicalData | observado o calculado | `{ revenue: 251121.72 }` |
| partialActual | bloque \| null | Real de un día no cerrado (en curso) | actualData | se muestra, no cuenta | — |
| actualSource | enum | `actual` o `historical` | store | — | `actual` |
| forecast | bloque \| null | Forecast del día | motor | actual si contado; método si no | `{ revenue: 263000 }` |
| forecastSource | enum | `actual`, `projected`, `insufficient_data` | motor | — | `projected` |
| fallback / fallbackReason | booleano / texto | Un índice sin datos obligó a usar el plan | métodos | — | `false` |
| pacing.<métrica> | objeto | `{ plan, actual, gap, gapPct, compliance }` del día | gap | actual − plan | `gap: -18146.53` |
| cumulative.<métrica> | objeto | Igual, acumulado desde el 1 de enero en días contados | pacing | Σ contados | `compliance: 1.034` |
| status | enum | `above`, `on_plan`, `below`, `insufficient_data`, `in_progress`, `future` | gap | umbrales | `below` |
| tag | objeto \| null | Evento, festivo, temporada del día | datos y eventos configurados | — | `{ holiday: "Día de la Independencia" }` |

## 17. Resumen de periodo (`annual`, `months[]`, `weeks[]`, eventos)

| Campo | Tipo | Descripción | Cálculo | Ejemplo |
|---|---|---|---|---|
| key / firstDate / lastDate | texto | Periodo | — | `2026-09` |
| status | enum | `closed`, `current`, `future` | días vs corte | `current` |
| days / countedDays / missingActualDays | entero | Días del periodo / con real / cerrados sin real | — | `30 / 22 / 0` |
| plan | bloque | Plan del periodo completo | Σ días | `7466255.71` |
| planToDate | bloque | Plan de los días contados | Σ plan contados | `5463153.86` |
| actualToDate | bloque | Real de los días contados | Σ real | `5525185.97` |
| toDate.<métrica> | objeto | Gap y cumplimiento a la fecha | actualToDate vs planToDate | `compliance: 1.011` |
| forecast | bloque | Forecast de cierre del periodo | Σ forecast diario | `7528287.82` |
| forecastGap.<métrica> | objeto | `{ plan, forecast, gap, gapPct, attainment }` | forecast − plan | `gap: 62032.11` |
| pacingStatus | enum | Semáforo del periodo (venta) | `toDate.revenue.compliance` | `above` |
| weekStart / weekEnd / crossesMonths | — | Solo semanas | ISO | `2026-09-21` |

## 18. Performance index (`indices.<ventana>.<métrica>`)

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| window | enum | `ytd`, `month`, `last7`, `last14`, `last28` | `last28` |
| from / to | fecha | Rango (termina en el corte) | `2026-08-26` / `2026-09-22` |
| value | número \| null | Σactual ÷ Σplan (CR y AOV: razón de razones de sumas) | `1.0156` |
| status | enum | `ok` o `insufficient_data` | `ok` |
| comparableDays / windowDays / coverage | número | Días usados / días de la ventana / fracción | `28 / 28 / 1` |
| actual / plan | número | Sumas usadas (métricas aditivas) | `7118092.08` |

## 19. Corrida y versiones

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| run.referenceDate / run.cutoff / run.todayStatus | — | Fecha de referencia, corte y estado del día | `2026-09-22` |
| run.method | objeto | Método aplicado | `{ id: "D", label: "Por drivers" }` |
| run.plan | objeto | Fuente del plan: `original_distributed_plan`, `imported_plan` o `none` | — |
| run.comparison | objeto | Métodos A–D por canal y total | — |
| run.alerts[] | objeto | `{ type, severity (info/attention), channel, metric, message, … }` | `gap_growing` |
| run.events[] | objeto | `{ type, name, start, end, days, byChannel, total, observation }` | Hot Sale |
| version.forecastVersion | texto | `v1`, `v2`, … | `v2` |
| version.generatedAt / referenceDate / cutoff | fecha | Momento de guardado y referencia | `2026-09-10` |
| version.assumptions | objeto | Índices y parámetros usados por canal | — |
| version.results | objeto | Anual y mensual por canal y total | — |
| change.total | objeto | `{ current, previous, change, changePct }` | `change: -710663` |
| accuracy[] | objeto | `{ forecastVersion, evaluatedMonths, mape, bias, accuracy, status, detail }` | — |

## 20. Parámetros del forecast (`forecastSettings`)

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| referenceDate | fecha \| null | null (hoy) | Fecha de referencia |
| todayStatus | enum | `completed` | Día de referencia completo o en curso |
| method | `A`–`D` | `A` | Método en uso |
| recentWindow | ventana | `last28` | Ventana del método C |
| driverWindows | objeto | volumen `last28`, CR `ytd`, AOV `ytd` | Ventanas del método D |
| minComparableDays / minWindowCoverage | número | 5 / 0.7 | Suficiencia de un índice |
| useHistoricalAsActual | booleano | true | Completar el real con histórico del mismo año |
| pacingThresholds | objeto | aboveFrom 1.01, onPlanFrom 0.99 | Semáforo |
| alerts | objeto | streakDays 5, recentVsCumulative 0.05, forecastGapPct 0.03 | Umbrales de alertas |


---

# Fase 4 — Reforecast

## 21. Día del reforecast (`rf.channels.<canal>.days[]`, igual en `rf.total.days[]`)

| Campo | Tipo | Descripción | Origen | Cálculo | Ejemplo |
|---|---|---|---|---|---|
| kind | enum | `actual` (congelado), `required`, `plan` (fuera del horizonte), `missing_actual` | motor | — | `required` |
| closed / counted | booleano | Igual que Fase 3 | pacing | — | `false` |
| plan / actual / forecast | bloque | Estados de Fase 2 y 3 (solo lectura) | plan, store, forecast | — | — |
| partialActual | bloque \| null | Real parcial del día en curso | actualData | no se descuenta | — |
| weight | objeto | `{ weight, source, confidence }` del día | futureWeights | venta del plan original | `{ weight: 244092.14 }` |
| normalizedWeight | fracción \| null | Peso sobre los días futuros del horizonte | motor | peso ÷ Σ pesos futuros | `0.0090` |
| required | bloque \| null | Venta, pedidos, volumen, CR y AOV requeridos | motor | pendiente × peso; ÷ AOV; ÷ CR | `{ revenue: 224925.19 }` |
| assumption | objeto | AOV y CR usados | plan, forecast o real YTD | `assumptionSource` | `{ aov: 917.64 }` |
| reforecast | bloque \| null | Actual (congelado), requerido o plan | motor | según `kind` | — |
| delta.<métrica> | objeto | `{ required, plan, delta, pressure }` | motor | requerido − plan; requerido ÷ plan − 1 | `pressure: -0.0785` |

## 22. Horizonte (`rf.channels.<canal>.horizon`)

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| type / key | texto | `year` + `2026` o `month` + `2026-09` | `year` |
| target | número | Meta del periodo (Σ plan original) | `98000000` |
| actualToDate | número | Real de los días contados | `70811819.49` |
| remaining | número | max(0, meta − actual) | `27188180.51` |
| surplus | número | max(0, actual − meta) | `0` |
| met | booleano | La meta ya se alcanzó | `false` |
| countedDays / futureDays / missingActualDays | entero | Días congelados / con requerimiento / pasados sin real | `265 / 100 / 0` |
| weightMethod / usedFallback | texto / booleano | `future_weighted_distribution`, `uniform_future_distribution`, `no_future_days` | — |
| requiredTotal | número | Σ requerido | `27188180.51` |
| closes | booleano \| null | actual + requerido = meta al centavo | `true` |

## 23. Resumen de periodo del reforecast (`annual`, `months[]`, `weeks[]`, `horizonSummary`)

| Campo | Tipo | Descripción | Cálculo |
|---|---|---|---|
| plan / planToDate / actualToDate / forecast | bloque | De Fase 3 | — |
| reforecast | bloque | Σ reforecast diario | real + requerido + plan fuera del horizonte |
| reforecastMissingDays | entero | Días sin valor (pasados sin real) | — |
| openDays | entero | Días con requerimiento | — |
| required / planOpen | bloque | Requerido y plan original de esos días | Σ |
| recoveryGap | número | requerido − plan de esos días (venta) | — |
| pressure.<métrica> | objeto | `{ required, plan, delta, pressure }` | requerido ÷ plan − 1 |
| targetRemaining | objeto | `{ target, actual, remaining, surplus, met }` del periodo | max(0, plan − actual) |
| surplusVsPlanToDate | número | Adelanto contra el plan a la fecha | max(0, actual − plan a la fecha) |

## 24. Requerimiento por driver (`drivers`)

| Campo | Descripción | Ejemplo |
|---|---|---|
| chain.revenue / aov / orders / conversionRate / trafficVolume | Cadena venta → pedidos → volumen | `orders = revenue ÷ aov` |
| assumptionSource | `plan`, `forecast` o `actual_ytd` | `plan` |
| scenarios.A/B/C | `{ label, holds, required, base, delta, deltaPct, kind }` | B: CR requerido 0.99 % vs 1.10 % |
| sensitivity | Venta, pedidos y volumen adicionales sobre el forecast | `additionalRevenue` |
| historical | Mismos días en años anteriores: `years, days, coverage, conversionRate, aov, trafficPerYear` | `years: [2024, 2025]` |

## 25. Versión del reforecast

| Campo | Descripción | Ejemplo |
|---|---|---|
| reforecastVersion / id | Versión y llave | `rf_v3` |
| generatedAt / referenceDate / cutoff / todayStatus | Momento y fecha del cálculo | `2026-09-22` |
| simulated | Guardado desde una simulación | `false` |
| horizon / method / assumptionSource | Parámetros del cálculo | `year`, `future_weighted_distribution` |
| planVersion / forecastVersion | Plan y forecast usados | `distributed-plan-2026-original` |
| results | Horizonte, periodo del horizonte, anual y meses por canal y total | — |

## 26. Parámetros del reforecast (`reforecastSettings`)

| Campo | Default | Descripción |
|---|---|---|
| horizon | `year` | `year` o `month` |
| assumptionSource | `plan` | Fuente de AOV y CR |
| zeroWeightFloor | 0 | Mínimo para días con peso 0 (múltiplo del peso promedio) |
| fallback | `uniform_future_distribution` | Reparto sin pesos |
| actualDaysThresholds / futureDaysThresholds | 90/28/1 y 28/7/1 | Umbrales de confianza |


---

# Fase 5 — Diagnóstico

## 27. Segmentos (tipo de dato `segments`, opcional)

| Campo | Encabezados | Tipo | Obligatorio | Descripción | Ejemplo |
|---|---|---|---|---|---|
| date, channel | fecha, canal | — | Sí | Igual que en actual | `2026-09-21`, `ecommerce` |
| dimension | dimension, dimensiones, eje | texto | Sí | Eje del desglose, normalizado por alias | `device` |
| segment | segmento, segment | texto | Sí | Valor dentro de la dimensión | `Mobile` |
| revenue, orders, trafficVolume | venta, pedidos, traffic_volume | número | No | Métricas del segmento | `343727` |
| customers | clientes | número | No | Clientes | `5210` |
| newCustomers / returningCustomers | clientes_nuevos / clientes_recurrentes | número | No | Clientes por tipo | `1830` |
| items | items, articulos, piezas | número | No | Artículos vendidos (items por pedido = items ÷ pedidos) | `9120` |

Llave: fecha + canal + tipo + dimensión + segmento. Las métricas extra también se aceptan en histórico y actual.

## 28. Diagnóstico (`runDiagnostic`)

| Campo | Descripción | Ejemplo |
|---|---|---|
| comparison | `actual_vs_plan`, `forecast_vs_plan`, `actual_vs_previous`, `actual_vs_yoy`, `reforecast_vs_forecast` | `actual_vs_plan` |
| period | `{ type: month|week|year, key }` | `{ type: "month", key: "2026-09" }` |
| result | Hecho: current, baseline y frase | "Venta actual $5,525,186 vs $5,463,154 plan (+1.1 %)" |
| gap | `{ abs, pct }` por métrica | `revenue.abs: 62032` |
| level1Drivers[] | `{ driver, baseline, current, deltaPct, contribution, share, kind: negative|positive_offset, main }` | volumen +$83,917 |
| level2[] | `{ dimension, source: core|segments, reference, groups[] }` | device |
| level2 group | `{ dimension, value, metric, current, baseline, delta, deltaPct, contribution, exposure }` | Mobile, CR |
| signals[] | `{ id, kind, metric, dimension, value, current, baseline, delta, deltaPct, direction, relevance, evidence }` | s24 |
| relevance | `{ impact, exposure, confidence, score, priority: high|medium|low }` | `priority: high` |
| hypotheses[] | `{ id, hypothesis, priority, evidence, mechanism, validationNeeded, relatedSignals, status, source }` | `requires_investigation` |
| recovery | Volumen, CR y AOV requeridos (reforecast vs forecast) | — |
| confidence | `{ level, components[] }` de datos | `sufficient` |
| availability | Dimensiones disponibles y no disponibles | — |
| validation | Σ contribuciones = brecha | `closes: true` |

## 29. Ajustes del diagnóstico (`diagnosticSettings`)

| Campo | Default | Descripción |
|---|---|---|
| comparison | `actual_vs_plan` | Comparación |
| periodType / periodKey | mes en curso | Periodo |
| channel | `total` | Canal |
| metric | `revenue` | Venta o pedidos |
| method | `sequential` | `sequential` o `shapley` |
| model | `command-a-03-2025` | Modelo de Cohere |
| rememberKey | false | Guardar la API key en este navegador (`cohereApiKey`); nunca se exporta |


---

# Fase 6 — Escenarios y plan de acción

## 30. Escenario (`scenarios:<año>`)

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| scenarioId / family / version / supersedes | texto / entero | Identidad y versión; editar crea versión nueva | `SC_001_v2`, supersedes `SC_001_v1` |
| name / type | texto / enum | Nombre y tipo (`base`, `conservative`, `moderate`, `aggressive`, `custom`) | `CR mobile recurrente` |
| createdAt / algorithmVersion | — | Fecha y versión del motor | `recovery-v1` |
| context | objeto | Fuente (`app`, `analysis_import`, `reforecast_import`), canal, periodo, applyTo, referencia, método de forecast, plan | — |
| target | objeto | `{ type: channel }` o `{ type: segment, dimension, segment, segmentLabel }` | device: Mobile |
| inputs | objeto | `trafficPct`, `crMode` (pp/pct), `crValue`, `aovMode` (pct/abs), `aovValue` (fracciones) | `crMode: pp, crValue: 0.0015` |
| links | objeto | `hypothesisId`, `hypothesis`, `signalIds`, `driver` (el que mueve el escenario), `hypothesisDriver` | `h1` |
| outputs | objeto | plan, base, scenario, incremental, editable, gap, digital, exposure | — |
| expectedImpact | objeto | Impacto simulado (ver §31) | — |
| assumptions / warnings | lista | Supuestos y restricciones excedidas | — |
| days | objeto | Por canal: `[fecha, venta base, pedidos base, volumen base, venta esc., pedidos esc., volumen esc.]` | — |

## 31. Impacto esperado (simulado)

| Campo | Descripción | Cálculo |
|---|---|---|
| kind | Siempre `simulated` | — |
| metric / baseline / scenarioValue / incrementalValue | Métrica principal (venta) | escenario − base |
| gapBefore / gapAfter | Falta para el plan antes y después | plan − base; gapBefore − incremental |
| recoveryPercent / remainingPercent | Parte del gap recuperada / restante | incremental ÷ gapBefore |
| digitalIncremental | Efecto en el total digital | Σ canales |
| byMetric | Venta, pedidos, volumen, CR y AOV: base, escenario, incremento | — |
| assumptions | Supuestos del escenario | — |

## 32. Opción de recuperación (`recoveryOptions.alternatives[]`)

| Campo | Descripción | Ejemplo |
|---|---|---|
| id / label / drivers | A–G y drivers que cambia | `B · Solo CR` |
| changes | Cambios que se llevan al simulador | `crMode: pp, crValue: 0.0015` |
| display | Volumen %, CR en pp y relativo (de → a), AOV % | CR +0.15 pp (de 1.09 % a 1.24 %) |
| feasible / errors / exceedsConstraints | Posible, errores, restricciones excedidas | — |
| simulated | Incremento, recovery y gap restante re-simulados | recovery 50 % |

## 33. Acción (`actionPlan:<año>.actions[]`)

| Campo | Descripción |
|---|---|
| actionId | `ACT_001` |
| title / description / catalogId / source | Del catálogo, propia o propuesta por IA (`cohere`) |
| hypothesisId / hypothesis / scenarioId / signalIds / driver | Cadena de evidencia |
| channel / period | Alcance |
| owner / startDate / endDate / notes | Ejecución |
| status | `proposed`, `approved`, `in_progress`, `completed`, `measuring`, `validated`, `rejected`, `cancelled` |
| priority | Factores descriptivos: `simulatedImpact`, `exposure`, `urgency`, `evidence`, `constraints` |
| expectedImpact | Copia del impacto simulado del escenario |
| measurement | `{ metric, windowDays }` |
| history[] | `{ at, field, from, to, note }` (append-only) |

## 34. Medición (`actionPlan:<año>.measurements[]`)

| Campo | Descripción |
|---|---|
| measurementId / actionId / scenarioId / measurementDate | Identidad |
| window / observedDays / windowDays | Ventana y días con real |
| baseline / scenario / actual | Bloques de los mismos días |
| byMetric.<métrica> | `baseline, scenario, observed, deltaVsBaseline, deltaVsScenario, expectedDelta, realization` |
| observedImpact | `{ kind: observed, metric, value }` |
| consistency / statement | `consistent`, `partial`, `not_consistent`, `insufficient_data` y su frase |
| factors[] | Factores que pueden afectar la comparación |

## 35. Catálogo de acciones

| Campo | Descripción |
|---|---|
| actionId / name / description | Identidad |
| driver | `trafficVolume`, `conversionRate` o `aov` |
| applicableChannels / applicableSignals / requiredData | Dónde aplica y qué datos necesita |
| ownerArea / measurementMetric / defaultWindowDays | Responsable sugerido, métrica y ventana |

## 36. Ajustes del Recovery Center (`recoverySettings`)

| Campo | Default | Descripción |
|---|---|---|
| channel / periodType / periodKey / start / end | total, mes en curso | Contexto |
| applyTo | `future` | Días no cerrados o todo el periodo (retrospectivo) |
| comparison | `forecast_vs_plan` | Diagnóstico de origen |
| targetPct | 0.5 | Objetivo del cálculo inverso |
| constraints | todas null | `maxTrafficIncrease` (%), `maxCRIncrease` (pp), `maxAOVIncrease` (%), `budget`, `operationalCapacity`, `inventoryConstraint`, `dateConstraint` |


---

# Fase 7 — Capa de experiencia (sin datos de negocio nuevos)

## 37. Ajustes de experiencia (`uxSettings`, solo local, no se exporta)

| Campo | Tipo | Descripción | Ejemplo |
|---|---|---|---|
| mode | `exec` \| `analyst` | Nivel de detalle visual | `analyst` |
| ctx | objeto | Contexto compartido `{ channel, periodType, periodKey, comparison }` | Ecommerce · 2026-09 · actual_vs_plan |
| visited | objeto | Vistas visitadas (alimenta el siguiente paso) | `{ pacing: true }` |
| lastByGroup | objeto | Última vista de cada grupo | `{ recuperar: 'recovery' }` |
| tour | objeto | `{ active, step }` del recorrido | `{ active: false, step: 4 }` |
| home | objeto | Canal y periodo del Inicio | `{ channel: 'total', periodType: 'year' }` |

## 38. Estado para el motor de contexto (`collectStatus`)

| Campo | Descripción |
|---|---|
| data | Registros por tipo, estado y texto de calidad |
| targets / plan / actual | Meta definida, plan original o importado, días con real |
| forecast | Disponible, cumplimiento, gap a la fecha y gap forecast (copiados de la corrida de Fase 3) |
| reforecast | Disponible y presión (copiada de Fase 4) |
| diagnostic | Visitado e hipótesis disponibles |
| scenarios / actions / measurements | Conteos (con hipótesis, abiertas, sin medición) |
| visited | Vistas visitadas |

## 39. Salidas

| Función | Salida |
|---|---|
| getNextStep | `{ id, text, label, reason, view, priority }` |
| describe | `{ whereAmI, whatAmISeeing, whatDoesItMean, whatShouldIInvestigate, nextStep, availableActions }` |
| entrada de ayuda | `{ id, title, shortDescription, detailedDescription, howToRead, formula, interpretation, caveats, nextStep, state }` |

---

# Fase 8.1 — Productos

## 37. Archivos de producto (oficiales desde el 25-09-2026, Fase 8.1.1)

Dos archivos porque la vista de ficha ocurre antes de elegir sucursal, estado o tipo de entrega.

### 37a. Productos · venta

**Encabezados oficiales** (en este orden; plantilla "Plantilla venta" en Carga de datos):
`fecha, canal, sku, codigo_producto, producto, marca, categoria, subcategoria, presentacion, estado, sucursal, tipo_entrega, venta, pedidos, unidades`

Un renglón por fecha + canal + SKU + estado + sucursal + tipo de entrega. Reglas:
- `fecha` AAAA-MM-DD; `canal`: ecommerce, app, whatsapp, llamadas.
- `estado`: uno de los 32 estados de la República (catálogo fijo; acepta CDMX, Edo. Méx., abreviaturas comunes).
- `sucursal`: siempre el mismo identificador; obligatoria en todo pedido, incluido envío a domicilio (es la sucursal
  que surte el pedido, no la dirección del cliente).
- `tipo_entrega`: `domicilio` o `recoleccion` (acepta variantes: "envío a domicilio", "pickup", "recoger en tienda"…).
- `venta`: mismo criterio que el archivo Actual (IVA, descuentos, cancelaciones, devoluciones).
- `pedidos`: pedidos distintos que incluyeron el SKU en esa sucursal y tipo de entrega.
- `unidades`: piezas vendidas.
- Sin filas de totales ni subtotales. UTF-8, separador coma, números sin separador de miles.

### 37b. Productos · funnel (GA4, métricas por artículo)

**Encabezados oficiales** (plantilla "Plantilla funnel"):
`fecha, canal, sku, vistas_ficha, agregados_carrito, inicio_checkout, compras_ga4`

Un renglón por fecha + canal + SKU. **Sin estado, sucursal ni tipo de entrega**: el funnel ocurre antes de elegirlos.
- `vistas_ficha` = GA4 `item_views` / `view_item`; `agregados_carrito` = `add_to_cart`; `inicio_checkout` =
  `begin_checkout`; `compras_ga4` = `purchase`, todas a nivel artículo (misma unidad, no sesiones ni usuarios).
- Vacío en canales sin ficha web (WhatsApp, Llamadas): el CR y el funnel quedan no disponibles ahí.
- Incluir el SKU con 0 en una columna si GA4 lo registró en 0; una celda vacía significa "sin dato", no cero.
- `compras_ga4` es para cerrar el funnel y medir cobertura de tracking, no para calcular venta: la venta real sigue
  viniendo del archivo de venta.

Campos canónicos y encabezados aceptados:

## 38. Bloques día × canal (`productDays` venta, `productFunnel` funnel; esquema v2)

Ambos comparten la misma forma base; venta agrega tres columnas de dimensión.

| Campo | Tipo | En | Descripción |
|---|---|---|---|
| schema | entero | ambos | `2` (esquema de Fase 8.1.1; `1` eran los bloques de Fase 8.1, migrados automáticamente) |
| kind | texto | ambos | `sales` o `funnel` |
| date, channel | texto | ambos | Llave del bloque |
| n | entero | ambos | Renglones en el bloque |
| skuIdx | Uint32Array | ambos | Índice del SKU en el catálogo |
| stateIdx, branchIdx, deliveryIdx | Uint8/Uint16/Uint8Array | solo venta | Índices a `FP.productStore.dims` (0 = "(sin dato)") |
| revenue, orders, units | Float64Array | venta | Valor observado; NaN si faltante o inválido |
| views, addToCart, beginCheckout, purchasesGa4 | Float64Array | funnel | Valor observado; NaN si faltante o inválido |
| state | Uint8Array (n × 3 en venta, n × 4 en funnel) | ambos | 0 observado, 1 faltante, 2 inválido, por métrica |
| flags | Uint8Array | ambos | bit 1 conflicto, bit 2 suma por multiplicidad |
| row | Uint32Array | ambos | Fila del archivo de origen |
| src / batches | Uint16Array / texto[] | ambos | Archivo (lote) de origen de cada renglón |

## 39. Resumen (`productRollups`)

`{ date, channel, level (category|subcategory|state|branch|delivery), key, revenue, orders, units, obs[3], missing[3],
invalid[3], cells, views, addToCart, beginCheckout, purchasesGa4, fobs[4], fmissing[4], finvalid[4], funnelCells,
funnelJoinable, crOrders, crViews, aovRevenue, aovOrders, cartNum/Den, chkNum/Den, buyNum/Den, trkGa4, trkUnits,
impliedZero, conflicts, skus[] }` — sumas solo de celdas observadas; `funnelJoinable` es `false` cuando `level` es
`state`, `branch` o `delivery` (el funnel no se cruza con esas dimensiones).

## 40. Resultado del análisis (fila)

| Campo | Descripción | Cálculo |
|---|---|---|
| key, level | Grupo y nivel | — |
| revenue.current / baseline / delta / deltaPct | Venta y variación | observada |
| share | Participación | venta del grupo ÷ total actual |
| baselineShare | Participación en la referencia | — |
| contribution | Contribución | Δ grupo ÷ Δ total (null si Δ total = 0) |
| contributionAbs | Aporte absoluto | Δ grupo |
| status | growth, decline, stable, new, lost | umbral 3 % |
| current / baseline | Métricas con `{ value, status, source, coverage }` | CR y AOV calculados |
| drivers | Δ de venta, pedidos, unidades, vistas, CR y AOV | — |
| signals | Patrones A–D con evidencia | descriptivos |

## 41. Estado de migración (`storageMigration`, localStorage)

`{ schema, status, attempts, startedAt, finishedAt, keys[{ key, action, source, target, verified }], error, localStorageKept }`
