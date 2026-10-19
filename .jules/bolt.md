## 2026-10-19 - O(N²) Invariant Aggregations in Item Iterations
**Learning:** Calculating aggregate sums (e.g., positive/negative effect sums across items) inside `items.forEach` by filtering the full collection repeatedly creates an O(N²) bottleneck (75M array ops for 5k items).
**Action:** Always precalculate invariant positive/negative sums in a single O(N) pass prior to mapping/iterating over individual collection items.
