# Reporte — Fase I · UX de fuentes de datos, cuarentena, salud y sincronización

## Qué se encontró (inspección)
- **Ya existía** (fases A, B y H): Salud de los datos, panel de Cuarentena, Registro de importaciones (auditoría de cada carga) y explicación de por qué falta una dimensión.
- **Faltaba:** una pantalla de **Fuentes de datos**, el **estado de sincronización / frescura** de los datos, y —pedido por el usuario— que la **cuarentena y la salud de Productos tengan el resumen arriba y el consolidado línea por línea abajo** (son muchas líneas).

## Qué se hizo
- **Fuentes de datos** (Configuración, `js/quality/dataSources.js`): catálogo de 6 fuentes. «Archivos CSV y Excel» y «GA4 · export convertido» muestran estado (con datos / sin archivos), última sincronización («hace 3 h»), periodo disponible y calidad. «GA4 · conexión directa» (Fase C), «Google Sheets» (D), «Excel / OneDrive / SharePoint» (E) y «BigQuery» (F) aparecen como **No conectado**, con la fase en que llegan y lo que hace falta de tu lado; no se inventa ninguna conexión. Debajo, una tabla **por tipo de dato** (histórico, plan, venta real, segmentos y los dos de Productos): archivos, registros, periodo, **frescura** (días entre la última fecha con datos y hoy: al día hasta 2; atención de 3 a 7; atrasado más de 7; para venta real y segmentos), última carga, valores en cuarentena y calidad.
- **Cuarentena** (Calidad de datos): arriba el total exacto y un **resumen por sección y por regla** (con archivos afectados y reglas principales); abajo el **consolidado línea por línea** de todas las secciones (incluida Productos) con **filtros** (sección, regla, archivo), **paginación** de 25 líneas y **descarga CSV** que respeta los filtros.
- **Salud**: arriba un **resumen por tipo de dato** (puntaje y lo que más bajó); abajo el detalle por componente que ya existía.
- La columna «Sección» se agregó al final de la tabla de cuarentena para no mover las anteriores.

## Pruebas ejecutadas
- `batch_ak.py` (nuevo, 24; falla en la versión anterior): catálogo y estado de las 6 fuentes, texto de las no disponibles, periodo y última sincronización, frescura calculada aparte (venta real: 3 días de atraso; GA4: 12 días) y su tono, conteos exactos de cuarentena por sección y por regla sumando Venta real y Productos, consolidado de dos páginas, filtros por sección, regla y archivo, CSV, orden de los bloques, desborde de 320 a 1920 px y etiquetas.
- Defectos encontrados y corregidos: la rejilla del resumen de cuarentena ensanchaba la página a 320 y 360 px; y los subtítulos nuevos de Calidad de datos saltaban de nivel de encabezado (h2 → h4), lo que detectó la prueba de alineación y accesibilidad por lotes (ahora h3, y los títulos de las tarjetas de salud pasan a h4).
- Regresión (mismo día): motor 206/206; lint; contraste; batería (7 exports idénticos, sin errores de consola; solo cambian Calidad y Ajustes y sus tablas anteriores siguen intactas); las pruebas de Productos, Fase A, Fase B, GA4, Segmentos, Tráfico y conversión, Fase H, Worker y carga.

## Limitaciones
- «Última sincronización» es la última carga de un archivo: no hay sincronización automática (llegará con los conectores).
- La frescura se calcula para venta real y segmentos; Productos no tiene un periodo guardado a nivel de lote.
- Del consolidado de Productos se listan hasta 25 ejemplos por regla y archivo; el resumen sí trae el conteo exacto.
- Con muchos archivos, «Fuentes de datos» muestra el estado por tipo de dato, no el detalle de cada archivo (ese está en el Registro de importaciones).

## Verificación final (copia congelada)
Accesibilidad: 3,190 controles con foco visible, 0 sin contorno, 0 contraste bajo AA, 0 objetivos táctiles < 44 px. Responsive: 0 hallazgos (16 vistas × 12 anchos). Espaciado: 0 pares < 8 px.
