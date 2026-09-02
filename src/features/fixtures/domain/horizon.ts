// The past-fixture rule — ONE definition, several consumers.
//
// Product rule (owner, 2026-07-31): KickOffCal only ever creates, updates
// or deletes calendar events for fixtures that have NOT YET FINISHED.
// Events for finished fixtures are frozen — never updated, never deleted,
// never re-created — unless the user has explicitly opted into removing
// past events.
//
// Lives in the fixtures feature because "has this fixture finished" is a
// property of the fixture, and because calendar-sync may import from here
// but not the other way round.

import { Fixture, FIXTURE_DURATION_HOURS, TimePrecision } from './fixture';

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

// Statuses whose startUtc is a DAY SENTINEL rather than a kick-off.
const DATE_ONLY_STATUS = new Set(['tbd', 'postponed']);

// How precisely this fixture's start is known. `timePrecision` is
// authoritative when present; records written before the field existed
// fall back to their status, which is what it was overloaded to mean.
//
// NOTE the deliberate omission: `confidence` no longer implies a day
// sentinel. Once football-data SCHEDULED became provisional-but-nominal,
// treating provisional as date-only would have turned 3,011 real
// kick-offs back into all-day banners — the exact bug this replaces.
// Structural, not `Fixture`: the app's own display snapshot carries the
// same two fields and must resolve precision identically.
export function timePrecisionOf(f: {
  timePrecision?: TimePrecision;
  status: string;
}): TimePrecision {
  if (f.timePrecision) return f.timePrecision;
  return DATE_ONLY_STATUS.has(f.status) ? 'date_only' : 'exact';
}

// A day sentinel, not an instant — so the event spans the day and does not
// finish until the day does.
export function isDateOnlyFixture(f: FixtureTiming): boolean {
  return timePrecisionOf(f) === 'date_only' || f.status === 'postponed';
}

// How many whole days a date_only fixture spans. A day sentinel with
// durationHours 360 is a 15-day tournament, not a one-day banner — until
// Prompt 5 this was collapsed to a single day, which froze the US Open
// (and every multi-day meeting) six hours after its FIRST day ended and
// banished it from the calendar for its remaining fortnight.
export function dateOnlySpanDays(durationHours?: number): number {
  return Math.max(
    1,
    Math.round((durationHours ?? FIXTURE_DURATION_HOURS) / 24),
  );
}

// When this fixture is over. PAST MEANS FINISHED, NOT STARTED: a 96-hour
// County Championship match, a 5-hour golf round and an all-day "time TBC"
// banner are all still live long after they begin, and a postponement
// announced mid-event still has to reach the calendar.
// The fields the end-time rule reads — structural, so the app's display
// snapshot (SnapshotFixture) is judged by the SAME rule as a stored doc.
export interface FixtureTiming {
  startUtc: string;
  durationHours?: number;
  // `string`, not FixtureStatus: the display snapshot carries status as
  // plain text, and it must be judged by the very same rule.
  status: string;
  timePrecision?: TimePrecision;
}

export function fixtureEndUtc(f: FixtureTiming): string {
  if (isDateOnlyFixture(f)) {
    const d = new Date(f.startUtc);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    // The span applies to POSTPONED fixtures too, even though their
    // BANNER collapses to one day: the freeze end may outlive the event
    // it wrote, never undercut it. Collapsing the freeze as well made
    // isPast go true mid-span while the ledger entry (spanning the full
    // window) was not yet end-past — and planSync then DELETED a live
    // tournament's banner, the exact act the horizon rule forbids.
    // Caught by adversarial review before commit; pinned in
    // pastHorizon.test.ts.
    return new Date(
      dayStart + dateOnlySpanDays(f.durationHours) * 86_400_000,
    ).toISOString();
  }
  return eventEndUtc(f.startUtc, f.durationHours);
}

// Grace past the end before a fixture freezes. durationHours is a
// per-LEAGUE constant, not a per-fixture fact — a match that goes to extra
// time, or whose duration was the default 2h guess, must not freeze while
// it is still being played.
export const PAST_GRACE_HOURS = 6;
export const PAST_GRACE_MS = PAST_GRACE_HOURS * 3_600_000;

export function isPast(f: FixtureTiming, nowMs: number): boolean {
  return Date.parse(fixtureEndUtc(f)) + PAST_GRACE_MS <= nowMs;
}

// CURRENT = not yet finished (P0 2026-09-02). Every display surface that
// lists "upcoming" fixtures — Home carousel, Following rail and counts,
// the entity page, the Schedule — judges by THIS, never by start: a
// fifteen-day Slam that began on Sunday is the most current thing a
// follower has, and a start-based filter hid the in-progress US Open on
// every surface and served the 2027 edition (no draw, no children) in its
// place — "no matches at all, men's or women's". The snapshot writer
// already used the end-based rule; the readers did not.
export function isCurrent(f: FixtureTiming, nowMs: number): boolean {
  return !isPast(f, nowMs);
}

export function currentFixtures<T extends FixtureTiming>(
  fixtures: readonly T[],
  nowMs: number,
): T[] {
  return fixtures.filter((f) => isCurrent(f, nowMs));
}

// Has this fixture begun (and not yet finished)? Surfaces place a live
// multi-day block under TODAY, not under the day it started.
export function isLive(f: FixtureTiming, nowMs: number): boolean {
  return Date.parse(f.startUtc) <= nowMs && isCurrent(f, nowMs);
}

// The same rule expressed over a ledger entry, which records the event's
// own end. The planner needs this because a frozen fixture is (by design)
// no longer in the fetch, so the ENTRY is the only evidence left.
export function isEndPast(endUtc: string, nowMs: number): boolean {
  return Date.parse(endUtc) + PAST_GRACE_MS <= nowMs;
}

// The longest fixture we serve. Was 96 hours (the County Championship);
// tennis tournaments and athletics championships are longer — the US Open
// runs 15 days, and this bound must not exclude a Grand Slam that is
// halfway through. Three weeks covers every span either source publishes
// with room to spare.
//
// The cost is a wider query lookback (now − 510h rather than − 102h), so
// a sync reads a few more past-but-recent documents. Correctness first:
// the alternative is a live tournament falling out of the fetch, and the
// ledger freeze then treating it as gone.
export const MAX_FIXTURE_DURATION_HOURS = 24 * 21;

export function queryHorizonUtc(nowMs: number): string {
  return new Date(
    nowMs - (MAX_FIXTURE_DURATION_HOURS + PAST_GRACE_HOURS) * 3_600_000,
  ).toISOString();
}

// Opt-in removal of finished events. Fixed retention, deliberately not a
// picker: the setting is destructive and a dial invites fiddling with it.
export const PAST_RETENTION_DAYS = 30;
export const PAST_RETENTION_MS = PAST_RETENTION_DAYS * 86_400_000;

export function isBeyondRetention(endUtc: string, nowMs: number): boolean {
  return Date.parse(endUtc) + PAST_RETENTION_MS <= nowMs;
}
