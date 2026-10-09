# Reporte — Proyección del año siguiente (Planear)

## Qué se pidió (decisiones del usuario)
Una proyección para 2027 a partir de 2026, con un crecimiento de la meta de ~16 % como supuesto. Decisiones: el 16 % es sobre el **monto total** de la venta meta; la base es el **cierre estimado de 2026** y, para los meses que falten (octubre, noviembre y diciembre), se toman **los del año pasado**; se compara con el ritmo de los **últimos 2 meses**; la salida es **ambas cosas**, proyección y propuesta de objetivo; con el histórico cargado.

## Cómo funciona (`js/projection/projection.js`, `js/ui/projection-view.js`)
- **Base de 2026:** por canal y mes, venta real si el mes ya terminó y tiene al menos 90 % de sus días con venta; si no, el mismo mes de 2025 (que debe cumplir lo mismo). Un mes parcial (octubre con 2 días de venta) no se usa a medias. Un mes sin dato ni en 2026 ni en 2025 queda «sin dato» y se avisa. Los valores de venta en cuarentena no suman.
- **Meta propuesta (objetivo):** base total × (1 + g), g = 16 % editable (0–200 %). Se reparte por canal con la participación de la base; las participaciones se pueden editar (deben sumar 100 %; si no, se reparte como la base y no se puede guardar). La suma de los canales es exacta.
- **Proyección (lo que esperamos):** a cada canal se le aplica el crecimiento de sus últimos 2 meses cerrados contra los mismos meses de 2025. Sin dos meses comparables, 0 % y se avisa; si el ritmo cambió más de 40 %, se avisa que puede ser atípico.
- **Brecha:** meta − proyección. «Qué tendría que pasar»: cuánto subiría, por separado, el volumen, el CR (en puntos) o el AOV sobre lo proyectado para cerrarla (aritmética, no un plan).
- **Reparto mensual de referencia:** meta y proyección repartidas con la forma de los meses de la base, con suma exacta. El plan diario lo genera Planear con su estacionalidad.
- **Sensibilidad:** 10, 12, 16, 20 % y el valor en uso.
- **Comparación con Pacing:** el forecast de cierre de Pacing se muestra por canal solo como referencia.
- **Guardar metas:** «Guardar metas de 2027» escribe la venta meta total y por canal en Planear → Metas de 2027 (pide confirmar si ya hay metas), sin tocar las de 2026; «Ver metas» abre Planear en 2027.
- **Descargas:** `proyeccion_2027.json` (supuestos, base, meta, proyección, brecha, canales, meses, sensibilidad, avisos) y `proyeccion_2027_mensual.csv` (base, meta y proyección por canal y mes).
- Menú: Planear → «Proyección del próximo año» (al final del grupo, para no alterar el orden acordado).

## Pruebas ejecutadas
`batch_ai.py` (nuevo, 30 comprobaciones; falla en la versión anterior): datos con resultado calculado aparte (histórico 2025 completo, real 2026 de enero a septiembre y dos días de octubre, Llamadas con 5 días sin dato en marzo, «hoy» = 2 de octubre). Base y fuente de cada mes; mes parcial; ritmo de 2 meses (+20, +30, −15, +5 %); meta, proyección y brecha; qué tendría que pasar; reparto mensual exacto; sensibilidad; cifras en pantalla; crecimiento (10 % y rechazo de 250 %); participaciones (suma ≠ 100 % bloquea; 40/30/15/15); guardado de metas de 2027 (2026 intacto, confirmación al reemplazar); mes sin dato; sin histórico; sin datos; descargas; menú; desborde de 320 a 1920 px; etiquetas de los campos.
Regresión: motor 206/206; lint; contraste; batería del mismo día (7 exports idénticos, sin errores de consola); Worker `batch_ac`; IA en archivos grandes; carga; importación; guardado incremental; fases A y B; GA4; Segmentos; Tráfico y conversión; Productos; calidad; periodo y canal; clasificación; Inicio; diseño; modos; menú; accesibilidad (3,160 controles con foco visible, 0 sin contorno, 0 contraste bajo AA, 0 objetivos táctiles < 44 px).

## Hallazgos durante la construcción
- La primera versión de «Lectura» dejaba la frase en una columna de 132 px; ahora lleva etiqueta (Base, Meta, Brecha) como en Tráfico y conversión.
- Con datos de prueba la proyección (+17.8 %) superó a la meta (+16 %): la brecha sale negativa y la pantalla lo dice («la proyección supera la meta en 1.6 %»).

## Limitaciones
- Es una estimación con reglas, no un pronóstico estadístico: asume que el ritmo de los últimos 2 meses se mantiene; no separa volumen de precio (inflación).
- Si los dos últimos meses cerrados no son consecutivos (porque uno no tuvo cobertura), se usan los dos más recientes que sí cerraron.
- La base de un canal con días sin dato en un mes que sí cuenta (cobertura entre 90 y 99 %) queda algo subestimada y se avisa.
- Los ajustes (crecimiento y participaciones) viven en la sesión: al recargar vuelven a 16 % y a la base. Las metas guardadas sí persisten.
- No se probó con datos reales del usuario, otros navegadores ni dispositivos táctiles.
