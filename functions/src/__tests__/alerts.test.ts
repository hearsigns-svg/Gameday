// The alert rules. Few, loud, and never paging on an honest off-season.

import {
  BORN_DEAD_HOURS,
  BORN_DEAD_MIN_RUNS,
  COVERAGE_LAG_HOURS,
  evaluateAlerts,
  evaluateCoverageLagAlerts,
  evaluateQuotaAlerts,
  QUOTA_RUNWAY_DAYS,
  NO_SUCCESS_HOURS,
  YIELD_DIED_HOURS,
} from '../alerts';
import { CoverageRow } from '../coverage';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const row = (over: Partial<CoverageRow> = {}): CoverageRow => ({
  source: 'tsdb',
  competitionId: 'tsdb-league-4445',
  sport: 'boxing',
  storedFutureDated: 10,
  runsInWindow: 8,
  firstRunAt: hoursAgo(200),
  lastRunAt: hoursAgo(2),
  lastSuccessAt: hoursAgo(2),
  lastNonZeroYieldAt: hoursAgo(2),
  hoursSinceLastRun: 2,
  hoursSinceLastSuccess: 2,
  hoursSinceLastNonZeroYield: 2,
  lastError: null,
  lastReason: null,
  lastSeasonResolved: '2026',
  ...over,
});

const DEMANDED = new Set(['tsdb|tsdb-league-4445']);

test('a healthy slice raises nothing', () => {
  expect(evaluateAlerts([row()], DEMANDED, NOW)).toEqual([]);
});

test('no_success_24h: a day of failure is an incident whatever the cause', () => {
  const alerts = evaluateAlerts(
    [row({ lastSuccessAt: hoursAgo(NO_SUCCESS_HOURS + 1), lastError: 'tsdb http 500' })],
    DEMANDED,
    NOW,
  );
  expect(alerts).toEqual([
    expect.objectContaining({ condition: 'no_success_24h' }),
  ]);
});

test('a never-succeeded demanded slice alerts immediately', () => {
  const alerts = evaluateAlerts(
    [row({ lastSuccessAt: null, lastError: 'dead key' })],
    DEMANDED,
    NOW,
  );
  expect(alerts).toEqual([
    expect.objectContaining({ condition: 'no_success_24h' }),
  ]);
});

test('yield_died: the PBC/athletics shape — clean runs, dead coverage', () => {
  const alerts = evaluateAlerts(
    [row({ lastNonZeroYieldAt: hoursAgo(YIELD_DIED_HOURS + 1) })],
    DEMANDED,
    NOW,
  );
  expect(alerts).toEqual([expect.objectContaining({ condition: 'yield_died' })]);
});

test('an honest off-season NEVER pages — reason no_future_events suppresses yield_died', () => {
  const alerts = evaluateAlerts(
    [
      row({
        lastNonZeroYieldAt: hoursAgo(24 * 30),
        lastReason: 'no_future_events',
      }),
    ],
    DEMANDED,
    NOW,
  );
  expect(alerts).toEqual([]);
});

test('a slice that has never yielded is not yield_died — and while genuinely NEW, nothing fires', () => {
  // "May be new" now has to mean actually new: an OLD never-yielded
  // slice is born_dead (the World Cup hole), so the quiet grace period
  // exists only while the slice is younger than BORN_DEAD_HOURS.
  const alerts = evaluateAlerts(
    [row({ lastNonZeroYieldAt: null, firstRunAt: hoursAgo(24) })],
    DEMANDED,
    NOW,
  );
  expect(alerts).toEqual([]);
});

test('undemanded slices are ignored — retired follows must not page forever', () => {
  const alerts = evaluateAlerts(
    [row({ lastSuccessAt: null })],
    new Set<string>(),
    NOW,
  );
  expect(alerts).toEqual([]);
});

test('a failing slice is one incident, not two', () => {
  const alerts = evaluateAlerts(
    [
      row({
        lastSuccessAt: hoursAgo(48),
        lastNonZeroYieldAt: hoursAgo(200),
      }),
    ],
    DEMANDED,
    NOW,
  );
  expect(alerts).toHaveLength(1);
  expect(alerts[0].condition).toBe('no_success_24h');
});

