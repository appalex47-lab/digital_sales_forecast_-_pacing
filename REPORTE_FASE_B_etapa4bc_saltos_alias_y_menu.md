# Producto y evolución · etapas 4b y 4c: lo que se perdía, alias y menú

## 4b · Lo que se perdería al retirar las páginas viejas (ahora está en la página nueva)
- **Ir a…** (ruta): buscador de categoría, subcategoría, producto o SKU que abre la ruta completa de un salto (`FP.productFilter.gotoOptions`, acción `pa-goto`). Un texto que no es opción no cambia nada.
- **Ver evolución por** (capítulo 4): por defecto igual que la tabla; permite analizar la evolución por otro nivel (por ejemplo SKU) mientras la tabla sigue por categoría (`pa.evoLevel`, acción `pe-evolevel`).
- **Datos que alimentan esta página** y **Exportar análisis (JSON)** (capítulo 6), más el CSV de la contribución.
- **Saltos dentro de la página:** «Evolución» y «Embudo» en cada fila abren su lectura y bajan al capítulo (`pe-focus`); «Ver embudo y señales» baja al capítulo 5 y «Ver trazabilidad completa» abre la trazabilidad en el capítulo 6 sin cambiar la ruta.

## 4c · Alias, franja y menú
- `#producto` y `#analisis` abren **Producto y evolución** en el capítulo equivalente (¿Quién lo mueve? y ¿Desde cuándo?), conservando canal, periodo, comparación y ruta. Los enlaces de otros módulos (Diagnóstico, Inicio, asistentes, atención, paquete) siguen funcionando sin editarlos.
- Franja «¿Por qué?»: tres formas (Brecha y drivers, Producto y evolución, Tráfico y conversión).
- Menú Diagnosticar: ¿Por qué? Diagnóstico, Producto y evolución, Tráfico y conversión, Clientes y LTV. Las dos vistas viejas quedan marcadas `retired` (fuera del menú y de la búsqueda).

## Verificación
selftest 233/233; motor del embudo 15/15; pruebas de contexto, guía y fases 25/26/27/33. Navegador: 4b 14/14 (Ir a…, nivel de la evolución, datos y exportación con descarga, saltos), 4c 9/9 (alias con su capítulo, canal por el alias, franja, menú, búsqueda, enlace data-nav), embudo 11/11 y página nueva 9/9.
`tools/regression/batch_why4.py` se actualizó a tres formas pero no se pudo ejecutar (falta Playwright para Python); otras pruebas de esa carpeta que abren `#producto` o `#analisis` pasan ahora por el alias y conviene revisarlas.

## Pendiente (4d, solo con confirmación)
Retirar el código de las páginas viejas: `view-producto` y `view-analisis` en `index.html`, `renderStatus`/`renderControls`/`renderResult` y `trendView.render` como páginas independientes, las ramas de `app.js` y los saltos entre páginas ya sin uso.
