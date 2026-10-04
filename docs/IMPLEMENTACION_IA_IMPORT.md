# Implementación: importación CSV/XLSX + mapeo semántico Cohere

## Arquitectura integrada

La importación utiliza **la misma conexión de Cohere que ya existe en Configuración → Análisis con IA (Cohere)**. No existe una segunda API key ni una segunda configuración de modelo para importaciones.

Flujo:

`Ajustes Cohere → FP.cohereConnection → cohereClient → normalización de importación`

La misma conexión sigue siendo utilizada por Diagnóstico, Recovery Center y Narrativa.

## Flujo de importación

1. CSV o XLSX entra a staging.
2. Se ejecuta el diccionario estático de cabeceras.
3. Si quedan cabeceras desconocidas o campos obligatorios sin resolver y la IA está habilitada, se consulta Cohere.
4. Cohere solo propone nombres de campos canónicos; no modifica valores ni calcula métricas.
5. La respuesta se valida localmente: campo permitido, cabecera conocida, confianza mínima 0.78 y unicidad.
6. El usuario puede revisar/cambiar cada asignación antes de importar.
7. Los mapeos IA aceptados se aprenden como aliases de cabecera y se persisten en los ajustes existentes para futuras cargas.
8. El pipeline normal continúa con normalización, validación y commit.

## CSV

El parser existente soporta:

- coma, punto y coma, tabulador y `|`;
- comillas;
- comillas escapadas `""`;
- comas/punto y coma dentro de campos entrecomillados;
- saltos de línea dentro de campos;
- CRLF/LF;
- BOM UTF-8;
- encabezados duplicados.

## XLSX

Se mantiene el lector XLSX nativo ya integrado en el proyecto, sin introducir otra dependencia ni romper el funcionamiento offline/file://. Lee la primera hoja, cadenas compartidas, celdas inline, booleanos y fechas almacenadas mediante estilos de Excel. No ejecuta macros ni fórmulas.

## Seguridad

La arquitectura actual realiza la llamada a Cohere desde el navegador con la API key que el usuario configura en Ajustes. Para una versión pública multiusuario, la recomendación es mover la llamada a un backend/proxy y no exponer una API key de servidor en el cliente.

## Validación realizada

- `node --check` ejecutado sobre todos los archivos JavaScript del proyecto: sin errores de sintaxis.
- Prueba automatizada de staging CSV + mapeo Cohere simulado + reutilización de conexión central + aprendizaje de alias: OK.
