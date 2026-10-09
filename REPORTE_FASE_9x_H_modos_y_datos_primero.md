# Reporte — Fase 9.x · Revisiones de uso, cuarta tanda (modos y datos primero)

Complementa los reportes anteriores de la etapa H y sus revisiones.

## Estado
```
IMPLEMENTADA:        SÍ (dos modos + sin botones de modo en el encabezado + datos primero en Siguiente paso, recorrido guiado y aviso del plan)
TESTS OK:            SÍ (batería T1–T10, batch_h, batch_i, batch_j, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "No verificado")
REGRESIÓN OK:        SÍ contra la puerta anterior (texto solo cambia en Configuración y en el nombre de una prueba del motor)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «cuarta tanda», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación; después empieza I-final
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Mejora 1 · Solo Aprendiz y Analista; fuera los botones de arriba
- El modo **Ejecutivo desaparece** (configuración, selector de Configuración, nota «Modo ejecutivo», regla CSS y clase `mode-exec`).
- Los **tres botones de modo** (Aprendiz / Analista / Ejecutivo) del encabezado de cada vista **ya no existen** (17 vistas comprobadas). Se conservan «Ayuda de esta sección», «Glosario» y «Recorrido guiado».
- El modo se cambia con el interruptor «Modo Aprendiz» del menú y con el selector de Configuración (ahora dos opciones).
- Quien tenía guardado «Ejecutivo» pasa a Analista al abrir la app.
- Se cambió una prueba del motor (`Fase 9.1: modos`) que fijaba los tres modos; ahora fija dos. Es la única prueba del motor que se modificó.

## Mejora 2 · Los datos primero
**Qué lleva a llenar la herramienta, según el código:**
| Elemento | Qué hace | ¿Te lleva a completar todo? |
|---|---|---|
| **Siguiente paso** | Se calcula con tu estado real (reglas por prioridad) y te manda a lo que falta | **Sí: es el que te lleva a llenar todo**, un paso a la vez |
| **Preparación de datos** | Porcentaje y lista de qué está completo (meta, plan, venta real, cobertura, histórico, calidad) | Te dice cómo vas; no te lleva |
| **Recorrido del sistema** | Seis etapas y cuáles ya hiciste | Te dice cómo vas |
| **Recorrido guiado** | Tutorial fijo de la metodología (no mira tu estado) | Enseña el orden; no completa por ti |

**Cambios:**
- **Siguiente paso:** nueva regla «Cargar el histórico», después de «Cargar datos» y «Revisar la calidad» y antes de «Capturar la meta». Solo mientras no hay meta ni plan: si ya capturaste la meta o guardaste un plan, no estorba aunque falte histórico.
- **Recorrido guiado:** ahora 15 pasos; **empieza por Datos (histórico primero)** en Carga de datos y explica por qué; después los 14 pasos de antes en el mismo orden (Meta, Plan, Real…).
- **Aviso del plan sin histórico:** en la vista previa del plan, si no hay histórico y aún no existe el plan original, avisa que se congela sin volumen, AOV ni CR proyectados y no se puede rehacer, con enlace a Carga de datos.
- **Sin cambios (como pediste):** Preparación de datos y las tarjetas de Recorrido del sistema.

**Por qué pasa lo que viste (comprobado en el código):** el plan original se congela al guardarse (`plan-save` → «Plan distribuido original guardado y congelado»; luego solo se guardan revisiones) y `planningEngine` calcula pedidos = venta ÷ AOV y volumen = pedidos ÷ CR con los supuestos que existen en ese momento; sin histórico quedan «sin datos suficientes». Por eso, si cargas la meta y el plan antes del histórico, el original no proyecta volumen, AOV y CR y no se puede rehacer.

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 (con la prueba de modos actualizada) |
| T1–T10 batería (T6 ahora: 0 botones de modo arriba; Aprendiz y Analista; sin `mode-exec`) | ✔ |
| Exports (7), Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_j.py`: modos (ids, 17 vistas sin botones, botones que se conservan, interruptor, selector de dos opciones, migración de «exec») y datos primero (6 estados de siguiente paso, tarjeta de Inicio, recorrido de 15 pasos, pasos 1 y 2, aviso con y sin histórico) | ✔ |
| `batch_i.py` (R-3/R-4 adaptados a dos modos), `batch_h.py` | ✔ |
| `spacing.py`, `tables_fit.py` (216 tablas), `lint_design.py`, `contrast.py` | ✔ |

## Defectos y suposiciones mías corregidas en las pruebas
- Supuse que los datos de prueba traían histórico y no lo traen (traen venta real y plan): la prueba del aviso esperaba lo contrario; el aviso salía bien. Corregida.
- Usé un nombre de propiedad equivocado (`assumptions` en vez de `audit.historicalPeriod`) al simular el histórico en la prueba.

## No verificado
- **Recorrido con datos reales tuyos:** lo probé con datos de prueba y con estados simulados; no con tu archivo de histórico real.
- **Usuarios sin histórico:** «Siguiente paso» les propone cargarlo hasta que capturen la meta; pueden seguir desde el menú o «Preparación de datos». No agregué un «continuar sin histórico».
- **Modo guardado «exec»:** probé la migración simulando el almacenamiento local; no con un navegador que ya lo tuviera guardado de verdad.
- **`FP.storageTests.run()`:** sigue sin ejecutarse (se cuelga en Chromium headless); hay que correrlo a mano desde Configuración → Almacenamiento.
- Solo Chromium headless; Firefox, Safari y toque real sin probar.
- El texto del recorrido guiado en modo Aprendiz (barra de aprendizaje) no se revisó línea por línea.

## Decisiones tomadas (revierte lo que no te sirva)
1. El histórico se sugiere solo antes de tener meta o plan; después ya no estorba.
2. El recorrido guiado sigue siendo un tutorial fijo (no salta pasos ya hechos); solo cambió el orden y su primer paso.
3. Se conserva el código de `ANALYST_ONLY` / `data-analyst` sin efecto visible.

## Pendiente
- Tu confirmación de esta tanda y de las anteriores; después I-final (barra de contexto y responsive fino) y J.
- Fase 10 (paquete de análisis): sigue sin hacerse, por diseño.
- Tu revisión del CR con el histórico 2025 de Ecommerce y App (ver el reporte anterior).

**No cierro la fase automáticamente. Espero tu confirmación.**
