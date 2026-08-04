import { Fixture } from '../../../fixtures/domain/fixture';
import { DEFAULT_PREFS } from '../prefs';
import {
  desiredEventFor,
  horizonStartFrom,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';

// Fixtures in these tests are 2023-dated; a 2020 horizon keeps them in
// scope so each test still exercises the behaviour it names.
const PAST_HORIZON = '2020-01-01T00:00:00.000Z';
const LIV = 'apisports-team-40';
const PL = 'apisports-league-39';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'apisports-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: PL,
    title: 'Liverpool v Everton',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    followKeys: [LIV, 'apisports-team-45', PL],
    startUtc: '2023-10-21T11:30:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2023-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function entryFor(f: Fixture): LedgerEntry {
  const desired = desiredEventFor(f, DEFAULT_PREFS);
  if (!desired) throw new Error('fixture has no desired event');
  return {
    eventId: `evt-${f.id}`,
    calendarId: 'cal-1',
    startUtc: desired.startUtc,
    endUtc: desired.endUtc,
    title: desired.title,
    allDay: desired.allDay,
    // The engine records the reminder it applied; a ledger entry that
    // does not is UNKNOWN and replans as a mismatch (syncPlan.ts).
    reminderMinutes: desired.reminderMinutes,
  };
}

function applied(ledger: Ledger, ops: SyncOp[]): Ledger {
  const next: Ledger = { ...ledger };
  for (const op of ops) {
    if (op.op === 'create' || op.op === 'update') {
      next[op.fixture.id] = {
        eventId: `evt-${op.fixture.id}`,
        calendarId: 'cal-1',
        startUtc: op.desired.startUtc,
        endUtc: op.desired.endUtc,
        title: op.desired.title,
        allDay: op.desired.allDay,
        reminderMinutes: op.desired.reminderMinutes,
      };
    } else {
      delete next[op.fixtureId];
    }
  }
  return next;
}

describe('desiredEventFor', () => {
  test('scheduled → timed event with 2h duration', () => {
    const d = desiredEventFor(fixture(), DEFAULT_PREFS);
    expect(d).toEqual({
      title: 'Liverpool v Everton',
      startUtc: '2023-10-21T11:30:00.000Z',
      endUtc: '2023-10-21T13:30:00.000Z',
      allDay: false,
      reminderMinutes: DEFAULT_PREFS.reminderMinutes,
    });
  });

  test('tbd → all-day placeholder on the fixture day', () => {
    const d = desiredEventFor(fixture({ status: 'tbd' }), DEFAULT_PREFS);
    expect(d).toEqual({
      title: 'Liverpool v Everton — time TBC',
      startUtc: '2023-10-21T00:00:00.000Z',
      endUtc: '2023-10-22T00:00:00.000Z',
      allDay: true,
      reminderMinutes: null,
    });
  });

  test('postponed → all-day placeholder on the original day', () => {
    const d = desiredEventFor(fixture({ status: 'postponed' }), DEFAULT_PREFS);
    expect(d?.title).toBe('Liverpool v Everton — postponed');
    expect(d?.allDay).toBe(true);
  });

  test('cancelled → nothing', () => {
    expect(
      desiredEventFor(fixture({ status: 'cancelled' }), DEFAULT_PREFS),
    ).toBeNull();
  });
});

