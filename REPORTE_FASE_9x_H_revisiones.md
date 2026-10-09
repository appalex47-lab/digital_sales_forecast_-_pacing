# Reporte — Fase 9.x · Revisiones de uso posteriores a la etapa H

Siete ajustes pedidos tras revisar la etapa H con datos reales. Este reporte complementa `REPORTE_FASE_9x_H.md`.

## Estado
```
IMPLEMENTADA:        SÍ (los 7 ajustes)
TESTS OK:            SÍ (batería T1–T10, batch_h, batch_i, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "No verificado")
REGRESIÓN OK:        SÍ contra la línea base con el arnés actualizado
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «Revisiones de uso», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación (quedan decisiones y las etapas I-final y J)
```
La puerta final se corrió sobre una copia idéntica a lo entregado en código (`app_final`); después de esa copia solo se editaron los `.md`.

## Qué cambió
| # | Ajuste | Resultado |
|---|---|---|
| R-1 | Tarjeta «Actual» de Recovery Center | Etiqueta «Actual» en teal (token), como Pacing. «Observado» queda para el resultado medido de una acción |
| R-2 | Arrastrar y soltar en Carga de datos | Cada tarjeta acepta un CSV; estados «arrastrando» y «cargando» en su línea de estado; el archivo entra a «en revisión», nada se importa hasta confirmar; fuera de una tarjeta el arrastre se rechaza para que el navegador no abra el archivo; el botón «Seleccionar CSV» se conserva |
| R-3 | Configuración de RevNavigator | Vista especial en el pie del menú. **Solo orienta** (tabla de 5 filas con enlaces a dónde vive cada cosa); sin controles ni lógica nueva. Qué preferencias vivirán ahí queda por definir |
| R-4 | Tarjeta «Cómo leer esta vista» | Siempre cerrada, en los 3 modos. Si el usuario la abre se queda abierta mientras siga en esa vista; al cambiar de vista vuelve a cerrarse |
| R-5 | Menú con grupos plegables | 5 grupos con `aria-expanded`/`aria-controls`; «Inicio» suelto; al cambiar de vista queda abierto el grupo actual y los abiertos a mano; varios a la vez; sin memoria entre sesiones; enlaces de grupos cerrados no enfocables; táctil ≥ 44 px en móvil |
| R-6 | Espaciado | 16 px entre bloques y 8 px entre un bloque y su nota; 0 pares a menos de 8 px en 17 vistas × 3 anchos |
| R-7 | Tablas sin scroll horizontal en escritorio | Contenido hasta 1400 px, menos relleno horizontal, encabezados que se parten, textos secundarios y controles de celda que se ajustan, `table--dense` en Producto. Sin desborde a 1100 / 1200 / 1280 / 1440 / 1536 / 1920 px (216 tablas) y Producto (13 columnas) a 1280 y 1440 px en sus 3 estados |

Antes de R-7, a 1280 px se desbordaban 20 tablas (la peor, el plan de acción de Recovery Center, por 906 px).

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 (una versión intermedia de la vista nueva lo bajó a 204: faltaba el campo `produces` del catálogo; corregido) |
| T1–T10 batería (18 vistas con «ajustes») | ✔ |
| Tablas / controles / texto idénticos (solo palabras nuevas: la leyenda de arrastrar en Carga; «Actual» en Recovery) | ✔ |
| Exports (Forecast, Reforecast, Diagnóstico, Narrativa, Plan, Recovery, Producto) | ✔ idénticos |
| Producto, Recovery Center, Medir y Narrativa con datos | ✔ (incl. P7: 13 columnas sin desborde) |
| `batch_h.py` (etapa H) | ✔ |
| `batch_i.py` (R-1 a R-5, 25 comprobaciones: menú con teclado, móvil, arrastre simulado, vista nueva) | ✔ |
| `spacing.py` (R-6) | ✔ 0 pares |
| `tables_fit.py` (R-7, 216 tablas) | ✔ |
| `lint_design.py`, `contrast.py` | ✔ |

Cambio de arnés: las capturas de texto leen ahora **todos los `<details>` abiertos** (la tarjeta cerrada ya no cuenta como texto eliminado); la línea base se volvió a capturar con el mismo arnés.

## Defectos míos que las pruebas detectaron y corregí
- Vista nueva: rompía 1 de 205 pruebas del motor y desbordaba 102 px en móvil.
- Menú: los grupos se acumulaban abiertos al recorrer vistas.
- Chip «calc.» de Producto cambiaba el texto de las celdas.
- La prueba del acordeón (etapa H) asumía la tarjeta abierta.

## No verificado
- **Escritorio angosto (1025–1099 px):** las tablas de 9–11 columnas aún se desplazan por dentro (a 1025 px: 5 tablas, la peor +68 px). No hay ancho para todas las columnas junto al menú fijo sin quitar datos.
- **Arrastrar y soltar:** probado con eventos simulados (`DragEvent` con `DataTransfer`), no con un arrastre real desde el explorador de archivos; Firefox y Safari sin probar.
- **Datos reales:** las tablas se midieron con datos de prueba; nombres o textos más largos podrían desbordarlas.
- **`FP.storageTests.run()`:** sigue sin ejecutarse (se cuelga en Chromium headless); hay que correrlo a mano desde Categoría → Producto → «Pruebas de almacenamiento».
- **Cosmético:** en algunos encabezados de tabla el «?» de ayuda cae en línea aparte al partirse el título.
- Las capturas de la batería a 768 px y 390 px son de la ventana visible, no de página completa.

## Decisiones tomadas sin respuesta tuya (revierte lo que no te sirva)
1. Menú sin memoria entre sesiones.
2. Tarjeta «Cómo leer esta vista» cerrada también en modo Aprendiz.
3. Ancho máximo del contenido: 1400 px (antes 1160).
4. Separaciones de 16 px y 8 px.
5. Configuración de RevNavigator solo orienta (no movió ningún control).

## Pendiente / requiere decisión
1. **Configuración de RevNavigator:** ¿qué preferencias de la herramienta deben vivir ahí? (modo de uso, API key de Cohere, almacenamiento, tour…). Hoy están donde estaban.
2. Colores de la cadena de evidencia (siguen separados por forma, no por token) y Baseline / «Plan · Plan» en Medir: sin cambio, según tu respuesta.
3. Etapas I-final (barra de contexto y responsive fino) y J.

**No cierro la fase automáticamente. Espero tu confirmación.**
