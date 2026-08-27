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
  dateOnlySpanDays,
  eventEndUtc,
  fixtureEndUtc,
  isBeyondRetention,
  isEndPast,
  isPast,
  timePrecisionOf,
} from '../../fixtures/domain/horizon';
import {
  allDayReminderFor,
  EventSettingsMap,
  extraRemindersFor,
  reminderMinutesFor,
} from './eventSettings';
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
  // The reminder we last WROTE to this event, so a change to it produces
  // a real calendar operation. Without this the planner could not see a
  // reminder change at all: nothing else about the event differs, so a
  // per-event setting (or a changed global preference) sat in storage
  // and never reached the calendar.
  //
  // ABSENT MEANS UNKNOWN, and unknown is treated as a MISMATCH so the
  // event converges on the next pass. Existing ledgers are stamped once
  // with what was assumed applied (data/ledger.ts::stampMissingReminders)
  // precisely so "unknown" is rare rather than universal.
  reminderMinutes?: number | null;
  // The ADDITIONAL alarms last written (slots 2/3, Stage 5). ABSENT
  // MEANS EMPTY, the allDayReminder rule below rather than the
  // reminderMinutes rule above: before this field existed the engine
  // wrote exactly one alarm, so an unstamped entry testifies to
  // no-extras — treating it as unknown would rewrite every event in
  // every calendar on the first sync after this ships.
  extraReminders?: number[];
  // The day-shaped reminder last written to an ALL-DAY entry (Prompt 24
  // A1). ABSENT MEANS NULL, not unknown — the deliberate opposite of the
  // reminderMinutes rule above, because before this field existed the
  // engine wrote NO alarm on any all-day entry, ever. Absent therefore
  // IS the old engine's testimony, and treating it as a mismatch would
  // rewrite every all-day event in every calendar on first sync while
  // the global default is off and nothing has actually changed.
  allDayReminder?: import('./prefs').AllDayReminder;
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
  // Day-shaped reminder for all-day entries; null on timed events. One
  // channel per entry kind, so the two can never stack (eventSettings).
  allDayReminder: import('./prefs').AllDayReminder;
  // Minutes before the start, or null for no alarm. Part of the DESIRED
  // state rather than something the engine decides at write time, so
  // that (a) a delete-and-recreate re-applies it by construction and
  // (b) the planner can compare it with what the ledger last wrote.
  reminderMinutes: number | null;
  // Slots 2/3 (Stage 5), already resolved by extraRemindersFor: empty
  // on all-day entries and on events with a per-event override. Same
  // desired-state reasoning as reminderMinutes above.
  extraReminders: number[];
  // Goes in the event's description, below the tag line. Used to say a
  // time is not settled yet WITHOUT putting it in the title, where it
  // would shout on every glance at the calendar.
  note?: string;
}

// What a nominal time means, in the user's words. Deliberately promises
// the correction rather than just warning: the app's whole claim is that
// the calendar keeps itself right.
export const NOMINAL_TIME_NOTE =
  'Start time is not confirmed yet — this will update automatically.';

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

