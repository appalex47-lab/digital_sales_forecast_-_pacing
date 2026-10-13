# Cierre de la auditoría integral de RevNavigator (2026-10-13)

Fuente: «Prompt maestro» (secciones 3–5.6; el archivo recibido termina cortado en 5.6, así que **no se evaluó** lo que viniera después) + «Anexo obligatorio de cierre exhaustivo».
Método: cada hallazgo se contrastó contra el código actual antes de tocarlo; sólo se corrigió lo demostrable.

## 1. Matriz de hallazgos

| # | Hallazgo | Estado tras validar | Archivo / función | Cambio | Prueba y resultado |
|---|---|---|---|---|---|
| 3.1 | Suma parcial presentada como conciliación | **Confirmado y corregido** (único consumidor: metas por canal) | `calculations/metrics.js` `validateHierarchy`; `ui/ui.js` `renderTargets` | Estados `reconciled`/`discrepancy`/`incomplete_coverage`/`not_evaluable`, cobertura, duplicados; `status` histórico intacto + `incomplete` | `tools/test-hierarchy-coverage.js` 18/18; `batch_cierre_auditoria.py` M1 ✔ |
| 3.2 | `kvSet` devuelve `true` antes de confirmar | **Confirmado parcialmente**: ya había toast y verificación para colecciones grandes; faltaba estado para claves pequeñas | `storage/repository.js` (`enqueue`, `status`, `retryFailed`, `onSettled`); `app.js` (banner, `beforeunload`, `storage-retry-writes`); `ui/product-view.js` | Estado saved/pending/failed/memory; banner persistente; reintento; firma síncrona intacta | `tools/test-repository-persistence.js` 15/15 (IndexedDB simulado: cuota, cola, carreras, no disponible); batch P2/P3 ✔ (fallo simulado en navegador real) |
| 3.3 | API key de Cohere | **Parcialmente vigente**: ya era opt-in, fuera de la nube y de los exports; faltaban advertencia, borrado y errores clasificados | `ai/cohereClient.js`; `ui/settings-view.js`; `app.js` (`dx-key-clear`) | Aviso de que no es un secreto seguro, botón «Quitar la key», `errorKind` (auth/quota/server/network/timeout/invalid) sin eco de key | `tools/test-cohere-key-safety.js` 14/14; batch S1 ✔. **Riesgo residual**: sin backend no se puede proteger la key |
| 3.4 | «Confianza» del forecast = días de histórico | **Confirmado y corregido** | `forecast/forecastEngine.js` (`historyAdequacy`, `backtest`, `backtestRows`); `config.js`; `ui/forecast-view.js`; `forecastVersioning.js` | Etiquetas «Histórico suficiente/limitado/insuficiente»; `confidence` se conserva (compat.); backtesting WAPE/MAE/sesgo vs plan, «no evaluada» sin evidencia | `tools/test-forecast-backtest.js` 13/13; batch C1–C5 ✔ |
| 3.5 | Canales/métricas fijos | **Confirmado; sin cambio (decisión de diseño)** | `config.channels`, ver lista en ARCHITECTURE.md | Documentadas dependencias y migración necesaria | n/a (documental) |
| 3.6 | Instrumentación GA4/GTM | **No existe** (búsqueda en todo `js/` e `index.html`; sin telemetría) | — | Propuesta de eventos sin datos comerciales; no se implementó (falta ID autorizado y consentimiento) | n/a |
| N1 | Errores no capturados fallaban en silencio | **Nuevo, corregido** | `app.js` `installGlobalErrorHandlers` | Aviso limitado + consola, sin key | batch E1/E2 ✔ |
| N2 | Sin Content-Security-Policy | **Nuevo, NO corregido** | `index.html` | Requiere decidir política (Cohere, Supabase, Turnstile, Google Sheets, blobs) y probarla con red real | pendiente |
| N3 | Edición simultánea en dos pestañas = última escritura gana | **Nuevo, NO corregido** | `storage/repository.js` | Documentado | pendiente (S5) |

## 2. Inventario maestro de funcionalidades (antes → después)
Generado por script comparando el commit previo contra el árbol de trabajo (`/tmp/inventory.py`): **21 vistas → 21; 143 scripts → 143; 248 acciones → 251; 136 módulos `FP.*` → 136.** Quitadas: **ninguna**. Añadidas: acciones `fc-backtest`, `dx-key-clear`, `storage-retry-writes`; funciones `forecastEngine.backtest/backtestRows/historyAdequacy`, `ui.renderSaveFailure`.
Estado por área: Plan/metas, Pacing, Forecast/Reforecast, Diagnóstico, Análisis (patrones, mix, cohortes), Productos, Importación/Exportación, Nube (Supabase), Home, Asistente Cohere → **preservadas** (65 lotes de regresión + 31 pruebas Node sin fallas). Modificadas intencionalmente: validación de metas (cobertura), tabla de métodos del forecast (histórico en vez de «confianza»), Configuración (Cohere, Almacenamiento).

## 3. Regresión integral (después de integrar todo)
- 65 lotes de navegador (64 existentes + `batch_cierre_auditoria.py`, 12 comprobaciones): **0 fallas**.
- 31 pruebas Node (27 previas + 4 nuevas): **0 fallas**.
- Revisión de `node --check` de todos los `.js`: sin errores de sintaxis.
- Recorrido de las 21 vistas con datos de ejemplo a 1280 px y 375 px: sin errores de página, de consola ni recursos fallidos y sin desborde horizontal.

## 4. Riesgos residuales y bloqueos
1. API key de Cohere en el cliente: requiere backend/proxy (no existe ni está autorizado).
2. CSP ausente (N2): decisión + prueba contra servicios reales.
3. Dos pestañas escribiendo (N3).
4. Backtesting sólo de venta, por canal; el total no se evalúa aparte; los métodos B/C/D pueden coincidir con el plan en datos de ejemplo.
5. Canales/métricas fijos (3.5): cambio de esquema versionado, no abordado.
6. Medición de uso (3.6): falta ID autorizado y política de consentimiento.
7. `(x || 0)` en 30 puntos de analytics/forecast: revisados por lista; son ordenamientos y puntuaciones, no sumas de importes, pero **no se auditó cada uno con datos reales**.

## 5. Límites de esta auditoría (no es exhaustiva en…)
- El prompt recibido está truncado en 5.6: lo posterior no se evaluó.
- Seguridad: sólo búsqueda heurística de HTML sin escapar (0 hallazgos) y de llamadas de red; no hay análisis estático completo de las 174 asignaciones a `innerHTML`.
- Accesibilidad y rendimiento: cubiertos por los lotes existentes y el recorrido de vistas; no se midió con lector de pantalla ni con volúmenes reales grandes.
- Datos reales, flujo real de Supabase y navegadores móviles reales: no verificados desde este entorno.
