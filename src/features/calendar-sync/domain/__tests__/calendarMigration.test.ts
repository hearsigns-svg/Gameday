// Switching the calendar target must MOVE the fixtures already in a
// calendar, not orphan them (acceptance criterion 4: "conserves the
// count, and leaves no duplicates").
//
// A move is create-then-delete across two calendars with no transaction,
// so the interesting cases are all the ways it can be interrupted. These
// tests run a faithful model of the engine loop — same order of writes,
// same prune pass — and kill it at every step to prove it converges.

import {
  clearedStray,
  movedEntry,
  planTargetMigration,
  strayEventIds,
  vacatedCalendarIds,
} from '../calendarMigration';
import { orphanEventIds, ourEventsIn, NOTES_TAG, ScannedEvent } from '../recovery';
import { Ledger, LedgerEntry } from '../syncPlan';

const OLD = 'cal-old';
const NEW = 'cal-new';

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    eventId: 'evt-1',
    calendarId: OLD,
    startUtc: '2026-10-21T11:30:00.000Z',
    endUtc: '2026-10-21T13:30:00.000Z',
    title: 'Liverpool v Everton',
    allDay: false,
    ...over,
  };
}

function ledgerOf(n: number): Ledger {
  const l: Ledger = {};
  for (let i = 0; i < n; i++) {
    l[`f-${i}`] = entry({ eventId: `old-${i}`, title: `Match ${i}` });
  }
  return l;
}

// ─── A model of the world the engine mutates ─────────────────────────

interface World {
  ledger: Ledger;
  // calendarId → eventId → fixtureId
  calendars: Map<string, Map<string, string>>;
  created: number;
  deleted: number;
}

function worldWith(ledger: Ledger): World {
  const calendars = new Map<string, Map<string, string>>();
  for (const [fixtureId, e] of Object.entries(ledger)) {
    const cal = calendars.get(e.calendarId) ?? new Map();
    cal.set(e.eventId, fixtureId);
    calendars.set(e.calendarId, cal);
  }
  calendars.set(NEW, calendars.get(NEW) ?? new Map());
  return { ledger, calendars, created: 0, deleted: 0 };
}

function createIn(w: World, calendarId: string, fixtureId: string): string {
  const id = `new-${fixtureId}-${w.created++}`;
  const cal = w.calendars.get(calendarId) ?? new Map();
  cal.set(id, fixtureId);
  w.calendars.set(calendarId, cal);
  return id;
}

function deleteEvent(w: World, eventId: string): void {
  for (const cal of w.calendars.values()) {
    if (cal.delete(eventId)) w.deleted++;
  }
}

// Exactly the engine's order of operations, with a kill switch. `budget`
// counts individual side effects; running out mid-move is the crash.
function migrate(w: World, target: string, budget = Infinity): void {
  let spent = 0;
  const spend = () => ++spent > budget;

  // 1. Drain leftovers from a previous attempt (top of every sync).
  for (const { fixtureId, eventId } of strayEventIds(w.ledger)) {
    if (spend()) return;
    deleteEvent(w, eventId);
    w.ledger[fixtureId] = clearedStray(w.ledger[fixtureId]);
  }

  // 2. Move everything not already in the target.
  for (const step of planTargetMigration(w.ledger, target)) {
    if (spend()) return;
    const newEventId = createIn(w, target, step.fixtureId);
    if (spend()) return;
    // ONE write: repoint the ledger AND record the debt.
    w.ledger[step.fixtureId] = movedEntry(step.entry, newEventId, target);
    if (spend()) return;
    deleteEvent(w, step.entry.eventId);
    w.ledger[step.fixtureId] = clearedStray(w.ledger[step.fixtureId]);
  }
}

// The standing prune invariant, over the target calendar only.
function prune(w: World, target: string): number {
  const scanned: ScannedEvent[] = [...(w.calendars.get(target) ?? [])].map(
    ([eventId, fixtureId]) => ({
      id: eventId,
      calendarId: target,
      notes: `${NOTES_TAG}${fixtureId}`,
      startDate: '2026-10-21T11:30:00.000Z',
      endDate: '2026-10-21T13:30:00.000Z',
      allDay: false,
    }),
  );
  const orphans = orphanEventIds(ourEventsIn(scanned, target), w.ledger);
  for (const id of orphans) deleteEvent(w, id);
  return orphans.length;
}

const eventCount = (w: World): number =>
  [...w.calendars.values()].reduce((n, c) => n + c.size, 0);

// ─── The plan ────────────────────────────────────────────────────────

describe('planning a switch', () => {
  it('moves every ledgered fixture that is not already in the target', () => {
    const steps = planTargetMigration(ledgerOf(3), NEW);
    expect(steps.map((s) => s.fixtureId)).toEqual(['f-0', 'f-1', 'f-2']);
  });

  it('is a no-op once everything has arrived — switching is idempotent', () => {
    const l = ledgerOf(3);
    for (const k of Object.keys(l)) l[k] = { ...l[k], calendarId: NEW };
    expect(planTargetMigration(l, NEW)).toEqual([]);
  });

  it('moves only what is left when the target already holds some', () => {
    const l = ledgerOf(3);
    l['f-1'] = { ...l['f-1'], calendarId: NEW };
    expect(planTargetMigration(l, NEW).map((s) => s.fixtureId)).toEqual([
      'f-0',
      'f-2',
    ]);
  });

  it('names the calendars a switch leaves behind, and never the target', () => {
    const l = ledgerOf(2);
    l['f-1'] = { ...l['f-1'], calendarId: 'cal-other' };
    expect(vacatedCalendarIds(l, NEW).sort()).toEqual(['cal-old', 'cal-other']);
    expect(vacatedCalendarIds(l, OLD)).toEqual(['cal-other']);
  });
});

