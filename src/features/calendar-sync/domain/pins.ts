// Per-event opt-IN ("pins") — the mirror of exclusions.
//
// Exclusions subtract from a follow; pins ADD a single fixture without
// following anything. One big cup tie, one derby, one title fight —
// with none of the flood that following the whole competition brings.
// PURE — persistence lives in data/pinStore.ts.

export interface PinnedFixture {
  id: string;
  title: string;
  startUtc: string;
  competition: string;
  sport: string;
  // The fixture cache is queried BY FOLLOW KEY, so a pin must carry one
  // (its competition) or the fixture nobody follows is never fetched.
  followKey: string;
  pollPath?: string; // how to keep this fixture fresh
  at: string; // ISO pinned-at, for age pruning
}

export type PinMap = Record<string, PinnedFixture>;

// Long enough that a pinned fixture is certainly played and done.
export const PIN_MAX_AGE_MS = 400 * 86_400_000;

export function prunePins(
  map: PinMap,
  now: number = Date.now(),
  maxAgeMs: number = PIN_MAX_AGE_MS,
): PinMap {
  const kept: PinMap = {};
  for (const [id, pin] of Object.entries(map)) {
    const age = now - new Date(pin.at).getTime();
    if (!Number.isFinite(age)) {
      kept[id] = { ...pin, at: new Date(now).toISOString() }; // repair
      continue;
    }
    if (age > maxAgeMs) continue;
    kept[id] = pin;
  }
  return kept;
}

// A pinned fixture is wanted even when nothing it belongs to is
// followed. The planner unions pins with follow-matched fixtures;
// exclusions still win (an explicit remove beats an older pin).
export function isWanted(
  fixtureFollowKeys: readonly string[],
  fixtureId: string,
  followedKeys: readonly string[],
  pinnedIds: ReadonlySet<string>,
  excludedIds: ReadonlySet<string>,
): boolean {
  if (excludedIds.has(fixtureId)) return false;
  if (pinnedIds.has(fixtureId)) return true;
  return fixtureFollowKeys.some((k) => followedKeys.includes(k));
}