describe('roster staleness — from the marker doc, never the run window', () => {
  const { evaluateRosterAlerts, EXPECTED_ROSTER_SLICES, ROSTER_STALE_HOURS } =
    jest.requireActual<typeof import('../alerts')>('../alerts');
  const NOW = Date.parse('2026-08-03T00:00:00.000Z');
  const fresh = new Date(NOW - 24 * 3_600_000).toISOString();
  const stale = new Date(NOW - (ROSTER_STALE_HOURS + 1) * 3_600_000).toISOString();

  test('an EMPTY marker pages for every expected slice — the first-deploy totality failure is visible', () => {
    const alerts = evaluateRosterAlerts({}, NOW);
    expect(alerts.map((a) => a.sliceKey).sort()).toEqual(
      [...EXPECTED_ROSTER_SLICES].sort(),
    );
    expect(alerts[0].condition).toBe('roster_stale');
    expect(alerts[0].detail).toMatch(/never refreshed/);
  });

  // Markers cover EVERY expected slice (incl. roster-atp since the
  // Prompt 10c mint) — these tests build them from the list itself so
  // adding a source extends them instead of silently failing them.
  const allFresh = Object.fromEntries(
    EXPECTED_ROSTER_SLICES.map((s) => [s, fresh]),
  );

  test('fresh markers are quiet; one stale slice pages alone', () => {
    const marker = { ...allFresh, 'ibf|roster-ibf': stale };
    const alerts = evaluateRosterAlerts(marker, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sliceKey).toBe('ibf|roster-ibf');
    expect(alerts[0].detail).toContain(stale);
  });

  test('a week-old refresh is inside the 8-day threshold', () => {
    const weekOld = new Date(NOW - 7 * 24 * 3_600_000).toISOString();
    expect(
      evaluateRosterAlerts(
        Object.fromEntries(EXPECTED_ROSTER_SLICES.map((s) => [s, weekOld])),
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('born_dead — the hole the World Cup fell through', () => {
  // The exact production shape of fdorg-comp-WC on 2026-08-17: a slice
  // created two weeks after its tournament ended — every run succeeds,
  // reason says no_future_events, and nothing has ever yielded.
  const wcShape = () =>
    row({
      lastNonZeroYieldAt: null,
      hoursSinceLastNonZeroYield: null,
      runsInWindow: 14,
      firstRunAt: hoursAgo(BORN_DEAD_HOURS + 24),
      lastReason: 'no_future_events',
    });

  test('ATTACK: fires DESPITE the honest-empty reason — forever-empty is the pathology', () => {
    const alerts = evaluateAlerts([wcShape()], DEMANDED, NOW);
    expect(alerts).toEqual([expect.objectContaining({ condition: 'born_dead' })]);
  });

  test('a slice that ever yielded is exempt — wind-downs stay with yield_died rules', () => {
    const woundDown = row({
      lastNonZeroYieldAt: hoursAgo(YIELD_DIED_HOURS + 500),
      lastReason: 'no_future_events', // honest season end
      firstRunAt: hoursAgo(1000),
      runsInWindow: 50,
    });
    expect(evaluateAlerts([woundDown], DEMANDED, NOW)).toEqual([]);
  });

  test('too young or too few runs stays quiet — enabling a path is not an incident', () => {
    const young = row({
      lastNonZeroYieldAt: null,
      hoursSinceLastNonZeroYield: null,
      firstRunAt: hoursAgo(24),
      runsInWindow: 14,
    });
    const sparse = row({
      lastNonZeroYieldAt: null,
      hoursSinceLastNonZeroYield: null,
      firstRunAt: hoursAgo(BORN_DEAD_HOURS + 24),
      runsInWindow: BORN_DEAD_MIN_RUNS - 1,
    });
    expect(evaluateAlerts([young, sparse], DEMANDED, NOW)).toEqual([]);
  });

  test('a slice that cannot even succeed pages as no_success, once, not twice', () => {
    const broken = row({
      lastSuccessAt: null,
      lastError: 'dead key',
      lastNonZeroYieldAt: null,
      hoursSinceLastNonZeroYield: null,
      firstRunAt: hoursAgo(BORN_DEAD_HOURS + 24),
      runsInWindow: 14,
    });
    const alerts = evaluateAlerts([broken], DEMANDED, NOW);
    expect(alerts).toEqual([
      expect.objectContaining({ condition: 'no_success_24h' }),
    ]);
  });

  test('undemanded slices never page — appearance funnels stay exempt', () => {
    expect(evaluateAlerts([wcShape()], new Set<string>(), NOW)).toEqual([]);
  });
});

// coverage_lag (Round 4): green runs, stale sweep-side stamp — the
// divergence that ran silent for three days on the boxing-cards slice.
describe('coverage_lag', () => {
  const PATH_KEY = 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing&durationHours=3';
  const BY_SLICE = new Map([['tsdb|tsdb-league-4445', PATH_KEY]]);

  test('a green slice whose coverage stamp is fresh raises nothing', () => {
    expect(
      evaluateCoverageLagAlerts([row()], DEMANDED, BY_SLICE, { [PATH_KEY]: hoursAgo(3) }, NOW),
    ).toEqual([]);
  });

  test('a green slice whose stamp aged past the threshold pages, naming the divergence', () => {
    const alerts = evaluateCoverageLagAlerts(
      [row()],
      DEMANDED,
      BY_SLICE,
      { [PATH_KEY]: hoursAgo(COVERAGE_LAG_HOURS + 1) },
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].condition).toBe('coverage_lag');
    expect(alerts[0].detail).toContain('outrunning');
  });

  test('a green slice with NO stamp at all pages too (the PBC shape)', () => {
    const alerts = evaluateCoverageLagAlerts([row()], DEMANDED, BY_SLICE, {}, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toContain('never answered');
  });

  test('a FAILING slice is no_success_24h business, not coverage_lag — one incident, not two', () => {
    const failing = row({ lastSuccessAt: hoursAgo(30), lastError: 'boom' });
    expect(evaluateCoverageLagAlerts([failing], DEMANDED, BY_SLICE, {}, NOW)).toEqual([]);
  });

  test('undemanded slices and slices without a mapped path are ignored', () => {
    expect(evaluateCoverageLagAlerts([row()], new Set(), BY_SLICE, {}, NOW)).toEqual([]);
    expect(evaluateCoverageLagAlerts([row()], DEMANDED, new Map(), {}, NOW)).toEqual([]);
  });
});

// quota_low (Round 4 item 6): predicted exhaustion from the vendor's own
// headers, paged while there is still runway to act.
describe('quota_low', () => {
  const SLICE = 'boxingdata|boxingdata-cards';
  test('plenty of runway raises nothing; no marker raises nothing', () => {
    expect(evaluateQuotaAlerts(SLICE, { remaining: 60, callsThisRun: 9 })).toEqual([]);
    expect(evaluateQuotaAlerts(SLICE, null)).toEqual([]);
    expect(evaluateQuotaAlerts(SLICE, { remaining: null })).toEqual([]);
  });
  test('under the runway threshold it pages and names the numbers', () => {
    const a = evaluateQuotaAlerts(SLICE, {
      remaining: 9 * QUOTA_RUNWAY_DAYS - 1,
      limit: 100,
      callsThisRun: 9,
      resetAt: '2026-09-29T00:00:00.000Z',
    });
    expect(a).toHaveLength(1);
    expect(a[0].condition).toBe('quota_low');
    expect(a[0].detail).toContain('of 100');
    expect(a[0].detail).toContain('resets 2026-09-29');
  });
  test('exactly at the threshold is still fine — the rule is strict-below', () => {
    expect(evaluateQuotaAlerts(SLICE, { remaining: 9 * QUOTA_RUNWAY_DAYS, callsThisRun: 9 })).toEqual([]);
  });
});

describe('appearance-only slices are judged by their appearance sibling (Round 4 item 7)', () => {
  // pollAtpVendor publishes zero fixtures by design: on its own row it
  // never yields, so born_dead would fire a week after deploy and
  // yield_died could never see a live slam publishing nothing — the
  // sheet slice's exact blind spot while its Apps Script lay dead.
  const VENDOR = 'tennisapi1|tennis-atp-vendor';
  const demanded = new Set([VENDOR]);
  const vendor = (over: Partial<CoverageRow> = {}) =>
    row({
      source: 'tennisapi1',
      competitionId: 'tennis-atp-vendor',
      sport: 'tennis',
      storedFutureDated: 0,
      runsInWindow: 40,
      firstRunAt: hoursAgo(BORN_DEAD_HOURS + 100),
      lastNonZeroYieldAt: null, // never — by design
      hoursSinceLastNonZeroYield: null,
      ...over,
    });
  const sibling = (over: Partial<CoverageRow> = {}) =>
    row({
      source: 'tennisapi1',
      competitionId: 'tennis-atp-appearances',
      sport: 'tennis',
      ...over,
    });

  test('a live slam whose appearances yielded recently is healthy, own-row zero yield notwithstanding', () => {
    expect(evaluateAlerts([vendor(), sibling({ lastNonZeroYieldAt: hoursAgo(2) })], demanded, NOW)).toEqual([]);
  });

  test('a live window with no appearance yield for 72h pages yield_died on the VENDOR slice', () => {
    const alerts = evaluateAlerts(
      [vendor({ lastReason: null }), sibling({ lastNonZeroYieldAt: hoursAgo(YIELD_DIED_HOURS + 5) })],
      demanded,
      NOW,
    );
    expect(alerts).toEqual([expect.objectContaining({ sliceKey: VENDOR, condition: 'yield_died' })]);
  });

  test('between tournaments the parent says no_future_events, and nothing pages', () => {
    const quiet = [
      vendor({ lastReason: 'no_future_events' }),
      sibling({ lastNonZeroYieldAt: hoursAgo(24 * 30) }),
    ];
    expect(evaluateAlerts(quiet, demanded, NOW)).toEqual([]);
  });

  test('never a single appearance while LIVE for a week is born_dead; while idle it is not', () => {
    expect(evaluateAlerts([vendor({ lastReason: null })], demanded, NOW)).toEqual([
      expect.objectContaining({ sliceKey: VENDOR, condition: 'born_dead' }),
    ]);
    expect(evaluateAlerts([vendor({ lastReason: 'no_future_events' })], demanded, NOW)).toEqual([]);
  });

  test('liveness stays the parent’s own: a day of failures pages no_success_24h, once', () => {
    const dead = vendor({ lastSuccessAt: hoursAgo(NO_SUCCESS_HOURS + 1), lastError: 'tennisapi1 http 429' });
    expect(evaluateAlerts([dead, sibling({ lastNonZeroYieldAt: hoursAgo(200) })], demanded, NOW)).toEqual([
      expect.objectContaining({ sliceKey: VENDOR, condition: 'no_success_24h' }),
    ]);
  });

  test('an ordinary slice is untouched by the rule', () => {
    expect(evaluateAlerts([row()], DEMANDED, NOW)).toEqual([]);
  });
});
