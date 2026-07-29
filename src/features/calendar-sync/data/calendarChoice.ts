// The user's calendar decision — distinct from the OS permission. The
// permission dialog must never appear before the user has said yes to
// the primed explainer (design rule: one permission prompt, primed).
//
//   unset    → never asked (first-run); follows sync fixtures only
//   deferred → user said "not now"; re-asked in context, never nagged
//   enabled  → user opted in; sync may prompt the OS and write events

import { readJson, writeJson } from '../../../core/storage';
import { loadLedger } from './ledger';

export type CalendarChoice = 'unset' | 'deferred' | 'enabled';

const KEY = 'calendarChoice.v1';

export function calendarChoice(): CalendarChoice {
  const stored = readJson<CalendarChoice | null>(KEY, null);
  if (stored) return stored;
  // Migration: a device with ledgered events predates this choice and
  // has already been through the OS prompt — treat as opted in, and
  // LATCH it: a legitimately drained ledger (unfollow-everything,
  // season rollover) must not silently revert an opt-in to 'unset'.
  if (Object.keys(loadLedger()).length > 0) {
    writeJson(KEY, 'enabled');
    return 'enabled';
  }
  return 'unset';
}

export function setCalendarChoice(choice: CalendarChoice): void {
  writeJson(KEY, choice);
}

// First-run welcome flag — the welcome screen shows exactly once.
const WELCOMED_KEY = 'welcomed.v1';

export function hasSeenWelcome(): boolean {
  return readJson<boolean>(WELCOMED_KEY, false);
}

export function markWelcomeSeen(): void {
  writeJson(WELCOMED_KEY, true);
}
