# RevNavigator — Análisis 7: Narrativa analítica

## Objetivo
Convertir los resultados ya calculados por Evolución, Patrones, Share & Mix, Contribución, Riesgos y Forecast en una lectura ejecutiva trazable.

## Implementación
- `js/analytics/analysisNarrativeEngine.js`: genera claims determinísticos con nivel de certeza y fuente.
- `js/ui/trend-view.js`: añade el panel Narrativa analítica dentro de `📊 Análisis`.
- `js/app.js`: construye la narrativa después de los motores existentes y permite redacción opcional con Cohere.
- `index.html`: carga el nuevo motor.

## Principios
- No recalcula métricas.
- No inventa cifras.
- No presenta señales como causas.
- Cohere reutiliza la conexión existente y recibe resultados calculados, no datos crudos.
- Si Cohere falla, permanece visible la narrativa determinística.

## Pruebas
- 126 archivos JavaScript validados con `node --check`: 0 errores.
- Prueba aislada del motor con crecimiento, deterioro, riesgo, oportunidad, forecast, share y contribución: correcta.
- Prueba sin datos: devuelve estado no disponible sin inventar narrativa.

## Cohortes — preparación
Los datos actuales sí aportan fecha, SKU/producto, canal, pedidos, unidades, venta y métricas agregadas de funnel GA4. Sin embargo, el modelo de productos no conserva un identificador persistente de cliente (`customerId`) ni transacciones individuales por cliente.

Por lo tanto:
1. Se puede construir una cohorte descriptiva de **productos/SKU** por primer mes observado si se desea.
2. No se puede construir todavía una cohorte estándar de **clientes** (mes de primera compra → retención/recompra por cliente) de forma fiable.
3. Para Cohortes de clientes se necesita incorporar al modelo, al menos: `customerId` persistente/pseudonimizado, fecha de transacción, identificador de pedido opcional pero recomendable, importe/unidades y estado de la transacción.
4. La implementación debe usar IndexedDB existente, sin crear una segunda base paralela.

## Decisión recomendada
Sí podemos pasar a la Fase de Cohortes después de esta fase, pero primero debe definirse explícitamente que será una de estas dos variantes:
- **Cohortes de clientes:** requiere ampliar el dataset antes de activar resultados reales.
- **Cohortes de productos/SKU:** puede ejecutarse con los datos actuales, dejando claro que no representa retención de clientes.
