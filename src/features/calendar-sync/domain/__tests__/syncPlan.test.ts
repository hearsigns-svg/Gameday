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
    });
  });

  test('tbd → all-day placeholder on the fixture day', () => {
    const d = desiredEventFor(fixture({ status: 'tbd' }), DEFAULT_PREFS);
    expect(d).toEqual({
      title: 'Liverpool v Everton — time TBC',
      startUtc: '2023-10-21T00:00:00.000Z',
      endUtc: '2023-10-22T00:00:00.000Z',
      allDay: true,
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
    // Switching to race-only over a full ledger deletes the support events.
    const full = applied({}, planSync([race, practice], {}, ['f1-series-1'], DEFAULT_PREFS, PAST_HORIZON));
    const cleanup = planSync([race, practice], full, ['f1-series-1'], prefs, PAST_HORIZON);
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0].op).toBe('delete');
  });

  test('per-fixture duration drives the timed event end', () => {
    const d = desiredEventFor(fixture({ durationHours: 3 }), DEFAULT_PREFS);
    expect(d?.endUtc).toBe('2023-10-21T14:30:00.000Z');
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

  test('an aged, ledgered fixture still tracks corrections', () => {
    const ledger: Ledger = { 'past-1': entryFor(past) };
    const moved = fixture({ id: 'past-1', startUtc: '2026-06-01T17:00:00.000Z' });
    const ops = planSync([moved], ledger, [LIV], DEFAULT_PREFS, HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });

  test('lookback keeps a match that has already kicked off', () => {
    const nowMs = Date.parse('2026-07-27T15:00:00.000Z');
    const inPlay = fixture({ id: 'live-1', startUtc: '2026-07-27T13:00:00.000Z' });
    const ops = planSync([inPlay], {}, [LIV], DEFAULT_PREFS, horizonStartFrom(nowMs));
    expect(ops).toHaveLength(1);
  });
});
