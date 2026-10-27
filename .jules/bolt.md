## 2026-03-30 - Array Spread and Mapping in Record Serialization Loops
**Learning:** In `data-store.js`, `packRecords` is called during dataset persistence. Using `...C().metricKeys.map(...)` inside the loop per record allocated tens of thousands of short-lived metric arrays and spread arguments, creating heavy GC and CPU overhead when saving datasets.
**Action:** When serializing/packing large datasets, pull schema keys out of the record loop, pre-allocate output arrays, and push metric values directly without spread operators.

## 2026-03-30 - Single-Pass Aggregation over Batch Issues
**Learning:** In `coverage.js` and `data-view.js`, batch issues were processed using `flatMap` followed by multiple `.filter()` and `.reduce()` operations. With tens of thousands of issues across batches, this created heavy GC pressure through intermediate arrays and iterated over the issues array up to 5 times.
**Action:** Combine batch row counts, rejections, issue counts (`error` / `warning`), and `issuesByType` into a single imperative loop over `bats` and `b.issues` to eliminate array allocations and achieve ~3.8x CPU speedup.