describe('planSync', () => {
  test('fresh follow creates every wanted fixture', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2', status: 'tbd' })];
    const ops = planSync(fixtures, {}, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'create')).toBe(true);
  });

  test('competition follow works without a team follow', () => {
    const ops = planSync([fixture()], {}, [PL], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(1);
  });

  test('idempotent: re-planning a synced state is a no-op', () => {
    const fixtures = [
      fixture(),
      fixture({ id: 'apisports-2', status: 'tbd' }),
      fixture({ id: 'apisports-3', status: 'postponed' }),
    ];
    const ledger = applied({}, planSync(fixtures, {}, [LIV], DEFAULT_PREFS, PAST_HORIZON));
    expect(planSync(fixtures, ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON)).toHaveLength(0);
  });

  test('scheduled → postponed: timed event becomes placeholder (update)', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    const postponed = fixture({ status: 'postponed' });
    const ops = planSync([postponed], ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    if (ops[0].op === 'update') {
      expect(ops[0].desired.allDay).toBe(true);
      expect(ops[0].desired.title).toBe('Liverpool v Everton — postponed');
    }
  });

  test('postponed → rescheduled: placeholder sharpens to new timed slot', () => {
    const postponed = fixture({ status: 'postponed' });
    const ledger: Ledger = { [postponed.id]: entryFor(postponed) };
    const rearranged = fixture({
      status: 'scheduled',
      startUtc: '2023-12-20T20:00:00.000Z',
    });
    const ops = planSync([rearranged], ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    if (ops[0].op === 'update') {
      expect(ops[0].desired).toEqual({
        title: 'Liverpool v Everton',
        startUtc: '2023-12-20T20:00:00.000Z',
        endUtc: '2023-12-20T22:00:00.000Z',
        allDay: false,
        reminderMinutes: DEFAULT_PREFS.reminderMinutes,
      });
    }
  });

  test('tbd → scheduled sharpening is a single update', () => {
    const tbd = fixture({ status: 'tbd' });
    const ledger: Ledger = { [tbd.id]: entryFor(tbd) };
    const ops = planSync([fixture()], ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });

  test('scheduled → cancelled deletes the event', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    const ops = planSync([fixture({ status: 'cancelled' })], ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toEqual([
      { op: 'delete', fixtureId: f.id, entry: ledger[f.id] },
    ]);
  });

  test("event style 'all-day' converts scheduled fixtures and flips kinds", () => {
    const prefs = { ...DEFAULT_PREFS, eventStyle: 'all-day' as const };
    const d = desiredEventFor(fixture(), prefs);
    expect(d?.allDay).toBe(true);
    expect(d?.title).toBe('Liverpool v Everton');
    // Switching the pref over an existing timed ledger is a kind-flip
    // update for every scheduled fixture.
    const ledgerTimed: Ledger = { 'apisports-1': entryFor(fixture()) };
    const ops = planSync([fixture()], ledgerTimed, [LIV], prefs, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });

  test('race-only preference drops support sessions, keeps the race', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'race-only' as const };
    const race = fixture({
      id: 'f1-2026-r1-race',
      sessionKind: 'race',
      title: 'Australian Grand Prix — Race',
      followKeys: ['f1-series-1'],
    });
    const practice = fixture({
      id: 'f1-2026-r1-fp1',
      sessionKind: 'support',
      title: 'Australian Grand Prix — Practice 1',
      followKeys: ['f1-series-1'],
    });
    const ops = planSync([race, practice], {}, ['f1-series-1'], prefs, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    if (ops[0].op === 'create') {
      expect(ops[0].fixture.id).toBe('f1-2026-r1-race');
    }
    // Switching to race-only over a full ledger deletes the support
    // events. Explicit 'all' here: the DEFAULT is race-only (ten-rules
    // conservative default), and this test is about the transition.
    const full = applied({}, planSync([race, practice], {}, ['f1-series-1'], { ...DEFAULT_PREFS, seriesSessions: 'all' }, PAST_HORIZON));
    const cleanup = planSync([race, practice], full, ['f1-series-1'], prefs, PAST_HORIZON);
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].op).toBe('delete');
  });

  test('per-fixture duration drives the timed event end', () => {
    const d = desiredEventFor(fixture({ durationHours: 3 }), DEFAULT_PREFS);
    expect(d?.endUtc).toBe('2023-10-21T14:30:00.000Z');
  });

  test('a duration-ONLY change is an update — endUtc is part of the entry compare', () => {
    // Same start, same title, same kind, longer event. Before Prompt 5
    // this produced no op and the calendar kept the stale end forever —
    // which would also have swallowed a confirmed appearance slot landing
    // at the same instant as its provisional window.
    const before = fixture();
    const after = fixture({ durationHours: 3 });
    const ledger = { [before.id]: entryFor(before) };
    const ops = planSync([after], ledger, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
    expect(planSync([after], applied(ledger, ops), [LIV], DEFAULT_PREFS, PAST_HORIZON)).toHaveLength(0);
  });

  test("the all-day pref spans a multi-day TIMED fixture to its real final day", () => {
    // 96h from 11:30 runs into a fifth calendar day; a banner counted
    // in day-multiples from midnight stopped a day short.
    const d = desiredEventFor(
      fixture({ durationHours: 96 }),
      { ...DEFAULT_PREFS, eventStyle: 'all-day' },
    );
    expect(d).toEqual({
      title: 'Liverpool v Everton',
      startUtc: '2023-10-21T00:00:00.000Z',
      endUtc: '2023-10-26T00:00:00.000Z',
      allDay: true,
      reminderMinutes: null,
    });
  });

  test('a multi-day date_only fixture is a full-width banner without the TBC suffix', () => {
    const d = desiredEventFor(
      fixture({
        timePrecision: 'date_only',
        startUtc: '2023-07-01T00:00:00.000Z',
        durationHours: 96,
        title: 'Surrey v Yorkshire',
      }),
      DEFAULT_PREFS,
    );
    expect(d).toEqual({
      title: 'Surrey v Yorkshire',
      startUtc: '2023-07-01T00:00:00.000Z',
      endUtc: '2023-07-05T00:00:00.000Z',
      allDay: true,
      reminderMinutes: null,
    });
  });

  test('pre-M2 ledger entries (no allDay field) stay idempotent', () => {
    const f = fixture();
    const legacy: LedgerEntry = {
      eventId: 'evt-apisports-1',
      calendarId: 'cal-1',
      startUtc: '2023-10-21T11:30:00.000Z',
      endUtc: '2023-10-21T13:30:00.000Z',
      title: 'Liverpool v Everton',
      // no allDay key — written by the M1 engine
      // (reminderMinutes IS present: the engine stamps every legacy
      // entry with the assumption before planning, so an entry reaching
      // the planner without one is the reinstall case below, not this.)
      reminderMinutes: DEFAULT_PREFS.reminderMinutes,
    };
    expect(
      planSync([f], { [f.id]: legacy }, [LIV], DEFAULT_PREFS, PAST_HORIZON),
    ).toHaveLength(0);
  });

  test('unfollowing deletes everything ledgered', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2' })];
    const ledger = applied({}, planSync(fixtures, {}, [LIV], DEFAULT_PREFS, PAST_HORIZON));
    const ops = planSync(fixtures, ledger, [], DEFAULT_PREFS, PAST_HORIZON);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'delete')).toBe(true);
  });

  test('killed mid-sync: partial apply then re-plan converges', () => {
    const fixtures = [
      fixture(),
      fixture({ id: 'apisports-2', status: 'tbd' }),
      fixture({ id: 'apisports-3' }),
    ];
    const ops = planSync(fixtures, {}, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    const partial = applied({}, ops.slice(0, 1));
    const rerun = planSync(fixtures, partial, [LIV], DEFAULT_PREFS, PAST_HORIZON);
    expect(rerun).toHaveLength(2);
    const final = applied(partial, rerun);
    expect(planSync(fixtures, final, [LIV], DEFAULT_PREFS, PAST_HORIZON)).toHaveLength(0);
  });
});

