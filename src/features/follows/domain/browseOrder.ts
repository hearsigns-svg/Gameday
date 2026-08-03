// Priority ordering (Prompt 11). PURE — the data layer supplies the
// weight maps (data/browsePriority.ts), this is the one sort rule.

// Stable descending sort by weight; unweighted rows keep their source
// order after every weighted row. Array.prototype.sort is stable in
// JSC/Hermes/V8, which is what lets absence mean "keep config order".
export function byPriority<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  weights: Record<string, number>,
): T[] {
  return [...rows].sort(
    (a, b) => (weights[keyOf(b)] ?? 0) - (weights[keyOf(a)] ?? 0),
  );
}
