// The calendar we write fixtures into, persisted. Two jobs:
//
//   1. Remember an EXPLICIT choice, so a user who picked "Work" keeps
//      getting "Work" even when automatic resolution would pick
//      something else.
//   2. Let the UI describe the target without a native round-trip —
//      Preferences renders the row on first paint, before any calendar
//      call has resolved.
//
// `kind` is the safety-critical field: 'ours' licenses renaming,
// recolouring and (once empty) deleting the calendar; 'user' licenses
// none of those. Everything the driver does to a calendar as a whole is
// gated on it.

import { readJson, writeJson, removeKey } from '../../../core/storage';
import { SourceKind } from '../domain/calendarTarget';

export type TargetKind = 'ours' | 'user';

export interface CalendarTarget {
  calendarId: string;
  kind: TargetKind;
  label: string; // the calendar's own title
  accountLabel: string; // the account or source it belongs to
  sourceKind: SourceKind;
  // True once the user has picked explicitly. An automatic target is
  // re-resolved freely (a Google account added later should be picked
  // up); a chosen one is honoured until the user changes it or the
  // calendar disappears.
  chosen?: boolean;
}

const KEY = 'calendarTarget.v1';

export function storedTarget(): CalendarTarget | null {
  return readJson<CalendarTarget | null>(KEY, null);
}

export function saveTarget(target: CalendarTarget): void {
  writeJson(KEY, target);
}

export function clearTarget(): void {
  removeKey(KEY);
}
