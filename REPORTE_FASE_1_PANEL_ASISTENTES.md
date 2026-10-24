# Reporte — Fase 1 · Panel de asistentes (Analista de Números)

## Estado
```
IMPLEMENTADA:        SÍ (botón «Asistentes», panel, 6 detectores del Analista, IA opcional con validación)
TESTS OK:            SÍ (regresión completa: 206 scripts comunes sin diferencias contra main; 54 pruebas nuevas de Node, 7 del motor, 28 de navegador)
¿LISTA PARA CIERRE?  NO — falta que la pruebes con tu sesión de IA real y con datos reales
```

## Qué se agregó
1. **Botón «Asistentes»** en toda la app (≈4 KB en el arranque). El panel, los detectores y la IA son un módulo diferido que se descarga al abrir el panel.
2. **Analista de Números (6 detectores deterministas)** que leen los motores que ya existen: brecha concentrada en un canal, meta en riesgo, driver dominante, contradicción entre plan y periodo anterior, forecast divergente y datos que distorsionan el cumplimiento. Alcance: Total digital, mes de la última venta real.
3. **IA opcional**: solo ordena y redacta los hallazgos ya calculados. Su respuesta se valida con las reglas del asistente de Análisis (sin cifras fuera del contexto, sin causalidad) y, si falla, se muestran los textos del motor. Nunca se pierde un hallazgo.
4. **Panel**: pestañas Números / Conversión (Fase 2) / Ofertas (Fase 4); descripción plegada; cada hallazgo con «Ver más» y «Ver en {vista}»; pregunta libre con sugerencias tras «¿No sabes qué preguntar?»; PC 540 px, celular pantalla completa; al pie «● IA conectada» o «● IA no conectada · Ir a Configuración».
5. **Pantalla de arranque**: el logo queda quieto y solo gira el aro.
6. El asistente de Análisis (Fase 27) no se toca.

## Defecto encontrado y corregido en el camino
Cuando la IA repetía una cifra negativa o en millones tal como la escribe el motor («−$200», «$4.6 M»), el validador la rechazaba por «cifra no presente». Ahora el contexto lleva los valores numéricos y los signos se normalizan; hay pruebas para ambos casos.

## Regresión
- 208 scripts (52 Node + 156 Python) contra main: los 206 que existen en ambos lados dan **los mismos códigos de salida y los mismos ✔/✘** (✘ 207 en ambos; ✔ 2,593 en main, 2,618 aquí por las pruebas nuevas).
- Nuevos: `tools/test-agents.js` (54/54) y `tools/regression/batch_agentes.py` (28 comprobaciones, OK).
- Motor: 231/231 (`tools/selftest-node.js`; incluye el grupo «Asistentes»).
- La regresión completa corrió antes de los últimos ajustes del pie del panel y del logo; sobre el estado final se repitieron `test-agents`, motor, `batch_agentes`, `batch_ajustes_tabs` y `batch_rs6`: todo OK.

## Ya fallaba en main (igual en ambos lados, no tocado)
2 pruebas de Node (`test-report-builder`, `test-report-copy`) y 42 scripts de Python con salida ≠ 0.

## No verificado
- La IA real de Cohere con sesión o API key (solo con respuestas simuladas).
- Con los datos de demo casi en plan solo aparece un hallazgo de baja prioridad; los demás se probaron con datos sintéticos.
- Safari y Firefox; tiempos reales en GitHub Pages.
- El número del botón cuenta hallazgos sin IA y no se actualiza al cargar datos nuevos hasta cambiar de vista o abrir el panel.
