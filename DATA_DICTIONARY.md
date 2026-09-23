# DATA_DICTIONARY.md — Digital Sales Forecast & Pacing

Contrato de datos 1.1.0 (Fase 1). Convención: nombres internos en camelCase; en CSV y JSON exportado, snake_case.
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
