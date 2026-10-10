# Plan de simplificación de RevNavigator (por fases)

**Intención.** Que la herramienta sea muy fácil de entender y de usar para alguien no experto, y que un experto encuentre rápido soluciones y problemas, **sin quitar ningún dato**.

**Regla de oro.** Cada pantalla se ordena en tres capas y el dato siempre sigue en la página:
1. **Lo esencial**: la respuesta y los datos clave, siempre a la vista, arriba.
2. **Ver más**: el detalle completo, plegado (mismos números, mismas tarjetas y tablas).
3. **Metodología y ayuda**: cómo se calcula, supuestos y qué falta.

**Garantía automática (cada fase).** La batería abre todos los desplegables y compara contra la versión anterior: no puede desaparecer ninguna palabra, tabla ni control (`compare.py`); solo se permiten palabras nuevas. Además, cada fase trae pruebas que comparan las cifras visibles con un cálculo aparte.

## Fases

| Fase | Qué | Estado |
|---|---|---|
| 1 | **Inicio simplificado**: «Lo esencial» (¿Cómo voy? ¿Por qué? ¿Qué hago hoy?) + «Ver más» + «Metodología y ayuda» | Hecha en esta rama |
| 2 | **Marco global limpio**: quitar el distintivo «Fase 9.1.x» del encabezado; ocultar «Siguiente paso» cuando apunta a la misma pantalla; mostrar la advertencia de datos una sola vez | Pendiente |
| 3 | **Pacing y Forecast**: la respuesta (cumplimiento, gap, forecast) arriba; fecha de referencia, método y métrica compactos después; el detalle en «Ver más» | Pendiente |
| 4 | **Diagnóstico + entrada única «¿Por qué?»**: un punto de entrada para Diagnóstico, Análisis, Segmentos y Producto | Pendiente |
| 5 | **Recovery y Reforecast**: resultado y brecha arriba; filtros, importar/exportar y restricciones plegados | Pendiente |
| 6 | **Metas y motor**: separar «Herramientas» (datos de prueba, pruebas del motor, borrar datos) en una zona plegada | Pendiente |
| 7 | **Ajustes**: «Básico» y «Avanzado» (hoy 104 controles) | Pendiente |
| 8 | **Menú por pregunta**: ¿Cómo voy? ¿Por qué? ¿Qué hago? ¿Funcionó? + Datos y Configuración (mismas pantallas, otra agrupación) | Pendiente (nombres por decidir) |
| P | **Prueba de usuario** (`PRUEBA_DE_USUARIO_inicio.md`) | Después de las fases 1 y 5, y al final |

## Cómo se ejecuta cada fase
Maqueta con la app real → visto bueno → construcción → pruebas contra cálculo aparte → regresión completa y comparación visual → documentación → PR.

## Decisiones abiertas
Nombres del menú (fase 8) · dónde va «Herramientas» (zona plegada o en Ayuda) · quiénes hacen la prueba de usuario.
