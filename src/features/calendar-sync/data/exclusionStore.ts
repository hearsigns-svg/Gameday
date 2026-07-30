// Per-event exclusions: fixtures the user removed from an otherwise
// followed competition/team. The planner treats an excluded fixture as
// not-wanted (its calendar event is deleted), but the app still SHOWS
// it greyed on Schedule so the removal is visible and reversible —
// silent disappearance would read as a bug (owner ruling).
//
// Stored as id → ISO timestamp of when it was excluded. Pruning is
// AGE-based, never presence-based: an exclusion must survive an
// unfollow/re-follow cycle and the display cap. (Presence-based
// pruning silently forgot removals the moment their fixtures left the
// fetch — re-following then resurrected an event the user deleted.)

import { readJson, writeJson } from '../../../core/storage';
import {
  ExclusionMap,
  migrateLegacyIds,
  pruneByAge,
} from '../domain/exclusions';

const KEY = 'excludedFixtures.v2';
const LEGACY_KEY = 'excludedFixtures.v1'; // string[] with no timestamps
function loadMap(): ExclusionMap {
  const current = readJson<ExclusionMap | null>(KEY, null);
  if (current) return current;
  // Migrate v1 (bare ids): stamp them now so they age out normally.
  const legacy = readJson<string[]>(LEGACY_KEY, []);
  if (legacy.length === 0) return {};
  const migrated = migrateLegacyIds(legacy, new Date().toISOString());
  writeJson(KEY, migrated);
  return migrated;
}

export function loadExclusions(): Set<string> {
  return new Set(Object.keys(loadMap()));
}

export function isExcluded(fixtureId: string): boolean {
  return fixtureId in loadMap();
}

export function setExcluded(fixtureId: string, excluded: boolean): void {
  const all = loadMap();
  if (excluded) all[fixtureId] = new Date().toISOString();
  else delete all[fixtureId];
  writeJson(KEY, all);
}

// Bounded growth without forgetting: drop only entries old enough that
// their fixture cannot plausibly still be upcoming.
export function pruneExclusions(now: number = Date.now()): void {
  const all = loadMap();
  const kept = pruneByAge(all, now);
  if (Object.keys(kept).length !== Object.keys(all).length) writeJson(KEY, kept);
}
