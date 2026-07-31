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

import { Fixture, FIXTURE_DURATION_HOURS } from './fixture';

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

// Statuses whose startUtc is a DAY SENTINEL rather than a kick-off. Their
// event is an all-day banner, so it does not finish until the day does.
const DATE_ONLY = new Set(['tbd', 'postponed']);

export function isDateOnlyFixture(f: Fixture): boolean {
  return (
    DATE_ONLY.has(f.status) ||
    (f.confidence === 'provisional' && f.status !== 'cancelled')
  );
}

// When this fixture is over. PAST MEANS FINISHED, NOT STARTED: a 96-hour
// County Championship match, a 5-hour golf round and an all-day "time TBC"
// banner are all still live long after they begin, and a postponement
// announced mid-event still has to reach the calendar.
export function fixtureEndUtc(f: Fixture): string {
  if (isDateOnlyFixture(f)) {
    const d = new Date(f.startUtc);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return new Date(dayStart + 86_400_000).toISOString();
  }
  return eventEndUtc(f.startUtc, f.durationHours);
}

// Grace past the end before a fixture freezes. durationHours is a
// per-LEAGUE constant, not a per-fixture fact — a match that goes to extra
// time, or whose duration was the default 2h guess, must not freeze while
// it is still being played.
export const PAST_GRACE_HOURS = 6;
export const PAST_GRACE_MS = PAST_GRACE_HOURS * 3_600_000;

export function isPast(f: Fixture, nowMs: number): boolean {
  return Date.parse(fixtureEndUtc(f)) + PAST_GRACE_MS <= nowMs;
}

// The same rule expressed over a ledger entry, which records the event's
// own end. The planner needs this because a frozen fixture is (by design)
// no longer in the fetch, so the ENTRY is the only evidence left.
export function isEndPast(endUtc: string, nowMs: number): boolean {
  return Date.parse(endUtc) + PAST_GRACE_MS <= nowMs;
}

// The longest fixture we serve: the County Championship is configured at
// 96 hours. Any fixture that started longer ago than this plus the grace
// cannot still be running, which makes it a safe lower bound for a query
// that must not exclude a single live fixture.
export const MAX_FIXTURE_DURATION_HOURS = 96;

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
