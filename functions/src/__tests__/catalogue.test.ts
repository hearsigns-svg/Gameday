// The catalogue: every entry must be a real route the allowlist
// accepts, the union must never let a warming entry displace a
// follower's path, and the seed must stay consistent with what browse
// actually offers.

import { sportByKey, SPORTS } from '../../../src/features/follows/domain/sportsConfig';
import {
  CATALOGUE_SEED,
  orderSweepPaths,
  sportWeightsOf,
  tierPollsThisSweep,
} from '../catalogue';
import { tournamentKey } from '../tennisTournaments';
import { canonicalisePollPath, sliceOfPollPath } from '../sweep';

// Ranking-only rows are ordering data, not routes — every route
// invariant below exempts them and the rankOnly invariants pin what
// they must be instead.
const ROUTES = CATALOGUE_SEED.filter((e) => !e.rankOnly);
const RANK_ROWS = CATALOGUE_SEED.filter((e) => e.rankOnly);

test('every pollable seed entry canonicalises — a catalogue typo is unfetchable by construction', () => {
  for (const e of ROUTES) {
    expect({ id: e.competitionId, ok: canonicalisePollPath(e.pollPath) }).toEqual({
      id: e.competitionId,
      ok: expect.any(String),
    });
  }
});

test('every pollable seed entry names the slice its route actually feeds', () => {
  for (const e of ROUTES) {
    const slice = sliceOfPollPath(canonicalisePollPath(e.pollPath)!);
    expect(`${e.label}: ${slice?.competitionId}`).toBe(
      `${e.label}: ${e.competitionId}`,
    );
  }
});

test('rankOnly rows are inert by construction: no route, disabled, weighted', () => {
  expect(RANK_ROWS.length).toBeGreaterThan(0);
  for (const e of RANK_ROWS) {
    expect({
      id: e.competitionId,
      pollPath: e.pollPath,
      enabled: e.enabled,
      priority: typeof e.priority,
    }).toEqual({ id: e.competitionId, pollPath: '', enabled: false, priority: 'number' });
  }
});

test('every seed entry names a real client sport — the sport rollup cannot drift', () => {
  for (const e of CATALOGUE_SEED) {
    expect(`${e.competitionId}: ${sportByKey(e.sport ?? '')?.key}`).toBe(
      `${e.competitionId}: ${e.sport}`,
    );
  }
});

test('priorities are 0–100, and within-sport ties are only the documented peers', () => {
  // Ties are deterministic anyway — every consumer sort is stable, so
  // tied rows keep source order — but an ACCIDENTAL tie is usually a
  // data slip. The one deliberate tie: the two tennis tours are peers.
  // Sport rows are a separate namespace (they order the sports grid,
  // never a competition list) and are excluded.
  // Documented peer sets: priorities that are EQUAL because ranking
  // them would be an invention. 'tennis:66' is the two tours. The
  // Olympic disciplines are the larger case — there is no honest basis
  // on which archery outranks fencing, and manufacturing 54 distinct
  // weights would dress a coin-toss as a judgement. They tie, and the
  // list falls back to source order (alphabetical, as seeded).
  const ALLOWED_TIES = new Set([
    'tennis:66',
    'olympics:40',
    // Same competition on two sources (Part B, 2026-08-17): fd.org and
    // TSDB World Cup / Euros rows deliberately share a priority.
    'soccer:100',
    'soccer:88',
  ]);
  const seen = new Map<string, string>();
  for (const e of CATALOGUE_SEED) {
    if (e.priority === undefined) continue;
    expect(e.priority).toBeGreaterThanOrEqual(0);
    expect(e.priority).toBeLessThanOrEqual(100);
    if (e.sportRow) continue;
    const key = `${e.sport}:${e.priority}`;
    if (!ALLOWED_TIES.has(key)) {
      expect(`${key} ${seen.get(key) ?? ''}`.trim()).toBe(key);
    }
    seen.set(key, e.competitionId);
  }
});

test('sport rows: one per enabled sport, sport: id prefix, rank-inert, distinct weights (Prompt 11b)', () => {
  const sportRows = CATALOGUE_SEED.filter((e) => e.sportRow);
  const bySport = new Map(sportRows.map((e) => [e.sport, e]));
  for (const s of SPORTS.filter((s) => s.enabled)) {
    const row = bySport.get(s.key);
    expect(`${s.key}: ${row?.competitionId}`).toBe(`${s.key}: sport:${s.key}`);
    // The label mirrors the client's, so the ops table and the app
    // never disagree about what a weight names.
    expect(`${s.key}: ${row?.label}`).toBe(`${s.key}: ${s.label}`);
    expect(row?.rankOnly).toBe(true);
  }
  const weights = sportRows.map((e) => e.priority);
  expect(new Set(weights).size).toBe(weights.length); // grid order fully determined
});

