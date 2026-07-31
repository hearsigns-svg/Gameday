// Reinstall recovery — pure core. Given the tagged events found in the
// target calendar, rebuild the ledger the app lost (uninstall wipes
// MMKV; calendar events survive in the OS store). One entry per fixture
// id; any extra events for the same fixture (zombie-run leftovers) are
// surplus and must be deleted by the engine.
//
// This module also owns the OWNERSHIP GATE. Once the target can be a
// calendar the user owns (docs/CALENDAR_TARGET.md), "tagged" is the only
// thing standing between a sync bug and someone's real appointments, so
// the check lives here — pure, and pinned by tests — instead of being an
// incidental filter inside the driver.

import { isEndPast } from '../../fixtures/domain/horizon';
import { Ledger } from './syncPlan';

export interface RecoveredEvent {
  fixtureId: string;
  eventId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
}

// Written into every event's notes at creation; the durable record that
// survives an uninstall. An internal identifier — it must never chase
// branding, or recovery breaks on every rename.
export const NOTES_TAG = 'gameday-fixture:';

// The raw shape the platform hands back from a calendar scan. Only the
// fields ownership and recovery actually need.
export interface ScannedEvent {
  id: string;
  calendarId?: string;
  notes?: string | null;
  title?: string | null;
  startDate: string | Date;
  endDate: string | Date;
  allDay?: boolean;
}

// How far either side of today a scan looks for events we wrote. The span
// has to cover everything we could plausibly have written: fixtures land
// up to ~3 years out (World Cup, F1 calendars) and the recovery audit of
// 2026-07-26 widened the lookback to 5 years after a −3y window missed the
// two oldest fixtures.
export const SCAN_BACK_YEARS = 5;
export const SCAN_FORWARD_YEARS = 3;

// …but that full span CANNOT be asked for in one query. EventKit's
// predicateForEvents silently returns NOTHING for a range this long:
// measured 2026-07-31 on iOS 26.5, a −5y…+3y scan of a calendar holding
// 1,790 tagged events returned 0, while the identical code on Android's
// CalendarProvider returned all 964 of its own. Nothing errored — the
// scan just came back empty, which the prune invariant reads as "no
// orphans" and recovery reads as "no ledger to rebuild".
//
// So the span is split into windows the platform will honour and the
// results concatenated. Same shape as the fixture query's 30-key chunks:
// the ceiling is not negotiable, so ask within it repeatedly.
export const SCAN_CHUNK_YEARS = 2;

export interface ScanWindow {
  start: Date;
  end: Date;
}

function shiftYears(from: Date, years: number): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// Contiguous windows covering [now − SCAN_BACK_YEARS, now + SCAN_FORWARD_YEARS],
// none longer than SCAN_CHUNK_YEARS. Boundaries touch, so an event sitting
// exactly on one can be returned twice — callers dedupe by event id.
export function scanWindows(
  now: Date = new Date(),
  chunkYears: number = SCAN_CHUNK_YEARS,
  backYears: number = SCAN_BACK_YEARS,
  forwardYears: number = SCAN_FORWARD_YEARS,
): ScanWindow[] {
  const first = shiftYears(now, -backYears);
  const last = shiftYears(now, forwardYears);
  const windows: ScanWindow[] = [];
  let start = first;
  while (start < last) {
    const end = shiftYears(start, chunkYears);
    windows.push({ start, end: end > last ? last : end });
    start = end;
  }
  return windows;
}

// Our tag, or null. Requires a usable fixture id: a bare tag with
// nothing after it identifies no fixture, so it is not evidence that we
// wrote the event and must not license deleting it.
export function fixtureIdFromNotes(
  notes: string | null | undefined,
): string | null {
  if (typeof notes !== 'string') return null;
  if (!notes.startsWith(NOTES_TAG)) return null;
  const id = notes.slice(NOTES_TAG.length).split('\n')[0].trim();
  return id.length > 0 ? id : null;
}

// Normalise a platform-reported all-day boundary to the UTC day the
// planner wrote. Two read-back shapes exist: an exact UTC boundary
// (kept as-is), or device-local midnight — whose LOCAL calendar date IS
// the intended day. A round-to-nearest cannot cover both: inhabited
// offsets span −11…+14 (25h > 24h), so UTC+13/+14 devices would snap a
// day early.
function utcDayOf(input: string | Date): string {
  const d = new Date(input);
  if (d.getTime() % 86_400_000 === 0) return d.toISOString();
  return new Date(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()),
  ).toISOString();
}

