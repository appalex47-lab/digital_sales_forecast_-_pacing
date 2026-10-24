# Reporte — Fase A · Arranque ligero

## Estado
```
IMPLEMENTADA:        SÍ (pruebas del motor fuera del arranque, ejecución automática en segundo plano, pantalla de arranque)
TESTS OK:            SÍ (regresión completa de 206 scripts contra la versión anterior: 0 diferencias; motor 224/224)
¿LISTA PARA CIERRE?  NO — falta que la pruebes en tu equipo y con tu conexión real
```

## Qué cambió (sin tocar funcionalidad)
1. **Las pruebas del motor ya no corren al abrir.** `js/calculations/self-test.js` y `js/storage/storage-tests.js` se descargan solo cuando hacen falta (`js/lazy.js`, `type="text/plain" data-lazy="…"` en `index.html`).
2. **Se ejecutan solas, sin botón obligatorio**, unos 4 segundos después de abrir y en un Web Worker (`js/workers/selftest-worker.js`): la pantalla no se congela y los datos reales no se tocan (las pruebas reinician catálogos; por eso nunca corren en la página con sesión viva). El resultado alimenta «Estado del motor». El botón «Volver a ejecutar pruebas del motor» sigue existiendo en Configuración.
3. **Pantalla de arranque** con el logo girando y una frase por etapa (arrancando motor, procesando venta, generando insights…). Si el arranque falla muestra un aviso con «Reintentar» en lugar de dejar la pantalla en blanco. Respeta «reducir movimiento».
4. «Estado del motor» muestra «sin ejecutar» mientras no hay resultado (antes lo habría mostrado «con fallas»).

## Medición (teléfono emulado, servidor local, misma máquina, antes y después)
| | Antes | Después |
|---|---|---|
| App lista | 11.7 s | 7.4 s |
| Tiempo de bloqueo (TBT) | 4,437 ms | 245 ms |
| Pausa máxima en la página por las pruebas | todas al arrancar | ≤ ~142 ms (el resto va en el Worker) |

## Regresión
- 206 scripts (50 de Node + 156 de Python/Playwright) corridos contra `main` (z25) y contra esta rama, con los mismos datos.
- **0 diferencias**: mismos códigos de salida y mismos ✔/✘ en cada script (2,593 ✔ y 207 ✘ en ambos lados).
- Dos baterías (`batch_ajustes_tabs.py`, `batch_rs6.py`) asumían que las pruebas del motor ya habían corrido al abrir; ahora esperan a que terminen (`FP.app.state.selfTest`). Es un ajuste del script, no de la app.
- Pruebas del motor: 224/224 (`tools/selftest-node.js`).

## Fallas que ya existían en main (no son de esta fase)
- Node: `test-report-builder`, `test-report-copy`.
- 42 scripts de Python con código de salida distinto de cero y 207 comprobaciones ✘, idénticos en `main` y en esta rama.
- Quedan para revisar aparte; no se tocaron.

## No verificado
- Tiempos con tu red y tu equipo reales (mi medición es en servidor local con teléfono emulado).
- Navegadores distintos de Chromium (Safari/Firefox) para el Worker y la pantalla de arranque.
- Que el Worker corra en tu publicación de GitHub Pages (en local sí; mismo origen, sin cambios de CSP).
- Una carga completa con tus datos reales de producción en el arranque.
