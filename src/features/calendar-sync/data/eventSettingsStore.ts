// Persistence for per-event calendar settings (domain/eventSettings.ts).

import { readJson, writeJson } from '../../../core/storage';
import {
  EventSettings,
  EventSettingsMap,
  pruneEventSettings,
} from '../domain/eventSettings';

const KEY = 'eventSettings.v1';

export function loadEventSettings(): EventSettingsMap {
  return readJson<EventSettingsMap>(KEY, {});
}

export function eventSettingsFor(fixtureId: string): EventSettings | undefined {
  return loadEventSettings()[fixtureId];
}

// Record an explicit per-event reminder. `undefined` CLEARS the override
// so the fixture goes back to following the global preference — the
// difference between "no reminder for this one" (null) and "whatever the
// setting says" (cleared) is the whole point of the field.
export function setEventReminder(
  fixtureId: string,
  reminderMinutes: number | null | undefined,
): void {
  const all = loadEventSettings();
  if (reminderMinutes === undefined) {
    const existing = all[fixtureId];
    if (!existing) return;
    const { reminderMinutes: _drop, ...rest } = existing;
    // A settings record with nothing left in it is not worth keeping.
    if (Object.keys(rest).length <= 1) delete all[fixtureId];
    else all[fixtureId] = { ...rest, at: new Date().toISOString() };
  } else {
    all[fixtureId] = {
      ...all[fixtureId],
      reminderMinutes,
      at: new Date().toISOString(),
    };
  }
  writeJson(KEY, all);
}

// Bounded growth without forgetting: drop only entries old enough that
// their fixture cannot plausibly still be upcoming.
export function pruneEventSettingsStore(now: number = Date.now()): void {
  const all = loadEventSettings();
  const kept = pruneEventSettings(all, now);
  if (Object.keys(kept).length !== Object.keys(all).length) writeJson(KEY, kept);
}