describe('sync horizon — the calendar is about upcoming games', () => {
  const HORIZON = '2026-07-27T00:00:00.000Z';
  const past = fixture({ id: 'past-1', startUtc: '2026-06-01T15:00:00.000Z' });
  const future = fixture({ id: 'future-1', startUtc: '2026-09-01T15:00:00.000Z' });

  test('a finished season adds nothing to the calendar', () => {
    const wholeSeason = Array.from({ length: 82 }, (_, i) =>
      fixture({ id: `nba-${i}`, startUtc: '2026-03-01T20:00:00.000Z' }),
    );
    expect(planSync(wholeSeason, {}, [LIV], DEFAULT_PREFS, HORIZON)).toHaveLength(0);
  });

  test('upcoming fixtures are still created', () => {
    const ops = planSync([past, future], {}, [LIV], DEFAULT_PREFS, HORIZON);
    expect(ops).toHaveLength(1);
    if (ops[0].op === 'create') expect(ops[0].fixture.id).toBe('future-1');
  });

  test('events already in the calendar are NOT deleted as they age', () => {
    // Erasing a user's history would be worse than leaving it.
    const ledger: Ledger = { 'past-1': entryFor(past) };
    expect(planSync([past], ledger, [LIV], DEFAULT_PREFS, HORIZON)).toHaveLength(0);
  });

  test('an aged, ledgered fixture is FROZEN, not corrected', () => {
    // SUPERSEDED 2026-07-31 by the owner's past-fixture rule. This test
    // previously asserted that a finished fixture still tracked upstream
    // corrections. It no longer does: a fixture that has finished gets no
    // ops of any kind, because the event in the user's calendar is now a
    // record of something that happened rather than a promise about
    // something that will. See domain/horizon.ts.
    const ledger: Ledger = { 'past-1': entryFor(past) };
    const moved = fixture({ id: 'past-1', startUtc: '2026-06-01T17:00:00.000Z' });
    expect(planSync([moved], ledger, [LIV], DEFAULT_PREFS, HORIZON)).toEqual([]);
  });

  test('lookback keeps a match that has already kicked off', () => {
    const nowMs = Date.parse('2026-07-27T15:00:00.000Z');
    const inPlay = fixture({ id: 'live-1', startUtc: '2026-07-27T13:00:00.000Z' });
    const ops = planSync([inPlay], {}, [LIV], DEFAULT_PREFS, horizonStartFrom(nowMs));
    expect(ops).toHaveLength(1);
  });
});

