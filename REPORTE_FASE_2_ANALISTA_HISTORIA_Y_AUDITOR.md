# Reporte · Fase 2 de los agentes (Analista con historia + Auditor de Conversión)

## Qué cambió para quien usa la herramienta
- **Números** ya no responde «¿ganamos o perdemos dinero?». Abre con una puerta de confianza, la **historia en 20 segundos** y 4 cifras (venta real al corte, plan a la fecha, brecha, cierre estimado). Después: **Qué se cae**, **Qué crece** y **Dónde revisar primero**, y la ruta **Entendámoslo juntos** (5 preguntas con avance y «Entendido, sigamos»).
- **Conversión** (antes «próximamente») lee el embudo por producto. Primero verifica si GA4 cuadra con tus unidades vendidas; si no cuadra, todo lo que sigue se marca con confianza baja. Después, hallazgos priorizados: demanda sin conversión, conversión sin tráfico (muestra limitada), brecha web vs app por paso, fuga por paso, concentración de la fuga y mezcla de tráfico.
- Los dos agentes usan **la misma tarjeta** (cifra grande, mini-visual, «Ver más» con hipótesis a validar, cómo validarla, acción esta semana con responsable natural, y límites).
- Preguntas fuera de lugar se reencaminan: promociones → Arquitecto de Ofertas; rentabilidad/ganancia/costo → se aclara que solo se habla de venta; embudo → Auditor; plan/meta → Analista.

## Qué no cambió
Todo se calcula con código; la IA solo ordena y redacta, y si propone una cifra que el motor no calculó o usa lenguaje causal, se descarta. Nada de costo ni margen por SKU. El asistente de Análisis (Fase 27) sigue donde estaba.

## Verificación
- `tools/test-agents.js` 54/54 · `tools/test-agents-fase2.js` 128/128 · `tools/selftest-node.js` 233/233.
- Baterías de navegador: `batch_agentes.py` (Z1–Z28) y `batch_agentes_fase2.py` (F1–F26) con datos de demo y archivo de productos simulado, PC y celular de 390 px, tema claro y oscuro.
- Las pruebas encontraron un defecto real (el hallazgo «canal que compensa» no mostraba sus cifras) y un texto ambiguo («margen para recuperar»); ambos corregidos.

## Qué no se pudo verificar
Comportamiento con tus datos reales (el cuadre de GA4 real, categorías reales, umbrales sobre tu catálogo) y respuestas de la IA real de Cohere: las pruebas usan datos de demo, productos simulados e IA simulada.
