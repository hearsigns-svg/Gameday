// The one write-surface the engine sees, whichever backend is active.
//
// 'provider' delegates to calendarDriver (expo-calendar over the OS
// store); 'rest' delegates to restCalendarDriver (Google's API into a
// calendar that is ours by construction). The engine imports THIS
// module and nothing platform-shaped: same verbs, same Result types,
// and a CalendarHandle where a native calendar object used to leak
// through.
//
// Target-picker surfaces (listTargetOptions, applyTargetRequest,
// deleteVacatedCalendarIfOurs) stay provider-only by design: under
// REST there is exactly one calendar and it is ours, so there is
// nothing to pick, vacate or adopt. The screens that use them are
// hidden when the REST backend is active (P28-3).

import { Platform } from 'react-native';
import { ok, Result } from '../../../core/result';
import { RecoveredEvent } from '../domain/recovery';
import { activeBackend, restCalendarId } from './calendarBackend';
import { saveCalendarColour } from './calendarColourStore';
import * as provider from './calendarDriver';
import { storedTarget } from './calendarTargetStore';
import { loadPrefs } from './prefsStore';
import {
  applyRestCalendarColour,
  ensureRestTarget,
  eraseRestCalendar,
  restCreateFixtureEvent,
  restCreateSportCalendar,
  restDeleteCalendarIfEmpty,
  restDeleteFixtureEvent,
  restEraseCalendars,
  restListTaggedEvents,
  restPresentCalendars,
  restUpdateFixtureEvent,
  restVacateTargetIfEmpty,
} from './restCalendarDriver';

// Re-exported unchanged: types and the provider-only surfaces.
export type { EventInput, ResolvedTarget, TargetRequest } from './calendarDriver';
export {
  applyTargetRequest,
  deleteVacatedCalendarIfOurs,
} from './calendarDriver';
export { calendarColour } from './calendarColourStore';

// What the engine threads between getCalendarObject and the event
// verbs. Provider needs the live native object (one per run — per-event
// instantiation exhausts bridge handles); REST needs only the id.
export type CalendarHandle =
  | { kind: 'provider'; cal: provider.ProviderCalendar }
  | { kind: 'rest'; calendarId: string };

// User-invoked erase of the app-created calendar (Stage 7B), whichever
// backend holds it. `true` means a calendar of ours was deleted;
// `false` means there was nothing of ours to erase. REST erase needs a
// live grant — the UI greys the row when Android is disconnected, and
// an expired token surfaces as the typed auth error either way.
export async function eraseAppCalendar(): Promise<Result<boolean>> {
  return activeBackend() === 'rest'
    ? eraseRestCalendar()
    : provider.eraseOurNativeCalendar();
}

export async function getCalendarObject(
  calendarId: string,
): Promise<Result<CalendarHandle>> {
  if (activeBackend() === 'rest') {
    return ok({ kind: 'rest', calendarId });
  }
  const r = await provider.getCalendarObject(calendarId);
  if (!r.ok) return r;
  return ok({ kind: 'provider', cal: r.value });
}

export async function ensureCalendarTarget(): Promise<
  Result<provider.ResolvedTarget>
> {
  return activeBackend() === 'rest'
    ? ensureRestTarget()
    : provider.ensureCalendarTarget();
}

// REST needs no OS calendar grant — the authorization is the Google
// sign-in, and its failure mode is the typed auth-expired state, not a
// permission dialog.
export async function ensureCalendarPermission(): Promise<Result<true>> {
  return activeBackend() === 'rest'
    ? ok(true)
    : provider.ensureCalendarPermission();
}

// Reinstall evidence. On the provider path an existing OS grant proves
// a prior opt-in; on REST the stored connection is the same evidence.
export async function hasCalendarGrant(): Promise<boolean> {
  return activeBackend() === 'rest' ? true : provider.hasCalendarGrant();
}

export async function createFixtureEvent(
  handle: CalendarHandle,
  input: provider.EventInput,
): Promise<Result<string>> {
  return handle.kind === 'rest'
    ? restCreateFixtureEvent(handle.calendarId, input)
    : provider.createFixtureEvent(handle.cal, input);
}

// `calendarId` names the calendar the event lives in (2026-09-24: events
// can live in a sport calendar). REST addresses an event THROUGH its
// calendar; an EventKit / CalendarProvider id is unique store-wide, so the
// provider needs no calendar to find it.
export async function updateFixtureEvent(
  eventId: string,
  input: provider.EventInput,
  calendarId?: string,
): Promise<Result<string>> {
  return activeBackend() === 'rest'
    ? restUpdateFixtureEvent(eventId, input, calendarId)
    : provider.updateFixtureEvent(eventId, input);
}

export async function deleteFixtureEvent(
  eventId: string,
  calendarId?: string,
): Promise<Result<true>> {
  return activeBackend() === 'rest'
    ? restDeleteFixtureEvent(eventId, calendarId)
    : provider.deleteFixtureEvent(eventId);
}

export async function listTaggedEvents(
  calendarId: string,
): Promise<Result<RecoveredEvent[]>> {
  return activeBackend() === 'rest'
    ? restListTaggedEvents(calendarId)
    : provider.listTaggedEvents(calendarId);
}

