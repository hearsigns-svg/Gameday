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

import { Fixture } from '../../fixtures/domain/fixture';
import {
  eventEndUtc,
  isBeyondRetention,
  isEndPast,
  isPast,
} from '../../fixtures/domain/horizon';
import { CalendarPrefs } from './prefs';

// Re-exported so existing consumers keep their import site; the one
// definition now lives with the fixture model, alongside isPast.
export { eventEndUtc };

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

// The planner needs "now" to decide what has finished. It is derived from
// the horizon rather than added as a parameter because there is exactly
// one producer of that horizon (horizonStartFrom), so the two can never
// disagree — and every existing caller keeps working unchanged.
export function nowFromHorizon(horizonStartUtc: string): number {
  return Date.parse(horizonStartUtc) + HORIZON_LOOKBACK_HOURS * 3600_000;
}

export function planSync(
  fixtures: readonly Fixture[],
  ledger: Ledger,
  followedKeys: readonly string[],
  prefs: CalendarPrefs,
  horizonStartUtc: string,
  excluded: ReadonlySet<string> = new Set(),
  pinned: ReadonlySet<string> = new Set(),
  nowMs: number = nowFromHorizon(horizonStartUtc),
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
    // FROZEN: a fixture that has finished gets no ops at all — not an
    // update, and not a create if its event has somehow gone. Its ledger
    // entry is retained below so the prune sweep still sees it referenced.
    if (isPast(f, nowMs)) continue;
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
    // A frozen entry is NOT a deletion candidate, whatever the fetch did
    // or did not return. This is the whole point of keeping the freeze in
    // the ledger rather than in the query: once a fixture crosses the
    // horizon it leaves the fetch, and "absent from the fetch" must never
    // again be read as "the user unfollowed it".
    if (isEndPast(entry.endUtc, nowMs)) {
      // …unless the user has explicitly opted into removing old events,
      // and this one is past the retention window.
      if (prefs.autoDeletePast && isBeyondRetention(entry.endUtc, nowMs)) {
        ops.push({ op: 'delete', fixtureId, entry });
      }
      continue;
    }
    if (!wanted.has(fixtureId)) ops.push({ op: 'delete', fixtureId, entry });
  }

  return ops;
}

// How long one pass may spend applying ops.
//
// The op loop is serial and each op is a native calendar write, so a first
// sync is as long as it is wide. Measured 2026-07-31 writing to a
// DEVICE-LOCAL calendar: iOS simulator ~150 ops/sec, Android emulator
// ~15 ops/sec. Those are an order of magnitude apart, which is exactly why
// this is a TIME budget and not an op count — a fixed count tuned on one
// platform is wrong on the other, and both were measured against a local
// calendar while calendarTarget.ts prefers a CLOUD-backed one for real
// users. A cloud target's per-write cost is unmeasured (see PLAN.md).
//
// The ceiling that matters is STALE_RUN_MS in the engine: a run holding
// the lock longer is treated as abandoned, and the next trigger starts a
// SECOND run while the first is still writing. Two live runs racing the
// ledger is the zombie-run duplication this codebase already knows about.
// Spending 60% of that window leaves room for the fetch, the plan, the
// recovery scan and the prune pass that bracket the loop.
export const PASS_BUDGET_FRACTION = 0.6;

export function passBudgetMs(staleRunMs: number): number {
  return Math.floor(staleRunMs * PASS_BUDGET_FRACTION);
}

// Deletes and updates go first. They are bounded by what is already IN the
// calendar, and they correct or remove events the user can see right now;
// deferring a removal would leave a cancelled fixture sitting in someone's
// calendar for another pass. Creates — the unbounded part — follow.
export function orderOps(ops: readonly SyncOp[]): SyncOp[] {
  return [
    ...ops.filter((o) => o.op !== 'create'),
    ...ops.filter((o) => o.op === 'create'),
  ];
}

// Liveness, not age. A pass that is slow but ALIVE must never be treated
// as abandoned: measured on Android, one native calendar write blocked for
// ~119s and took its pass to 227s, past STALE_RUN_MS — at which point the
// next trigger would have started a second run on top of it, which is the
// zombie-run duplication this codebase already knows about. So the lock
// records a HEARTBEAT the running pass refreshes, and staleness means "no
// heartbeat since", not "started before".
export function isRunAbandoned(
  heartbeatAt: number,
  nowMs: number,
  staleMs: number,
): boolean {
  return nowMs - heartbeatAt >= staleMs;
}

// Stop when the budget is spent — but never before applying anything, or
// a slow platform could make zero progress and loop forever.
export function shouldStopPass(
  applied: number,
  elapsedMs: number,
  budgetMs: number,
): boolean {
  return applied > 0 && elapsedMs >= budgetMs;
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
