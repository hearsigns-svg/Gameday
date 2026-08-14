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

import { ok, Result } from '../../../core/result';
import { RecoveredEvent } from '../domain/recovery';
import { activeBackend } from './calendarBackend';
import * as provider from './calendarDriver';
import {
  ensureRestTarget,
  restCreateFixtureEvent,
  restDeleteFixtureEvent,
  restListTaggedEvents,
  restUpdateFixtureEvent,
} from './restCalendarDriver';

// Re-exported unchanged: types and the provider-only surfaces.
export type { EventInput, ResolvedTarget, TargetRequest } from './calendarDriver';
export {
  applyTargetRequest,
  deleteVacatedCalendarIfOurs,
} from './calendarDriver';

// What the engine threads between getCalendarObject and the event
// verbs. Provider needs the live native object (one per run — per-event
// instantiation exhausts bridge handles); REST needs only the id.
export type CalendarHandle =
  | { kind: 'provider'; cal: provider.ProviderCalendar }
  | { kind: 'rest'; calendarId: string };

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

export async function updateFixtureEvent(
  eventId: string,
  input: provider.EventInput,
): Promise<Result<string>> {
  return activeBackend() === 'rest'
    ? restUpdateFixtureEvent(eventId, input)
    : provider.updateFixtureEvent(eventId, input);
}

export async function deleteFixtureEvent(
  eventId: string,
): Promise<Result<true>> {
  return activeBackend() === 'rest'
    ? restDeleteFixtureEvent(eventId)
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