test('the tennis slam RANK keys are exactly what the feed titles mint', () => {
  // Contract with tennisTournaments.tournamentKey: if slug rules or
  // aliases change, the priority rows must move with them or the slams
  // silently lose their weight.
  expect(tournamentKey('Wimbledon')).toBe('tennis-t-wimbledon');
  expect(tournamentKey('US Open')).toBe('tennis-t-us-open');
  expect(tournamentKey('Roland Garros')).toBe('tennis-t-roland-garros');
  expect(tournamentKey('Australian Open')).toBe('tennis-t-australian-open');
  for (const slug of ['tennis-t-wimbledon', 'tennis-t-us-open', 'tennis-t-roland-garros', 'tennis-t-australian-open']) {
    expect(CATALOGUE_SEED.some((e) => e.rankOnly && e.competitionId === slug)).toBe(true);
  }
});

test('athletics RANK keys mirror the browse rows, and the catch-all is unpriced and last', () => {
  const athletics = SPORTS.find((s) => s.key === 'athletics')!;
  const rows = athletics.staticCompetitions ?? [];
  for (const c of rows) {
    if (c.key === 'wa-calendar') continue; // the catch-all is a poll entry
    expect({ row: c.key, ranked: CATALOGUE_SEED.some((e) => e.rankOnly && e.competitionId === c.key) }).toEqual({ row: c.key, ranked: true });
  }
  const catchAll = CATALOGUE_SEED.find((e) => e.competitionId === 'wa-calendar')!;
  expect(catchAll.priority).toBeUndefined();
});

test('tennis-atp stays tier 1 WITH the connector cadence guard (F41) — the pairing is deliberate', () => {
  // The once-daily commitment lives in pollTennis (the 22h marker
  // guard), not in the tier: tier 1 buys same-day retries after a
  // failed daily fetch, and the guard makes the extra sweeps cheap
  // skips instead of fetches. Demoting to tier 2 would turn one
  // transient failure into 48h of data age.
  const atp = CATALOGUE_SEED.find((e) => e.competitionId === 'tennis-atp')!;
  expect(atp.tier).toBe(1);
  expect(atp.enabled).toBe(true);
});

test('sportWeightsOf: explicit sport rows win outright; derived max is only the missing-row fallback', () => {
  const w = sportWeightsOf(CATALOGUE_SEED);
  // Explicit rows (Prompt 11b): tennis is 82 by its own knob, NOT 98 —
  // Wimbledon no longer speaks for the sport ("has one giant event" ≠
  // "is a big sport", owner review).
  expect(w.soccer).toBe(100);
  expect(w.tennis).toBe(86);
  expect(w.cricket).toBe(84);
  expect(w.basketball).toBe(82); // top-five global league, not below golf (11c)
  expect(w.rugby).toBe(78);
  expect(w.athletics).toBe(70);
  // Every enabled browse sport has a weight, so the sports row can
  // order fully once the client consumes it.
  for (const s of SPORTS.filter((s) => s.enabled)) {
    expect(`${s.key}: ${typeof w[s.key]}`).toBe(`${s.key}: number`);
  }
  // Fallback: strip the sport rows and the old derived-max behaviour
  // returns — a sport missing its row degrades gracefully, never to 0.
  const derived = sportWeightsOf(CATALOGUE_SEED.filter((e) => !e.sportRow));
  expect(derived.tennis).toBe(98); // Wimbledon again
  // Order independence: a sport row seen BEFORE its sport's
  // competitions must not be clobbered by a later derived max.
  const reversed = sportWeightsOf([...CATALOGUE_SEED].reverse());
  expect(reversed.tennis).toBe(86);
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
  // The raw length includes rankOnly ordering rows and DISABLED
  // tournament-cycle rows (Part B), neither of which the sweep polls —
  // the slot math below is the real cap; this is a runaway guard.
  expect(CATALOGUE_SEED.length).toBeLessThan(200);
  const pollable = CATALOGUE_SEED.filter((e) => e.enabled && e.pollPath !== '');
  expect(pollable.length).toBeLessThan(150);
  // 250 slots minus what the sweep actually POLLS leaves ≥182 for
  // device paths — rankOnly rows never become sweep paths, and
  // DISABLED tournament-cycle rows (Part B, ruling 7) sit in the
  // allowlist without consuming a slot until flipped. Was ≥190, then
  // ≥188 (the NHL/MLB league-freshness rows, Stage 6 addendum); six
  // more slots were spent DELIBERATELY on the Round 3 Phase B ruling-7
  // majors (MLS, NWSL, WSL, URC, IIHF Worlds, Rugby World Cup — the
  // three staged rows there cost nothing until flipped) — any further
  // seed growth trips this gate again.
  const polled = ROUTES.filter((e) => e.enabled);
  expect(250 - polled.length).toBeGreaterThanOrEqual(182);
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