// ─── Bounded passes (Stage 1b item 2, reworked in 1c item 5) ─────────
//
// Measured 2026-07-31 against a DEVICE-LOCAL calendar: iOS ~150 ops/sec,
// Android ~15. An order of magnitude apart, and neither is a cloud-backed
// target — which is what calendarTarget.ts prefers for real users. So the
// pass is bounded by TIME, not by a count tuned on one platform.

import {
  orderOps,
  passBudgetMs,
  PASS_BUDGET_FRACTION,
  shouldStopPass,
} from '../syncPlan';

const createOp = (id: string): SyncOp => ({
  op: 'create',
  fixture: fixture({ id }),
  desired: {
    title: 't',
    startUtc: '2026-12-25T15:00:00.000Z',
    endUtc: '2026-12-25T17:00:00.000Z',
    allDay: false,
    reminderMinutes: 60,
  },
});
const deleteOp = (id: string): SyncOp => ({
  op: 'delete',
  fixtureId: id,
  entry: {
    eventId: `ev-${id}`,
    calendarId: 'c',
    startUtc: '2026-12-25T15:00:00.000Z',
    endUtc: '2026-12-25T17:00:00.000Z',
    title: 't',
  },
});
const updateOp = (id: string): SyncOp => ({
  op: 'update',
  fixture: fixture({ id }),
  desired: {
    title: 't2',
    startUtc: '2026-12-25T15:00:00.000Z',
    endUtc: '2026-12-25T17:00:00.000Z',
    allDay: false,
    reminderMinutes: 60,
  },
  entry: {
    eventId: `ev-${id}`,
    calendarId: 'c',
    startUtc: '2026-12-25T15:00:00.000Z',
    endUtc: '2026-12-25T17:00:00.000Z',
    title: 't',
  },
});

describe('pass budget', () => {
  test('is a fraction of the stale-run window, leaving room either side', () => {
    // STALE_RUN_MS is 180s in the engine. The loop is bracketed by a fetch,
    // a plan, a recovery scan and a prune pass, none of which are free.
    expect(PASS_BUDGET_FRACTION).toBe(0.6);
    expect(passBudgetMs(180_000)).toBe(108_000);
    expect(passBudgetMs(180_000)).toBeLessThan(180_000);
  });
});

describe('orderOps', () => {
  test('corrections come before creates', () => {
    // A capped pass that deferred a delete would leave a cancelled fixture
    // sitting in the user's calendar until some later pass got to it.
    const ordered = orderOps([
      createOp('c1'),
      deleteOp('d1'),
      createOp('c2'),
      updateOp('u1'),
    ]);
    expect(ordered.map((o) => o.op)).toEqual([
      'delete',
      'update',
      'create',
      'create',
    ]);
  });

  test('every op survives the reordering', () => {
    const ops = [createOp('a'), deleteOp('b'), updateOp('c')];
    expect(orderOps(ops)).toHaveLength(3);
    expect(new Set(orderOps(ops))).toEqual(new Set(ops));
  });

  test('an empty plan orders to an empty plan', () => {
    expect(orderOps([])).toEqual([]);
  });
});

describe('shouldStopPass', () => {
  test('runs on while inside the budget', () => {
    expect(shouldStopPass(500, 10_000, 108_000)).toBe(false);
  });

  test('stops once the budget is spent', () => {
    expect(shouldStopPass(500, 108_000, 108_000)).toBe(true);
    expect(shouldStopPass(500, 120_000, 108_000)).toBe(true);
  });

  test('NEVER stops before applying anything — progress is guaranteed', () => {
    // Without this a platform slow enough to blow the budget on its first
    // write would apply zero ops per pass and re-queue forever.
    expect(shouldStopPass(0, 999_999, 108_000)).toBe(false);
  });

  test('the slow platform still drains a large first sync in bounded passes', () => {
    // 5,160 creates at the measured Android rate of 15 ops/sec.
    const OPS_PER_SEC = 15;
    let remaining = 5160;
    let passes = 0;
    while (remaining > 0) {
      let applied = 0;
      while (
        applied < remaining &&
        !shouldStopPass(applied, (applied / OPS_PER_SEC) * 1000, 108_000)
      ) {
        applied++;
      }
      expect(applied).toBeGreaterThan(0);
      remaining -= applied;
      passes++;
      expect(passes).toBeLessThan(20); // must terminate
    }
    // ~1,620 ops per pass at 15/sec → four passes.
    expect(passes).toBe(4);
  });

  test('a fast platform finishes the same work in one pass', () => {
    const OPS_PER_SEC = 150;
    let applied = 0;
    while (
      applied < 5160 &&
      !shouldStopPass(applied, (applied / OPS_PER_SEC) * 1000, 108_000)
    ) {
      applied++;
    }
    expect(applied).toBe(5160);
  });
});

