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
| 2 | **Marco global limpio**: quitar el distintivo «Fase 9.1.x» del encabezado; ocultar «Siguiente paso» cuando apunta a la misma pantalla; mostrar la advertencia de datos una sola vez | Hecha en esta rama |
| 3 | **Pacing y Forecast**: la respuesta (cumplimiento, gap, forecast) arriba; fecha de referencia, método y métrica compactos después; el detalle en «Ver más» | Hecha en esta rama |
| 4 | **Diagnóstico + entrada única «¿Por qué?»**: un punto de entrada para Diagnóstico, Análisis, Segmentos y Producto (una franja «¿Por qué?» con las cuatro formas de investigar; el menú lateral se reagrupa en la fase 8) | Hecha en esta rama |
| 5 | **Recovery y Reforecast**: resultado y brecha arriba; archivos, restricciones y detalle plegados (los filtros de canal y periodo se quedan visibles porque cambian el resultado) | Hecha en esta rama |
| 6 | **Metas y motor**: separar «Herramientas» (datos de prueba, pruebas del motor, borrar datos) en una zona plegada dentro de la misma pantalla | Hecha en esta rama |
| 7 | **Ajustes**: «Básico» y «Avanzado» (hoy 104 controles) | Hecha en esta rama |
| 8 | **Menú por pregunta (versión acordada)**: se conservan los nombres de grupo y las pantallas; cada grupo muestra su pregunta (Planear ¿Qué quiero alcanzar?, Monitorear ¿Cómo voy?, Diagnosticar ¿Por qué?, Análisis ¿Qué patrones hay?, Recuperar ¿Qué hago?, Medir y aprender ¿Funcionó?) en el menú y en la ruta | Hecha en esta rama |
| 9 | **Encabezado homologado en las 21 vistas**: migas → título + estado → «Qué hay aquí» → «Qué hago aquí» → «Detalle» (título y descripción propios de la vista, sin perder texto) → contexto → aviso de calidad (solo donde aplica); ayudas en un menú «Ayuda ▾»; «Siguiente paso» al final de la página; Modo Aprendiz con un panel «Aprender en esta vista» siempre cerrado al entrar | Hecha en esta rama |
| 10 | **Recorrido guiado interactivo**: tarjeta flotante que no bloquea la pantalla; los 3 primeros pasos (histórico, venta real, meta) son de acción y avanzan solo al detectar el dato; «No tengo histórico / venta real / meta» con textos condicionales; sin meta el recorrido queda en pausa con resumen y «Retomar»; Pausar/Retomar; se ofrece una vez en la primera visita sin datos y al activar el Modo Aprendiz. Conserva los 15 pasos y sus textos | Hecha en esta rama |
| P | **Prueba de usuario** (`PRUEBA_DE_USUARIO_inicio.md`) | Después de las fases 1 y 5, y al final |

## Cómo se ejecuta cada fase
Maqueta con la app real → visto bueno → construcción → pruebas contra cálculo aparte → regresión completa y comparación visual → documentación → PR.

## Decisiones abiertas
Nombres del menú (fase 8) · dónde va «Herramientas» (zona plegada o en Ayuda) · quiénes hacen la prueba de usuario.
