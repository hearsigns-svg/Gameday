// Persistence for calendar preferences.

import { readJson, writeJson } from '../../../core/storage';
import { CalendarPrefs, DEFAULT_PREFS } from '../domain/prefs';
import { loadLedger } from './ledger';

const KEY = 'prefs.v1';

const MIGRATED_KEY = 'prefsDefaultsMigrated.v2';

export function loadPrefs(): CalendarPrefs {
  const stored = readJson<Partial<CalendarPrefs>>(KEY, {});
  // ONE-TIME migration for the race-only default flip: a ledger that
  // already exists the first time this build runs was synced under the
  // old 'all' default — latch that so the flip can't retroactively
  // delete its support-session events. Must run exactly once: a NEW
  // install's ledger is empty at its first loadPrefs (before any
  // calendar op), and once stamped, a ledger it builds later under
  // race-only must never re-trigger the latch.
  if (!readJson<boolean>(MIGRATED_KEY, false)) {
    writeJson(MIGRATED_KEY, true);
    if (
      stored.seriesSessions === undefined &&
      Object.keys(loadLedger()).length > 0
    ) {
      const latched = { ...stored, seriesSessions: 'all' as const };
      writeJson(KEY, latched);
      return { ...DEFAULT_PREFS, ...latched };
    }
  }
  return { ...DEFAULT_PREFS, ...stored };
}

export function savePrefs(prefs: CalendarPrefs): void {
  writeJson(KEY, prefs);
}
