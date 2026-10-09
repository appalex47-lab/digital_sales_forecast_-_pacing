# Reporte — Pasada de diseño: Calidad de datos y Tráfico y conversión

Pedido del usuario: «el UX está muy feo». Sin detalle de qué le molestaba, se revisó cada pantalla construida en las últimas fases con capturas a 1280 y 390 px (antes y después, en `capturas/`) y se corrigieron los defectos objetivos encontrados. **No reemplaza su revisión: falta saber qué le molesta a él.**

## Defectos encontrados y corregidos
| Pantalla | Defecto | Corrección |
|---|---|---|
| Calidad · Salud | «Salud general 100/100» con el banner «Datos con advertencias» (el redondeo de 99.5 subía a 100) | 100 solo si nada bajó puntos; si no, máximo 99 |
| Calidad · Salud | Dos tarjetas con 7 filas y frases largas cada una (ruido) | Tarjeta compacta: puntaje, «Lo que bajó puntos» (solo lo que bajó) y el detalle completo plegado |
| Calidad · Salud | «Sin incidencias: los 7 componentes» en Segmentos (tiene 6) | Usa el número real |
| Calidad · Cobertura | Abría en «Histórico sin datos» aunque había venta real | Abre en la primera colección con datos (si el usuario no eligió otra) |
| Calidad · Problemas por tipo | La venta negativa salía en rojo como «Error» aunque ahora va a cuarentena | «En cuarentena»; columna «Qué pasa» en lugar de «Severidad» |
| Calidad · textos | «1 celdas», «1 registros», «1 filas», «1 fechas» | Plurales correctos (Salud, Disponibilidad) |
| Calidad · Qué puedes analizar | Tabla larga sin resumen | Línea de resumen (disponibles, con límites, sin información) |
| Tráfico y conversión | 8 secciones en una página larga sin navegación | Enlaces «Ir a:» a cada sección (desplazamiento suave, foco, 44 px en móvil) |
| Tráfico y conversión | Frases difíciles de escanear | Nombres de segmento en negritas |
| Tráfico y conversión | «+0.0 %», «+0.00 pp» cuando no hubo cambio | Cambio cero sin signo |
| Tráfico y conversión · mapa | Líneas de referencia sin valor | Rótulos «promedio 33.3 %» y «CR del total 1.89 %» |
| Calidad y Diagnóstico | Tabla pegada al título de los desplegables (0 px) | Separación de 8 px (la detectó la prueba de espaciado) |
| Calidad · móvil (320 px) | Tarjetas de Salud se salían 33 px (lo detectó el barrido responsive) | `minmax(min(320px, 100%), 1fr)` |

## Pruebas
`batch_ac.py` (nuevo, falla en la versión anterior): salud 100 con datos limpios y nunca 100 con incidencias, tarjetas compactas, Cobertura, «En cuarentena», plurales, resumen de análisis, navegación (9 enlaces que apuntan a secciones existentes, desplazamiento y foco, hash sin cambio), negritas, ceros, rótulos del mapa, sin desborde de 320 a 1920 px y enlaces de 44 px en móvil. Motor 206/206; lint y contraste; accesibilidad (3,139 controles con foco, 0 bajo AA, 0 táctiles < 44 px); barrido responsive (0 hallazgos); espaciado (0 pares); tablas (270). Batería del mismo día contra la entrega anterior: 7 exports idénticos, sin errores de consola; solo cambia Calidad (lo esperado). Lotes: A y B, GA4, Segmentos, descubrimiento, Producto en Diagnóstico, periodo y canal, clasificación, Inicio.
Pruebas de las fases A y B actualizadas a los plurales correctos.

## No verificado
La revisión de diseño es mía (no sé qué le molesta al usuario); no se rediseñó el Diagnóstico, Recovery ni el resto de pantallas; sin pasada con datos reales; Firefox, Safari, lectores de pantalla y dispositivo táctil real.
