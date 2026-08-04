// Per-event calendar settings — what the user has decided about ONE
// fixture's calendar event, as opposed to the global preferences.
//
// PURE — no storage imports (the domain layer stays jest-testable without
// native modules); data/eventSettingsStore.ts owns persistence and calls
// these.
//
// WHY THESE LIVE HERE RATHER THAN IN THE CALENDAR. Changing a reminder
// used to mean leaving the app for the OS calendar, and anything set
// there is destroyed the moment sync recreates the event — which it
// must, because EventKit half-applies an all-day↔timed conversion, so a
// "Time TBC" banner sharpening into a real kick-off is always a delete
// and a create. The user's choice therefore has to live somewhere WE
// own and re-apply. That is this module.
//
// THE RULE THAT FOLLOWS FROM OWNING THEM: the reminder on an event is
// always ours to write. An override recorded here survives a recreate, a
// calendar-target switch, and a preference change — and, because
// planSync compares it against what the ledger says was last applied,
// changing it produces a real calendar operation instead of sitting in
// storage doing nothing.

import { CalendarPrefs } from './prefs';

export interface EventSettings {
  // The user's explicit reminder for this fixture. `null` is a real
  // choice (no reminder at all) and is NOT the same as the field being
  // absent, which means "follow the global preference".
  reminderMinutes?: number | null;
  // Per-event colour, only ever set where the calendar layer supports
  // one (data/calendarDriver.ts::calendarCapabilities). On a layer that
  // does not, the control is never rendered, so this is never written —
  // which is what keeps the planner from wanting a colour it cannot
  // apply.
  colour?: string;
  at: string; // ISO set-at, for age pruning
}

export type EventSettingsMap = Record<string, EventSettings>;

// Long enough that the fixture it belongs to is certainly played and
// done — the same age-based rule exclusions and pins use, and for the
// same reason: presence-based pruning silently forgets a choice the
// moment its fixture leaves the fetch window.
export const EVENT_SETTINGS_MAX_AGE_MS = 400 * 86_400_000;

export function pruneEventSettings(
  map: EventSettingsMap,
  now: number = Date.now(),
  maxAgeMs: number = EVENT_SETTINGS_MAX_AGE_MS,
): EventSettingsMap {
  const kept: EventSettingsMap = {};
  for (const [id, settings] of Object.entries(map)) {
    const age = now - new Date(settings.at).getTime();
    if (!Number.isFinite(age)) {
      // Repaired, not dropped: a corrupt timestamp must never cost the
      // user a setting they made.
      kept[id] = { ...settings, at: new Date(now).toISOString() };
      continue;
    }
    if (age > maxAgeMs) continue;
    kept[id] = settings;
  }
  return kept;
}

// Has the user said anything at all about this fixture? Used by the UI
// to show "Reminder · 1 hour before (just this one)" rather than
// implying the global default was chosen here.
export function hasReminderOverride(
  fixtureId: string,
  map: EventSettingsMap,
): boolean {
  return map[fixtureId]?.reminderMinutes !== undefined;
}

// The reminder this event should carry, in minutes before the start.
//
// ALL-DAY EVENTS TAKE NO ALARM, override or not. An all-day fixture's
// start is a midnight day sentinel, so "15 minutes before" means 23:45
// the night before in UTC — an alert at an arbitrary hour for an event
// whose time nobody has published yet. The override is still KEPT: when
// the fixture sharpens from "Time TBC" into a real kick-off, the very
// next sync applies it. That is the promise the settings screen makes,
// and appearanceLifecycle/syncPlan tests pin it.
export function reminderMinutesFor(
  fixtureId: string,
  map: EventSettingsMap,
  prefs: CalendarPrefs,
  allDay: boolean,
): number | null {
  if (allDay) return null;
  const override = map[fixtureId]?.reminderMinutes;
  return override === undefined ? prefs.reminderMinutes : override;
}

// What a legacy ledger entry — one written before reminders were
// recorded — is ASSUMED to be carrying. It is exactly what the engine
// would have applied for that entry: nothing on an all-day placeholder,
// the global preference on a timed event.
//
// This is a stated assumption, not a measurement: a user who changed the
// global preference before upgrading has events carrying the OLD value,
// and stamping records the new one. That is today's behaviour either way
// (nothing has ever re-applied a preference change to existing events),
// and the alternative — treating every legacy entry as unknown — would
// rewrite every event in every calendar on the first sync after this
// ships, wiping any alarm a user had added by hand. Converging quietly
// on the next real change is the smaller claim.
export function assumedAppliedReminder(
  entryAllDay: boolean | undefined,
  prefs: CalendarPrefs,
): number | null {
  return entryAllDay === true ? null : prefs.reminderMinutes;
}
