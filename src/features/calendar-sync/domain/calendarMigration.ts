// Moving the calendar target — pure core. Switching target MUST move
// existing events, never orphan them (docs/CALENDAR_TARGET.md).
//
// The ledger is the record of where every fixture's event actually
// lives, so the plan is simply "every entry not already in the target".
// That makes the switch idempotent by construction: re-planning after an
// interruption yields exactly the work that is left.
//
// Convergence is the hard part. A move is create-then-delete across two
// calendars with no transaction, so every intermediate state has to be
// recoverable:
//
//   killed after create, before the ledger write
//     → the ledger still points at the old event, so the re-run moves it
//       again; the first new event is tagged, in the target, and
//       unreferenced, so the standing prune invariant deletes it.
//   killed after the ledger write, before the old event is deleted
//     → the entry carries strayEventId, and every sync drains strays.
//
// Which is why the repoint and the stray record are ONE write: any split
// between them would leave an event stranded in a calendar we no longer
// scan, invisible to prune forever.

import { Ledger, LedgerEntry } from './syncPlan';

export interface MoveStep {
  fixtureId: string;
  entry: LedgerEntry;
}

// Everything still living somewhere other than the target.
export function planTargetMigration(
  ledger: Ledger,
  targetCalendarId: string,
): MoveStep[] {
  return Object.entries(ledger)
    .filter(([, entry]) => entry.calendarId !== targetCalendarId)
    .map(([fixtureId, entry]) => ({ fixtureId, entry }));
}

// The atomic half-step: this fixture now lives at newEventId in the
// target, and the event it vacated is owed a delete.
export function movedEntry(
  entry: LedgerEntry,
  newEventId: string,
  targetCalendarId: string,
): LedgerEntry {
  return {
    ...entry,
    eventId: newEventId,
    calendarId: targetCalendarId,
    strayEventId: entry.eventId,
  };
}

export function clearedStray(entry: LedgerEntry): LedgerEntry {
  const { strayEventId: _dropped, ...rest } = entry;
  return rest;
}

// Leftovers from an interrupted switch. Drained at the top of every
// sync, so an abandoned migration cleans itself up without the user ever
// touching the picker again.
export function strayEventIds(
  ledger: Ledger,
): Array<{ fixtureId: string; eventId: string }> {
  return Object.entries(ledger)
    .filter(([, e]) => typeof e.strayEventId === 'string' && e.strayEventId)
    .map(([fixtureId, e]) => ({ fixtureId, eventId: e.strayEventId as string }));
}

// Old calendars a switch has left behind — the candidates for "delete it
// once empty" (only ever applied to calendars WE created).
export function vacatedCalendarIds(
  ledgerBefore: Ledger,
  targetCalendarId: string,
): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(ledgerBefore)) {
    if (entry.calendarId !== targetCalendarId) ids.add(entry.calendarId);
  }
  return [...ids];
}
