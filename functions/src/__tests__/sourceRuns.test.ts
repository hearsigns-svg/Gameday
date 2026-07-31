// Run-record construction. The point of this collection is that a read
// FAILURE and an empty RESULT can never look alike again, so that is what
// these pin — with literal expectations, not values re-derived through the
// same code under test.

import {
  buildSourceRun,
  countsFrom,
  EMPTY_COUNTS,
  httpStatusFromError,
  isZeroYield,
  RETENTION_DAYS,
  RunContext,
  RunOutcome,
  triggerOf,
} from '../sourceRuns';
import { Fixture } from '../fixture';

const NOW_ISO = '2026-07-31T12:00:00.000Z';
const NOW_MS = Date.parse(NOW_ISO);

const fixture = (id: string, startUtc: string): Fixture => ({
  id,
  sport: 'soccer',
  competition: 'Premier League',
  competitionId: 'fdorg-comp-PL',
  title: 'A v B',
  followKeys: ['fdorg-comp-PL'],
  startUtc,
  venueTz: 'UTC',
  status: 'scheduled',
  updatedAt: NOW_ISO,
});

const ctx: RunContext = {
  trigger: 'sweep',
  source: 'fdorg',
  sport: 'soccer',
  competitionId: 'fdorg-comp-PL',
  pollPath: 'pollFdCompetition?code=PL&season=2026',
  seasonRequested: '2026',
};

const outcome = (over: Partial<RunOutcome> = {}): RunOutcome => ({
  httpStatus: 200,
  seasonResolved: '2026',
  seasonsTried: ['2026'],
  counts: EMPTY_COUNTS,
  error: null,
  ...over,
});

describe('trigger attribution', () => {
  test('only the two known labels are trusted; anything else is manual', () => {
    expect(triggerOf('sweep')).toBe('sweep');
    expect(triggerOf('follow')).toBe('follow');
    expect(triggerOf(undefined)).toBe('manual');
    expect(triggerOf(null)).toBe('manual');
    expect(triggerOf('')).toBe('manual');
    expect(triggerOf('SWEEP')).toBe('manual'); // no case-folding: exact or manual
    expect(triggerOf('sweep ')).toBe('manual');
  });
});

describe('zero yield', () => {
  test('is about future fixtures, NOT about HTTP status', () => {
    // 380 rows fetched, stored, no error — and still useless to a user,
    // because every one of them has already happened. This is the FA Cup
    // case: 873 docs, HTTP 200, zero future.
    const counts = countsFrom(
      { fetched: 873, parsed: 873, rejected: 0, stored: 873, unchanged: 0 },
      [fixture('a', '2026-01-01T15:00:00.000Z')],
      NOW_ISO,
    );
    expect(counts.futureDated).toBe(0);
    expect(isZeroYield(counts)).toBe(true);
    const run = buildSourceRun('r1', ctx, outcome({ counts }), NOW_ISO, NOW_MS);
    expect(run.zeroYield).toBe(true);
    expect(run.error).toBeNull();
    expect(run.httpStatus).toBe(200);
  });

  test('a single future fixture clears it', () => {
    const counts = countsFrom(
      { fetched: 2, parsed: 2, rejected: 0, stored: 1, unchanged: 1 },
      [
        fixture('a', '2026-01-01T15:00:00.000Z'),
        fixture('b', '2026-12-25T15:00:00.000Z'),
      ],
      NOW_ISO,
    );
    expect(counts.futureDated).toBe(1);
    expect(isZeroYield(counts)).toBe(false);
    // …and reaches the record as false. Without this the whole suite only
    // ever asserted zeroYield === true, so `zeroYield: true` hardcoded
    // would have passed.
    const run = buildSourceRun('r6', ctx, outcome({ counts }), NOW_ISO, NOW_MS);
    expect(run.zeroYield).toBe(false);
  });

  test('a fixture starting exactly now still counts as future', () => {
    const counts = countsFrom(
      { fetched: 1, parsed: 1, rejected: 0, stored: 1, unchanged: 0 },
      [fixture('a', NOW_ISO)],
      NOW_ISO,
    );
    expect(counts.futureDated).toBe(1);
  });

  test('an errored run is zero-yield and carries the failure', () => {
    const run = buildSourceRun(
      'r2',
      ctx,
      outcome({
        httpStatus: 404,
        seasonResolved: null,
        counts: EMPTY_COUNTS,
        error: 'Error: football-data http 404',
      }),
      NOW_ISO,
      NOW_MS,
    );
    expect(run.zeroYield).toBe(true);
    expect(run.error).toContain('404');
    expect(run.httpStatus).toBe(404);
    // The pair (error, counts) is what separates the two cases: an empty
    // result has error === null and the same zero counts.
    expect(run.seasonResolved).toBeNull();
  });
});

