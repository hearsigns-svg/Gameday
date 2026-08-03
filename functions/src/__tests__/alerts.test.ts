// The alert rules. Few, loud, and never paging on an honest off-season.

import { evaluateAlerts, NO_SUCCESS_HOURS, YIELD_DIED_HOURS } from '../alerts';
import { CoverageRow } from '../coverage';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const row = (over: Partial<CoverageRow> = {}): CoverageRow => ({
  source: 'tsdb',
  competitionId: 'tsdb-league-4445',
  sport: 'boxing',
  storedFutureDated: 10,
  runsInWindow: 8,
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

test('a slice that has never yielded is not yield_died — it may be new', () => {
  const alerts = evaluateAlerts(
    [row({ lastNonZeroYieldAt: null })],
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

  test('fresh markers are quiet; one stale slice pages alone', () => {
    const marker = {
      'wta|roster-wta': fresh,
      'f1|roster-f1': fresh,
      'ibf|roster-ibf': stale,
    };
    const alerts = evaluateRosterAlerts(marker, NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sliceKey).toBe('ibf|roster-ibf');
    expect(alerts[0].detail).toContain(stale);
  });

  test('a week-old refresh is inside the 8-day threshold', () => {
    const weekOld = new Date(NOW - 7 * 24 * 3_600_000).toISOString();
    expect(
      evaluateRosterAlerts(
        {
          'wta|roster-wta': weekOld,
          'f1|roster-f1': weekOld,
          'ibf|roster-ibf': weekOld,
        },
        NOW,
      ),
    ).toEqual([]);
  });
});
