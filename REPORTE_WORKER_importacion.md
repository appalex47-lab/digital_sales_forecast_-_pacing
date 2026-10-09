# Reporte — Worker de importación para archivos grandes

## Pedido y punto de partida
Archivos de 100 MB y más de 300 mil líneas. Se reprodujo con un export de GA4 **sintético** de 90 MB / 300,000 líneas (landings largas, 150 campañas, 2,500 landings; 337,057 filas de Segmentos tras traducirlo) en Chromium, con el flujo real de pantalla (`tools/regression/perf_ga4_file.py`).

Antes (flujo en la página): leer 0.26 s · **traducir 7.0 s** · **volver a leer el CSV de 66 MB que la app acababa de generar 4.7 s** · validar 6.7 s → **19.5 s hasta la revisión, con la página congelada hasta 11.9 s seguidos** y 405 MB de memoria en revisión.

## Qué se hizo
- **`js/workers/import-worker.js` (nuevo):** lee el archivo, detecta y traduce GA4, parsea, valida por bloques y conserva las filas en su propia memoria. Usa los mismos módulos que la página (config, calendario, métricas, CSV, normalización, validación, importador, traductor de GA4 y reglas de calidad). La página recibe solo resumen, mapeo, 50 filas de muestra, las primeras 2,000 incidencias (el total exacto viaja aparte) y la cuenta de filas que entrarán con y sin «importar filas con errores».
- **`js/import/workerClient.js` (nuevo):** arranque con respaldo (si el navegador no crea Workers, se usa el flujo normal), llamadas con avance y lista compacta de lo ya guardado para detectar duplicados. Umbral: 4 MB (`FP.importWorker.setMinBytes`).
- **`ga4Segments.translateRows`:** entrega las filas sin generar ni releer el CSV; `translate()` sigue entregando el CSV con el mismo resultado. Núcleo común `translateCore`; corte de líneas sin comillas con `split`, textos normalizados recordados y ordenamiento con un solo `Intl.Collator`.
- **`app.js`:** ruta del Worker (`stageViaWorker`, `reprocessRemote`, `commitRemote`, `finishCommit` compartido); recalcula en el Worker al cambiar mapeo, tipo, formato de fecha, opciones o equivalencias; descartar o importar libera su memoria; «Cargar como» funciona entre Histórico, Plan, Venta real y Segmentos.
- **`data-store.commitRemote`:** el lote queda con los mismos campos que el de la página; los registros que llegan del Worker comparten sus cadenas repetidas.
- **Pantalla de carga:** tarjeta con fase y porcentaje («la página sigue respondiendo»); botón «Importar» deshabilitado mientras se recalcula.

## Medición final (mismo archivo)
| | Antes | Con Worker |
|---|---|---|
| Hasta la revisión | 19.5 s | **11.0 s** |
| Bloqueo máximo de la página hasta la revisión | 11,864 ms | **33 ms** |
| Memoria de la página en revisión | 405 MB | **9 MB** (50 filas de 337,057) |
| Confirmar | 1.7 s | 6.9 s |
| Bloqueo máximo al confirmar | 1,284 ms | 585 ms |
| Memoria tras importar | 320 MB | 256 MB |
| Abrir Segmentos / recargar la página | 0.1 s / 3.8 s | 0.2 s / 3.5 s |
Confirmar tarda más porque los registros cruzan del Worker a la página por bloques (84 de 4,000); a cambio la página no se congela.

## Pruebas ejecutadas
- `batch_ac.py` (nuevo, 23 comprobaciones): el MISMO archivo con el flujo normal y con el Worker, comparando campo a campo la pantalla de revisión, la vista previa, los registros guardados (mismo orden y contenido), el lote (conteos, resumen, problemas, mapeo) y el aviso. Casos: GA4 traducido, Segmentos propios con negativos y no numéricos, venta real con todos los problemas, quitar y devolver la asignación de «Venta», opción de filas con errores, duplicados contra lo ya guardado, «Cargar como», descartar e importar liberan el Worker (1 → 0 → 0), sin API de Workers (respaldo) y archivo chico sin Worker.
- Motor 206/206; lint; contraste; almacenamiento 26/26; fases A y B; GA4; Segmentos; Tráfico y conversión (partes 1 a 3); calidad con huecos; periodo y canal; clasificación; Inicio; menú, modos, accesibilidad por lotes y renombre. Batería del mismo día contra la última entrega: 7 exports idénticos, sin errores de consola; solo cambia Calidad (ver abajo).

Además, sobre la versión final: accesibilidad (3,139 controles con foco visible, 0 sin contorno; 0 combinaciones de contraste bajo AA; 0 objetivos táctiles < 44 px), responsive (0 hallazgos, 16 vistas × 12 anchos) y espaciado (0 pares < 8 px); la tarjeta de avance se revisó a ojo a 390 px.

## Procedencia: lo que no hice yo
La copia de trabajo traía una **pasada de diseño** (`REPORTE_PASADA_DE_DISENO.md`: salud 100 solo sin incidencias, tarjetas compactas, Cobertura abre en la primera colección con datos, «En cuarentena» en lugar de «Error», plurales, navegación en Tráfico y conversión, etc.) y cambios en `batch_w.py` y `batch_x.py` (plurales). No la hice en esta tanda. La revisé corriendo su prueba (renombrada `batch_ae.py` porque chocaba con el nombre de la del Worker: 15 comprobaciones, OK) y las de las fases A y B. En la batería, Calidad cambia de forma esperada (tablas y textos nuevos).

## No hecho
- **Almacén en columnas en IndexedDB:** no se hizo. Con 337 mil filas la memoria ya es 256 MB; el diseño (arreglos tipados, bloques de IndexedDB, migración del formato actual) es el siguiente paso si la memoria vuelve a ser el límite (~1.3 M de filas).
- El Worker no cubre Excel (.xlsx), Productos ni el mapeo con Cohere en archivos grandes (queda el mapeo estático).
- Un archivo procesado en el Worker no se puede mover a Categoría → Producto con «Cargar como».
## No verificado
Con tu archivo real (el de prueba es sintético); archivos de 100 MB exactos; otros navegadores; el límite de memoria del Worker.