describe('count identity', () => {
  test('parsed accounts for every row: stored + unchanged + rejected', () => {
    const counts = countsFrom(
      { fetched: 100, parsed: 100, rejected: 0, stored: 40, unchanged: 60 },
      [],
      NOW_ISO,
    );
    expect(counts.stored + counts.unchanged + counts.rejected).toBe(
      counts.parsed,
    );
  });

  test('fetched and parsed are independent — one race weekend, seven sessions', () => {
    // The F1 adapter fans 23 race weekends into 115 session fixtures. A
    // schema that collapsed these would make selector rot (800 rows in,
    // 3 out) indistinguishable from a quiet season.
    const counts = countsFrom(
      { fetched: 23, parsed: 115, rejected: 0, stored: 115, unchanged: 0 },
      [],
      NOW_ISO,
    );
    expect(counts.fetched).toBe(23);
    expect(counts.parsed).toBe(115);
  });
});

describe('retention', () => {
  test('expires 90 days after the run finishes', () => {
    const run = buildSourceRun('r3', ctx, outcome(), NOW_ISO, NOW_MS);
    expect(RETENTION_DAYS).toBe(90);
    // Literal: 2026-07-31 + 90d = 2026-10-29.
    expect(run.expiresAt.toDate().toISOString()).toBe(
      '2026-10-29T12:00:00.000Z',
    );
  });

  test('startedAt is preserved and finishedAt is the write moment', () => {
    const run = buildSourceRun(
      'r4',
      ctx,
      outcome(),
      '2026-07-31T11:59:58.000Z',
      NOW_MS,
    );
    expect(run.startedAt).toBe('2026-07-31T11:59:58.000Z');
    expect(run.finishedAt).toBe(NOW_ISO);
  });
});

describe('http status recovery from adapter errors', () => {
  // Every adapter throws `<provider> http <status>`; the run record keeps
  // the real status instead of flattening everything to "502, see string".
  test.each([
    ['Error: football-data http 404', 404],
    ['Error: thesportsdb http 500', 500],
    ['Error: nhl api-web http 503', 503],
    ['Error: mlb statsapi http 429', 429],
    ['Error: jolpica http 502', 502],
    ['Error: api-sports http 403', 403],
  ])('%s → %i', (message, expected) => {
    expect(httpStatusFromError(new Error(message.replace('Error: ', '')))).toBe(
      expected,
    );
  });

  test('a non-HTTP failure has no status rather than a wrong one', () => {
    expect(httpStatusFromError(new Error('api-sports error: {"plan":"..."}'))).toBeNull();
    expect(httpStatusFromError(new Error('thesportsdb: response missing "events"'))).toBeNull();
    expect(httpStatusFromError(new Error('boom'))).toBeNull();
  });

  test('does not mistake an id or a year for a status', () => {
    expect(httpStatusFromError(new Error('failed for league 4387'))).toBeNull();
    expect(httpStatusFromError(new Error('season 2026 unavailable'))).toBeNull();
  });
});

describe('context is carried verbatim', () => {
  test('slice identity and trigger survive onto the record', () => {
    const run = buildSourceRun('r5', ctx, outcome(), NOW_ISO, NOW_MS);
    expect(run.runId).toBe('r5');
    expect(run.trigger).toBe('sweep');
    expect(run.source).toBe('fdorg');
    expect(run.competitionId).toBe('fdorg-comp-PL');
    expect(run.pollPath).toBe('pollFdCompetition?code=PL&season=2026');
    expect(run.seasonRequested).toBe('2026');
    expect(run.seasonsTried).toEqual(['2026']);
  });
});
