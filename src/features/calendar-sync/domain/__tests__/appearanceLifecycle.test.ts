// The appearance lifecycle, per sport — the thing Prompt 5 exists to get
// right: provisional (parent event's window) → confirmed (exact slot)
// must UPDATE the same calendar entry, never create a second one.
//
// An appearance is an ordinary fixture doc whose id is born final, so
// the mechanism under test is the planner's own: same id ⇒ same ledger
// slot ⇒ an `update` op re-using the existing entry. These tests pin
// that for all three consumers — boxing (timed nominal card → exact
// slot: an in-place update at the OS-event level too), and tennis and
// athletics (date_only parent-window banner → timed slot: one update op
// whose allDay flip the engine applies as its established
// delete+recreate, still one event, same ledger key).

import { Fixture } from '../../../fixtures/domain/fixture';
import { DEFAULT_PREFS } from '../prefs';
import {
  desiredEventFor,
  Ledger,
  LedgerEntry,
  planSync,
  SyncOp,
} from '../syncPlan';

const HORIZON = '2026-08-01T00:00:00.000Z';

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
        eventId:
          op.op === 'update' ? op.entry.eventId : `evt-${op.fixture.id}`,
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

// One provisional/confirmed pair per sport. The confirmed doc is the
// SAME id with the slot fields changed — exactly what a re-poll writes.

const boxingProvisional: Fixture = {
  id: 'pbc-fight-night-august-22-2026-app-carlos-utria-israel-mercado',
  sport: 'boxing',
  competition: 'Premier Boxing Champions',
  competitionId: 'pbc-cards-appearances',
  title: 'Carlos Utria vs Israel Mercado',
  followKeys: ['pbc-cards-appearances', 'athlete-carlos-utria', 'athlete-israel-mercado'],
  startUtc: '2026-08-22T22:00:00.000Z', // the card's window
  status: 'scheduled',
  durationHours: 4,
  timePrecision: 'nominal',
  confidence: 'provisional',
  parentFixtureId: 'pbc-fight-night-august-22-2026',
  athletes: ['Carlos Utria', 'Israel Mercado'],
  updatedAt: '2026-08-02T00:00:00.000Z',
};
const boxingConfirmed: Fixture = {
  ...boxingProvisional,
  startUtc: '2026-08-23T00:30:00.000Z', // the bout's own ringwalk slot
  durationHours: 1,
  timePrecision: 'exact',
  confidence: 'confirmed',
  updatedAt: '2026-08-20T00:00:00.000Z',
};

const tennisProvisional: Fixture = {
  id: 'tennis-usopen26-app-iga-swiatek',
  sport: 'tennis',
  competition: 'ATP Tour',
  competitionId: 'tennis-atp-appearances',
  title: 'Iga Swiatek — US Open',
  followKeys: ['tennis-atp-appearances', 'athlete-iga-swiatek'],
  startUtc: '2026-08-31T00:00:00.000Z', // the tournament's day sentinel
  status: 'scheduled',
  durationHours: 15 * 24, // the full fortnight — the parent's window
  timePrecision: 'date_only',
  confidence: 'provisional',
  parentFixtureId: 'tennis-usopen26',
  athletes: ['Iga Swiatek'],
  updatedAt: '2026-08-27T00:00:00.000Z',
};
const tennisConfirmed: Fixture = {
  ...tennisProvisional,
  title: 'Iga Swiatek vs Naomi Osaka — US Open',
  startUtc: '2026-08-31T15:00:00.000Z', // order of play, the night before
  durationHours: 3,
  timePrecision: 'exact',
  confidence: 'confirmed',
  updatedAt: '2026-08-30T22:00:00.000Z',
};

const athleticsProvisional: Fixture = {
  id: 'wa-7244804-app-faith-kipyegon',
  sport: 'athletics',
  competition: 'Wanda Diamond League',
  competitionId: 'wa-wanda-diamond-league-meeting-appearances',
  title: 'Faith Kipyegon — Weltklasse Zürich',
  followKeys: [
    'wa-wanda-diamond-league-meeting-appearances',
    'athlete-faith-kipyegon',
  ],
  startUtc: '2026-09-03T00:00:00.000Z', // the meeting's day sentinel
  status: 'scheduled',
  durationHours: 24,
  timePrecision: 'date_only',
  confidence: 'provisional',
  parentFixtureId: 'wa-7244804',
  athletes: ['Faith Kipyegon'],
  updatedAt: '2026-09-01T00:00:00.000Z',
};
const athleticsConfirmed: Fixture = {
  ...athleticsProvisional,
  title: 'Faith Kipyegon — 1500m — Weltklasse Zürich',
  startUtc: '2026-09-03T19:24:00.000Z', // the 1500m slot, from the timetable
  durationHours: 1,
  timePrecision: 'exact',
  confidence: 'confirmed',
  updatedAt: '2026-09-02T18:00:00.000Z',
};

