# CORRECCIÓN 5 — Auditoría integral de lógicas y lenguaje de Análisis

## Objetivo
Revisar con datos reales que Evolución, Patrones, Patrones avanzados, Share & Mix, Contribución, Riesgos/Oportunidades, Forecast, Cohortes y Narrativa consuman resultados coherentes; corregir inconsistencias y hacer comprensible la terminología.

## Dataset de validación
Archivo: `Venta Productos 2026.csv`
- 85,973 registros
- 2026-01-01 → 2026-10-04
- 4,535 SKU únicos en la fuente
- Octubre es parcial y no se trata como mes completo en comparativos mensuales.
- El nivel predeterminado del módulo Análisis es Producto, por lo que el número de entidades analizadas puede ser menor que el número de SKU.

## Hallazgo crítico 1 — meses sin observación
### Problema
`ensureTrendAnalysis()` construía una serie agregando puntos únicamente cuando una entidad aparecía en un mes. Si una entidad desaparecía y reaparecía, el motor recibía dos observaciones como si fueran consecutivas.

Esto podía producir falsos positivos de:
- Volatilidad
- Recuperación
- Desaceleración
- Ruptura de tendencia

### Corrección
Ahora se construye una serie completa por entidad y por mes. Cuando no existe observación se registra `null`.

El `trendEngine` ya sabe que un `null` no genera variación ni continuidad, por lo que la tendencia se interrumpe correctamente.

### Evidencia
Con la misma muestra real, el comportamiento histórico comprimido producía, entre otros:
- 517 volátiles
- 119 recuperaciones
- 426 rupturas

Con series completas:
- 367 volátiles
- 2 recuperaciones
- 276 rupturas

La corrección evita tratar meses faltantes como continuidad.

## Hallazgo crítico 2 — Contribución no conciliaba
### Problema
Contribución utilizaba `an.rows`, que ya había sido filtrado por historia suficiente para tendencias, y comparaba el primer período histórico contra el último período disponible. Eso podía excluir entidades y además mezclar un mes completo con octubre parcial.

### Corrección
Contribución ahora reutiliza exactamente el par comparable definido por Share & Mix y utiliza todas las entidades presentes en alguno de esos dos períodos.

En la validación agosto → septiembre:
- Movimiento calculado por contribución: 9,964,807.87
- Diferencia entre venta septiembre y agosto: 9,964,807.87
- Reconciliación: PASS

## Share & Mix
La auditoría confirmó:
- las participaciones actuales suman 1 dentro de tolerancia numérica;
- nuevos y perdidos se separan de ganadores/perdedores;
- octubre parcial no se usa como período actual cuando existen dos meses completos anteriores;
- HHI se calcula sobre el share actual.

Salida reproducible de la implementación actual en la serie independiente:
- Ganadores: 147
- Perdedores: 261
- Nuevos: 832
- Perdidos: 556
- Estables: 842
- HHI: 0.0274

La documentación anterior que indicaba 264/366 no es reproducible con el código actual y queda señalada como resultado histórico no válido para auditoría.

## Patrones
Se ejecutaron pruebas sintéticas para:
- crecimiento sostenido
- crecimiento acelerado
- crecimiento desacelerando
- deterioro sostenido
- caída acelerada
- caída desacelerando
- recuperación
- recuperación fuerte
- estable
- volátil

Todos devolvieron el patrón esperado.

En el dataset real, con nivel Producto y al menos 3 períodos válidos:
- Entidades clasificables: 2,664
- Volátil: 367
- Estable: 359
- Crecimiento sostenido: 320
- Deterioro sostenido: 306
- Ruptura de tendencia: 276
- Historia insuficiente dentro de las observaciones válidas: 226
- Caída acelerada: 200
- Crecimiento desacelerando: 183
- Caída desacelerando: 159
- Crecimiento acelerado: 149
- Anomalía: 117
- Recuperación: 2

## Patrones avanzados
Con las series completas:
- Sin señal avanzada: 2,259
- Ruptura de tendencia: 276
- Anomalía: 117
- Deterioro estructural: 10
- Recuperación: 2

El resultado es descriptivo y el score continúa siendo una prioridad relativa, no una probabilidad ni causalidad.

## Cohortes
La auditoría integrada confirmó:
- Entidades: 4,513
- Cohortes: 9
- Retención mes 1 promedio entre cohortes elegibles: 34.54 %
- Retención mes 3 promedio entre cohortes elegibles: 32.90 %
- Suma de tamaños de cohortes = entidades asignadas: PASS

La UI ahora especifica que esas tasas son un promedio entre cohortes con esa edad disponible.

## Forecast
La prueba integrada confirmó que el motor puede producir 3 períodos futuros para las entidades con al menos 4 observaciones válidas.
- Forecast disponible: PASS
- Entidades proyectadas en la prueba real: 2,149
- Crecimiento proyectado: 1,175
- Deterioro proyectado: 911

El forecast sigue siendo descriptivo y separado del forecast operativo PLAN → ACTUAL.

## Lenguaje y comprensión
Se incorporó una capa de ayuda contextual en Evolución:
- `Crecimiento acelerado`: crece y aumenta la velocidad.
- `Crecimiento desacelerando`: sigue creciendo, pero con aumentos menores.
- `Deterioro sostenido`: caída persistente de la venta.
- `Caída acelerada`: la caída está aumentando de velocidad.
- `Caída desacelerando`: sigue cayendo, pero más lentamente.
- `Volátil`: alterna subidas y bajadas sin dirección persistente.
- `Ruptura de tendencia`: cambia la dirección respecto a la trayectoria anterior.
- `Anomalía`: movimiento estadísticamente inusual frente al historial.
- `Deterioro estructural`: caída acumulada relevante y persistente.
- `Crecimiento estructural`: crecimiento acumulado relevante y persistente.
- `Alerta temprana`: cambio reciente que todavía no domina la tendencia.
- `Recuperación`: crecimiento posterior a una caída.

La ayuda se presenta mediante un desplegable contextual y las píldoras incluyen descripción accesible.

También se añadieron estas definiciones al glosario general de la aplicación.

## Pruebas ejecutadas
- `node --check` sobre todos los archivos JavaScript: PASS
- Pruebas sintéticas de patrones: PASS
- Prueba de huecos mensuales: PASS
- Share actual suma 1: PASS
- Contribución reconcilia contra el delta de los períodos comparables: PASS
- Suma de cohortes: PASS
- Forecast real: PASS
- Ejecución de motores con datos reales: PASS

## Archivos modificados
- `js/app.js`
- `js/ui/trend-view.js`
- `js/analytics/contributionEngine.js`
- `js/config/guidanceConfig.js`
- `css/design-system.css`
- `REPORTE_CORRECCION_2_SHARE_MIX.md` (addendum)
- `REPORTE_CORRECCION_4_COHORTES.md` (addendum)
- `REPORTE_CORRECCION_5_AUDITORIA_LOGICAS_ANALISIS.md`

## Criterio de aceptación
La vista de Análisis debe:
1. no tratar meses faltantes como continuidad;
2. no mezclar un mes parcial con un mes completo en comparativos mensuales;
3. reconciliar Contribución con el movimiento de los períodos que declara;
4. distinguir claramente señales, ausencia de señales y causas;
5. explicar los patrones en lenguaje comprensible;
6. mantener las cifras trazables a los motores determinísticos;
7. conservar la narrativa como capa descriptiva, sin inventar cifras ni causalidad.
