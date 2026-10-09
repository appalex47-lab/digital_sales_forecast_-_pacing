# Reporte — Fase 9.x · Revisiones de uso, tercera tanda (estado en el encabezado y orden de Planear)

Complementa los reportes anteriores de la etapa H y sus dos tandas de revisiones.

## Estado
```
IMPLEMENTADA:        SÍ (píldoras de estado en el encabezado + ficha completa solo en Configuración + nuevo orden de Planear)
TESTS OK:            SÍ (batería T1–T10, batch_h, batch_i, spacing, tables_fit, lint, contraste, motor 205/205)
VALIDACIÓN OK:       PARCIAL (ver "No verificado")
REGRESIÓN OK:        SÍ contra la puerta anterior (solo cambia el texto de Configuración: 72 palabras nuevas, ninguna eliminada)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md «tercera tanda», ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación; después empieza I-final
```
Las pruebas se corrieron sobre una copia idéntica al código entregado; después de esa copia solo se editaron los `.md`.

## Qué cambió
| Cambio | Detalle |
|---|---|
| Encabezado | Entre el buscador y las notificaciones: **año** (selector; sí cambia el año desde ahí y queda sincronizado con Configuración), **estado de datos** y **estado del motor** (enlaces a Configuración de RevNavigator, sección «Estado de la herramienta»). Cada píldora con texto además de color y nombre accesible que dice a dónde lleva |
| Ficha completa | Año, meta anual, canales, datos y motor: **solo dentro de Configuración**. Ya no aparece en las demás vistas ni en el encabezado |
| Móvil | Con el menú en cajón (≤ 860 px) las píldoras van en una segunda fila; el encabezado pasa de 56 a 90 px y el cajón sigue empezando justo debajo. En ≤ 340 px, dos filas (120 px). Buscador oculto ≤ 1024 px (es un marcador deshabilitado) y etiqueta de fase oculta ≤ 1180 px |
| Orden de Planear | Carga de datos → Calidad de datos → Metas y motor → Plan → Estacionalidad → Datos normalizados → Configuración de planeación. La primera página al elegir Planear sigue siendo Carga de datos |

## Pruebas
| Prueba | Resultado |
|---|---|
| Motor `FP.selfTest.run()` | ✔ 205/205 |
| T1–T10 batería (17 vistas) | ✔; T5 (persistencia) ahora lee la ficha desde Configuración |
| Exports (7) | ✔ idénticos |
| Producto, Recovery Center, Medir, Narrativa con datos | ✔ |
| `batch_i.py` (R-8: orden y posición del encabezado, 3 píldoras con texto y color, enlaces con nombre accesible y objetivo ≥ 24 px, ficha ausente del encabezado y de las demás vistas, píldoras coherentes con el detalle, clic → sección «Estado» también estando ya en Configuración, año sincronizado en ambos sentidos, foco con Tab, 6 anchos de escritorio y 4 de móvil; R-9: orden de Planear) | ✔ |
| `batch_h.py` | ✔ |
| `spacing.py` | ✔ 0 pares |
| `tables_fit.py` (216 tablas, 1100–1920 px) | ✔ |
| `lint_design.py`, `contrast.py` | ✔ (el lint marcó 3 colores literales en mi CSS del encabezado; ahora usan tokens, con `--ds-on-nav` nuevo) |

## Defectos míos que las pruebas detectaron y corregí
- A 360 px las píldoras desbordaban 7 px (47 px a 320 px): compactadas y, en ≤ 340 px, en dos filas. (A 320 px ya se desbordaba 17 px antes de este cambio.)
- La prueba de foco fallaba porque enfocaba por código y no con teclado; ahora llega con Tab, como un usuario.
- Alto del encabezado móvil: 96 px dejaba un hueco de 6 px sobre el cajón del menú; ahora 90 px, alineado.

## No verificado
- **Navegadores y toque real:** solo Chromium headless; Firefox, Safari y un dispositivo táctil sin probar.
- **Selector de año como píldora:** en móvil usa el selector nativo del sistema, que se ve distinto en iOS y Android.
- **Años disponibles:** con datos de prueba el selector ofrece 2025–2027; con datos reales dependerá de los años cargados.
- **`FP.storageTests.run()`:** sigue sin ejecutarse (se cuelga en Chromium headless). Hay que correrlo a mano desde Configuración → Almacenamiento.
- **Textos de ayuda** que describan la ficha superior: busqué menciones y no encontré ninguna, pero no revisé cada entrada del glosario.

## Análisis del CR con los datos que pasaste (sin cambios de código)
- El índice de CR de la tabla «Performance index» es el CR real ÷ el CR del plan, calculado con razón de sumas de los días comparables (nunca promedio de CR diarios). Por construcción, índice de CR = índice de pedidos ÷ índice de volumen (119.2 % ÷ 56.7 % = 210 %).
- Con tus tablas «Validación por canal», por día (plan 365 días, real 271; Llamadas 266):

| Canal | CR real / plan | Volumen/día real vs plan | Pedidos/día real vs plan |
|---|---|---|---|
| Ecommerce | 0.74 % / 0.43 % (×1.70) | 18,216 vs 28,923 (63 %) | 135 vs 126 (107 %) |
| App | 8.70 % / 2.45 % (×3.56) | 1,260 vs 3,610 (35 %) | 110 vs 88 (124 %) |
| WhatsApp | 6.03 % / 5.44 % (×1.11) | 424 vs 705 (60 %) | 26 vs 38 (67 %) |
| Llamadas | 12.04 % / 9.24 % (×1.30) | 339 vs 261 (130 %) | 41 vs 24 (169 %) |

- En el motor del plan (`planningEngine.js`), los pedidos son venta ÷ AOV supuesto y el volumen es pedidos ÷ CR supuesto, salvo que el archivo de plan traiga volumen explícito. El volumen del plan es, por tanto, una consecuencia del CR supuesto (App: 32,235 ÷ 2.45 % ≈ 1.32 M de sesiones). Un volumen real de 57 % del plan indica sobre todo que el CR del plan es mucho más bajo que el real, no necesariamente que falte tráfico.
- **Qué revisar primero:** el CR de App (real 3.6 veces el del plan). Comparar el CR de Ecommerce y App del histórico 2025 con el del plan; la vista Plan indica el origen de cada CR (calculado, supuesto o histórico). Si el histórico decía ≈ 2.45 % y el real 2026 dice 8.7 %, cambió la definición de sesiones o el archivo real cuenta menos volumen.
- **Fila Total:** ≈ 90 % del volumen son sesiones de Ecommerce y el resto mensajes y llamadas; el CR total no es una conversión de embudo. Conviene leerlo por canal.
- No puedo saber si es un cambio real o un problema de datos. AOV real vs plan: +4 % a +13 % en los cuatro canales (plausible).
- Posible mejora (no implementada, no solicitada): mostrar en esa tabla el CR real y el CR del plan junto al índice.

## Decisiones tomadas
1. Orden de Planear: la variante propuesta por mí, aprobada por el usuario.
2. El año en el encabezado es un selector (no un enlace), como pidió el usuario.
3. Meta anual y canales configurados salen del encabezado y quedan solo en Configuración.

## Pendiente
- Confirmación de esta tanda y de las anteriores.
- Etapas I-final (barra de contexto y responsive fino) y J.
- Fase 10 (paquete de análisis): sigue sin hacerse, por diseño.

**No cierro la fase automáticamente. Espero tu confirmación.**