describe('the atomic half-step', () => {
  it('repointing the ledger and owing the old event a delete is one value', () => {
    // If these could be written separately, a crash between them would
    // strand an event in a calendar nothing scans again — invisible to
    // prune forever.
    const moved = movedEntry(entry({ eventId: 'old-1' }), 'new-1', NEW);
    expect(moved.eventId).toBe('new-1');
    expect(moved.calendarId).toBe(NEW);
    expect(moved.strayEventId).toBe('old-1');
    expect(strayEventIds({ 'f-0': moved })).toEqual([
      { fixtureId: 'f-0', eventId: 'old-1' },
    ]);
  });

  it('carries the event’s shape across untouched', () => {
    const before = entry({ allDay: true, title: 'Chelsea v Liverpool — postponed' });
    const after = movedEntry(before, 'new-1', NEW);
    expect(after.title).toBe(before.title);
    expect(after.startUtc).toBe(before.startUtc);
    expect(after.endUtc).toBe(before.endUtc);
    expect(after.allDay).toBe(true);
  });

  it('a settled entry owes nothing', () => {
    const settled = clearedStray(movedEntry(entry(), 'new-1', NEW));
    expect('strayEventId' in settled).toBe(false);
    expect(strayEventIds({ 'f-0': settled })).toEqual([]);
  });
});

// ─── Convergence ─────────────────────────────────────────────────────

describe('a completed switch', () => {
  it('moves every fixture, conserves the count, leaves the old calendar empty', () => {
    const w = worldWith(ledgerOf(100));
    expect(eventCount(w)).toBe(100);

    migrate(w, NEW);

    expect(eventCount(w)).toBe(100); // conserved
    expect(w.calendars.get(NEW)!.size).toBe(100);
    expect(w.calendars.get(OLD)!.size).toBe(0);
    // Every ledger entry points into the new calendar and owes nothing.
    for (const e of Object.values(w.ledger)) {
      expect(e.calendarId).toBe(NEW);
      expect(w.calendars.get(NEW)!.has(e.eventId)).toBe(true);
      expect(e.strayEventId).toBeUndefined();
    }
    // One event per fixture — no duplicates.
    expect(new Set(w.calendars.get(NEW)!.values()).size).toBe(100);
  });
});

describe('an interrupted switch converges on re-run', () => {
  // Every kill point inside a three-write move, across a run long enough
  // that later fixtures have not started.
  for (let budget = 1; budget <= 12; budget++) {
    it(`killed after ${budget} operation(s), then re-run + prune`, () => {
      const w = worldWith(ledgerOf(5));

      migrate(w, NEW, budget); // crash
      migrate(w, NEW); // the next sync
      prune(w, NEW); // the standing invariant

      expect(w.calendars.get(NEW)!.size).toBe(5);
      expect(w.calendars.get(OLD)!.size).toBe(0);
      expect(eventCount(w)).toBe(5); // nothing lost, nothing duplicated
      expect(new Set(w.calendars.get(NEW)!.values()).size).toBe(5);
      for (const e of Object.values(w.ledger)) {
        expect(e.calendarId).toBe(NEW);
        expect(w.calendars.get(NEW)!.has(e.eventId)).toBe(true);
        expect(e.strayEventId).toBeUndefined();
      }
    });
  }

  it('a crash between create and the ledger write leaves a duplicate that prune removes', () => {
    // The one state that does produce a second event in the target: the
    // ledger still points at the old one, so the re-run moves it again.
    // The abandoned copy is tagged, in the target, and unreferenced —
    // exactly what the prune invariant exists for.
    const w = worldWith(ledgerOf(1));
    migrate(w, NEW, 1); // create only
    expect(w.calendars.get(NEW)!.size).toBe(1);
    expect(w.ledger['f-0'].calendarId).toBe(OLD); // ledger untouched

    migrate(w, NEW);
    expect(w.calendars.get(NEW)!.size).toBe(2); // duplicate, briefly
    expect(prune(w, NEW)).toBe(1);
    expect(w.calendars.get(NEW)!.size).toBe(1);
    expect(eventCount(w)).toBe(1);
  });

  it('a crash after the ledger write is repaired by the stray drain, not prune', () => {
    // The old event lives in a calendar the prune pass never scans, so
    // the debt recorded in the entry is the only thing that can find it.
    const w = worldWith(ledgerOf(1));
    migrate(w, NEW, 2); // create + repoint, no delete
    expect(w.ledger['f-0'].strayEventId).toBe('old-0');
    expect(w.calendars.get(OLD)!.size).toBe(1);

    prune(w, NEW); // scans the target only — cannot see it
    expect(w.calendars.get(OLD)!.size).toBe(1);

    migrate(w, NEW); // next sync drains first
    expect(w.calendars.get(OLD)!.size).toBe(0);
    expect(eventCount(w)).toBe(1);
  });

  it('survives being killed on every single run, repeatedly', () => {
    // Pathological: the user keeps force-quitting mid-switch. State must
    // never drift — each attempt makes progress or changes nothing.
    const w = worldWith(ledgerOf(4));
    for (let i = 0; i < 20; i++) migrate(w, NEW, 2);
    migrate(w, NEW);
    prune(w, NEW);
    expect(w.calendars.get(NEW)!.size).toBe(4);
    expect(w.calendars.get(OLD)!.size).toBe(0);
    expect(new Set(w.calendars.get(NEW)!.values()).size).toBe(4);
  });
});
