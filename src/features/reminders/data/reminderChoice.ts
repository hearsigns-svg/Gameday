// The user's reminder decision — distinct from the OS notification
// permission, and the same tri-state as the calendar choice
// (calendar-sync/data/calendarChoice.ts). The OS prompt must never appear
// before the user has said yes here.
//
//   unset    → never asked; nothing is scheduled, nothing prompts
//   deferred → user said "not now"; re-asked in context, never nagged
//   enabled  → user opted in; reconcile may schedule (once the OS agrees)

import { readJson, writeJson } from '../../../core/storage';

export type ReminderChoice = 'unset' | 'deferred' | 'enabled';

const KEY = 'reminders.choice.v1';

const CHOICES: ReadonlySet<string> = new Set<ReminderChoice>([
  'unset',
  'deferred',
  'enabled',
]);

export function reminderChoice(): ReminderChoice {
  const stored = readJson<unknown>(KEY, null);
  // A corrupted or foreign value is 'unset', never a third state the
  // reconcile would have to interpret.
  return typeof stored === 'string' && CHOICES.has(stored)
    ? (stored as ReminderChoice)
    : 'unset';
}

export function setReminderChoice(choice: ReminderChoice): void {
  writeJson(KEY, choice);
}
