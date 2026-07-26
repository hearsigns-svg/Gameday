// Reinstall recovery — pure core. Given the tagged events found in the
// Gameday calendar, rebuild the ledger the app lost (uninstall wipes
// MMKV; calendar events survive in the OS store). One entry per fixture
// id; any extra events for the same fixture (zombie-run leftovers) are
// surplus and must be deleted by the engine.

import { Ledger } from './syncPlan';

export interface RecoveredEvent {
  fixtureId: string;
  eventId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
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
): { ledger: Ledger; surplusEventIds: string[] } {
  const ledger: Ledger = {};
  const surplusEventIds: string[] = [];
  for (const e of events) {
    if (ledger[e.fixtureId]) {
      surplusEventIds.push(e.eventId);
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