// Backend-aware capability probe (rule 10: the UI asks this, never the
// platform). Google events carry an eleven-swatch colorId, so the REST
// backend HAS per-event colour — the control appears the moment the
// backend flips, with no UI change.
export function calendarCapabilities(): provider.CalendarCapabilities {
  if (activeBackend() === 'rest') return { perEventColour: true };
  return provider.calendarCapabilities();
}

// The calendar's colour, whichever backend paints it (Round 4 B4 item
// 3). The preference saves FIRST on every path; what happens next is
// the backend's business — REST patches the calendarList entry and
// reports a refusal honestly; the provider path recolours a calendar it
// can prove is ours; an Android install still waiting to connect has
// nothing to paint yet, and the KickOffCal calendar to come takes the
// colour at creation. Before this the screen called the provider
// function directly, which under REST answered 'not-ours' and toasted
// "saves when your calendar connects" beside a connected calendar.
export type CalendarColourOutcome = provider.ColourOutcome | 'refused';

export async function setCalendarColour(
  hex: string,
): Promise<CalendarColourOutcome> {
  saveCalendarColour(hex);
  if (activeBackend() === 'rest') return applyRestCalendarColour(hex);
  if (nativeSyncRoute() === 'google-connect') return 'saved';
  return provider.setCalendarColour(hex);
}

// The provider picker (CalendarTargetScreen, "Use a different calendar")
// exists only where there is a choice to make. Under REST there is one
// calendar and it is ours — nothing to pick (P28-3; B4 item 6 closes
// the last route in). With a calendar for each sport (2026-09-24) there
// is no one target to pick either: every route in is absent until the
// user turns that layout off.
export function canPickCalendarTarget(): boolean {
  return activeBackend() !== 'rest' && !loadPrefs().separateSportCalendars;
}

// How native calendar sync HAPPENS on this install — the UI asks this,
// never Platform.OS. The platform knowledge lives here, in the driver,
// because it is a driver fact: Android's provider path runs through
// the OS sync adapter, whose mass-deletion gate is the reason Prompt
// 28 exists, so Android's native route is a Google connect; iOS's
// EventKit writes into iCloud directly and needs no sign-in at all
// (forcing one there would be friction for its own sake — owner §2).
export type NativeSyncRoute = 'provider' | 'google-connect';

export function nativeSyncRoute(): NativeSyncRoute {
  if (activeBackend() === 'rest') return 'google-connect';
  return Platform.OS === 'android' ? 'google-connect' : 'provider';
}

// ─── Sport calendars (owner brief 2026-09-24) ─────────────────────────
//
// A separate calendar for each sport: created the first time a sport has
// an event, removed once it holds nothing. What makes one OURS is the
// backend's business — the app-created scope under REST, our record or
// the title-plus-no-foreign-events proof on the provider.

export async function createSportCalendar(
  title: string,
  colour: string,
): Promise<Result<string>> {
  return activeBackend() === 'rest'
    ? restCreateSportCalendar(title, colour)
    : provider.createSportCalendar(title, colour);
}

// Which of `candidateIds` exist, plus (provider only) the "KickOffCal · …"
// calendars provably ours but missing from our record. REST cannot list
// calendars, so it can only ever find the ones it recorded.
export async function surveyCalendars(
  candidateIds: readonly string[],
  recordedSportIds: readonly string[],
): Promise<Result<{ present: Set<string>; unrecordedSport: string[] }>> {
  if (activeBackend() === 'rest') {
    const present = await restPresentCalendars(candidateIds);
    if (!present.ok) return present;
    return ok({ present: present.value, unrecordedSport: [] });
  }
  return provider.surveyCalendars(candidateIds, recordedSportIds);
}

// `true` when the calendar is gone — deleted now because it held nothing
// at all, or already gone.
export async function deleteSportCalendarIfEmpty(
  calendarId: string,
  recorded: boolean,
): Promise<boolean> {
  return activeBackend() === 'rest'
    ? restDeleteCalendarIfEmpty(calendarId)
    : provider.deleteSportCalendarIfEmpty(calendarId, recorded);
}

// The one KickOffCal calendar, emptied by a move to a calendar per sport:
// removed when it is ours and holds nothing, with the target record.
export async function vacateTargetIfEmpty(): Promise<boolean> {
  return activeBackend() === 'rest'
    ? restVacateTargetIfEmpty()
    : provider.vacateTargetIfOursAndEmpty();
}

export async function eraseSportCalendars(
  calendars: ReadonlyArray<{ id: string; recorded: boolean }>,
): Promise<Result<number>> {
  return activeBackend() === 'rest'
    ? restEraseCalendars(calendars.map((c) => c.id))
    : provider.eraseSportCalendars(calendars);
}

// The calendar a combined layout writes into, as last resolved — read
// WITHOUT resolving, because a pass in the per-sport layout must never
// create it.
export function currentTargetId(): string | null {
  return activeBackend() === 'rest'
    ? restCalendarId()
    : (storedTarget()?.calendarId ?? null);
}
