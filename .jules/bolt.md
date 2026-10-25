## 2026-03-30 - Array Spread and Mapping in Record Serialization Loops
**Learning:** In `data-store.js`, `packRecords` is called during dataset persistence. Using `...C().metricKeys.map(...)` inside the loop per record allocated tens of thousands of short-lived metric arrays and spread arguments, creating heavy GC and CPU overhead when saving datasets.
**Action:** When serializing/packing large datasets, pull schema keys out of the record loop, pre-allocate output arrays, and push metric values directly without spread operators.

## 2026-03-30 - Linear Search and Map Instantiation in Record Sorting Comparators
**Learning:** In `data-model.js` and `data-view.js`, `getChannel` performed `Array.find` scans per record, and `filtered` instantiated `new Map()` with Map `.get()` calls inside $O(N \log N)$ sort comparators for large datasets.
**Action:** Cache static entity lookups in a Map/object index, pre-calculate sort order mappings outside sorting loops, and use fast property lookups in comparison callbacks.
