# FASE 26 — DRIVER: CONTRIBUCIÓN Y ORIGEN, LECTURA DE DATOS

## Objetivo
Mejorar la utilidad analítica y la lectura visual de la tabla **Contribución y origen**. La tabla anterior repetía en gran medida lo que ya mostraba Mix Intelligence: entidad, cambio monetario, contribución y peso del movimiento.

## Cambio conceptual
La tabla ahora responde una pregunta diferente:

> **¿Cómo se construyó matemáticamente el cambio entre el período base y el período actual?**

Se incorporan:

- **Entidad / rol**: arrastra, compensa o estable.
- **Base → actual**: valores monetarios de ambos períodos.
- **Cambio $ / %**: magnitud absoluta y cambio relativo de la entidad.
- **Aporte al cambio neto**: proporción del resultado neto total atribuible matemáticamente a esa entidad. Puede superar 100% cuando existe compensación en sentido contrario.
- **Peso del movimiento**: proporción del movimiento absoluto total concentrada en la entidad.
- **Δ participación**: cambio de participación en puntos porcentuales cuando está disponible.
- **Lectura matemática**: frase interpretativa determinística que combina rol, aporte, peso y cambio de participación.

## Diferencia frente a Mix Intelligence
**Mix Intelligence** responde principalmente:
- quién gana/pierde participación;
- cómo cambia la composición;
- ranking y concentración del mix.

**Contribución y origen** responde:
- cómo se reconcilia el cambio neto;
- cuánto aporta cada entidad al resultado;
- cuánto movimiento absoluto concentra;
- qué entidades compensan en sentido contrario.

No se presenta causalidad.

## Cambios técnicos
- `js/analytics/contributionEngine.js`
  - conserva `baseline`, `current` y `delta`;
  - calcula `deltaPct`;
  - conserva `shareChangePp`, `baselineShare` y `currentShare` cuando llegan desde Share & Mix;
  - añade `role` determinístico.
- `js/app.js`
  - pasa datos de participación al motor de contribución.
- `js/ui/trend-view.js`
  - reemplaza la tabla mínima por una tabla de lectura matemática.
  - añade guía de lectura.
  - distingue cambio neto, movimiento positivo y negativo.
- `css/design-system.css`
  - mejora jerarquía, ancho de columnas, subvalores y comportamiento responsive.

## Pruebas
- DRIVER Fase 26: **9/9 PASS**
- Datos reales Fase 25: **8/8 PASS**
- Prioridades Fase 25: **10/10 PASS**
- UX/UI Fase 25: **12/12 PASS**
- Sintaxis JavaScript: **PASS**

## Alcance
No se modificaron funcionalmente módulos fuera de la sección **Análisis**.

## Limitación
No se afirma una prueba visual completa mediante Chromium/headless porque el entorno de validación no la permite de forma fiable.
