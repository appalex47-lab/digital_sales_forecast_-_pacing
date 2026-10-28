## 2026-03-30 - Array Spread and Mapping in Record Serialization Loops
**Learning:** In `data-store.js`, `packRecords` is called during dataset persistence. Using `...C().metricKeys.map(...)` inside the loop per record allocated tens of thousands of short-lived metric arrays and spread arguments, creating heavy GC and CPU overhead when saving datasets.
**Action:** When serializing/packing large datasets, pull schema keys out of the record loop, pre-allocate output arrays, and push metric values directly without spread operators.

## 2026-03-31 - Unnecessary Export Payload Serialization in Package Preview
**Learning:** `previewPackage()` in `app.js` runs when rendering the `#datos` view to show export file availability. Calling full `EXPORT_BUILDERS` created 6 massive JSON payload objects (`build*Export`) that were immediately discarded, causing ~15-20% CPU overhead on view navigation.
**Action:** Add a lightweight `previewOnly` flag to export builders so preview checks can verify availability and compute expected filenames without constructing large export JSON objects.
