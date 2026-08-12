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

// The all-day counterpart, same undefined-clears / null-is-a-choice
// contract as setEventReminder above.
export function setEventAllDayReminder(
  fixtureId: string,
  reminder: import('../domain/prefs').AllDayReminder | undefined,
): void {
  const all = loadEventSettings();
  if (reminder === undefined) {
    const existing = all[fixtureId];
    if (!existing) return;
    const { allDayReminder: _drop, ...rest } = existing;
    if (Object.keys(rest).length <= 1) delete all[fixtureId];
    else all[fixtureId] = { ...rest, at: new Date().toISOString() };
  } else {
    all[fixtureId] = {
      ...all[fixtureId],
      allDayReminder: reminder,
      at: new Date().toISOString(),
    };
  }
  writeJson(KEY, all);
}

export function setEventColour(
  fixtureId: string,
  colour: string | undefined,
): void {
  const all = loadEventSettings();
  const existing = all[fixtureId];
  if (colour === undefined) {
    if (!existing) return;
    const { colour: _drop, ...rest } = existing;
    // A record still carrying EITHER reminder channel survives — the
    // one-field check here silently deleted an all-day override the
    // moment its event's colour was cleared.
    if (rest.reminderMinutes === undefined && rest.allDayReminder === undefined)
      delete all[fixtureId];
    else all[fixtureId] = { ...rest, at: new Date().toISOString() };
  } else {
    all[fixtureId] = { ...existing, colour, at: new Date().toISOString() };
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
