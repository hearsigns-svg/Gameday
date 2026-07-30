// Exclusions must survive an unfollow/re-follow cycle and the display
// cap — pruning is AGE-based, never presence-based. (Presence pruning
// silently forgot removals the moment a fixture left the fetch, so
// re-following resurrected an event the user had deleted.)

import {
  EXCLUSION_MAX_AGE_MS,
  migrateLegacyIds,
  pruneByAge,
} from '../exclusions';

const DAY = 86_400_000;
const NOW = Date.parse('2026-07-30T00:00:00.000Z');
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

it('keeps an exclusion no matter what the last fetch contained', () => {
  const map = { 'fx-1': iso(1), 'fx-2': iso(120) };
  // Repeated syncs whose fixture sets never mention these ids.
  const after = pruneByAge(pruneByAge(map, NOW), NOW);
  expect(Object.keys(after).sort()).toEqual(['fx-1', 'fx-2']);
});

it('ages out only entries older than a season', () => {
  const map = { stale: iso(500), edge: iso(399), fresh: iso(30) };
  const after = pruneByAge(map, NOW);
  expect(after).toHaveProperty('fresh');
  expect(after).toHaveProperty('edge');
  expect(after).not.toHaveProperty('stale');
});

it('the age boundary is just over a season', () => {
  expect(EXCLUSION_MAX_AGE_MS / DAY).toBeGreaterThan(365);
});

it('repairs a corrupt timestamp instead of dropping the exclusion', () => {
  // Dropping would resurrect an event the user deleted; leaving it
  // unstamped would make it immortal. It is re-stamped to now.
  const after = pruneByAge({ bad: 'not-a-date', good: iso(5) }, NOW);
  expect(after).toHaveProperty('good');
  expect(after.bad).toBe(new Date(NOW).toISOString());
  // and from there it ages normally
  const later = pruneByAge(after, NOW + 500 * DAY);
  expect(later).not.toHaveProperty('bad');
});

it('migrates v1 bare ids with a timestamp so they age normally', () => {
  const at = new Date(NOW).toISOString();
  const migrated = migrateLegacyIds(['a', 'b'], at);
  expect(migrated).toEqual({ a: at, b: at });
  expect(pruneByAge(migrated, NOW)).toEqual(migrated);
});
