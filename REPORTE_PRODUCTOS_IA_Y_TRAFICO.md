# Reporte — Cuarentena de Productos unificada, IA en archivos grandes y rediseño de «Tráfico y conversión»

## 1 · Cuarentena de Productos unificada con el catálogo de la Fase A
Productos ya apartaba los valores negativos o no numéricos de cada celda (no suman; se guardan como inválidos, no como 0) y los registraba como incidencias de su lote (`NEGATIVE_<MÉTRICA>`, `INVALID_<MÉTRICA>`), pero esos casos no aparecían en Calidad de datos.
- `quality/rules.js`: lee esas incidencias (`slimProductBatch`, `productQuarantineList`, `productQuarantineTotals`); el **conteo por regla es exacto** y se listan hasta 25 ejemplos por regla y archivo (tope de Productos) con archivo, fila, campo y valor original. La misma regla se llama igual en todas las secciones («Venta negativa»); las que no existían en el catálogo usan «Métrica: valor negativo / no numérico».
- `quality/health.js`: `products()` calcula la salud de «Productos · venta» y «Productos · embudo» con componentes Estructura, Tipos, Duplicados y Registros válidos desde lo que ya guarda cada lote (no recorre filas); nunca marca 100 si algo bajó puntos.
- `ui/quality-view.js`: Cuarentena, Registro de importaciones y Salud incluyen Productos; `app.js` mantiene una instantánea ligera (`refreshProductQuality`) al iniciar, guardar y quitar archivos de Productos.
- **Las cifras de Productos no cambian:** la política ya era excluir y no se tocó ningún cálculo (comparación de snapshots de Producto contra la entrega anterior: ver «Pruebas»).
- Pendiente de decisión futura: la excepción por fuente para devoluciones netas.

## 2 · IA (Cohere) en archivos grandes
`aiMapRemote` (en `app.js`) aplica a los archivos del Worker la misma lógica que `stageWithAI`: solo con encabezados desconocidos o campos obligatorios sin columna, con la regla de privacidad de datos personales (columnas con correos, teléfonos, RFC, CURP, nombres de cliente o direcciones viajan sin ejemplos) y la validación del mapeo (campo existente, confianza mínima, sin duplicados). Viajan encabezados y hasta 3 valores de las 3 primeras filas (la vista previa que el Worker ya envió). Si el mapeo cambia, el Worker recalcula; si no hay nada que resolver no hay consulta ni segunda validación. El Worker ahora conoce las columnas aprendidas (`learned`), así que la segunda carga no consulta. Un export de GA4 no pasa por la IA (sus columnas ya vienen resueltas).

## 3 · Rediseño de «Tráfico y conversión»
Homologado con Diagnóstico y Pacing: primera tarjeta con periodo, cuál, canal y **dimensión en la misma fila**, cinco cifras del periodo (tráfico, pedidos, CR, AOV y venta) contra el periodo anterior con las tarjetas `metric-card` de Pacing, y botones «Ir a»; después una tarjeta por sección (Lo que destaca con etiqueta de color por tipo de hallazgo, Mapa, Dónde está la oportunidad, Qué cambió, Ticket y clientes, Detalle por segmento), cada una con título y descripción. Defecto encontrado y corregido: las tarjetas ensanchaban la página a 768 y 390 px (hasta 486 px).

## Pruebas ejecutadas
- Nuevas: `batch_af` (Productos, 9), `batch_ag` (IA en archivos grandes, 12; dos corridas; falla en la entrega anterior), `batch_ah` (rediseño, 9: cifras contra lo calculado aparte, una fila en escritorio, dos columnas en móvil, orden de tarjetas, navegación, etiquetas y sin desborde de 320 a 1920 px).
- Ajustadas por el rediseño (no por un defecto de la app): `batch_t`, `batch_u`, `batch_r` (el texto del hallazgo ahora lleva una etiqueta delante) y `batch_ae` (navegación de 9 enlaces a 6 botones).
- Motor 206/206; lint; contraste; batería del mismo día contra la entrega anterior (todo en verde, 7 exports idénticos, sin errores de consola); Worker `batch_ac` 23/23; carga `batch_ad`; importación grande y guardado incremental; fases A y B; GA4; Segmentos; Tráfico y conversión (partes 1 a 3); calidad con huecos; periodo y canal; clasificación; Inicio; menú, modos, alineación y renombre; accesibilidad (3,139 controles con foco visible, 0 sin contorno, 0 contraste bajo AA, 0 objetivos táctiles < 44 px); espaciado 0; responsive 0 hallazgos (16 vistas × 12 anchos).

## No verificado
Con la API key real de Cohere (respuesta simulada); con archivos reales de Productos o Segmentos; Firefox, Safari, lectores de pantalla y dispositivo táctil; la parte de abajo de «Tráfico y conversión» en celular y las tarjetas de Productos en Calidad de datos a ojo.
