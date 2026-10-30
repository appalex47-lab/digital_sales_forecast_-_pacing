## 2026-03-30 - Array Spread and Mapping in Record Serialization Loops
**Learning:** In `data-store.js`, `packRecords` is called during dataset persistence. Using `...C().metricKeys.map(...)` inside the loop per record allocated tens of thousands of short-lived metric arrays and spread arguments, creating heavy GC and CPU overhead when saving datasets.
**Action:** When serializing/packing large datasets, pull schema keys out of the record loop, pre-allocate output arrays, and push metric values directly without spread operators.

## 2026-03-31 - Redundant Payload Generation in Export Preview Checks
**Learning:** In `app.js`, `previewPackage` checks which export files are available to show status cards in the `#datos` view. Calling `EXPORT_BUILDERS` built full export payloads (forecasts, diagnostics, narratives, etc.) for each module, allocating megabytes of objects only to check availability (`e.obj ? true : false`) and discard the payload.
**Action:** Pass a `previewOnly` flag to export builders when checking status/availability so expensive payload generation is bypassed when only metadata or status is needed.
