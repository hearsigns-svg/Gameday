// The catalogue: every entry must be a real route the allowlist
// accepts, the union must never let a warming entry displace a
// follower's path, and the seed must stay consistent with what browse
// actually offers.

import { sportByKey, SPORTS } from '../../../src/features/follows/domain/sportsConfig';
import {
  CATALOGUE_SEED,
  orderSweepPaths,
  tierPollsThisSweep,
} from '../catalogue';
import { canonicalisePollPath, sliceOfPollPath } from '../sweep';

test('every seed entry canonicalises — a catalogue typo is unfetchable by construction', () => {
  for (const e of CATALOGUE_SEED) {
    expect({ id: e.competitionId, ok: canonicalisePollPath(e.pollPath) }).toEqual({
      id: e.competitionId,
      ok: expect.any(String),
    });
  }
});

test('every seed entry names the slice its route actually feeds', () => {
  for (const e of CATALOGUE_SEED) {
    const slice = sliceOfPollPath(canonicalisePollPath(e.pollPath)!);
    expect(`${e.label}: ${slice?.competitionId}`).toBe(
      `${e.label}: ${e.competitionId}`,
    );
  }
});

test('DRIFT GUARD: every browse-offered competition pollPath is catalogued', () => {
  // The catalogue's whole promise: browse never offers a competition
  // the store lets freeze. Team-level paths are deliberately absent —
  // teams are the unbounded, follower-driven set.
  const offered = new Set<string>();
  for (const s of SPORTS) {
    if (!s.enabled) continue;
    for (const c of s.staticCompetitions ?? []) {
      if (c.pollPath) offered.add(canonicalisePollPath(c.pollPath) ?? c.pollPath);
    }
    if (s.seriesFollowable?.pollPath) {
      offered.add(
        canonicalisePollPath(s.seriesFollowable.pollPath) ??
          s.seriesFollowable.pollPath,
      );
    }
  }
  const catalogued = new Set(
    CATALOGUE_SEED.map((e) => canonicalisePollPath(e.pollPath)!),
  );
  const missing = [...offered].filter((p) => !catalogued.has(p));
  expect(missing).toEqual([]);
});

test('the seed stays under the stop-gate and the sweep cap with room for devices', () => {
  expect(CATALOGUE_SEED.length).toBeLessThan(150);
  // 250 slots minus the full catalogue leaves ≥190 for device paths.
  expect(250 - CATALOGUE_SEED.length).toBeGreaterThanOrEqual(190);
});

test('tier 2 polls only on the daily sweep', () => {
  expect(tierPollsThisSweep(1, 3)).toBe(true);
  expect(tierPollsThisSweep(1, 15)).toBe(true);
  expect(tierPollsThisSweep(2, 3)).toBe(true);
  expect(tierPollsThisSweep(2, 6)).toBe(false);
  expect(tierPollsThisSweep(2, 21)).toBe(false);
});

describe('orderSweepPaths — priority replaces uid lexicography (F10)', () => {
  test('device paths always precede catalogue paths under the cap', () => {
    const devices = ['pollF1?season=2026', 'pollPbc?'];
    const catalogue = ['pollTennis?', 'pollWtaTennis?', 'pollAthletics?'];
    const r = orderSweepPaths(devices, catalogue, 3);
    expect(r.paths).toEqual(['pollF1?season=2026', 'pollPbc?', 'pollTennis?']);
    expect(r.skippedByCap).toEqual(['pollWtaTennis?', 'pollAthletics?']);
    expect(r.originOf.get('pollPbc?')).toBe('device');
    expect(r.originOf.get('pollTennis?')).toBe('catalogue');
  });

  test('a followed slice is a device path, not a catalogue one — dedup keeps the higher priority', () => {
    const r = orderSweepPaths(['pollF1?season=2026'], ['pollF1?season=2026'], 10);
    expect(r.paths).toEqual(['pollF1?season=2026']);
    expect(r.originOf.get('pollF1?season=2026')).toBe('device');
  });

  test('a full device set starves the catalogue, never the reverse', () => {
    const devices = Array.from({ length: 250 }, (_, i) => `pollFdTeam?teamId=${i + 1}&season=2026`);
    const r = orderSweepPaths(devices, ['pollTennis?'], 250);
    expect(r.paths).toHaveLength(250);
    expect(r.paths).not.toContain('pollTennis?');
    expect(r.skippedByCap).toEqual(['pollTennis?']);
  });
});

test('the sportByKey import is real — this test file is the cross-tree drift anchor', () => {
  expect(sportByKey('tennis')?.label).toBe('Tennis');
});
