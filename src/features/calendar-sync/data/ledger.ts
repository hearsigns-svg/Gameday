// Device sync ledger: fixtureId → calendar event. Persisted after EVERY
// applied operation so a killed sync re-runs to convergence. The fixture
// id is also embedded in each event's notes (see calendarDriver) so the
// ledger can be rebuilt after reinstall (M4).

import { readJson, writeJson } from '../../../core/storage';
import { Ledger, LedgerEntry } from '../domain/syncPlan';

const KEY = 'ledger.v1';

export function loadLedger(): Ledger {
  return readJson<Ledger>(KEY, {});
}

// After a user-invoked calendar erase (Stage 7B): the events are gone,
// and a ledger still claiming them would make the engine "update"
// ghosts. Cleared ONLY when the calendar was actually deleted.
export function clearLedger(): void {
  writeJson(KEY, {});
}

export function upsertLedgerEntry(fixtureId: string, entry: LedgerEntry): void {
  const ledger = loadLedger();
  ledger[fixtureId] = entry;
  writeJson(KEY, ledger);
}

export function removeLedgerEntry(fixtureId: string): void {
  const ledger = loadLedger();
  delete ledger[fixtureId];
  writeJson(KEY, ledger);
}

// ONE-TIME per entry: record what a pre-reminder-tracking entry is
// assumed to be carrying, so the planner has something to compare
// against (see LedgerEntry.reminderMinutes and the assumption stated in
// domain/eventSettings.ts::assumedAppliedReminder).
//
// Without this, every entry in every existing ledger would read as
// UNKNOWN on the first sync after this ships and be rewritten — which
// would also wipe any alarm a user had added by hand in their own
// calendar. Returns how many entries were stamped; zero on every
// subsequent run, so it is a no-op the moment it has done its job.
export function stampMissingReminders(
  assumed: (entry: LedgerEntry) => number | null,
): number {
  const ledger = loadLedger();
  let stamped = 0;
  for (const [fixtureId, entry] of Object.entries(ledger)) {
    if (entry.reminderMinutes !== undefined) continue;
    ledger[fixtureId] = { ...entry, reminderMinutes: assumed(entry) };
    stamped++;
  }
  if (stamped > 0) writeJson(KEY, ledger);
  return stamped;
}
