# Fase 33 R2 — Comparación parcial estable en Evolución y Patrones

## Objetivo
Replicar en Análisis → Evolución y Patrones la lógica de comparación por ventana equivalente que ya utiliza Diagnóstico → Categoría producto, sin modificar el módulo de Diagnóstico.

## Problema encontrado en R1
La primera corrección funcional añadía varias agregaciones adicionales sobre el dataset para recalcular el periodo focal y el periodo comparable. Esto podía prolongar el pipeline de Análisis antes de volver a renderizar la vista.

## Corrección R2
Se mantiene íntegro el pipeline de Fase 32 y se aplica la comparación parcial después del cálculo normal:

- El periodo focal parcial ya está agregado en `monthlyMaps`.
- Solo se hace una agregación adicional: la ventana equivalente del periodo anterior.
- Evolución reutiliza ambas estructuras.
- Mix Intelligence reutiliza exactamente las mismas estructuras.
- No se vuelve a consultar el periodo focal.
- No se modifica Diagnóstico → Categoría producto.
- No se modifica la arquitectura HECHO → DRIVER → SEÑAL → HIPÓTESIS → PROYECCIÓN → CICLO DE VIDA.

## Ejemplo lógico
Si el foco es 1–4 octubre de 2026:

- actual = 1–4 octubre
- comparación = 1–4 septiembre
- NO = 1–30 septiembre

Esto evita comparar una ventana parcial contra un mes completo.

## Validación
- Test específico Fase 33: 12 comprobaciones PASS.
- Consolidación DRIVER / lectura de entidad: 12/12.
- DRIVER: 9/9.
- Asistente: 7/7.
- Contexto real asistente: 6/6.
- UX/UI Fase 27: 10/10.
- UX/UI Fase 25: 12/12.
- Prioridades Fase 25: 10/10.
- Prioridades con CSV real: 6/6; 2,638 productos comparables agosto→septiembre.
- Narrativa Fase 23: 11/11.
- Sintaxis JavaScript: PASS en todos los archivos.

## Prueba visual
Se intentó ejecutar Chromium del sistema para un smoke test real. El proceso headless quedó bloqueado por el entorno Chromium/DBus y agotó el tiempo disponible, por lo que NO se declara una prueba visual de navegador como PASS.

## Regla de release
Esta versión no debe considerarse visualmente validada hasta abrirla en un navegador real y comprobar:

1. cargar el CSV;
2. entrar a Análisis;
3. verificar que Evolución y Patrones muestra datos;
4. verificar que el foco 1–4 octubre compara contra 1–4 septiembre;
5. verificar Mix Intelligence;
6. verificar Prioridades;
7. cambiar granularidad/comparación y repetir.
