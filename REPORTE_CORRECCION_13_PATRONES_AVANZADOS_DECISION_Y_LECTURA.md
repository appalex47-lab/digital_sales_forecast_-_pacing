# Corrección 13 — Patrones Avanzados como bandeja de decisión

## Objetivo

Mejorar exclusivamente la experiencia de **Patrones Avanzados**, sin modificar la lógica de **Evolución y Patrones** ni el motor `patternEngine.js`.

## Problema detectado

El módulo mezclaba señales positivas y negativas correctamente desde el punto de vista analítico, pero no respondía claramente a la pregunta del usuario:

> «Llegué aquí. ¿Por dónde empiezo y qué hago después?»

Además, la **Lectura de entidad** estaba al final del módulo, obligando a recorrer la página después de seleccionar una señal, y su visualización histórica era un sparkline sin ejes interpretables.

## Cambios

### 1. Flujo de decisión visible

Patrones Avanzados ahora comunica explícitamente:

1. **Prioriza** — revisar primero las señales con mayor score.
2. **Lee la entidad** — entender qué ocurrió y cuándo.
3. **Investiga evidencia** — localizar dónde se concentra y qué datos faltan.
4. **Decide acción** — pasar a Contribución/Riesgos según el tipo de señal.

### 2. Positivos y negativos

No se separaron artificialmente en módulos distintos.

Se mantienen juntos porque ambos pueden requerir atención. El **score de prioridad** define el orden de revisión.

### 3. Lectura de entidad

La lectura fue movida visualmente dentro de Patrones Avanzados.

Incluye:

- patrón;
- inicio;
- duración;
- cambio acumulado;
- velocidad;
- punto de inflexión;
- confianza;
- explicación;
- evidencia;
- siguiente paso recomendado.

### 4. Gráfica

La gráfica anterior era un sparkline de valores absolutos.

Ahora muestra:

- eje X: fecha/período;
- eje Y: crecimiento porcentual;
- línea de 0 %;
- puntos por período;
- crecimiento del último período;
- tooltip por punto.

No se inventan valores: el crecimiento se calcula únicamente entre observaciones válidas consecutivas.

### 5. Siguiente paso contextual

La lectura diferencia acciones según la señal:

- deterioro → localizar y diagnosticar;
- anomalía → revisar el período anómalo;
- ruptura → revisar el punto de cambio;
- crecimiento → validar persistencia y explicación matemática;
- recuperación → comprobar cuánto de la pérdida fue recuperado.

No convierte patrones en causalidad.

## No modificado

- `js/analytics/patternEngine.js` no fue modificado.
- No se cambió la lógica de clasificación de Evolución y Patrones.
- No se cambiaron sus métricas, filtros ni selector temporal.

## Pruebas

- Sintaxis de todos los JS: PASS.
- Regresión existente de patrones: PASS.
- Checks UX/UI específicos: 9/9 PASS.
- Suite de motor reportada antes de esta corrección: 224/224 PASS.

La corrección 13 es principalmente de presentación, navegación y lectura de resultados; no introduce cambios en los cálculos del motor.
