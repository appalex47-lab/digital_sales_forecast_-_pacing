# FASE 27 — Asistente conversacional de Análisis con Cohere

## Objetivo
Convertir la sección Análisis en una experiencia conversacional sin permitir que Cohere sustituya los motores determinísticos.

## Decisión de arquitectura
- HECHO, DRIVER, SEÑAL, CICLO DE VIDA, PROYECCIÓN y Mix siguen calculándose localmente.
- Cohere recibe únicamente un contexto estructurado de resultados calculados.
- Cohere interpreta preguntas libres y redacta respuestas.
- No recibe el CSV crudo.
- No calcula, suma, resta, promedia ni inventa cifras.
- Las respuestas se validan antes de mostrarse.
- Se conserva la conexión Cohere única ya existente en Ajustes.

## Preguntas soportadas de forma natural
- ¿Qué se está dejando de vender?
- ¿Desde cuándo están cayendo y por cuánto tiempo?
- ¿Cuáles contribuyen más a la caída?
- ¿Cuáles están creciendo?
- ¿Cuáles están soportando la caída?
- ¿Quién está ganando o perdiendo participación?
- Preguntas libres que combinen varias capas analíticas.

## Diferenciación de DRIVER
### Contribución y origen
Responde: ¿de dónde salió matemáticamente el cambio?

### Mix Intelligence
Responde: ¿cómo cambió la composición del negocio?

La tarjeta de Mix prioriza ahora participación, cambio en puntos porcentuales y ranking; el dinero queda como contexto.

## UX/UI
- Botón flotante «Asistente de análisis» dentro de la sección Análisis.
- Panel conversacional con pregunta libre.
- Preguntas sugeridas.
- Estado de carga.
- Respuesta, evidencia utilizada, siguiente pregunta y limitaciones.
- Historial corto de preguntas de la sesión.
- Mensaje claro cuando Cohere no está configurado.
- Diseño responsive para móvil.

## Archivos principales modificados
- `js/ai/cohereAnalysisAssistant.js` — nuevo motor conversacional.
- `js/ui/trend-view.js` — UI del asistente y diferenciación visual de Mix.
- `js/app.js` — estado y acciones del asistente.
- `index.html` — carga del módulo.
- `css/styles.css` — UI flotante y responsive.
- `tools/test-phase27-assistant.js`
- `tools/test-phase27-real.js`
- `tools/test-phase27-ux-ui.js`

## Validación
- Motor asistente: **7/7 PASS**
- Contexto con datos reales: **6/6 PASS**
- UX/UI asistente: **10/10 PASS**
- DRIVER Fase 26: **9/9 PASS**
- Prioridades Fase 25: **10/10 PASS**
- Prioridades reales: **8/8 PASS**
- UX/UI Fase 25: **12/12 PASS**
- Narrativa Fase 23: **11/11 PASS**
- Narrativa real: **6/6 capas**
- Auditoría Fase 24 Cohere/narrativa: **PASS**
- Forecast: **13/13 PASS**
- Forecast real: **7/7 PASS**
- Arquitectura analítica: **12/12 PASS**
- Diagnóstico/patrones: **15/15 PASS**
- Sintaxis JavaScript: **0 fallos**
- IDs estáticos duplicados: **0**

## Limitación
No se declara una validación visual completa automatizada con Chromium/headless. La validación UX/UI realizada en esta fase es estructural/estática y responsive por código, además de las pruebas de motor e integración.

## Alcance
No se realizaron cambios funcionales fuera de la sección Análisis y sus dependencias directas de Cohere/UI necesarias para el asistente.
