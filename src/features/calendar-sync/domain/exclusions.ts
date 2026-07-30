// Pure exclusion rules. PURE — no storage imports (the domain layer is
// jest-testable without native modules); data/exclusionStore.ts owns
// persistence and calls these.

export type ExclusionMap = Record<string, string>; // fixtureId → ISO added

// Just over a season: long enough that any fixture excluded this cycle
// is genuinely past, short enough to bound growth.
export const EXCLUSION_MAX_AGE_MS = 400 * 86_400_000;

// Bounded growth WITHOUT forgetting: age is the only reason to drop an
// exclusion. Presence-based pruning (dropping ids missing from the last
// fetch) silently resurrected removed events after an unfollow/
// re-follow cycle, or when the fixture sat beyond the display cap.
export function pruneByAge(
  map: ExclusionMap,
  now: number = Date.now(),
  maxAgeMs: number = EXCLUSION_MAX_AGE_MS,
): ExclusionMap {
  const kept: ExclusionMap = {};
  for (const [id, at] of Object.entries(map)) {
    const age = now - new Date(at).getTime();
    if (!Number.isFinite(age)) {
      // Corrupt stamp: REPAIR rather than drop or keep forever.
      // Dropping would resurrect an event the user deleted; keeping it
      // unstamped would make it immortal. Re-stamping does neither.
      kept[id] = new Date(now).toISOString();
      continue;
    }
    if (age > maxAgeMs) continue;
    kept[id] = at;
  }
  return kept;
}

// v1 stored bare ids with no timestamps — stamp them so they age out
// normally instead of living forever.
export function migrateLegacyIds(ids: readonly string[], at: string): ExclusionMap {
  const map: ExclusionMap = {};
  for (const id of ids) map[id] = at;
  return map;
}
