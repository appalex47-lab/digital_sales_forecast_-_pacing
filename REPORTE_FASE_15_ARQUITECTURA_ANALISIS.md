# Fase 15 — Arquitectura de la sección Análisis

## Objetivo
Formalizar la sección Análisis con el mismo razonamiento que ya utiliza ¿Por qué? Diagnóstico, evitando que los módulos se organicen por algoritmo o acumulen funciones duplicadas.

## Arquitectura aprobada

1. **HECHO — ¿Qué pasó y cuánto?**
   - Evolución y Patrones
   - Lectura de Entidad como profundización del hecho
   - Describe movimiento, período, impacto $, cambio %, crecimiento, caída y persistencia.
   - No afirma causas.

2. **DRIVER — ¿Qué variable lo explica matemáticamente?**
   - Contribución
   - Mix Intelligence
   - Cuantifica atribución matemática y composición.
   - Driver matemático no equivale a causa.

3. **SEÑAL — ¿Dónde ocurre y merece investigarse?**
   - Prioridades de acción
   - Fusiona la función útil de Patrones Avanzados y Riesgos/Oportunidades.
   - Separa Arrastre y Compensación/Crecimiento.
   - Ordena primero por impacto monetario y usa score para priorizar investigación.

4. **HIPÓTESIS — ¿Qué podría estar explicándolo?**
   - ¿Por qué? Diagnóstico
   - Las explicaciones posibles requieren validación.
   - Se distingue evidencia disponible de información faltante.

5. **PROYECCIÓN — ¿Qué puede pasar después?**
   - Forecast
   - Proyección descriptiva; no convierte hipótesis en hechos.

6. **CICLO DE VIDA — ¿Cómo se comporta a través del tiempo?**
   - Cohortes
   - Nuevos, retenidos, reactivados y perdidos.

## Cambios realizados

- Nuevo contrato `js/analytics/analysisArchitecture.js`.
- Nuevo mapa de lectura al inicio de Análisis.
- Etiquetas semánticas HECHO/DRIVER/SEÑAL en los módulos correspondientes.
- Contribución se presenta antes de Mix dentro de la capa DRIVER.
- Lectura de Entidad permanece inmediatamente después de Evolución y antes de los drivers.
- La capa HIPÓTESIS enlaza explícitamente al Diagnóstico existente.
- Se mantiene el motor de Evolución sin modificaciones.
- Se mantiene el motor de Prioridades de Acción de la corrección 14.
- No se elimina todavía `riskOpportunityEngine.js`: queda fuera de la presentación para preservar compatibilidad hasta la fase de consolidación posterior.

## Pruebas

### Sintaxis
- Todos los archivos JavaScript: PASS.

### Arquitectura / UX/UI estructural
- `tools/test-analysis-architecture-15.js`: **12/12 PASS**.
- Verifica orden de las seis capas, ubicación de Lectura, orden Driver → Señal, enlace a Diagnóstico y responsive del mapa.

### Motor Prioridades de Acción
- `tools/test-action-priority-14.js`: **7/7 PASS**.
- Clasificación Arrastra/Compensa, orden monetario, balance, score/persistencia y no causalidad.

### Datos reales
- `tools/test-action-priority-real-14.js`: **6/6 PASS**.
- Dataset: `Venta Productos 2026.csv` mediante fixture real de agosto→septiembre.
- 2,638 productos comparables.
- Arrastre y compensación presentes.
- Balance de entidades reconcilia.
- Rankings positivo/negativo ordenados por impacto absoluto.

### Regresión
- `tools/test-patterns-correction-3.js`: PASS.

## Resultado real de referencia

Agosto → septiembre 2026, sobre productos comparables:

- Principal compensador: GARDASIL 9, **+$1,421,601.92**.
- Segundo compensador: BEYFORTUS, **+$1,296,680.00**.
- Principal arrastre: VIDAZA, **−$58,057.65**.
- Segundo arrastre: ADEMPAS, **−$51,435.40**.

Estos valores son evidencia del movimiento entre períodos, no explicaciones causales.

## Validación visual

La validación automatizada completa con Chromium headless no se considera aprobada en esta fase porque el entorno anterior presentó bloqueo durante el volcado DOM. Por ello no se declara una prueba visual de navegador completa; sí se validaron estructura, responsive CSS, accesibilidad semántica básica y contratos mediante pruebas automatizadas.

## Criterio de aceptación

La Fase 15 queda aprobada para avanzar a Fase 16 cuando:

- el orden HECHO → DRIVER → SEÑAL → HIPÓTESIS → PROYECCIÓN → CICLO DE VIDA se conserve;
- ningún módulo convierta driver matemático en causa;
- Prioridades de acción siga reconciliando con la venta real;
- Lectura de Entidad continúe como profundización del HECHO;
- las siguientes fases modifiquen cálculos únicamente cuando exista una necesidad funcional comprobable.