function addDaysUtc(dayIso: string, days: number): string {
  const d = new Date(dayIso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

// Per-follow F1 sessions override (Prompt 11): follow key → choice.
// Structural type, deliberately not imported from the follows feature —
// this module stays pure and feature-local.
export type SeriesScopeMap = ReadonlyMap<string, 'all' | 'race-only'>;

// The sessions rule for THIS fixture: an EXPLICIT per-follow choice
// beats the global default (a user who set the F1 follow to race-only
// meant it, even while a driver follow rides the same fixtures with no
// opinion of its own), and among explicit choices the most permissive
// wins — one follow explicitly asking for the full weekend keeps it.
// Only when no matching follow has spoken does the global pref govern.
function seriesSessionsFor(
  f: Fixture,
  prefs: CalendarPrefs,
  scopes?: SeriesScopeMap,
): 'all' | 'race-only' {
  if (scopes && scopes.size > 0) {
    let scoped: 'race-only' | null = null;
    for (const k of f.followKeys) {
      const s = scopes.get(k);
      if (s === 'all') return 'all';
      if (s === 'race-only') scoped = s;
    }
    if (scoped) return scoped;
  }
  return prefs.seriesSessions === 'race-only' ? 'race-only' : 'all';
}

export function desiredEventFor(
  f: Fixture,
  prefs: CalendarPrefs,
  seriesScopes?: SeriesScopeMap,
  // Per-event overrides (domain/eventSettings.ts). Defaulted so every
  // existing caller — and every snapshot consumer, which has no business
  // knowing about alarms — keeps working unchanged.
  settings: EventSettingsMap = {},
): DesiredEvent | null {
  // Series sports: optionally keep only the race itself in the calendar.
  if (
    seriesSessionsFor(f, prefs, seriesScopes) === 'race-only' &&
    f.sessionKind === 'support'
  ) {
    return null;
  }
  const matchTitle = f.title;
  if (f.status === 'cancelled') return null;

  const allDayFor = (suffix: string, days = 1): DesiredEvent => {
    const day = dayStartUtc(f.startUtc);
    return {
      title: suffix ? `${matchTitle} — ${suffix}` : matchTitle,
      startUtc: day,
      endUtc: addDaysUtc(day, days),
      allDay: true,
      // No minutes alarm on a day sentinel — see reminderMinutesFor. The
      // day-SHAPED reminder is the all-day channel (Prompt 24 A1); the
      // minutes override is kept and lands when a real time arrives.
      reminderMinutes: reminderMinutesFor(f.id, settings, prefs, true),
      extraReminders: extraRemindersFor(f.id, settings, prefs, true),
      allDayReminder: allDayReminderFor(f.id, settings, prefs, true),
    };
  };

  // A postponement carries the OLD day and no new time. The day is the
  // only honest thing left to show — deliberately ONE day, whatever the
  // fixture's normal span.
  if (f.status === 'postponed') return allDayFor('postponed');

  const precision = timePrecisionOf(f);

  // ALL-DAY IS RESERVED FOR date_only. A banner is what you write when you
  // genuinely do not know the time; using it for a time that merely is not
  // settled cost 3,011 fixtures their kick-off, including 380 of 380 in
  // the Premier League, and cost every one of them its reminder.
  //
  // A date_only fixture spans its real days (a 15-day tournament is a
  // 15-day banner, not a banner on day one). Multi-day spans drop the
  // "time TBC" suffix: a span is not claiming a missing kick-off, it IS
  // the event's honest shape.
  if (precision === 'date_only') {
    const days = dateOnlySpanDays(f.durationHours);
    return allDayFor(days > 1 ? '' : 'time TBC', days);
  }

  // The user asked for all-day events regardless; span multi-day
  // fixtures here too. Days are counted from the fixture's REAL timed
  // end, not from a midnight-based day count — a 96h match starting at
  // 10:00 runs into a fifth calendar day, and a banner that stops a day
  // short is wrong on the day it matters most.
  if (prefs.eventStyle === 'all-day') {
    const day = dayStartUtc(f.startUtc);
    const days = Math.max(
      1,
      Math.ceil(
        (Date.parse(eventEndUtc(f.startUtc, f.durationHours)) -
          Date.parse(day)) /
          86_400_000,
      ),
    );
    return allDayFor('', days);
  }

  return {
    title: matchTitle,
    startUtc: f.startUtc,
    endUtc: eventEndUtc(f.startUtc, f.durationHours),
    allDay: false,
    reminderMinutes: reminderMinutesFor(f.id, settings, prefs, false),
    extraReminders: extraRemindersFor(f.id, settings, prefs, false),
    allDayReminder: null,
    // Nominal: a real instant, but not the settled one. Said in the
    // description rather than the title — the title is read at a glance
    // fifty times, the description once when it matters.
    ...(precision === 'nominal' ? { note: NOMINAL_TIME_NOTE } : {}),
  };
}

function sameReminderSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const sb = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((v, i) => v === sb[i]);
}

function entryMatches(entry: LedgerEntry, desired: DesiredEvent): boolean {
  return (
    // Reminders are ours (domain/eventSettings.ts), so a difference
    // between what we last wrote and what is now wanted is a real
    // change. An entry that never recorded one is UNKNOWN, and unknown
    // must not be read as "matches" — that is the read-failure-as-empty
    // shape the standing invariant forbids, applied to the ledger.
    entry.reminderMinutes === desired.reminderMinutes &&
    // Absent-means-empty, per the LedgerEntry comment: one alarm was
    // all the old engine ever wrote. Order-insensitive — two alarm
    // sets are the same alarms whatever order they were recorded in.
    sameReminderSet(entry.extraReminders ?? [], desired.extraReminders) &&
    // Absent-means-null, per the LedgerEntry comment: the old engine
    // never wrote an all-day alarm, so an unstamped entry testifies to
    // exactly that.
    (entry.allDayReminder ?? null) === desired.allDayReminder &&
    entry.startUtc === desired.startUtc &&
    // endUtc joined the compare in Prompt 5: without it a change ONLY to
    // an event's duration — a confirmed appearance slot at the same
    // instant as its provisional window, a widened tournament span —
    // produced no op and the calendar kept the stale end forever.
    entry.endUtc === desired.endUtc &&
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
  seriesScopes?: SeriesScopeMap,
  settings: EventSettingsMap = {},
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
    const desired = desiredEventFor(f, prefs, seriesScopes, settings);
    if (!desired) continue;
    // The product is upcoming games: a finished season must never pour
    // hundreds of past fixtures into the calendar. Events we already
    // created stay put as they age — erasing someone's history would be
    // worse than leaving it. An all-day SPAN is judged by its end, not
    // its first day: a fortnight tournament followed on day five is
    // live, not history, and keying on the day-one sentinel made it
    // uncreatable for anyone who followed (or reinstalled) mid-event.
    const createCutoff = desired.allDay ? desired.endUtc : desired.startUtc;
    if (createCutoff < horizonStartUtc && !ledger[f.id]) continue;
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

// PROVIDER DELETIONS PER PASS, capped — because Android's sync framework
// has a mass-deletion safety valve our drain can trip. An adapter that
// finds "too many" pending deletions at upsync sets
// SyncResult.tooManyDeletions and the OS HALTS the sync behind a
// user-facing confirmation about mass-deleting calendar data — which is
// exactly what a user who just unfollowed a league must never meet.
// Proven on hardware 2026-08-13: 166 deletions in one pass wedged the
// "Social" feed upsync in mesg=too-many-deletions until manually
// confirmed, while phone + web kept showing every "deleted" event.
//
// Google's adapter threshold is not published (the adapter is closed
// source; the framework documents only the flag), so the cap is chosen
// WELL under the one hard datapoint (166 trips it) and matches the
// batch size the Apps-Script community independently converged on for
// Google Calendar write bursts (~10). Chunks must also be SPACED — the
// gate counts deletions pending at upsync time, so back-to-back passes
// would re-accumulate; DELETE_CHUNK_SPACING_MS gives the adapter a
// cycle to drain each chunk before the next lands.
// The delete-chunking machinery that briefly lived here (cap + spaced
// reruns) was DELETED with the REST swap, deliberately and completely
// (Prompt 28 §1: dead machinery gets resurrected by a future session
// that doesn't know why it exists). It existed to duck Android's
// sync-adapter mass-deletion gate; the REST path never touches the
// adapter, and iOS's EventKit never had a gate. The hardware
// measurements that motivated and then obsoleted it are in
// docs/DECISIONS.md (2026-08-13) and AGENTS.md rule 16.

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
  // The ingest slice this fixture belongs to. Carried so a fixture can
  // name its own source freshness ("checked 2 hours ago") without a
  // follow to route through — see fixtures/domain/sources.ts.
  competitionId: string;
  followKeys: string[];
  // TIMING HONESTY (Prompt 16 A3). These are what let a card explain
  // itself: whether only the day is known, whether the time shown is a
  // placeholder, and whether this is an appearance borrowing its
  // parent's window until a slot is published. They were already on the
  // stored fixture and simply never reached the app's own view of it.
  timePrecision?: 'exact' | 'nominal' | 'date_only';
  confidence?: 'confirmed' | 'provisional';
  parentFixtureId?: string;
  athletes?: string[];
  // Both participants' flags, where the server proved the whole pair
  // (Prompt 24 C2) — the combat hero's imagery.
  participantCountries?: string[];
  // Venue NAME where a provider publishes one (TSDB strVenue) — the
  // key the licensed venue-photography layer prefers over the
  // home-team lookup (Prompt 9b).
  venue?: string;
  venueCity?: string; // tournament-photo disambiguator (Prompt 9c)
  // Team sports only. Carried so the app can identify a fixture by its
  // PARTICIPANTS rather than by whichever follow happened to pull it in:
  // a competition follow knows the league, not who is playing, which is
  // why those cards had no identity to show.
  homeTeam?: string;
  awayTeam?: string;
  // Both sides' crests, stamped server-side at ingest (Stage 4B) — the
  // hero composite renders them regardless of which follow owns the card.
  homeCrestUrl?: string;
  awayCrestUrl?: string;
}

export function upcomingSnapshot(
  fixtures: Fixture[],
  prefs: CalendarPrefs,
  horizonStartUtc: string,
  cap: number,
  seriesScopes?: SeriesScopeMap,
): SnapshotFixture[] {
  return fixtures
    .filter(
      (f) =>
        // "Upcoming" means NOT YET FINISHED — the same end-based rule as
        // the freeze, so day five of a Slam does not vanish from Home
        // while its calendar banner spans the fortnight. (For a 2h match
        // this differs from the old start-based cut by minutes; for a
        // multi-day span it is the difference between present and gone.)
        fixtureEndUtc(f) > horizonStartUtc &&
        desiredEventFor(f, prefs, seriesScopes) !== null,
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
      competitionId: f.competitionId,
      followKeys: f.followKeys,
      ...(f.timePrecision !== undefined
        ? { timePrecision: f.timePrecision }
        : {}),
      ...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
      ...(f.participantCountries !== undefined
        ? { participantCountries: f.participantCountries }
        : {}),
      ...(f.parentFixtureId !== undefined
        ? { parentFixtureId: f.parentFixtureId }
        : {}),
      ...(f.athletes !== undefined ? { athletes: f.athletes } : {}),
      ...(f.homeTeam !== undefined ? { homeTeam: f.homeTeam } : {}),
      ...(f.awayTeam !== undefined ? { awayTeam: f.awayTeam } : {}),
      ...(f.homeCrestUrl !== undefined ? { homeCrestUrl: f.homeCrestUrl } : {}),
      ...(f.awayCrestUrl !== undefined ? { awayCrestUrl: f.awayCrestUrl } : {}),
      ...(f.venue !== undefined ? { venue: f.venue } : {}),
      ...(f.venueCity !== undefined ? { venueCity: f.venueCity } : {}),
    }));
}
