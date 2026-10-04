# Reporte — Fase A · Data Quality Engine, cuarentena, auditoría y Data Health

Formato de la sección 36 del Prompt 0.

## 1–3 · Inspección y arquitectura encontrada
- Ya existía un catálogo de incidencias (`config.errorTypes` + `quality/validation.js`) con tipo, severidad, fila, campo y valor; `coverage.js` resumía estado y cobertura; cada carga ya era un **lote** con archivo, fecha, filas, mapeo, resumen e incidencias (`data/data-store.js`). Productos ya tenía su propia cuarentena.
- Problema: un negativo o un valor no numérico en Histórico, Plan o Venta real hacía **rechazar la fila entera** (se perdían también sus otras métricas) o, con «importar filas con errores», el negativo **se sumaba**.

## 4–5 · Cambios (mínimos, sobre lo existente)
| Archivo | Cambio |
|---|---|
| `js/quality/rules.js` (nuevo) | Catálogo de reglas: cada tipo de incidencia existente con **acción** (`reject_row`, `quarantine_cell`, `flag`, `reject_file`), si admite excepción y su motivo. `applyQuarantine` (cuarentena por celda) y `quarantineList` (auditoría). |
| `js/quality/health.js` (nuevo) | Data Health 0–100 por archivo con 7 componentes (Estructura, Completitud, Tipos, Consistencia, Temporalidad, Duplicados, Registros válidos); cada uno con puntaje, conteo y «por qué»; el total es el promedio simple. |
| `js/import/import.js` | `process` aplica la cuarentena y la cuenta en el resumen; las filas `quarantined` entran. |
| `js/data/data-store.js` | El lote guarda `quarantined`, `source` (csv, xlsx, ga4-csv) y `durationMs`; el almacenamiento compacto guarda y recupera las celdas en cuarentena (valor original, interpretado y regla). |
| `js/quality/coverage.js` | Cuenta registros en cuarentena; con cuarentena y nada rechazado el estado es «con advertencias», no «no válido». |
| `js/app.js` | Registra tipo de fuente y duración; el aviso de importación dice cuántas filas tienen un valor en cuarentena. |
| `js/ui/quality-view.js`, `index.html`, `css/design-system.css` | Calidad de datos suma **Salud de los datos**, **Cuarentena** (archivo, fila, fecha, canal, campo, valor original, regla y motivo) y **Registro de importaciones** (fuente, recibidas, aceptadas, en cuarentena, rechazadas, columnas usadas, duración). |
| `js/ui/import-view.js`, `js/ui/data-view.js` | Estado de fila «Con un valor en cuarentena» y la celda con su valor original. |
| `js/import/normalize.js` | **Privacidad** (decisión adelantada de la Fase H): a Cohere no viajan ejemplos de columnas que parezcan datos personales (correo, teléfono, RFC, CURP, nombre de cliente, dirección, ID de cliente), por nombre o por contenido. |
| `js/import/xlsx.js` | **Error encontrado y corregido** (ver 12). |

## 13 · Decisiones de arquitectura (con las recomendaciones)
1. **Negativos:** nunca se transforman (ni −500 → 500 ni → 0). Van a cuarentena por celda con valor original, interpretado y regla; la fila entra y sus demás métricas sí se usan; el CR o AOV que dependía de esa celda no se calcula. En datos diarios por canal un total negativo casi siempre es un error; si una fuente trae devoluciones netas, se agregará como **política explícita por fuente** (Fase B), nunca en silencio.
2. **No numéricos:** cuarentena por celda (antes: fila rechazada o valor inválido).
3. **Sin fecha o canal válidos:** la fila se sigue rechazando (no se puede ubicar).
4. **Vacíos:** no son cero ni van a cuarentena: «faltante» con advertencia.
5. **API key de Cohere solo de sesión por defecto:** ya era así («recordar» desactivado); se verificó.
6. **Lector XLSX nativo** (no SheetJS), **capa de vocabulario sin renombrar el modelo** y **`users` no sumable:** registradas para la Fase B; sin cambios de código en esta fase.
7. **Cohere no decide calidad:** todas las reglas son determinísticas.

## 11 · Pruebas realizadas (ejecutadas)
- `batch_w.py` (nuevo, casos de la sección 34 de la Fase A): 1 CSV válido, 2 «;», 3 comillas y separador de miles, 4 XLSX, 5 encabezado desconocido, 6 mapeo con Cohere simulado + privacidad, 7 negativos, 8 no numéricos, 9 vacíos, 10 duplicados, 11 fechas inválidas, 12 periodo incompleto, 15 fuente sin datos, 19 cuarentena (pantalla y persistencia al recargar), 20 dataset totalmente inválido; además catálogo de reglas, Health desglosado, auditoría y estado. **Pasa; falla en la versión anterior.**
- Motor 206/206; lint y contraste; `batch_m` (calidad), `batch_s` (GA4), `batch_r` (Segmentos), `batch_l` (Inicio), `batch_p` (periodo y canal), `batch_t` (descubrimiento): OK.
- Batería del mismo día contra la versión anterior: 7 exports idénticos, sin errores de consola; Calidad suma 3 tablas nuevas y las 2 anteriores siguen idénticas.
- **No ejecutadas en esta fase:** 13 y 14 (comparación con periodo anterior e interanual: Fase B), 16–18 (APIs: fases C a F).

## 12 · Errores encontrados
- **Excel: fechas leídas como número de serie** (p. ej. 46266 → «Fecha inválida»), en la versión anterior también: el lector de Excel ignoraba fechas en celdas marcadas `t="n"` (así escriben openpyxl y otros programas) y contaba los estilos de `cellStyleXfs` junto con los de `cellXfs`, corriendo el índice. Corregido; un Excel de Venta real con fechas ya se importa.
- **Cuarentena que se perdía al recargar:** el almacenamiento compacto no conocía el estado nuevo; lo detectó la prueba del motor «empaquetado ida y vuelta». Corregido y con prueba de recarga.
- `batch_m` leía la primera tabla de Calidad (ahora es la de Salud); se ajustó al contenedor del resumen.

## No verificado
- Con tus archivos reales, en tu navegador y con tu API key real de Cohere (el mapeo se probó con respuesta simulada).
- Tu Excel de GA4 en Segmentos sigue sin convertirse solo (el traductor de GA4 aplica a CSV): pendiente de tu decisión.
- La política de negativos en Productos no se tocó (tu cuarentena de Productos sigue igual); unificarla con este catálogo queda para la Fase B.
- Rendimiento del Health Score con archivos muy grandes (cientos de miles de filas).
