// Coverage report assembly. The report exists to answer "when did this
// source last produce something a user could see" — a different question
// from "did it 200" — so these pin that the two dates diverge correctly.

import {
  buildCoverageReport,
  CoverageRow,
  emptyStoredCoverage,
  sliceKey,
  sourceOfFixtureId,
  StoredCoverage,
} from '../coverage';
import { SourceRun } from '../sourceRuns';
import { Timestamp } from 'firebase-admin/firestore';

const NOW_ISO = '2026-07-31T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

const run = (over: Partial<SourceRun>): SourceRun => ({
  runId: 'r',
  startedAt: NOW_ISO,
  finishedAt: NOW_ISO,
  trigger: 'sweep',
  source: 'tsdb',
  sport: 'basketball',
  competitionId: 'tsdb-league-4387',
  pollPath: 'pollTsdbLeague?leagueId=4387',
  seasonRequested: '2025-2026',
  seasonResolved: '2025-2026',
  seasonsTried: ['2025-2026'],
  httpStatus: 200,
  counts: {
    fetched: 1,
    parsed: 1,
    rejected: 0,
    stored: 1,
    unchanged: 0,
    futureDated: 1,
  },
  error: null,
  zeroYield: false,
  expiresAt: Timestamp.fromMillis(NOW_MS),
  ...over,
});

const rowFor = (report: { rows: CoverageRow[] }, key: string): CoverageRow => {
  const found = report.rows.find(
    (r) => sliceKey(r.source, r.competitionId) === key,
  );
  if (!found) throw new Error(`no row for ${key}`);
  return found;
};

const NO_STORED = emptyStoredCoverage();

// Stored side as the loader builds it: counts keyed by every followKey a
// fixture carries, plus the set of keys that are a fixture's OWN competition.
const storedWith = (
  slices: Array<[string, string | null, number]>,
  competitionKeys: string[],
  futureDocs: number,
): StoredCoverage => ({
  bySlice: new Map(
    slices.map(([key, sport, futureDated]) => [key, { sport, futureDated }]),
  ),
  competitionKeys: new Set(competitionKeys),
  futureDocs,
});

describe('source derivation', () => {
  test('matches the provider prefix convention used by identity.ts', () => {
    expect(sourceOfFixtureId('tsdb-2541770')).toBe('tsdb');
    expect(sourceOfFixtureId('fdorg-560746')).toBe('fdorg');
    expect(sourceOfFixtureId('f1-2026-r18-fp3')).toBe('f1');
    expect(sourceOfFixtureId('nhl-2026020001')).toBe('nhl');
  });
});

describe('last success vs last non-zero yield', () => {
  test('a source that 200s forever but yields nothing shows a stale yield date', () => {
    // The NBA case: the poller runs cleanly every six hours against a
    // finished season. "Last success" is minutes ago; the last time it
    // put a future fixture in front of anyone is weeks ago.
    const yielded = (startedAt: string, futureDated: number) =>
      run({
        startedAt,
        zeroYield: false,
        counts: {
          fetched: 1380,
          parsed: 1380,
          rejected: 0,
          stored: 1380,
          unchanged: 0,
          futureDated,
        },
      });
    const runs = [
      // TWO yielding runs, so "most recent that yielded" is distinguishable
      // from "first that yielded" — with one, .reverse().find() and .find()
      // are the same function.
      yielded('2026-06-01T00:00:00.000Z', 9),
      yielded('2026-07-01T00:00:00.000Z', 4),
      run({
        startedAt: '2026-07-31T10:20:00.000Z',
        zeroYield: true,
        counts: {
          fetched: 1380,
          parsed: 1380,
          rejected: 0,
          stored: 0,
          unchanged: 1380,
          futureDated: 0,
        },
      }),
    ];
    const report = buildCoverageReport(runs, NO_STORED, NOW_MS);
    const row = rowFor(report, 'tsdb|tsdb-league-4387');
    expect(row.lastRunAt).toBe('2026-07-31T10:20:00.000Z');
    expect(row.lastSuccessAt).toBe('2026-07-31T10:20:00.000Z');
    expect(row.lastNonZeroYieldAt).toBe('2026-07-01T00:00:00.000Z');
    // 2026-07-31T10:20Z → 2026-07-31T12:00Z is 1h40m.
    expect(row.hoursSinceLastRun).toBeCloseTo(1.7, 1);
    expect(row.hoursSinceLastSuccess).toBeCloseTo(1.7, 1);
    // 2026-07-01T00:00Z → 2026-07-31T12:00Z is 30.5 days.
    expect(row.hoursSinceLastNonZeroYield).toBeCloseTo(732, 0);
    expect(row.lastError).toBeNull();
    expect(row.runsInWindow).toBe(3);
    expect(report.totals.zeroYield).toBe(0); // it HAS yielded, just not lately
  });

  test('a source that has never yielded is counted and surfaced', () => {
    const runs = [run({ zeroYield: true, competitionId: 'tsdb-league-4482' })];
    const report = buildCoverageReport(runs, NO_STORED, NOW_MS);
    const row = rowFor(report, 'tsdb|tsdb-league-4482');
    expect(row.lastNonZeroYieldAt).toBeNull();
    expect(row.hoursSinceLastNonZeroYield).toBeNull();
    expect(report.totals.zeroYield).toBe(1);
  });

  test('an erroring source reports the error but keeps its older success', () => {
    const runs = [
      run({
        source: 'fdorg',
        competitionId: 'fdorg-comp-CL',
        startedAt: '2026-07-20T00:00:00.000Z',
      }),
      run({
        source: 'fdorg',
        competitionId: 'fdorg-comp-CL',
        startedAt: '2026-07-31T00:00:00.000Z',
        httpStatus: 404,
        error: 'football-data http 404',
        zeroYield: true,
        seasonResolved: null,
      }),
    ];
    const report = buildCoverageReport(runs, NO_STORED, NOW_MS);
    const row = rowFor(report, 'fdorg|fdorg-comp-CL');
    expect(row.lastRunAt).toBe('2026-07-31T00:00:00.000Z');
    expect(row.lastError).toBe('football-data http 404');
    expect(row.lastSuccessAt).toBe('2026-07-20T00:00:00.000Z');
    expect(row.lastSeasonResolved).toBe('2025-2026'); // from the last GOOD run
    expect(report.totals.neverSucceeded).toBe(0);
  });

  test('a source that has only ever errored is counted as never-succeeded', () => {
    const runs = [
      run({
        source: 'apisports',
        competitionId: 'apisports-league-39',
        error: 'api-sports error: account suspended',
        httpStatus: null,
        zeroYield: true,
        seasonResolved: null,
      }),
    ];
    const report = buildCoverageReport(runs, NO_STORED, NOW_MS);
    expect(report.totals.neverSucceeded).toBe(1);
    expect(rowFor(report, 'apisports|apisports-league-39').lastSuccessAt).toBeNull();
  });
});

