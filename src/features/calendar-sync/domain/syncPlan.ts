// Pure sync planner — the idempotency core. Given the fixture cache, the
// device ledger, and the followed set, produce the exact calendar
// operations needed. No I/O; fully unit-tested.
//
// Status → desired calendar state:
//   scheduled / in_play / finished → timed event
//   tbd                            → all-day placeholder "… — time TBC"
//   postponed                      → all-day placeholder "… — postponed"
//   cancelled                      → nothing (delete if ledgered)
// Placeholders sharpen back into timed events when a schedule lands —
// same fixture id, so it is always an update, never a duplicate.

import { Fixture, FIXTURE_DURATION_HOURS } from '../../fixtures/domain/fixture';
import { CalendarPrefs } from './prefs';

export interface LedgerEntry {
  eventId: string;
  calendarId: string;
  startUtc: string;
  endUtc: string;
  title: string;
  allDay?: boolean; // absent in pre-M2 ledgers → treated as false
}

export type Ledger = Record<string, LedgerEntry>; // keyed by fixture id

export interface DesiredEvent {
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
}

export type SyncOp =
  | { op: 'create'; fixture: Fixture; desired: DesiredEvent }
  | { op: 'update'; fixture: Fixture; desired: DesiredEvent; entry: LedgerEntry }
  | { op: 'delete'; fixtureId: string; entry: LedgerEntry };

export function eventEndUtc(
  startUtc: string,
  durationHours: number = FIXTURE_DURATION_HOURS,
): string {
  const end = new Date(startUtc);
  end.setMinutes(end.getMinutes() + Math.round(durationHours * 60));
  return end.toISOString();
}

function dayStartUtc(iso: string): string {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toISOString();
}

function nextDayUtc(dayIso: string): string {
  const d = new Date(dayIso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

export function desiredEventFor(
  f: Fixture,
  prefs: CalendarPrefs,
): DesiredEvent | null {
  // Series sports: optionally keep only the race itself in the calendar.
  if (prefs.seriesSessions === 'race-only' && f.sessionKind === 'support') {
    return null;
  }
  const matchTitle = f.title;
  switch (f.status) {
    case 'cancelled':
      return null;
    case 'tbd': {
      const day = dayStartUtc(f.startUtc);
      return {
        title: `${matchTitle} — time TBC`,
        startUtc: day,
        endUtc: nextDayUtc(day),
        allDay: true,
      };
    }
    case 'postponed': {
      const day = dayStartUtc(f.startUtc);
      return {
        title: `${matchTitle} — postponed`,
        startUtc: day,
        endUtc: nextDayUtc(day),
        allDay: true,
      };
    }
    default: {
      if (prefs.eventStyle === 'all-day') {
        const day = dayStartUtc(f.startUtc);
        return {
          title: matchTitle,
          startUtc: day,
          endUtc: nextDayUtc(day),
          allDay: true,
        };
      }
      return {
        title: matchTitle,
        startUtc: f.startUtc,
        endUtc: eventEndUtc(f.startUtc, f.durationHours),
        allDay: false,
      };
    }
  }
}

function entryMatches(entry: LedgerEntry, desired: DesiredEvent): boolean {
  return (
    entry.startUtc === desired.startUtc &&
    entry.title === desired.title &&
    (entry.allDay ?? false) === desired.allDay
  );
}

export function planSync(
  fixtures: readonly Fixture[],
  ledger: Ledger,
  followedKeys: readonly string[],
  prefs: CalendarPrefs,
): SyncOp[] {
  const ops: SyncOp[] = [];
  const wanted = new Map<string, { fixture: Fixture; desired: DesiredEvent }>();
  for (const f of fixtures) {
    if (!f.followKeys.some((k) => followedKeys.includes(k))) continue;
    const desired = desiredEventFor(f, prefs);
    if (desired) wanted.set(f.id, { fixture: f, desired });
  }

  for (const { fixture, desired } of wanted.values()) {
    const entry = ledger[fixture.id];
    if (!entry) {
      ops.push({ op: 'create', fixture, desired });
    } else if (!entryMatches(entry, desired)) {
      ops.push({ op: 'update', fixture, desired, entry });
    }
    // else: ledger already reflects this fixture — no op (idempotency)
  }

  // Anything ledgered that we no longer want: cancelled, unfollowed, or
  // gone from the cache.
  for (const [fixtureId, entry] of Object.entries(ledger)) {
    if (!wanted.has(fixtureId)) ops.push({ op: 'delete', fixtureId, entry });
  }

  return ops;
}
