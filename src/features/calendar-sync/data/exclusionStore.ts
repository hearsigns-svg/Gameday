// Per-event exclusions: fixtures the user removed from an otherwise
// followed competition/team. The planner treats an excluded fixture as
// not-wanted (its calendar event is deleted), but the app still SHOWS
// it greyed on Schedule so the removal is visible and reversible —
// silent disappearance would read as a bug (owner ruling).

import { readJson, writeJson } from '../../../core/storage';

const KEY = 'excludedFixtures.v1';

export function loadExclusions(): Set<string> {
  return new Set(readJson<string[]>(KEY, []));
}

export function isExcluded(fixtureId: string): boolean {
  return loadExclusions().has(fixtureId);
}

export function setExcluded(fixtureId: string, excluded: boolean): void {
  const all = loadExclusions();
  if (excluded) all.add(fixtureId);
  else all.delete(fixtureId);
  writeJson(KEY, [...all]);
}

// Housekeeping: drop ids for fixtures no longer in the snapshot horizon
// (long-finished games) so the set cannot grow without bound.
export function pruneExclusions(liveFixtureIds: ReadonlySet<string>): void {
  const all = loadExclusions();
  const kept = [...all].filter((id) => liveFixtureIds.has(id));
  if (kept.length !== all.size) writeJson(KEY, kept);
}
