# Reincorporación de mejoras R2 sobre la base estable (R3 / Fase 31)

Base: versión R3 (Fase 31 + comparación parcial mínima). Se usó R2 solo como referencia de mejoras visuales.

## A. Lista de cambios
| Mejora | Archivo | Función | Estado |
|---|---|---|---|
| Growth Chart con ejes X/Y, ticks y puntos | js/ui/trend-view.js, css/styles.css | growthChart | Incorporado (de R2); se ve en «Lectura de la entidad» |
| Next Step (texto sin referencia a Contribución removida) | js/ui/trend-view.js | nextStep | Incorporado (de R2) |
| Aislamiento de paneles opcionales (§18) | js/ui/trend-view.js | safe() en render() | Nuevo: un panel que falla muestra aviso y los demás siguen |
| Panel «Contribución y origen» | js/ui/trend-view.js | contributionPanel | RESTAURADO (R2 lo había quitado) |
| Forecast de tendencias, explicación de patrones | js/ui/trend-view.js | forecastPanel, explanation | RESTAURADOS (R2 los borró por error; causaban «forecastPanel is not defined») |
| Capa DRIVER con «Contribución + Mix» | js/analytics/analysisArchitecture.js | — | Restaurado a Fase 31 |
| Motor/comparación parcial | js/app.js | — | NO tocado: se conserva R3 |

## B. Matriz de pruebas (Chromium, CSV de productos sintético de 7,756 filas)
| Prueba | Resultado |
|---|---|
| A carga con datos | PASS: 8 KPIs, 14 entidades, 7 paneles, igual que R3 |
| B consola | PASS: 0 errores (ReferenceError/TypeError) |
| C filtros: nivel (3), periodo (año/mes/semana/día), comparación (2), búsqueda sin resultados, selección de entidad, asistente | PASS; datos idénticos a R3 |
| D estabilidad: tabla, forecast, métricas, navegación (Pacing, Segmentos, Producto, Diagnóstico, Narrativa) | PASS |
| E vacío / 10 días / 2 meses | PASS: sin errores (2 meses cae a estado vacío, igual que R3) |
| Fallo inyectado en Cohortes | PASS: aviso en ese panel, el resto se renderiza |
| Octubre parcial vs R3 | Idéntico a R3 (ver pendientes) |
| Pruebas Node (tools/) | Todas PASS salvo las 2 de R2 retiradas del paquete |

## C. Regresiones frente a R3
Ninguna en datos. Cambios intencionales: gráfica de crecimiento con ejes y texto del estado vacío de la lectura de entidad («Selecciona una señal…»).

## D. Decisiones
1. Se restauró «Contribución y origen» porque la guía prohíbe eliminar funcionalidad de Fase 31.
2. Se mantuvo app.js de R3 (la guía pide no tocar el motor para mejoras visuales).
3. Se retiraron tools/test-phase31-consolidation.js y test-phase33-fixed.js: validan el diseño de R2 (sin Contribución, app.js de R2).
4. Dos pruebas de texto se ajustaron al nuevo código (envoltorio safe() y etiqueta del gráfico).

## E. Pendientes
- Mejoras de app.js de R2 (Mix con ventana equivalente en foco parcial) NO incorporadas.
- En mis datos sintéticos, con foco en Octubre parcial, tanto R3 como esta versión comparan 4 días contra septiembre completo (-86%) y la etiqueta dice «completo». Requiere validarse con el CSV real (GARDASIL).
- Integración Cohere con CSV real no probada (sin credenciales).
