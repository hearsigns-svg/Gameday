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
  // Set only while a target switch is in flight: the event this fixture
  // used to occupy in the OLD calendar, still awaiting deletion. It
  // rides IN the entry so repointing the ledger and recording the
  // leftover are one atomic write — see domain/calendarMigration.ts.
  strayEventId?: string;
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
  pinned: ReadonlySet<string> = new Set(),
): SyncOp[] {
  const ops: SyncOp[] = [];
  const wanted = new Map<string, { fixture: Fixture; desired: DesiredEvent }>();
  for (const f of fixtures) {
    // A PIN wants this one fixture even when nothing it belongs to is
    // followed; an EXCLUSION still wins over both (an explicit remove
    // beats a follow and beats an older pin).
    if (excluded.has(f.id)) continue;
    if (!pinned.has(f.id) && !f.followKeys.some((k) => followedKeys.includes(k))) {
      continue;
    }
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

// Ops applied in one pass. The op loop is serial and each op is a native
// calendar write, so a first sync is as long as it is wide. Measured
// 2026-07-31: iOS simulator 150 ops/sec, Android emulator 15 ops/sec.
//
// The ceiling that matters is not patience, it is STALE_RUN_MS in the
// engine: a run holding the lock longer than three minutes is treated as
// abandoned, and the next trigger starts a SECOND run while the first is
// still writing. Two live runs racing the ledger is the zombie-run
// duplication this codebase already knows about. At 15 ops/sec that
// threshold arrives at ~2,700 ops, and a user who follows the ten
// heaviest competitions plans 3,369 creates on their first sync.
//
// So a pass is capped and later passes drain the rest. 1,500 ops is ~100s
// on the slowest thing measured — comfortably inside the window — and ~10s
// on iOS.
export const MAX_OPS_PER_PASS = 1500;

export interface CappedOps {
  apply: SyncOp[];
  deferred: number;
}

// Deletes and updates go first. They are bounded by what is already IN the
// calendar, and they correct or remove events the user can see right now;
// deferring a removal would leave a cancelled fixture sitting in someone's
// calendar for another pass. Creates — the unbounded part — fill whatever
// budget is left.
export function capOps(
  ops: readonly SyncOp[],
  cap: number = MAX_OPS_PER_PASS,
): CappedOps {
  if (ops.length <= cap) return { apply: [...ops], deferred: 0 };
  const corrections = ops.filter((o) => o.op !== 'create');
  const creates = ops.filter((o) => o.op === 'create');
  const apply = [...corrections, ...creates].slice(0, cap);
  return { apply, deferred: ops.length - apply.length };
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
  // Team sports only. Carried so the app can identify a fixture by its
  // PARTICIPANTS rather than by whichever follow happened to pull it in:
  // a competition follow knows the league, not who is playing, which is
  // why those cards had no identity to show.
  homeTeam?: string;
  awayTeam?: string;
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
      ...(f.homeTeam !== undefined ? { homeTeam: f.homeTeam } : {}),
      ...(f.awayTeam !== undefined ? { awayTeam: f.awayTeam } : {}),
    }));
}
