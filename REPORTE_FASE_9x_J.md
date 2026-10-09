# Reporte — Fase 9.x · Etapa J (accesibilidad y refinamiento)

## Estado
```
IMPLEMENTADA:        SÍ (etapa J); falta tu revisión. Fase 10 (paquete de análisis) sigue sin hacerse, por diseño.
TESTS OK:            SÍ (batería T1–T10, batch_h/i/j/k, a11y_audit, compare_context, responsive_scan, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "Pendiente de tu validación" y "No verificado")
REGRESIÓN OK:        SÍ contra la línea base del mismo día (0 vistas con texto distinto, 7 exports idénticos)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «Etapa J» y verificaciones, ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Procedencia (importante)
Al retomar, la copia de trabajo ya contenía los cambios de J (skip-link, anuncio de vista, roles, tokens de contraste, objetivos de 44 px, escala tipográfica) y cinco scripts (`a11y_audit.py`, `a11y_report.py`, `batch_k.py`, `contrast.py` ampliado, más ajustes), con fechas de las 00:43 a las 00:56, mientras yo no estaba ejecutando nada. **No los había verificado.** Los revisé (diffs completos) y volví a medir todo; no acepté lo que decía su documentación.

## Qué contiene J
| Área | Resultado |
|---|---|
| Skip-link «Saltar al contenido» | Primer elemento enfocable; invisible hasta recibir foco; lleva el foco a la vista visible sin cambiar de página; orden de tabulación: salto → encabezado → menú → contexto → contenido |
| Título y anuncio por vista | 17 títulos de pestaña distintos («Vista · RevNavigator») y anuncio `role="status" aria-live="polite"` solo al cambiar de vista |
| Regiones vivas y roles | Error de IA (Diagnóstico y Recovery Center) con `role="alert"`; «Calculando…» y «Consultando a Cohere…» con `role="status"`/`.ds-loading`; avisos de validación de la meta con rol |
| Encabezados | Un solo `h1`; 0 saltos de nivel (Negocio y «Datos de productos» pasan a `h3`) |
| Contraste (tokens, no vistas sueltas) | `--c-na` `#7A8494` → `#5B6678`; `--c-ok` alineado con `--ds-success`; los 7 colores de los pasos del recorrido salen de tokens (uno daba 4.47:1); `contrast.py` cubre 60 pares |
| Objetivos táctiles ≥ 44 px | Botones, campos, selects, segmentados, `summary`, iconos y píldoras del encabezado; los iconos diminutos («?», «¿Por qué?», interruptor) amplían su área con un pseudo-elemento |
| Coherencia | Tamaños y radios sueltos registrados como tokens (`--ds-fs-micro/title/lead`, `--ds-r-xs`) |

## Números medidos (mismo script, antes y después)
| Medición | Antes de J | Después de J |
|---|---|---|
| Combinaciones de texto bajo AA (contraste real, todas las vistas) | 4 | **0** |
| Controles sin foco visible con teclado | 0 de 2,832 | **0 de 2,883** |
| Objetivos táctiles < 44 px en 390 px | **249 casos (114 tipos)** | **0** |
| Títulos de pestaña distintos | 1 de 17 | **17 de 17** |
| Saltos de nivel de encabezado | 2 | **0** |
| Skip-link | no | sí |
| Dependencia solo del color | 0 | 0 |

(La bitácora que encontré decía 591 casos táctiles de partida; medido de nuevo con el mismo script son 249. Corregido.)

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería (17 vistas), exports (7) | ✔ idénticos; 0 vistas con texto distinto |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_k.py` (skip-link, orden de tabulación, título y anuncio, roles, encabezados, encabezado móvil, **alineación encabezado–menú a 10 anchos con ratón y con pantalla táctil emulada**) | ✔ |
| `a11y_audit.py` + `a11y_report.py` (17 vistas, 1280 Analista y Aprendiz, 390) | ✔ 0 hallazgos |
| `compare_context.py` | ✔; alto mediano de la barra frente a antes de I-final: −16 % (1280), −35 % (768 y 1024), −24 % (390) en Analista |
| `responsive_scan.py` (16 vistas × 12 anchos, 320–1920 px) | ✔ 0 hallazgos |
| `batch_h.py`, `batch_i.py`, `batch_j.py`, `spacing.py`, `tables_fit.py` (216 tablas), `lint_design.py`, `contrast.py` | ✔ |

## Defecto de J encontrado y corregido
Al subir `--ds-header-h` a 108 px en ≤ 860 px, el encabezado con ratón medía 90 px entre 761 y 860 px (las píldoras de 44 px solo aplican en ≤ 760 px o con pantalla táctil): hueco de 18 px sobre el menú; y a ≤ 340 px medía 156 px con el token en 152 (solape de 4 px). Ahora el token sigue el mismo criterio que las píldoras. La prueba nueva de `batch_k.py` **falla sin el arreglo y pasa con él**.

## Verificación propia de las áreas táctiles ampliadas
390 px con pantalla táctil emulada, 9 vistas × 4 posiciones de scroll: 60 iconos pequeños visibles; en 58 el toque cae en el propio control dentro de un cuadro de 44 × 44 px (`elementFromPoint` y un toque real). Los otros 2 eran falsos positivos por estar dentro de un `<details>` cerrado (comprobado en uno; el de Plan lo inferí por posición, no lo observé directamente).

## Pendiente de tu validación
1. **Revisión visual de J** en `capturas/`: skip-link enfocado, foco visible, encabezado y menú móviles.
2. **Píldora del año en móvil:** mide 44 px de alto y se ve más grande que las píldoras de datos y motor (estas tienen caja de 44 px con dibujo de ~22 px). ¿Lo dejas o lo afino?
3. **Barra de contexto en móvil, modo Aprendiz:** hasta 16 px más alta que en I final por botones de 44 px; sigue 14 % más baja que la original. ¿Lo aceptas?
4. **Tandas anteriores sin confirmar:** menú de una sola sección, Configuración (modo, IA, almacenamiento, Negocio), píldoras del encabezado, orden de Planear, dos modos, datos primero, I final.
5. **Prueba de volumen que te falló (✗, pausa 1,090 ms):** córrela de nuevo con la pestaña a la vista y sin tocar nada, y pásame el número. **No apliqué** el ajuste de la prueba ni el aviso.
6. **«Datos con advertencias»:** dime qué conteos aparecen en Calidad de datos. **No agregué** la línea con el motivo.
7. **CR de App** (real 3.6 veces el del plan): compáralo con tu histórico 2025.
8. **Decisiones abiertas:** ¿conservar la miga final que repite el título del panel? ¿quieres un «continuar sin histórico»?
9. **Fase 10** (paquete de análisis): sigue sin hacerse, por diseño.

## No verificado
- **Lectores de pantalla y dispositivos:** no probé NVDA, VoiceOver, TalkBack ni un dispositivo táctil real; solo scripts en Chromium con pantalla táctil emulada. Firefox y Safari sin probar.
- **Datos reales tuyos:** todo con datos de prueba.
- **Pasada visual de coherencia** (tipografía, espaciado, radios) de las 17 vistas a los 3 anchos: solo medí conteos de tamaños y radios; revisé a ojo pocas capturas (Pacing, encabezado móvil, skip-link).
- **Un caso táctil** inferido, no observado (ver arriba).
- **`FP.storageTests.run()`** en tu navegador: lo corriste tú una vez (✗ en volumen); yo lo reproduje en Chromium headless (pasa, con pausa de 110 ms).

**No cierro la fase automáticamente. Espero tu confirmación.**
