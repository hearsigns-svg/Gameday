import { Fixture } from '../../../fixtures/domain/fixture';
import { DEFAULT_PREFS } from '../prefs';
import {
  desiredEventFor,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';

const LIV = 'apisports-team-40';
const PL = 'apisports-league-39';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'apisports-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: PL,
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
    const ops = planSync(fixtures, {}, [LIV], DEFAULT_PREFS);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'create')).toBe(true);
  });

  test('competition follow works without a team follow', () => {
    const ops = planSync([fixture()], {}, [PL], DEFAULT_PREFS);
    expect(ops).toHaveLength(1);
  });

  test('idempotent: re-planning a synced state is a no-op', () => {
    const fixtures = [
      fixture(),
      fixture({ id: 'apisports-2', status: 'tbd' }),
      fixture({ id: 'apisports-3', status: 'postponed' }),
    ];
    const ledger = applied({}, planSync(fixtures, {}, [LIV], DEFAULT_PREFS));
    expect(planSync(fixtures, ledger, [LIV], DEFAULT_PREFS)).toHaveLength(0);
  });

  test('scheduled → postponed: timed event becomes placeholder (update)', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    const postponed = fixture({ status: 'postponed' });
    const ops = planSync([postponed], ledger, [LIV], DEFAULT_PREFS);
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
    const ops = planSync([rearranged], ledger, [LIV], DEFAULT_PREFS);
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
    const ops = planSync([fixture()], ledger, [LIV], DEFAULT_PREFS);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });

  test('scheduled → cancelled deletes the event', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    const ops = planSync([fixture({ status: 'cancelled' })], ledger, [LIV], DEFAULT_PREFS);
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
    const ops = planSync([fixture()], ledgerTimed, [LIV], prefs);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
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
      planSync([f], { [f.id]: legacy }, [LIV], DEFAULT_PREFS),
    ).toHaveLength(0);
  });

  test('unfollowing deletes everything ledgered', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2' })];
    const ledger = applied({}, planSync(fixtures, {}, [LIV], DEFAULT_PREFS));
    const ops = planSync(fixtures, ledger, [], DEFAULT_PREFS);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'delete')).toBe(true);
  });

  test('killed mid-sync: partial apply then re-plan converges', () => {
    const fixtures = [
      fixture(),
      fixture({ id: 'apisports-2', status: 'tbd' }),
      fixture({ id: 'apisports-3' }),
    ];
    const ops = planSync(fixtures, {}, [LIV], DEFAULT_PREFS);
    const partial = applied({}, ops.slice(0, 1));
    const rerun = planSync(fixtures, partial, [LIV], DEFAULT_PREFS);
    expect(rerun).toHaveLength(2);
    const final = applied(partial, rerun);
    expect(planSync(fixtures, final, [LIV], DEFAULT_PREFS)).toHaveLength(0);
  });
});
