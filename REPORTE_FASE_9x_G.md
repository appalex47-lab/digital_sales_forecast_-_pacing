# Reporte — Fase 9.x · Etapa I-base + Etapa G (avance)

## Estado
```
IMPLEMENTADA:        PARCIAL (I-base y G; faltan H, I-final y J)
TESTS OK:            SÍ (batería T1–T10, lint_design, contraste)
VALIDACIÓN OK:       SÍ (revisión visual de vistas migradas a 1280/768/390)
REGRESIÓN OK:        SÍ contra la línea base congelada (exports, tablas, controles y texto idénticos)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md)
¿LISTA PARA CIERRE?  NO — faltan las etapas H, I-final y J
```

## Pruebas (línea base = proyecto antes de la etapa; determinista: dos corridas seguidas coinciden)
| Prueba | Resultado |
|---|---|
| T1 Motor `FP.selfTest.run()` | ✔ 205/205 |
| T2 17 vistas con datos de prueba | ✔ |
| T3 Errores de consola / pageerror | ✔ 0 |
| T4 Paridad de exports (Forecast, Reforecast, Diagnóstico, Narrativa, Plan, Recovery) | ✔ idénticos (sin campos de fecha/hora); Producto: sin botón de export en el estado de prueba |
| T5 Persistencia IndexedDB tras recargar | ✔ |
| T6 Modos Aprendiz / Analista / Ejecutivo | ✔ |
| T7 Sin scroll horizontal del documento a 1280, 768 y 390 px (17 vistas) | ✔ |
| T8 Navegación, un solo `aria-current` | ✔ |
| T9 Controles sin nombre accesible | ✔ sin nuevos (los `?` de ayuda y 4 botones ya existían sin nombre: pendiente para J) |
| T10 Foco visible por teclado (recorrido con Tab real, 17 vistas) | ✔ todos los controles recorridos muestran indicador |
| Tablas: filas, columnas y celdas idénticas | ✔ |
| Controles: mismos id / name / data-action (sin ajustes nuevos) | ✔ |
| Texto: mismas palabras en cada vista | ✔ |
| `lint_design.py` (hex, `style=`, `!important`, `ds-table`) | ✔ |
| Contraste WCAG AA de tokens | ✔ tras corregir 6 pares (ver UX_GUIDE.md) |

## No verificado
- `FP.storageTests.run()`: se cuelga en Chromium headless (también en la app original). Ejecútalo a mano desde Producto → botón de pruebas de almacenamiento.
- Capturas (T11): revisadas en 1280/768/390; están en `capturas/`.

## Pendiente / requiere decisión
1. Estados «arrastrando» y «cargando» de carga de archivos: no hay arrastrar-y-soltar ni progreso; implicaría comportamiento nuevo.
2. Separar «Configuración de RevNavigator» de «Business Setup»: no existen preferencias propias más allá de Negocio y Configuración de planeación.
3. Encabezado `.ds-page-title` + `.ds-lede` por vista: depende de compactar la barra de contexto (I-final).
4. Etapa H (8 vistas analíticas), I-final (barra de contexto, responsive fino) y J (accesibilidad completa, skip-link, objetivos táctiles 44 px, nombres de los botones `?`).
5. En 390 y 768 px la franja de estado y la barra de contexto ocupan casi toda la primera pantalla: se resuelve en I-final.