describe('joining runs to stored fixtures', () => {
  test('a slice with stored fixtures but no runs is reported, not hidden', () => {
    // The County Championship case: 70 docs from a one-off follow poll,
    // then dropped from every sweep by a validator. Nothing would ever
    // have run, so a runs-only report would omit it entirely.
    const stored = storedWith(
      [['tsdb|tsdb-league-4458', 'cricket', 30]],
      ['tsdb|tsdb-league-4458'],
      30,
    );
    const report = buildCoverageReport([], stored, NOW_MS);
    const row = rowFor(report, 'tsdb|tsdb-league-4458');
    expect(row.lastRunAt).toBeNull();
    expect(row.storedFutureDated).toBe(30);
    expect(row.sport).toBe('cricket');
    expect(report.totals.neverRun).toBe(1);
  });

  test('a slice with runs but nothing stored is reported too', () => {
    const report = buildCoverageReport([run({})], NO_STORED, NOW_MS);
    expect(rowFor(report, 'tsdb|tsdb-league-4387').storedFutureDated).toBe(0);
    expect(report.totals.neverRun).toBe(0);
  });

  test('a TEAM poller joins to its fixtures, which name a LEAGUE', () => {
    // The join defect the emulator run caught: runs are keyed by ingest
    // slice (mlb-team-147) and fixtures name their competition
    // (mlb-league-1). Keyed by competitionId alone, the team row read
    // "stored nothing" and the league row read "never polled" — both
    // false. Counting a fixture against every followKey it carries fixes
    // both sides at once.
    const stored = storedWith(
      [
        ['mlb|mlb-team-147', 'baseball', 53],
        ['mlb|mlb-league-1', 'baseball', 53],
      ],
      ['mlb|mlb-league-1'],
      53,
    );
    const runs = [
      run({ source: 'mlb', sport: 'baseball', competitionId: 'mlb-team-147' }),
    ];
    const report = buildCoverageReport(runs, stored, NOW_MS);
    expect(rowFor(report, 'mlb|mlb-team-147').storedFutureDated).toBe(53);
    expect(rowFor(report, 'mlb|mlb-team-147').runsInWindow).toBe(1);
    // The league still gets its own row, and is honestly marked never-run:
    // nothing polls mlb-league-1 as a slice.
    expect(rowFor(report, 'mlb|mlb-league-1').storedFutureDated).toBe(53);
    expect(rowFor(report, 'mlb|mlb-league-1').lastRunAt).toBeNull();
  });

  test('totals count distinct fixtures, never the sum of overlapping rows', () => {
    // 53 fixtures, three slices. Summing the column would report 159.
    const stored = storedWith(
      [
        ['mlb|mlb-team-147', 'baseball', 53],
        ['mlb|mlb-team-111', 'baseball', 53],
        ['mlb|mlb-league-1', 'baseball', 53],
      ],
      ['mlb|mlb-league-1'],
      53,
    );
    const report = buildCoverageReport([], stored, NOW_MS);
    expect(report.totals.storedFutureDated).toBe(53);
    expect(report.totals.rows).toBe(1); // only the competition key seeds a row
  });
});

describe('ordering', () => {
  test('never-yielded first, then longest-since-yield, then emptiest', () => {
    const runs = [
      run({ competitionId: 'healthy', startedAt: '2026-07-31T11:00:00.000Z' }),
      run({
        competitionId: 'stale',
        startedAt: '2026-06-01T00:00:00.000Z',
        zeroYield: false,
      }),
      run({ competitionId: 'never', zeroYield: true }),
    ];
    const report = buildCoverageReport(runs, NO_STORED, NOW_MS);
    expect(report.rows.map((r) => r.competitionId)).toEqual([
      'never',
      'stale',
      'healthy',
    ]);
  });
});

describe('truncation', () => {
  test('is reported rather than silently dropping history', () => {
    expect(buildCoverageReport([], NO_STORED, NOW_MS, true).truncated).toBe(true);
    expect(buildCoverageReport([], NO_STORED, NOW_MS).truncated).toBe(false);
  });
});