describe.each([
  ['boxing', boxingProvisional, boxingConfirmed, 'athlete-israel-mercado'],
  ['tennis', tennisProvisional, tennisConfirmed, 'athlete-iga-swiatek'],
  ['athletics', athleticsProvisional, athleticsConfirmed, 'athlete-faith-kipyegon'],
] as const)(
  '%s: provisional → confirmed updates the same calendar entry',
  (_sport, provisional, confirmed, athleteKey) => {
    test('the provisional appearance is created once from the athlete follow', () => {
      const ops = planSync([provisional], {}, [athleteKey], DEFAULT_PREFS, HORIZON);
      expect(ops).toHaveLength(1);
      expect(ops[0].op).toBe('create');
      // Idempotent thereafter.
      const ledger = applied({}, ops);
      expect(
        planSync([provisional], ledger, [athleteKey], DEFAULT_PREFS, HORIZON),
      ).toHaveLength(0);
    });

    test('confirmation is exactly ONE update against the existing entry — no create, no delete', () => {
      const ledger: Ledger = { [provisional.id]: entryFor(provisional) };
      const ops = planSync([confirmed], ledger, [athleteKey], DEFAULT_PREFS, HORIZON);
      expect(ops).toHaveLength(1);
      const op = ops[0];
      expect(op.op).toBe('update');
      if (op.op !== 'update') return;
      // The op re-uses the ledgered entry — same ledger key, same
      // event. (Whether the OS-level eventId survives is the engine's
      // business: it does for a timed update, and an allDay flip is the
      // engine's documented delete+recreate under the same ledger key —
      // either way the entry count below proves there is never a second
      // event.)
      expect(op.entry).toBe(ledger[provisional.id]);
      expect(op.fixture.id).toBe(provisional.id);
      // After applying, still exactly one entry for the appearance.
      const after = applied(ledger, ops);
      expect(Object.keys(after)).toEqual([provisional.id]);
      // And convergence: replanning yields nothing.
      expect(
        planSync([confirmed], after, [athleteKey], DEFAULT_PREFS, HORIZON),
      ).toHaveLength(0);
    });
  },
);

describe('the per-sport shape of the transition', () => {
  test('boxing: timed nominal → timed exact, so the OS event itself updates in place (no allDay flip)', () => {
    const before = desiredEventFor(boxingProvisional, DEFAULT_PREFS)!;
    const after = desiredEventFor(boxingConfirmed, DEFAULT_PREFS)!;
    expect(before.allDay).toBe(false);
    expect(after.allDay).toBe(false);
    expect(before.note).toBeDefined(); // nominal carries the will-update note
    expect(after.note).toBeUndefined();
  });

  test('tennis: the provisional entry is the PARENT window — a fortnight-wide banner, not day one', () => {
    const d = desiredEventFor(tennisProvisional, DEFAULT_PREFS)!;
    expect(d.allDay).toBe(true);
    expect(d.startUtc).toBe('2026-08-31T00:00:00.000Z');
    expect(d.endUtc).toBe('2026-09-15T00:00:00.000Z'); // 15 days, exclusive end
    // A span is not claiming a missing kick-off — no "time TBC" shouting.
    expect(d.title).toBe('Iga Swiatek — US Open');
  });

  test('tennis/athletics: confirmation flips all-day → timed, which the engine applies as its established delete+recreate — one op, one entry, never two events', () => {
    for (const [provisional, confirmed] of [
      [tennisProvisional, tennisConfirmed],
      [athleticsProvisional, athleticsConfirmed],
    ] as const) {
      const before = desiredEventFor(provisional, DEFAULT_PREFS)!;
      const after = desiredEventFor(confirmed, DEFAULT_PREFS)!;
      expect(before.allDay).toBe(true);
      expect(after.allDay).toBe(false);
    }
  });

  test('athletics: the confirmed slot is the discipline slot, not the whole meeting', () => {
    const d = desiredEventFor(athleticsConfirmed, DEFAULT_PREFS)!;
    expect(d.startUtc).toBe('2026-09-03T19:24:00.000Z');
    expect(d.endUtc).toBe('2026-09-03T20:24:00.000Z');
  });
});

