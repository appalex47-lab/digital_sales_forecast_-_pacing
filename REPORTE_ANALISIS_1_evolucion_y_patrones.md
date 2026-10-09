# REPORTE ANÁLISIS 1 — Motor de evolución y patrones

## Estado
Implementado en el paquete de RevNavigator.

## Objetivo
Agregar una capa temporal que diferencie una variación puntual de una trayectoria histórica y permita responder: desde cuándo cambió, cuánto dura, si acelera/desacelera, si se recupera y qué evidencia sustenta la clasificación.

## Arquitectura
- `js/analytics/trendEngine.js`: motor determinístico y reutilizable.
- `js/ui/trend-view.js`: vista `Análisis → Evolución y patrones`.
- `js/app.js`: estado, ejecución asíncrona, integración con IndexedDB y acciones de UI.
- `js/config/guidanceConfig.js`: nueva sección de navegación y metadatos pedagógicos.
- `js/ui/guidance/navigation.js`: icono de la nueva sección.
- `index.html`: nueva vista y orden de carga.
- `css/design-system.css`: estilos de evolución y sparklines.

## Patrones iniciales
- crecimiento sostenido
- crecimiento acelerado
- crecimiento desacelerado
- deterioro sostenido
- caída acelerada
- caída desacelerada
- recuperación
- recuperación fuerte
- ruptura de tendencia
- estable
- volátil
- anomalía
- historia insuficiente

## Evidencia calculada
Cada resultado conserva:
- períodos y valores de la serie;
- cambios período a período;
- inicio de tendencia;
- duración/consecutividad;
- cambio acumulado;
- cambio reciente;
- pendiente;
- aceleración;
- volatilidad;
- punto de inflexión;
- nivel de confianza;
- reglas aplicadas;
- limitaciones.

## Integración
La nueva capacidad reutiliza `FP.productStore` e IndexedDB. No crea otro almacenamiento ni reemplaza `productAnalysis`, `driverEngine` o `signalEngine`.

La vista permite analizar por:
- categoría;
- subcategoría;
- producto;
- SKU;
- región;
- estado;
- ciudad;
- sucursal;
- tipo de entrega;
- canal.

Permite seleccionar 6, 12, 18 o 24 meses y filtrar por patrón.

## Reglas de datos
- No se fabrican ceros para períodos anteriores al primer dato de una entidad.
- Se exige un mínimo de 3 períodos útiles para clasificar una entidad.
- Historia insuficiente se distingue de estabilidad.
- Las anomalías son señales descriptivas, no causalidad.

## Validación ejecutada
- `node --check` sobre todos los archivos JavaScript del proyecto: OK.
- Pruebas aisladas del motor: crecimiento sostenido, caída acelerada, recuperación, volatilidad, estabilidad y anomalía: OK.
- Se corrigieron falsos positivos detectados durante la prueba de recuperación/volatilidad/anomalía.

## No incluido en esta fase
- Share & Mix avanzado.
- Cohortes.
- Forecast específico de tendencias.
- Narrativa Cohere de tendencias.
- Priorización avanzada de oportunidades/riesgos.

Estas capacidades quedan separadas para fases posteriores.

## Criterio de aceptación de esta fase
RevNavigator puede identificar y mostrar una trayectoria histórica, no solo un cambio entre dos períodos, y la explicación visible se deriva de evidencia determinística.
