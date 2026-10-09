# Reporte — Tráfico y conversión · parte 2 de descubrimiento

## Estado
```
IMPLEMENTADA:        SÍ (qué explica el cambio, AOV bajo con buen volumen, calidad de la medición, nuevos y recurrentes)
TESTS OK:            SÍ (batch_u nuevo; batch_r/s/t; batería T1–T10 contra la versión anterior el mismo día; lint; contraste; motor 205/205)
¿LISTA PARA CIERRE?  NO — falta la parte 3 y tus pruebas
```

## Qué se agregó
5. **Qué explica el cambio:** ganadores y perdedores con Δ venta, peso en los movimientos y efecto de tráfico, CR y AOV.
6. **AOV bajo con buen volumen:** ticket más de 15 % bajo el total, con al menos 30 pedidos, y cuánto sumaría con el AOV del total.
7. **Calidad de la medición:** alerta si el tráfico sin dato pasa del 5 %.
8. **Nuevos y recurrentes:** peso, cambio de peso, CR y AOV.

## No verificado
- Con tu export real de GA4.
- La auditoría automática de accesibilidad no carga Segmentos.
