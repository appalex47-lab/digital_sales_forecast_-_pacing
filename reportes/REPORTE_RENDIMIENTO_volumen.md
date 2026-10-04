# Reporte — Rendimiento con volumen (1.29 millones de registros)

## Qué se pidió y cómo se verificó
Se pegó un diagnóstico de lentitud (de otra herramienta) y se pidió ejecutar sus 5 acciones. **Antes de ejecutar se midió**, con 1.29 M de registros sintéticos de Segmentos (`tools/regression/perf_bench.py`, Chromium, mismos objetos que produce la importación). Sus afirmaciones se contrastaron:
| Afirmación | Medido |
|---|---|
| `consolidate` recorre todo | No: ~2 ms (solo usa plan y venta real) |
| `resolveLatest` crea un Map en cada render | Ya había una caché por firma (apareció en la copia de trabajo; no la hice yo en esta tanda) |
| Memoria ~1 GB | Sintético: 0.53 GB; con registros de importación real ~1.05 KB por registro → ~1.35 GB a 1.29 M (estimación) |
| Datos normalizados es el cuello | No: 0.2 s |
| Importar con registros previos es lento | 0.27 s |
| Guardar reescribe todo | Cierto: 5.3 s con la página bloqueada |
Los cuellos reales: Segmentos hacía ~50 pasadas completas por render, la cobertura tardaba 2.6 s, y validar/confirmar un archivo grande congelaba la página.

## Cambios
- `quality/coverage.js`: cobertura en pasadas únicas, reutilizando la lista de vigentes en caché (resultados idénticos).
- `ui/segments-view.js`, `model/availability.js`, `diagnostics/driverEngine.js`: leen del índice dimensión → fecha del almacén (solo los días del rango) y recuerdan resultados por parámetros; caché con tope de 300 entradas.
- `data/data-store.js` + `app.js`: guardado por bloques **incremental** (se reutilizan los bloques llenos; solo se escribe lo nuevo; sellos por bloque; los antiguos se borran). Quitar un lote o limpiar reescribe todo.
- `import/import.js` + `app.js`: `processAsync` (validación por bloques de 5,000 filas que ceden el hilo) con avisos de avance para archivos de más de 40 mil filas; `commitBatch` usa copia directa del registro (antes JSON por registro) y comparte las cadenas repetidas.
- `ui/data-view.js`: guarda solo el último resultado filtrado y precalcula el orden de canal.

## Medición final (1.29 M, ms) — mi entrega anterior → ahora
Ir a Segmentos 2,710 → 320 · segunda visita 2,219 → 24 · cambiar de dimensión 2,628 → 61 · Calidad 2,855 → 250 (segunda visita 2,374 → 20) · cobertura 2,626 → 1,079 · guardar con la página bloqueada 5,290 → 11 (el guardado completo tarda ~6 s en segundo plano).
Importación de 500 mil filas: bloqueo máximo de la validación 7.9 s → 0.79 s (bloques de 20 mil; la configuración final de 5 mil no se midió); confirmar 3.0 → 1.4 s.

## Pruebas ejecutadas
`batch_aa` (guardado incremental: 130 mil registros, 1 bloque de 6 al agregar, sin huérfanos, recarga idéntica, quitar lote) · `batch_ab` (process = processAsync, copia directa = copia JSON, archivo de 45 mil filas desde la pantalla) · `batch_z` (equivalencia anterior/nueva: cobertura, Segmentos y Salud idénticos; **Disponibilidad difiere en 3 de 36 casos solo en el conteo de filas, 181 → 180: la anterior contaba un duplicado dos veces**) · motor 206/206 · almacenamiento 26/26 (nueva y anterior) · batería T1–T10 del mismo día en verde, 7 exports idénticos · lint, contraste, fases A y B, GA4, Segmentos, Tráfico y conversión (partes 1 a 3), calidad con huecos, periodo y canal, clasificación, Inicio, menú, modos, accesibilidad y renombre.
`batch_n` tenía un selector demasiado amplio desde la Fase B (el desplegable «Por qué cada dimensión…» también es un `<details>` dentro del árbol); se corrigió la prueba, no la app.

## No hecho
- Segmentos agregados en IndexedDB (la medición no lo exige hasta ~1.3 M) y Web Worker (se usaron bloques que ceden el hilo; leer el archivo, 0.9 s, y confirmar, 1.4 s, siguen bloqueando).
- La memoria apenas bajó (~2 %).
## No verificado
Con tus archivos y tu navegador (los datos son sintéticos y ordenados por fecha); la configuración final de bloques de 5 mil filas; Firefox, Safari, lectores de pantalla y dispositivo táctil.
