# Reporte — Fase 11 · Traductor del CSV de GA4

## Estado
```
IMPLEMENTADA:        SÍ (la tarjeta de Segmentos acepta el CSV exportado de GA4 tal cual)
TESTS OK:            SÍ (batch_s nuevo; batería T1–T10; batch_h/i/j/k/l/m/n/p/r; a11y; responsive; spacing; tables_fit; lint; contraste; motor 205/205)
VALIDACIÓN OK:       PARCIAL (no se probó con un export real completo de tu GA4)
REGRESIÓN OK:        SÍ contra la versión entregada, mismo día: 7 exports idénticos; texto solo cambia en Carga de datos (aviso de GA4) y en «Tráfico y conversión» (frase del traductor)
DOCUMENTACIÓN OK:    SÍ (UX_GUIDE.md y ARCHITECTURE.md)
¿LISTA PARA CIERRE?  NO — espera tu confirmación con un export real
```

## Qué hace
- Detecta el CSV de GA4 (fecha + plataforma + sesiones) y lo convierte al formato de Segmentos antes de la revisión normal; nada se importa sin confirmar.
- **web → Ecommerce; Android + iOS → App.** Otras plataformas y filas sin fecha (totales) se omiten y el aviso lo dice.
- Dimensiones: dispositivo, fuente y medio (separados), campaña, landing y nuevo/recurrente. Cada fila de GA4 genera una fila por dimensión y se suman por día, canal y segmento.
- **«(not set)» → «Sin dato (not set)».** Usuarios: no se usan (no se pueden sumar entre filas). Métricas: Sesiones, Compras e Ingresos.
- Acepta comentarios «#», encabezados en español o inglés, fechas AAAAMMDD y números con comas de miles y «$».
- «Tráfico y conversión» explica que WhatsApp y Llamadas no tienen datos por segmento.

## Ojo con el Diagnóstico
Contra plan, el Diagnóstico compara los segmentos con el mismo periodo del año anterior (no hay plan por segmento). Para verlos ahí, exporta también el año anterior de GA4, o usa «Actual vs periodo anterior». La vista «Tráfico y conversión» ya compara contra el periodo anterior.

## Pruebas
| Prueba | Resultado |
|---|---|
| `batch_s.py` (nuevo): CSV de GA4 sintético con todo lo anterior; 9 segmentos de 6 dimensiones con sesiones, compras, ingresos y CR iguales a sumas calculadas aparte; «Sin dato (not set)»; App = Android + iOS; sin usuarios; Diagnóstico con las dimensiones disponibles | ✔ (falla en la versión anterior) |
| Motor; T1–T10; 7 exports; Producto, Recovery, Medir, Narrativa | ✔ |
| `batch_h/i/j/k/l/m/n/p/r` | ✔ |
| `a11y_audit.py` (3,115 controles; 0 bajo AA; 0 táctiles < 44 px), `responsive_scan.py` (0), `spacing.py` (0), `tables_fit.py`, lint, contraste | ✔ |

## Defectos encontrados en la prueba (de la prueba, no de la app)
- El aviso de conversión quedaba tapado por el de «en revisión»: ahora van juntos en un solo aviso.
- Los datos sintéticos de la prueba tenían errores (cada plataforma con un solo dispositivo; ingresos sin compras) y se corrigieron.

## No verificado
- Un export real y completo de tu GA4 (solo vi tu ejemplo de 4 filas en Excel).
- Exports con «;» como separador o decimales con coma.
- El rendimiento con un año completo de GA4.
