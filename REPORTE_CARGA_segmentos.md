# Reporte — Carga de Segmentos que no pierde filas ni falla en silencio

## Qué reportó el usuario
Las cargas de archivos pesados (Segmentos / GA4) «se registran pero quedan en cero registros»; con Productos nunca falla.

## Qué se encontró (reproducido)
Con un export de GA4 sintético de 90 MB / 300,000 líneas con los problemas que sí trae un export real (compras mayores que sesiones por atribución de GA4, ingresos sin compras, sesiones en 0, «(not set)»):
- **Antes:** entraban 370,838 de 474,729 filas; **103,891 quedaban fuera** (22 %). En una muestra de 40 mil líneas, 32,212 de 117,168 filas se rechazaban, todas por una sola regla: pedidos mayores que el volumen (o volumen 0, o venta con 0 pedidos) estaba definida como **error** y rechazaba la fila completa, perdiendo también sus sesiones, compras e ingresos reales. Con otro export (más compras que sesiones por segmento) la proporción puede ser mucho mayor, hasta dejar el archivo con cero filas.
- **Productos no tiene esa regla:** acepta las filas y aparta solo los valores inválidos. Por eso nunca le falla.
- No se pudo reproducir un fallo de guardado (IndexedDB) con datos sintéticos en Chromium: el archivo se guardaba y se recuperaba al recargar. Si el problema del usuario es de guardado (cuota, navegador privado, otro navegador), ahora se vería (ver abajo).

## Cambios
- `quality/validation.js`: en **Segmentos**, las inconsistencias pedidos/volumen/venta pasan de error a **advertencia** (GA4 atribuye compras al día del evento y sesiones al día de inicio; son datos reales y suman bien). En Venta real, Histórico y Plan por canal siguen siendo error.
- `ui/import-view.js`: la revisión explica **por qué** quedan filas fuera (conteo por motivo y un ejemplo) y, si **ninguna** entra, lo muestra como alerta («Ninguna fila se importaría»).
- `app.js` / `ui/ui.js` / `index.html`: el guardado por bloques se **verifica leyendo de vuelta desde IndexedDB** (índice y último bloque, esperando a que termine la cola de escritura); «guardados y verificados» solo aparece si es cierto. Si la escritura o la verificación fallan queda un **banner rojo persistente** (visible en cualquier sección) hasta que un guardado funcione.

## Medición (mismo archivo de 90 MB, flujo real de pantalla)
Antes: 370,838 registros, 103,891 fuera. Ahora: **474,729 registros, 0 fuera**; guardados y recuperados al recargar (474,729); sin errores. Hasta la revisión 17 s con la página sin congelarse (máx. 138 ms); confirmar 12 s; memoria 411 MB.

## Pruebas
`batch_ad.py` (nuevo, 13 comprobaciones; falla en la versión anterior): con el flujo normal y con el Worker entran todas las filas inconsistentes y las sumas guardadas (sesiones, compras, ingresos) coinciden con las del archivo calculadas aparte; en Venta real las mismas filas siguen rechazándose; la revisión explica rechazos totales y parciales; guardado verificado, banner si falla la escritura, si falla la verificación, persiste al cambiar de sección y se quita al recuperarse. Además: motor 206/206, lint, contraste, batería del mismo día (7 exports idénticos, sin errores de consola) y todos los lotes anteriores (Worker `batch_ac` 23/23, importación grande, guardado incremental, fases A y B, GA4, Segmentos, Tráfico y conversión, calidad, periodo y canal, clasificación, Inicio, menú, modos, accesibilidad por lotes y renombre).

## Honestidad sobre la causa
La regla de rechazo es una causa **demostrada** de filas perdidas y es compatible con «cero registros». No pude confirmar que sea la causa exacta del archivo del usuario: no tengo su archivo. Si vuelve a pasar, ahora la pantalla dice el motivo y, si fuera de guardado, el banner lo dice.

## No hecho
Almacén en columnas en IndexedDB (con partición como Productos): no es necesario para este fallo; sigue disponible como siguiente paso si la memoria es el límite. El Worker no cubre Excel, Productos ni Cohere en archivos grandes. No se probó con el archivo real del usuario, otros navegadores ni su tamaño exacto de 100 MB.
