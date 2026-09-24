// A separate calendar for each sport — the pure core (owner brief
// 2026-09-24).
//
// THE LAYOUT is where events live, never which: the per-follow calendar
// control, the inclusion rule and the Settings default decide WHAT goes
// in; the layout decides only WHERE. Combined: every event in the one
// calendar target. Per-sport: each event in its sport's calendar
// ("KickOffCal · <Sport>", follows/domain/sportCalendarGroup.ts),
// created the first time that sport has an event and removed once it
// holds none.
//
// SWITCHING LAYOUT MOVES EVENTS, by the same create → repoint-and-owe →
// delete step a calendar-target switch uses (domain/calendarMigration.ts,
// DECISIONS 2026-07-30), so it inherits that step's convergence: killed
// after a create, before the ledger write → an unreferenced tagged event
// the prune removes; killed after the write → a stray every pass drains.
// The plan is re-derived from the ledger each pass, so a move resumes
// exactly where it stopped. What a step needs that the target switch did
// not: a destination PER ENTRY, and a calendar that may not exist yet.

import type { Ledger, LedgerEntry } from './syncPlan';
import { isEndPast } from '../../fixtures/domain/horizon';
import { entriesFromRecoveredEvents, RecoveredEvent } from './recovery';

export type CalendarLayout = 'combined' | 'per-sport';

// "KickOffCal · Soccer". The brand and the separator never translate; the
// sport is the Following row's own word for it, in the user's region and
// language when the calendar is created — and never renamed after, the
// same as the colour: from then on the calendar is the user's to edit.
export const SPORT_CALENDAR_PREFIX = 'KickOffCal · ';

export function layoutOf(prefs: { separateSportCalendars: boolean }): CalendarLayout {
  return prefs.separateSportCalendars ? 'per-sport' : 'combined';
}

// What a tap on the switch does. PREMIUM ONLY (owner ruling 2026-09-24):
// in the free state it is the way into the offer and changes NOTHING —
// either direction, so a lapsed subscriber's calendars stay as they are.
// Otherwise it asks first when games are already in a calendar (they
// will move), and switches straight away when there is nothing to move.
export type LayoutSwitchStep = 'offer' | 'confirm' | 'switch';

export function layoutSwitchStep(premiumLocked: boolean, gamesInCalendar: number): LayoutSwitchStep {
  if (premiumLocked) return 'offer';
  return gamesInCalendar > 0 ? 'confirm' : 'switch';
}

// Where one entry belongs: a calendar that exists, or a sport whose
// calendar must be created before the event can go in it.
export type Placement =
  | { calendarId: string; group?: string }
  | { calendarId: null; group: string };

export interface RelocationStep {
  fixtureId: string;
  entry: LedgerEntry;
  to: Placement;
}

// Everything not where the layout wants it. `placementOf` answers null
// when an entry cannot be placed yet (its sport is not known) — it stays
// where it is and is planned again next pass.
export function planLayoutRelocation(
  ledger: Ledger,
  placementOf: (fixtureId: string, entry: LedgerEntry) => Placement | null,
): RelocationStep[] {
  return Object.entries(ledger).flatMap(([fixtureId, entry]) => {
    const to = placementOf(fixtureId, entry);
    if (to === null) return [];
    if (to.calendarId !== null && to.calendarId === entry.calendarId) return [];
    return [{ fixtureId, entry, to }];
  });
}

// Calendars no ledger entry lives in (and no leftover is waiting in) —
// the only candidates for "remove it once it's empty". Being unreferenced
// is necessary, not sufficient: the caller still checks the calendar
// itself is empty before deleting it.
export function unreferencedCalendarIds(
  ledger: Ledger,
  candidates: readonly string[],
): string[] {
  const used = new Set<string>();
  for (const e of Object.values(ledger)) {
    used.add(e.calendarId);
    if (e.strayCalendarId) used.add(e.strayCalendarId);
  }
  return [...new Set(candidates)].filter((id) => !used.has(id));
}

// The fixture document that says which sport an entry is. A tier pass
// synthesises ids for its bookend notes (`<parent>::close`); their sport
// is their parent's.
export function lookupIdOf(fixtureId: string): string {
  const i = fixtureId.indexOf('::');
  return i < 0 ? fixtureId : fixtureId.slice(0, i);
}

// Reinstall recovery across every calendar of ours (the target first,
// then the sport calendars): each calendar's tagged events rebuild ledger
// entries in THAT calendar; a fixture found in two calendars (a move
// killed between its create and its delete, then the storage lost) keeps
// its first copy, and a later LIVE copy is surplus — a finished one stays
// put, the same past-event rule single-calendar recovery follows.
export function mergeRecoveredCalendars(
  scans: ReadonlyArray<{ calendarId: string; events: readonly RecoveredEvent[] }>,
  nowMs: number = Date.now(),
): { ledger: Ledger; surplus: Array<{ eventId: string; calendarId: string }> } {
  const ledger: Ledger = {};
  const surplus: Array<{ eventId: string; calendarId: string }> = [];
  for (const { calendarId, events } of scans) {
    const rebuilt = entriesFromRecoveredEvents(events, calendarId, nowMs);
    for (const eventId of rebuilt.surplusEventIds) surplus.push({ eventId, calendarId });
    for (const [fixtureId, entry] of Object.entries(rebuilt.ledger)) {
      if (ledger[fixtureId]) {
        if (!isEndPast(entry.endUtc, nowMs)) surplus.push({ eventId: entry.eventId, calendarId });
        continue;
      }
      ledger[fixtureId] = entry;
    }
  }
  return { ledger, surplus };
}
