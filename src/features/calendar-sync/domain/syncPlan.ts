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
  // Pure instant arithmetic. getMinutes/setMinutes are LOCAL-time
  // accessors: adding a duration across a DST boundary with them lands
  // an hour out (a 90-minute match on a clocks-change night ended at
  // the wrong time), because the local wall clock is not monotonic.
  const ms = new Date(startUtc).getTime();
  return new Date(ms + Math.round(durationHours * 60) * 60_000).toISOString();
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
  // A provisional record's time is not trustworthy enough to write as a
  // precise event — show the day, say so, and let a confirmed source
  // sharpen it later. Better an honest all-day entry than a confident
  // wrong time in someone's calendar.
  if (f.confidence === 'provisional' && f.status !== 'cancelled') {
    const day = dayStartUtc(f.startUtc);
    return {
      title: `${matchTitle} — date TBC`,
      startUtc: day,
      endUtc: nextDayUtc(day),
      allDay: true,
    };
  }
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

// Look-back so a match already under way stays in the calendar rather
// than vanishing at kick-off.
export const HORIZON_LOOKBACK_HOURS = 6;

export function horizonStartFrom(nowMs: number): string {
  return new Date(nowMs - HORIZON_LOOKBACK_HOURS * 3600_000).toISOString();
}

export function planSync(
  fixtures: readonly Fixture[],
  ledger: Ledger,
  followedKeys: readonly string[],
  prefs: CalendarPrefs,
  horizonStartUtc: string,
  excluded: ReadonlySet<string> = new Set(),
): SyncOp[] {
  const ops: SyncOp[] = [];
  const wanted = new Map<string, { fixture: Fixture; desired: DesiredEvent }>();
  for (const f of fixtures) {
    if (!f.followKeys.some((k) => followedKeys.includes(k))) continue;
    // Per-event opt-out: an excluded fixture is simply not wanted — a
    // ledgered event for it falls into the delete pass below, and
    // clearing the exclusion re-creates it on the next sync.
    if (excluded.has(f.id)) continue;
    const desired = desiredEventFor(f, prefs);
    if (!desired) continue;
    // The product is upcoming games: a finished season must never pour
    // hundreds of past fixtures into the calendar. Events we already
    // created stay put as they age — erasing someone's history would be
    // worse than leaving it.
    if (desired.startUtc < horizonStartUtc && !ledger[f.id]) continue;
    wanted.set(f.id, { fixture: f, desired });
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

// Presentation snapshot of what's ahead — Home and Schedule render this.
// It must show only what the calendar actually wants: same
// desiredEventFor gate as the planner, so a cancelled fixture (or a
// race-only-excluded support session) never appears in the app while
// the same sync removes it from the calendar.
export interface SnapshotFixture {
  id: string;
  title: string;
  startUtc: string;
  durationHours?: number;
  status: string;
  sport: string;
  competition: string;
  followKeys: string[];
}

export function upcomingSnapshot(
  fixtures: Fixture[],
  prefs: CalendarPrefs,
  horizonStartUtc: string,
  cap: number,
): SnapshotFixture[] {
  return fixtures
    .filter(
      (f) =>
        f.startUtc >= horizonStartUtc && desiredEventFor(f, prefs) !== null,
    )
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc))
    .slice(0, cap)
    .map((f) => ({
      id: f.id,
      title: f.title,
      startUtc: f.startUtc,
      ...(f.durationHours !== undefined
        ? { durationHours: f.durationHours }
        : {}),
      status: f.status,
      sport: f.sport,
      competition: f.competition,
      followKeys: f.followKeys,
    }));
}
