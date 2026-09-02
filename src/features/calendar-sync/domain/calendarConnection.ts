// Is the calendar CONNECTED on this install? PURE — the one decision
// every surface used to make for itself by reading the stored choice
// alone, which is how a legacy Android install kept writing into the
// user's own Google calendar after the REST-always architecture landed
// (Round 4 B4, 2026-09-02).
//
// The choice ('enabled') is what the USER said. Whether that choice can
// actually reach a calendar depends on the ROUTE this install syncs
// through and the BACKEND that is armed:
//
//   iOS       — route 'provider'       → EventKit; enabled IS connected.
//   Android   — route 'google-connect' → only the REST backend writes;
//               enabled without it is a calendar nothing can reach.
//
// The three-state answer is what the engine gates on, what the banners
// and the Connect row render from, and what the picker screen asks —
// one function, so they cannot disagree again. Type-only imports from
// the data layer: erased at compile time, so this module stays free of
// native modules and every rule here is attackable in a unit test.

import type { AppError } from '../../../core/result';
import type { CalendarBackend } from '../data/calendarBackend';
import type { CalendarChoice } from '../data/calendarChoice';
import type { TargetKind } from '../data/calendarTargetStore';
import type { NativeSyncRoute } from '../data/driver';

export type CalendarConnection =
  // Opted in AND a write path exists: the engine writes.
  | 'connected'
  // Opted in, but this install syncs through Google Connect and the
  // REST backend is not armed — a never-connected or disconnected
  // Android install, INCLUDING a legacy one that wrote through the
  // provider path before Prompt 28. Fixtures-only until connected; the
  // Connect path is the honest state to show.
  | 'needs-google-connect'
  // Not opted in (unset or deferred).
  | 'off';

export function connectionState(
  choice: CalendarChoice,
  route: NativeSyncRoute,
  backend: CalendarBackend,
): CalendarConnection {
  if (choice !== 'enabled') return 'off';
  if (route === 'google-connect' && backend !== 'rest') {
    return 'needs-google-connect';
  }
  return 'connected';
}

// Reinstall healing: storage loss wipes the choice, but durable evidence
// of a prior opt-in (an OS calendar grant, or a stored Google
// connection) may re-latch 'enabled' — ONLY where 'enabled' would
// actually connect. On a reinstalled legacy Android install the OS
// grant is real, and latching from it would hide the Connect path
// behind a choice that reaches nothing.
export function grantMayLatch(
  choice: CalendarChoice,
  route: NativeSyncRoute,
  backend: CalendarBackend,
): boolean {
  return (
    choice === 'unset' &&
    connectionState('enabled', route, backend) === 'connected'
  );
}

// Does the calendar colour belong to us to set? Backend-aware, so the
// PROVIDER path's stale record can no longer speak for the REST path:
//   REST                 — the calendar is ours by construction.
//   Google Connect, not  — the KickOffCal calendar to come is ours; the
//   yet connected          colour saves now and lands at creation, and
//                          whatever record the old provider path left
//                          behind describes a calendar nothing writes to.
//   provider (iOS)       — the persisted target decides, as before: no
//                          record yet, or a record of ours.
export function ownsCalendarColour(
  backend: CalendarBackend,
  route: NativeSyncRoute,
  stored: { kind: TargetKind } | null,
): boolean {
  if (backend === 'rest') return true;
  if (route === 'google-connect') return true;
  return stored === null || stored.kind === 'ours';
}

// "Not now" on the priming ask records a deferral — and must NEVER
// downgrade a choice that has already been latched 'enabled'. The old
// handler wrote 'deferred' unconditionally, which on Android (where the
// REST path never wrote a target, so the connected confirmation never
// appeared) meant a user who had JUST connected could tap "Not now" on
// the still-showing ask and switch their calendar off (F1).
export function choiceAfterNotNow(current: CalendarChoice): CalendarChoice {
  return current === 'enabled' ? 'enabled' : 'deferred';
}

// The Google-connected row in Preferences: a reconnect ask ONLY when the
// last sync actually died of an expired grant. Every other state — no
// error, or an unrelated failure — is the plain connected truth with no
// reconnect verb. The row used to render "tap to reconnect" whenever the
// backend was 'rest', i.e. always.
export type RestRowMode = 'reconnect' | 'connected';

export function restRowMode(
  lastErrorKind: AppError['kind'] | null,
): RestRowMode {
  return lastErrorKind === 'auth-expired' ? 'reconnect' : 'connected';
}
