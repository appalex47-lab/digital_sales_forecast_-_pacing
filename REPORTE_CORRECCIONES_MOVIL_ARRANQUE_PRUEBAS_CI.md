# Reporte · Correcciones: celular, aro del arranque, pruebas viejas y CI chico

## Qué se pidió
1. Montar el CI chico como aviso. 2. Que el aro del arranque gire continuo (solo el aro; el logo quieto). 3. Que en celular no se pueda deslizar la página de lado. 4. Revisar y corregir los problemas que ya fallaban antes.

## Qué se hizo
| Tema | Causa | Arreglo | Prueba |
|---|---|---|---|
| Página se desliza de lado (Inicio) | Etiqueta larga de «Preparación de datos» sin salto de renglón | `.ds-badge` baja de renglón en ≤600 px | `batch_movil_sin_desborde.py` (23 vistas × 3 anchos × 2 estados) |
| Lista del árbol de causas se sale a 320 px | Columna `1fr` sin `minmax(0,…)` | `minmax(0,1fr) auto` | `responsive_scan.py` pasa de 2 hallazgos a 0 |
| Aro del arranque se traba | `<svg>` animado directo, el hilo principal está ocupado cargando scripts | `div` propio con `will-change:transform` | medido en Chromium; falta confirmar en iPhone |
| 2 tests de Node fallidos | Textos/estructura del reporte cambiados a propósito (#134 y anteriores) | Tests actualizados, línea base regenerada (solo campos nuevos y la KPI de canales rezagados) | `test-report-builder`, `test-report-copy` en verde |
| «42 baterías fallidas» | 38 eran del corredor (`-I`) o utilidades con argumentos | Corredor corregido; 13 baterías reales corridas en main y rama: iguales | ver abajo |
| `batch_subir_pills` a ratos | Esperaba 1.2 s fijos un desplazamiento suave | Espera a `scrollY ≤ 2` | 3 corridas limpias |
| CI | No existía | `.github/workflows/ci.yml`, solo aviso | 52 scripts de Node pasan localmente |

## No se tocó (decisión pendiente)
- `lint_design.py`: 184 hallazgos de higiene de estilo (hex de respaldo en `var()`), sin efecto visible.
- `tables_fit.py`: 6 tablas con barra de desplazamiento entre 1100 y 1280 px. Un intento de reducir relleno empeoró dos tablas y se descartó.
- Título de Recuperación con excedente en otros canales: hoy dice «Los canales rezagados necesitan $35.9M: $492K diarios en 73 días» y ya no menciona el neto ($11.0M) en el título (sí en el cuerpo). Si prefieres el neto en el título, es un cambio de texto.