// THE gate. Recovery and prune both consume this list and nothing else,
// so an event we did not write cannot reach a delete call: it must carry
// our tag AND live in the calendar we are targeting. The calendar check
// is belt-and-braces (a scan is already calendar-scoped) and is skipped
// only when the platform does not report the id.
export function ourEventsIn(
  events: readonly ScannedEvent[],
  targetCalendarId: string,
): RecoveredEvent[] {
  const mine: RecoveredEvent[] = [];
  for (const e of events) {
    const fixtureId = fixtureIdFromNotes(e.notes);
    if (fixtureId === null) continue;
    if (e.calendarId !== undefined && e.calendarId !== targetCalendarId) {
      continue;
    }
    const allDay = e.allDay ?? false;
    mine.push({
      fixtureId,
      eventId: e.id,
      title: e.title ?? '',
      // All-day reads must be normalised to the UTC day boundary the
      // planner writes (platforms may report local midnight instead).
      // Without this, a recovered placeholder never matches its desired
      // shape and is pointlessly rewritten on every sync after a
      // reinstall.
      startUtc: allDay
        ? utcDayOf(e.startDate)
        : new Date(e.startDate).toISOString(),
      endUtc: allDay ? utcDayOf(e.endDate) : new Date(e.endDate).toISOString(),
      allDay,
    });
  }
  return mine;
}

// How many events in a scanned calendar are NOT ours. Zero is the only
// value that licenses adopting, renaming or deleting a whole calendar —
// a user calendar that happens to be titled "KickOffCal" must never be
// hijacked.
export function foreignEventCount(events: readonly ScannedEvent[]): number {
  return events.filter((e) => fixtureIdFromNotes(e.notes) === null).length;
}

// THE IMPOSSIBLE STATE. A scan that returns no tagged events while the
// ledger holds entries cannot happen under correct operation: every
// ledger entry names an event we wrote into this calendar. It means the
// scan cannot SEE the calendar — which is the state F13 sat in undetected,
// EventKit answering an over-long range with an empty list while 1,790 of
// our events sat in the calendar.
//
// Both consumers of the scan misread that silence as fact: prune concludes
// there are no orphans, and recovery concludes there is no ledger to
// rebuild and lets the next follow re-create everything. Neither is
// recoverable after the fact, so the pass has to stop instead.
//
// This is Stage 0's standing invariant — a read failure must never be
// indistinguishable from an empty result — applied to the one surface that
// was still exempt from it. It holds whatever Apple does to the ceiling
// next, which a measured boundary would not.
export function isScanAnomaly(
  scannedTagged: number,
  ledgerEntries: number,
): boolean {
  return scannedTagged === 0 && ledgerEntries > 0;
}

// Standing invariant: every tagged event in the calendar must be
// referenced by the ledger. Anything else is an orphan (zombie dev runs,
// scan-window misses, interrupted installs) and must be deleted.
export function orphanEventIds(
  events: readonly RecoveredEvent[],
  ledger: Ledger,
): string[] {
  const ledgered = new Set(Object.values(ledger).map((e) => e.eventId));
  return events.filter((e) => !ledgered.has(e.eventId)).map((e) => e.eventId);
}

export function entriesFromRecoveredEvents(
  events: readonly RecoveredEvent[],
  calendarId: string,
  nowMs: number = Date.now(),
): { ledger: Ledger; surplusEventIds: string[] } {
  const ledger: Ledger = {};
  const surplusEventIds: string[] = [];
  for (const e of events) {
    if (ledger[e.fixtureId]) {
      // Surplus copies are removed only while the fixture is still LIVE.
      // A duplicate of a finished game stays in the calendar permanently:
      // the past-fixture rule forbids deleting a past event, and that
      // takes precedence over tidiness. Owner's explicit decision —
      // see docs/DECISIONS.md, 2026-07-31.
      if (!isEndPast(e.endUtc, nowMs)) surplusEventIds.push(e.eventId);
      continue;
    }
    ledger[e.fixtureId] = {
      eventId: e.eventId,
      calendarId,
      startUtc: e.startUtc,
      endUtc: e.endUtc,
      title: e.title,
      allDay: e.allDay,
    };
  }
  return { ledger, surplusEventIds };
}