describe('lifecycle edges', () => {
  test('a confirmed slot arriving AFTER the provisional window has passed still moves the event (the postponement asymmetry)', () => {
    // Mid-tournament: the provisional banner's window has been and gone
    // in ledger terms; the doc now carries a future exact slot. The
    // wanted loop keys on the FIXTURE's pastness — live — while the
    // delete loop keys on the entry's — frozen — so the answer must be
    // one update, not a delete or a duplicate.
    const lateConfirm: Fixture = {
      ...tennisConfirmed,
      startUtc: '2026-09-10T11:00:00.000Z', // a second-week match
      updatedAt: '2026-09-09T22:00:00.000Z',
    };
    const staleEntry: LedgerEntry = {
      eventId: 'evt-tennis-usopen26-app-iga-swiatek',
      calendarId: 'cal-1',
      startUtc: '2026-08-31T00:00:00.000Z',
      endUtc: '2026-09-01T00:00:00.000Z', // an old ONE-day banner entry
      title: 'Iga Swiatek — US Open — time TBC',
      allDay: true,
    };
    const nowMs = Date.parse('2026-09-09T23:00:00.000Z');
    const ops = planSync(
      [lateConfirm],
      { [lateConfirm.id]: staleEntry },
      ['athlete-iga-swiatek'],
      DEFAULT_PREFS,
      '2026-09-09T17:00:00.000Z',
      new Set(),
      new Set(),
      nowMs,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('update');
  });

  test('ACCEPTED NO-OP: nominal→exact at the identical slot changes nothing the entry can see', () => {
    // The stale "will update automatically" note survives a
    // confirmation that lands exactly on the provisional instant with
    // the same duration — entryMatches has no note field to compare
    // (the ledger stores none). Pinned as accepted behaviour so the
    // day it becomes unacceptable, this test is the conversation.
    const confirmedSameSlot: Fixture = {
      ...boxingProvisional,
      timePrecision: 'exact',
      confidence: 'confirmed',
      updatedAt: '2026-08-21T00:00:00.000Z',
    };
    const ledger: Ledger = {
      [boxingProvisional.id]: entryFor(boxingProvisional),
    };
    expect(
      planSync(
        [confirmedSameSlot],
        ledger,
        ['athlete-israel-mercado'],
        DEFAULT_PREFS,
        HORIZON,
      ),
    ).toHaveLength(0);
  });

  test('a cancelled appearance deletes its event while live', () => {
    const cancelled: Fixture = { ...boxingConfirmed, status: 'cancelled' };
    const ledger: Ledger = { [boxingConfirmed.id]: entryFor(boxingConfirmed) };
    const ops = planSync(
      [cancelled],
      ledger,
      ['athlete-israel-mercado'],
      DEFAULT_PREFS,
      HORIZON,
      new Set(),
      new Set(),
      Date.parse('2026-08-20T00:00:00.000Z'),
    );
    expect(ops).toEqual([
      expect.objectContaining({ op: 'delete', fixtureId: cancelled.id }),
    ]);
  });

  test('an appearance and its parent are independent ledger slots — following both means one event each, and recovery would keep both', () => {
    const parent: Fixture = {
      id: 'pbc-fight-night-august-22-2026',
      sport: 'boxing',
      competition: 'Premier Boxing Champions',
      competitionId: 'pbc-cards',
      title: 'Rolando Romero vs Teofimo Lopez',
      followKeys: ['pbc-cards'],
      startUtc: '2026-08-22T22:00:00.000Z',
      status: 'scheduled',
      durationHours: 4,
      timePrecision: 'nominal',
      confidence: 'provisional',
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const ops = planSync(
      [parent, boxingProvisional],
      {},
      ['pbc-cards', 'athlete-israel-mercado'],
      DEFAULT_PREFS,
      HORIZON,
    );
    expect(ops).toHaveLength(2);
    expect(new Set(ops.map((o) => (o.op === 'delete' ? o.fixtureId : o.fixture.id))))
      .toEqual(new Set([parent.id, boxingProvisional.id]));
  });

  test('an athlete follower gets ONLY the appearance — the card no longer carries athlete keys', () => {
    const parent: Fixture = {
      id: 'pbc-fight-night-august-22-2026',
      sport: 'boxing',
      competition: 'Premier Boxing Champions',
      competitionId: 'pbc-cards',
      title: 'Rolando Romero vs Teofimo Lopez',
      followKeys: ['pbc-cards'],
      startUtc: '2026-08-22T22:00:00.000Z',
      status: 'scheduled',
      durationHours: 4,
      updatedAt: '2026-08-02T00:00:00.000Z',
    };
    const ops = planSync(
      [parent, boxingProvisional],
      {},
      ['athlete-israel-mercado'],
      DEFAULT_PREFS,
      HORIZON,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('create');
    if (ops[0].op === 'create') {
      expect(ops[0].fixture.id).toBe(boxingProvisional.id);
    }
  });
});
