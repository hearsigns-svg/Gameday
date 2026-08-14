// Which calendar layer this install writes through.
//
// 'provider' — the OS calendar store via expo-calendar (iOS EventKit;
// Android's CalendarProvider on installs that predate the REST path).
// 'rest' — Google's Calendar API under calendar.app.created, writing
// into a KickoffCal-owned calendar in the user's Google account
// (Prompt 28: no sync adapter, no mass-deletion gate, and a scope that
// structurally cannot see the user's other calendars).
//
// The backend stays 'provider' until the connect flow flips it — code
// that lands ahead of sign-in changes nothing in behaviour, so every
// commit along the way remains shippable.

import { readJson, removeKey, writeJson } from '../../../core/storage';

export type CalendarBackend = 'provider' | 'rest';

const BACKEND_KEY = 'calendarBackend.v1';
const REST_CAL_KEY = 'restCalendarId.v1';

export function activeBackend(): CalendarBackend {
  return readJson<CalendarBackend>(BACKEND_KEY, 'provider');
}

export function setActiveBackend(backend: CalendarBackend): void {
  writeJson(BACKEND_KEY, backend);
}

// The id of the KickoffCal calendar we created in the user's Google
// account. Stored once at creation; ensureRestTarget re-creates (and
// re-stores) if the user deletes the calendar out from under us.
export function restCalendarId(): string | null {
  return readJson<string | null>(REST_CAL_KEY, null);
}

export function setRestCalendarId(id: string): void {
  writeJson(REST_CAL_KEY, id);
}

export function clearRestCalendarId(): void {
  removeKey(REST_CAL_KEY);
}
