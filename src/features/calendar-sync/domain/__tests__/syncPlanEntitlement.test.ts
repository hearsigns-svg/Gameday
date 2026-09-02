// Round 5 Stage 2 — the planner's entitlement input (owner rulings
// 2026-09-02): Free skips CREATE only; update and the delete loop are
// untouched; removal is never gated; downgrade removals are judged on
// the ledger, never touch the past, and are capped per pass.
import { Fixture } from '../../../fixtures/domain/fixture';
import { DEFAULT_PREFS } from '../prefs';
import {
  desiredEventFor,
  DOWNGRADE_DELETE_CAP,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';
import { FREE_PLAN, PREMIUM_PLAN } from '../../../../core/entitlement';

const PL = 'apisports-league-39';
const LIV = 'apisports-team-40';
const NOW = '2023-10-20T12:00:00.000Z';
const nowMs = Date.parse(NOW);
const horizon = new Date(nowMs - 6 * 3_600_000).toISOString();

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 'apisports-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: PL,
    title: 'Liverpool v Everton',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    followKeys: [LIV, PL],
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
    reminderMinutes: desired.reminderMinutes,
    extraReminders: desired.extraReminders,
    allDayReminder: desired.allDayReminder,
  };
}

const plan = (fixtures: Fixture[], ledger: Ledger, entitlement = FREE_PLAN): SyncOp[] =>
  planSync(fixtures, ledger, [LIV], DEFAULT_PREFS, horizon, new Set(), new Set(), nowMs, undefined, {}, {
    entitlement,
  });

const ops = (list: SyncOp[]) => list.map((o) => o.op);

describe('planSync — the entitlement options object', () => {
  const a = fixture({ id: 'a', startUtc: '2023-10-21T11:30:00.000Z' });
  const b = fixture({ id: 'b', startUtc: '2023-10-28T14:00:00.000Z' });

  it('no options at all plans as Premium (every existing caller is unchanged)', () => {
    expect(
      ops(planSync([a, b], {}, [LIV], DEFAULT_PREFS, horizon, new Set(), new Set(), nowMs)),
    ).toEqual(['create', 'create']);
  });

  it('Premium creates; Free skips CREATE ONLY', () => {
    expect(ops(plan([a, b], {}, PREMIUM_PLAN))).toEqual(['create', 'create']);
    expect(ops(plan([a, b], {}))).toEqual([]);
  });

  it('Free still UPDATES a placed event whose time changed', () => {
    const ledger: Ledger = { a: entryFor(a) };
    const moved = { ...a, startUtc: '2023-10-21T16:30:00.000Z' };
    const r = plan([moved, b], ledger);
    expect(ops(r)).toEqual(['update']);
    expect(r[0].op === 'update' && r[0].fixture.id).toBe('a');
  });

  it('Free still DELETES a placed event that was cancelled, and one that was unfollowed', () => {
    const ledger: Ledger = { a: entryFor(a), b: entryFor(b) };
    const cancelled = { ...a, status: 'cancelled' as const };
    // b is absent from the fetch → unfollowed/gone → delete
    expect(ops(plan([cancelled], ledger)).sort()).toEqual(['delete', 'delete']);
  });

  it('Free keeps an already-placed, unchanged event exactly as it is', () => {
    const ledger: Ledger = { a: entryFor(a) };
    expect(plan([a], ledger)).toEqual([]);
  });

  it('opt-in past-deletion is not gated', () => {
    const old = fixture({ id: 'old', startUtc: '2023-08-01T11:30:00.000Z' });
    const ledger: Ledger = { old: entryFor(old) };
    const r = planSync([], ledger, [LIV], { ...DEFAULT_PREFS, autoDeletePast: true }, horizon, new Set(), new Set(), nowMs, undefined, {}, {
      entitlement: FREE_PLAN,
    });
    expect(ops(r)).toEqual(['delete']);
  });
});

describe('planSync — downgrade removals', () => {
  const soon = fixture({ id: 'soon', startUtc: '2023-10-25T15:00:00.000Z' });
  const later = fixture({ id: 'later', startUtc: '2023-12-01T15:00:00.000Z' });
  const past = fixture({ id: 'past', startUtc: '2023-10-01T15:00:00.000Z' });

  it('trial keep-window: placed events dated after the boundary are removed, those before stay and keep updating', () => {
    const ledger: Ledger = { soon: entryFor(soon), later: entryFor(later), past: entryFor(past) };
    const movedSoon = { ...soon, startUtc: '2023-10-25T17:00:00.000Z' };
    const r = plan([movedSoon, later, past], ledger, {
      tier: 'free',
      removeAfterUtc: '2023-11-15T00:00:00.000Z',
    });
    const deletes = r.filter((o) => o.op === 'delete').map((o) => (o.op === 'delete' ? o.fixtureId : ''));
    expect(deletes).toEqual(['later']);
    expect(r.some((o) => o.op === 'update' && o.fixture.id === 'soon')).toBe(true);
    // the past is never touched
    expect(r.some((o) => o.op === 'delete' && o.fixtureId === 'past')).toBe(false);
  });

  it('a boundary removal is judged on the LEDGER, so an event missing from the fetch is still removed once', () => {
    const ledger: Ledger = { later: entryFor(later) };
    const r = plan([], ledger, { tier: 'free', removeAfterUtc: '2023-11-15T00:00:00.000Z' });
    expect(ops(r)).toEqual(['delete']);
  });

  it('paid lapse past the renew window: every future placed event is removed, nothing started or past', () => {
    const started = fixture({ id: 'started', startUtc: '2023-10-20T11:00:00.000Z' }); // began an hour ago
    const ledger: Ledger = {
      soon: entryFor(soon),
      later: entryFor(later),
      past: entryFor(past),
      started: entryFor(started),
    };
    const r = plan([soon, later, past, started], ledger, { tier: 'free', removeFuture: true });
    const deletes = r.filter((o) => o.op === 'delete').map((o) => (o.op === 'delete' ? o.fixtureId : '')).sort();
    expect(deletes).toEqual(['later', 'soon']);
  });

  it('removals are capped per pass; the rest wait for the next pass', () => {
    const ledger: Ledger = {};
    const fixtures: Fixture[] = [];
    for (let i = 0; i < DOWNGRADE_DELETE_CAP + 15; i++) {
      const f = fixture({
        id: `f${i}`,
        startUtc: new Date(Date.parse('2023-11-20T12:00:00.000Z') + i * 3_600_000).toISOString(),
      });
      fixtures.push(f);
      ledger[f.id] = entryFor(f);
    }
    const r = plan(fixtures, ledger, { tier: 'free', removeFuture: true });
    expect(r.filter((o) => o.op === 'delete')).toHaveLength(DOWNGRADE_DELETE_CAP);
    expect(r.some((o) => o.op === 'update')).toBe(false);
  });

  it('Premium again (restore): no removal effect, missing events are created back in one pass', () => {
    const ledger: Ledger = { soon: entryFor(soon) };
    const r = plan([soon, later], ledger, PREMIUM_PLAN);
    expect(ops(r)).toEqual(['create']);
  });
});
