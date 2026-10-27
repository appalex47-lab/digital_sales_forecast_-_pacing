# Producto y evolución · etapa 4d: retiro de las páginas viejas

Con la confirmación del usuario se retiró el código de Categoría → Producto y Evolución y patrones como páginas. `#producto` y `#analisis` siguen siendo alias de **Producto y evolución**.

## Qué se quitó
- `index.html`: las secciones `view-producto` y `view-analisis` y sus contenedores (`pa-*`, `an-content`).
- `app.js`: las ramas de despliegue de las dos vistas, los vaciados de ids duplicados (`clearPe`, `clearOldPages`), los saltos entre páginas (ahora solo existen dentro de la página), la bandera `ctxTouched` y las dos vistas del arreglo `VIEWS`.
- `navigation.js`: el contexto compartido de Evolución como página (`anContext` y su rama de `applyContext`); el de Producto y evolución se conserva.
- `product-view.js`: `render`, `renderStatus`, `renderControls`, `renderResult` (quedan `controlsHtml`, `resultParts`, `statusHtml` y la revisión de carga y el almacenamiento, que usan Carga, Calidad y Configuración).
- `trend-view.js`: `render`, la fila principal de filtros y el selector «Analizar por» (queda `build`, `filters` con los filtros propios, `extras` y `contributionKpis`).

## Qué se conservó (a propósito)
- Las entradas `producto` y `analisis` de `guidanceConfig.js`, marcadas `retired`, para que los módulos que las citan (agentes, atención, ayuda) sigan resolviendo su título; fuera del menú y de la búsqueda.
- Dos textos que solo vivían en la página vieja de Evolución y ahora salen en la nueva: la ayuda de los filtros de resultado y el aviso de periodo en curso o comparación no disponible.

## Verificación
selftest 233/233; motor del embudo 15/15; pruebas de guía y fases 25/26/27/33 y prioridades. Navegador: página nueva 9/9, embudo 11/11, 4b 14/14, 4c y retiro 12/12 (incluye que los contenedores viejos ya no existen y los dos textos recuperados) y una prueba de humo de 17 páginas (inicio, carga, calidad, datos, ajustes, diagnóstico, segmentos, pacing, recovery, promociones, medir, narrativa, ayuda, clientes, cambios y la página nueva) sin errores.
Las pruebas de `tools/regression/*.py` que abren `#producto`, `#analisis` o sus ids internos (`pa-controls`, `an-content`…) quedan desactualizadas y no se pudieron ejecutar en este entorno (falta Playwright para Python): conviene adaptarlas a la página nueva.

## Cómo volver atrás
Cada etapa es un commit propio: revertir este commit devuelve las dos páginas; quitar el alias de `readHash` las vuelve a abrir.
