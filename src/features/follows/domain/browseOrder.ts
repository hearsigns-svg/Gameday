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

// Competition-row variant (Prompt 11b): LIVE rows before DORMANT rows,
// weight within each band. A competition with no future fixtures must
// never top its sport's list — the World Cup at priority 100 leading a
// user into an empty screen is the failure the catalogue exists to
// prevent. Dormant rows stay findable and followable at the tail (a
// follow must survive until the fixtures land); an empty dormant set
// reduces to byPriority exactly.
export function byPriorityLive<T>(
  rows: readonly T[],
  keyOf: (row: T) => string,
  weights: Record<string, number>,
  dormant: ReadonlySet<string>,
): T[] {
  return [...rows].sort((a, b) => {
    const bandA = dormant.has(keyOf(a)) ? 1 : 0;
    const bandB = dormant.has(keyOf(b)) ? 1 : 0;
    if (bandA !== bandB) return bandA - bandB;
    return (weights[keyOf(b)] ?? 0) - (weights[keyOf(a)] ?? 0);
  });
}
