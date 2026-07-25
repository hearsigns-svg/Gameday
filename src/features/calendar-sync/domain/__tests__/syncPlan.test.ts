import { Fixture } from '../../../fixtures/domain/fixture';
import {
  eventEndUtc,
  eventTitle,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';

const LIV = 'apisports-team-40';

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'apisports-1',
    sport: 'soccer',
    competition: 'Premier League',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    teamIds: [LIV, 'apisports-team-45'],
    startUtc: '2023-10-21T11:30:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2023-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function entryFor(f: Fixture): LedgerEntry {
  return {
    eventId: `evt-${f.id}`,
    calendarId: 'cal-1',
    startUtc: f.startUtc,
    endUtc: eventEndUtc(f.startUtc),
    title: eventTitle(f),
  };
}

// Apply ops to a ledger the way the sync engine does (entry per op),
// used to prove convergence properties.
function applied(ledger: Ledger, ops: SyncOp[]): Ledger {
  const next: Ledger = { ...ledger };
  for (const op of ops) {
    if (op.op === 'create' || op.op === 'update') {
      next[op.fixture.id] = entryFor(op.fixture);
    } else {
      delete next[op.fixtureId];
    }
  }
  return next;
}

describe('planSync', () => {
  test('fresh follow creates every scheduled fixture', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2' })];
    const ops = planSync(fixtures, {}, [LIV]);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'create')).toBe(true);
  });

  test('idempotent: re-planning a synced state is a no-op', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2' })];
    const ledger = applied({}, planSync(fixtures, {}, [LIV]));
    expect(planSync(fixtures, ledger, [LIV])).toHaveLength(0);
  });

  test('time change produces exactly one update', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    const moved = fixture({ startUtc: '2023-10-21T13:30:00.000Z' });
    const ops = planSync([moved], ledger, [LIV]);
    expect(ops).toEqual([{ op: 'update', fixture: moved, entry: ledger[f.id] }]);
  });

  test('cancelled and postponed fixtures are removed', () => {
    const f = fixture();
    const ledger: Ledger = { [f.id]: entryFor(f) };
    for (const status of ['cancelled', 'postponed'] as const) {
      const ops = planSync([fixture({ status })], ledger, [LIV]);
      expect(ops).toEqual([
        { op: 'delete', fixtureId: f.id, entry: ledger[f.id] },
      ]);
    }
  });

  test('tbd fixtures create no timed event (slice behaviour)', () => {
    expect(planSync([fixture({ status: 'tbd' })], {}, [LIV])).toHaveLength(0);
  });

  test('unfollowing deletes everything ledgered', () => {
    const fixtures = [fixture(), fixture({ id: 'apisports-2' })];
    const ledger = applied({}, planSync(fixtures, {}, [LIV]));
    const ops = planSync(fixtures, ledger, []);
    expect(ops).toHaveLength(2);
    expect(ops.every((o) => o.op === 'delete')).toBe(true);
  });

  test('killed mid-sync: partial apply then re-plan converges', () => {
    const fixtures = [
      fixture(),
      fixture({ id: 'apisports-2' }),
      fixture({ id: 'apisports-3' }),
    ];
    const ops = planSync(fixtures, {}, [LIV]);
    // Only the first op lands before the "kill".
    const partial = applied({}, ops.slice(0, 1));
    const rerun = planSync(fixtures, partial, [LIV]);
    expect(rerun).toHaveLength(2);
    // And the re-run completes to a fully idempotent state.
    const final = applied(partial, rerun);
    expect(planSync(fixtures, final, [LIV])).toHaveLength(0);
  });
});
