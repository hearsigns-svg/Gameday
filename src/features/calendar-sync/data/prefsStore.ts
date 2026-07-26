// Persistence for calendar preferences.

import { readJson, writeJson } from '../../../core/storage';
import { CalendarPrefs, DEFAULT_PREFS } from '../domain/prefs';

const KEY = 'prefs.v1';

export function loadPrefs(): CalendarPrefs {
  return { ...DEFAULT_PREFS, ...readJson<Partial<CalendarPrefs>>(KEY, {}) };
}

export function savePrefs(prefs: CalendarPrefs): void {
  writeJson(KEY, prefs);
}
