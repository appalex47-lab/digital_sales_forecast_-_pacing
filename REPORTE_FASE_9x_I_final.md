# Reporte — Fase 9.x · Etapa I-final (barra de contexto compacta y responsive fino)

## Estado
```
IMPLEMENTADA:        SÍ (I-final: barra de contexto compacta + responsive fino). Falta la etapa J.
TESTS OK:            SÍ (batería T1–T10, batch_h/i/j, compare_context, responsive_scan, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "Pendiente de tu validación")
REGRESIÓN OK:        SÍ contra la línea base recapturada el mismo día (ver "Lección de las pruebas")
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «Etapa I-final», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación; la etapa J sigue pendiente
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Procedencia (importante)
Al empezar, la copia de trabajo ya contenía la barra de contexto compacta (`navigation.js`, bloque «I-final» de `design-system.css`) y tres scripts nuevos (`context_snapshot.py`, `compare_context.py`, `responsive_scan.py`), con fechas entre las 23:47 y las 23:58, mientras yo ejecutaba el diagnóstico de la prueba de volumen. **No los había verificado.** Los revisé (diff completo de `navigation.js` y del CSS) y volví a ejecutar todas las pruebas antes de darlos por buenos.

## Qué cambió
| Cambio | Detalle |
|---|---|
| Barra de contexto (`.ux-context`) | Misma información y mismos controles, en el orden en que se leen: fila 1 migas + acciones (Ayuda de esta sección, Glosario, Recorrido guiado); fila 2 «qué veo / qué hago aquí» + Siguiente paso como franja; fila 3 «Contexto:» y aviso de calidad de datos. El orden del DOM coincide con el visual (el orden de tabulación ya no salta) |
| Altura (mediana, modo Analista) | 1280 px: 149 → 125 px (−16 %) · 1024 y 768 px: 252 → 164 px (−35 %) · 390 px: 352 → 269 px (−24 %). Modo Aprendiz: −10 % (1280) y −15 % (390) |
| ≤ 1100 px | Todo se apila; ≤ 600 px las acciones van en tres columnas de 44 px de alto y «Ir» mide 44 × 44 px |
| Barra de aprendizaje | Las seis preguntas en dos columnas desde 900 px; mismo contenido |
| Responsive fino | `responsive_scan.py`: 16 vistas × 12 anchos (320–1920 px) buscando desborde del documento, elementos fuera de pantalla, texto recortado, solapes del encabezado y botones con texto que se sale |

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería (17 vistas) y exports (7) | ✔ idénticos |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `compare_context.py` (R-12): 0 palabras quitadas ni agregadas en 17 vistas × 4 anchos × 2 modos; mismos controles y destinos; sin desborde ni solapes; orden de tabulación = orden visual; migas con un solo `aria-current`; ninguna barra más alta que antes; reducciones medidas arriba; en 390 px acciones ≥ 44 px y «Ir» ≥ 44 × 44 px | ✔ |
| `responsive_scan.py` (16 vistas × 12 anchos) | ✔ 0 hallazgos en la versión actual; **2 hallazgos a 320 px en la versión anterior** (Ayuda +16 px, Configuración +17 px) → la prueba sí detecta desbordes |
| `batch_h.py`, `batch_i.py`, `batch_j.py` | ✔ |
| `spacing.py` (0 pares), `tables_fit.py` (216 tablas, 1100–1920 px), `lint_design.py`, `contrast.py` | ✔ |

## Lección de las pruebas
La app toma la **fecha del dispositivo** como fecha de corte. Con la línea base capturada ayer (29) y la nueva hoy (30), cambiaban exports y tablas de Pacing, Reforecast, Recovery y Narrativa (falsa alarma de regresión). Con la base recapturada hoy todo coincide. Regla: capturar la base y la nueva el mismo día.

## Decisiones tomadas
1. El «selector de modo» que el prompt lista dentro de la barra ya no existe porque pediste retirar los botones de modo de arriba.
2. La última miga repite el nombre del panel que está debajo; se conserva porque es la ruta y lleva `aria-current` (quitarla sería quitar información).

## Pendiente de tu validación
Cosas que necesito que revises o decidas (no las he validado contigo):
1. **Revisión visual de I-final** en `capturas/` (`barra_contexto_*` a 1280, 768 y 390 px, modo Analista y Aprendiz).
2. **Tandas anteriores sin confirmar:** menú de una sola sección, Configuración con modo/IA/almacenamiento/Negocio, píldoras del encabezado, orden de Planear, dos modos, datos primero.
3. **Prueba de volumen que te falló (✗, pausa 1,090 ms):** corre `FP.storageTests.run()` de nuevo con la pestaña a la vista y sin tocar nada; si vuelve a fallar con ~1 s, pásame el número. **No apliqué** el ajuste de la prueba ni el aviso «mantén la pestaña a la vista».
4. **«Datos con advertencias»:** dime qué conteos aparecen en Calidad de datos (días faltantes, canales faltantes, duplicados). **No agregué** la línea con el motivo bajo la píldora.
5. **CR de App** (real 3.6 veces el del plan): compáralo con tu histórico 2025.
6. ¿Conservar la miga final aunque repita el título del panel? (decisión 2)
7. ¿Quieres un «continuar sin histórico» para quien no lo tiene?
8. **Etapa J** (accesibilidad y refinamiento) y **Fase 10** (paquete de análisis, por diseño): siguen sin hacerse.

## No verificado
- Firefox, Safari y toque real: solo Chromium headless.
- Datos reales tuyos: todo con datos de prueba.
- Una pasada visual mía de las capturas de las 17 vistas a 3 anchos: revisé Pacing (1280 y 390), no todas.
- `FP.storageTests.run()` en un navegador de escritorio real: lo corriste tú una vez (✗ en volumen); yo lo reproduje en Chromium headless (pasa, con pausa de 110 ms).

**No cierro la fase automáticamente. Espero tu confirmación.**