// ─── Lock liveness (Stage 1d item 4 / FINDINGS F15) ───────────────────

import { isRunAbandoned } from '../syncPlan';

describe('isRunAbandoned', () => {
  const STALE = 180_000;

  test('a pass that is slow but beating is NOT abandoned', () => {
    // The F15 case: a 227s pass on Android, alive throughout. Under the
    // old start-time rule this was taken over at 180s and a second run
    // started on top of it.
    const started = 0;
    const nowAfter227s = 227_000;
    const lastBeat = 226_000; // still writing, beat one second ago
    expect(isRunAbandoned(lastBeat, nowAfter227s, STALE)).toBe(false);
    // …whereas the start time alone would have condemned it.
    expect(nowAfter227s - started).toBeGreaterThan(STALE);
  });

  test('a run that stopped beating IS abandoned', () => {
    expect(isRunAbandoned(0, 180_000, STALE)).toBe(true);
    expect(isRunAbandoned(0, 200_000, STALE)).toBe(true);
  });

  test('the boundary is inclusive, so a stuck run is always reclaimable', () => {
    expect(isRunAbandoned(0, 179_999, STALE)).toBe(false);
    expect(isRunAbandoned(0, 180_000, STALE)).toBe(true);
  });

  test('a single very slow op does not orphan its own run', () => {
    // One native write blocked ~119s in the measured case. As long as the
    // beat either side of it is recorded, the run holds its lock.
    const beatBeforeSlowOp = 10_000;
    const duringSlowOp = 10_000 + 119_000;
    expect(isRunAbandoned(beatBeforeSlowOp, duringSlowOp, STALE)).toBe(false);
  });
});

describe('per-follow seriesSessions override (Prompt 11)', () => {
  const support = fixture({
    id: 'f1-2026-albert_park-fp1',
    sport: 'f1',
    competitionId: 'f1-series-1',
    followKeys: ['f1-series-1', 'athlete_000200'],
    sessionKind: 'support',
  });
  const race = fixture({
    id: 'f1-2026-albert_park-race',
    sport: 'f1',
    competitionId: 'f1-series-1',
    followKeys: ['f1-series-1', 'athlete_000200'],
    sessionKind: 'race',
  });

  test('a race-only follow scope drops support sessions even when the global pref says all', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'all' as const };
    const scopes = new Map([['f1-series-1', 'race-only' as const]]);
    expect(desiredEventFor(support, prefs, scopes)).toBeNull();
    expect(desiredEventFor(race, prefs, scopes)).not.toBeNull();
  });

  test('an all-sessions follow scope keeps the weekend under a race-only global pref', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'race-only' as const };
    const scopes = new Map([['f1-series-1', 'all' as const]]);
    expect(desiredEventFor(support, prefs, scopes)).not.toBeNull();
  });

  test('most permissive wins when several matching follows disagree', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'race-only' as const };
    const scopes = new Map<string, 'all' | 'race-only'>([
      ['f1-series-1', 'race-only'],
      ['athlete_000200', 'all'],
    ]);
    expect(desiredEventFor(support, prefs, scopes)).not.toBeNull();
  });

  test('no scope entry for this fixture: the global pref governs, unchanged', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'race-only' as const };
    const scopes = new Map([['some-other-series', 'all' as const]]);
    expect(desiredEventFor(support, prefs, scopes)).toBeNull();
    expect(desiredEventFor(support, prefs)).toBeNull();
  });

  test('planSync threads the override: a scope flip from race-only to all creates the support sessions', () => {
    const prefs = { ...DEFAULT_PREFS, seriesSessions: 'race-only' as const };
    const raceOnly = planSync(
      [support, race],
      {},
      ['f1-series-1'],
      prefs,
      PAST_HORIZON,
      new Set(),
      new Set(),
      undefined,
      new Map([['f1-series-1', 'race-only' as const]]),
    );
    expect(raceOnly.map((o) => o.op === 'create' && o.fixture.id)).toEqual([
      'f1-2026-albert_park-race',
    ]);
    const all = planSync(
      [support, race],
      {},
      ['f1-series-1'],
      prefs,
      PAST_HORIZON,
      new Set(),
      new Set(),
      undefined,
      new Map([['f1-series-1', 'all' as const]]),
    );
    expect(all.filter((o) => o.op === 'create')).toHaveLength(2);
  });
});
