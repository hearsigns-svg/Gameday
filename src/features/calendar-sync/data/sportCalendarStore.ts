// Which calendar of ours holds each sport (owner brief 2026-09-24), and
// whether a layout move is still under way.
//
// A sport's calendar id is RECORDED the moment the calendar is created,
// before any event is written into it: the prune and the empty-calendar
// sweep work from this record, so a calendar that holds our events must
// never be missing from it.

import { readJson, writeJson } from '../../../core/storage';
import type { CalendarLayout } from '../domain/sportCalendars';

const MAP_KEY = 'sportCalendars.v1';
const MOVE_KEY = 'calendarLayoutMove.v1';

export function sportCalendarIds(): Record<string, string> {
  return readJson<Record<string, string>>(MAP_KEY, {});
}

export function recordSportCalendar(group: string, calendarId: string): void {
  writeJson(MAP_KEY, { ...sportCalendarIds(), [group]: calendarId });
}

export function forgetSportCalendar(calendarId: string): void {
  const next = Object.fromEntries(
    Object.entries(sportCalendarIds()).filter(([, id]) => id !== calendarId),
  );
  writeJson(MAP_KEY, next);
}

export function forgetAllSportCalendars(): void {
  writeJson(MAP_KEY, {});
}

// Set when the user confirms a move; cleared, with the "done" toast, by
// the first pass that finds nothing left to move. Persisted, so a move
// the app was closed in the middle of still announces itself when it
// finishes on a later open.
export function pendingLayoutMove(): CalendarLayout | null {
  return readJson<CalendarLayout | null>(MOVE_KEY, null);
}

export function setPendingLayoutMove(layout: CalendarLayout | null): void {
  writeJson(MOVE_KEY, layout);
}
