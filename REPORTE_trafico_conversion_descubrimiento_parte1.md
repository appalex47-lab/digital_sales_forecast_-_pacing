# Reporte — Tráfico y conversión · parte 1 de descubrimiento

Construido sobre la versión del usuario (`RevNavigator-app-fase11-ga4-fix`).

## Estado
```
IMPLEMENTADA:        SÍ (hallazgos, mapa tráfico × CR, oportunidad estimada, rankings con umbral)
TESTS OK:            SÍ (batch_t nuevo; batería T1–T10 contra la versión del usuario el mismo día; batch_p/r/s; lint; contraste; motor 205/205)
VALIDACIÓN OK:       PARCIAL (no probado con un export real de GA4 del usuario)
¿LISTA PARA CIERRE?  NO — faltan las partes 2 y 3 y tu confirmación
```

## Qué se agregó
1. **Hallazgos en frases:** mayor oportunidad de conversión (con monto), oportunidad de escalar, mayor caída y mayor alza contra el periodo anterior, concentración y segmentos con poco volumen.
2. **Mapa tráfico × CR** con cuadrantes (Estrellas, Escalar tráfico, Convertir mejor, Revisar) y columna **Cuadrante** en la tabla.
3. **Oportunidad estimada en pesos** (sesiones × diferencia de CR contra el total × AOV): escenario matemático, no promesa.
4. **Rankings con umbral:** Más venta, Mejor CR, Menor CR y Menor AOV (estos dos, solo bajo el total).

**Reglas:** razón de sumas; volumen mínimo = mayor entre 500 sesiones y 1 % del tráfico; diferencia de CR no concluyente (intervalo de Wilson 95 %) → sin oportunidad y marcada.

## Pruebas
| Prueba | Resultado |
|---|---|
| `batch_t.py` (datos con resultado conocido, calculado aparte) | ✔ (falla en la versión anterior) |
| Batería T1–T10 contra tu versión, mismo día | ✔ (solo cambia el control de equivalencias) |
| `batch_p`, `batch_r`, `batch_s`, lint, contraste, motor | ✔ |

## No verificado
- Con tu export real de GA4; con muchas campañas o landings (el mapa con muchos puntos puede encimar etiquetas).
- La auditoría de accesibilidad automática no carga Segmentos, así que no revisó esta sección con datos.
