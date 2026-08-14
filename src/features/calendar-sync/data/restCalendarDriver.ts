// The REST implementation of the calendar write surface — the engine's
// verbs over googleCalendarRest, one calendar, ours by construction.
//
// Ownership here is a FACT, not a check (Prompt 28 owner ruling): under
// calendar.app.created the token cannot address any calendar this app
// did not create, so the provider path's ownership proofs have no REST
// counterpart to guard. The one guard that survives is in the SCAN —
// the tagged filter — because the user can still hand-add events into
// our calendar through Google's own UI, and those must stay invisible
// to the prune invariant (attacked in googleCalendarRest.test.ts).
//
// AUTH INJECTION. The sign-in module configures the token provider at
// startup. Until it has, every call answers 'auth-expired' — the same
// loud, typed state an actually-dead grant produces, so a wiring gap
// can never look like a working sync.

import { err, ok, Result } from '../../../core/result';
import { RecoveredEvent } from '../domain/recovery';
import {
  restCalendarId,
  setRestCalendarId,
} from './calendarBackend';
import type { EventInput, ResolvedTarget } from './calendarDriver';
import {
  createOwnedCalendar,
  deleteRestEvent,
  insertRestEvent,
  listRestTaggedEvents,
  RestEventInput,
  TokenProvider,
  updateRestEvent,
} from './googleCalendarRest';

const REST_CAL_TITLE = 'KickOffCal';

let tokenProvider: TokenProvider | null = null;

export function configureRestAuth(provider: TokenProvider): void {
  tokenProvider = provider;
}

function token(): TokenProvider {
  return tokenProvider ?? (async () => err({ kind: 'auth-expired' }));
}

function toRestInput(input: EventInput): RestEventInput {
  return {
    fixtureId: input.fixtureId,
    title: input.title,
    startUtc: input.startUtc,
    endUtc: input.endUtc,
    allDay: input.allDay,
    reminderMinutesBefore: input.reminderMinutesBefore,
    ...(input.allDayReminder !== undefined
      ? { allDayReminder: input.allDayReminder }
      : {}),
    // Colour: Google events take an eleven-swatch colorId, not hex.
    // The mapping from the product colour lands with the picker work
    // (P28-3); until then REST events wear the calendar's colour.
    ...(input.note ? { note: input.note } : {}),
  };
}

// The stored calendar id, or a freshly created KickoffCal calendar in
// the user's account. Kind is always 'ours': there is no other kind of
// calendar this backend can touch.
export async function ensureRestTarget(): Promise<Result<ResolvedTarget>> {
  const existing = restCalendarId();
  if (existing) {
    return ok(restTarget(existing));
  }
  const created = await createOwnedCalendar(REST_CAL_TITLE, token());
  if (!created.ok) return created;
  setRestCalendarId(created.value);
  return ok(restTarget(created.value));
}

function restTarget(calendarId: string): ResolvedTarget {
  return {
    calendarId,
    kind: 'ours',
    label: REST_CAL_TITLE,
    accountLabel: 'Google Calendar',
    sourceKind: 'cloud',
  };
}

export async function restCreateFixtureEvent(
  calendarId: string,
  input: EventInput,
): Promise<Result<string>> {
  return insertRestEvent(calendarId, toRestInput(input), token());
}

// Not-found propagates as the typed kind — the engine answers it by
// RECREATING (a hand-deleted event whose fixture is still wanted),
// exactly as on the provider path.
export async function restUpdateFixtureEvent(
  eventId: string,
  input: EventInput,
): Promise<Result<string>> {
  const calendarId = restCalendarId();
  if (!calendarId) return err({ kind: 'not-found', what: 'calendar' });
  return updateRestEvent(calendarId, eventId, toRestInput(input), token());
}

// A delete of an already-gone event is the desired state, not a
// failure — same vacuous-success contract the provider path settled on
// the hard way. Every OTHER failure aborts before the ledger entry is
// dropped.
export async function restDeleteFixtureEvent(
  eventId: string,
): Promise<Result<true>> {
  const calendarId = restCalendarId();
  if (!calendarId) return err({ kind: 'not-found', what: 'calendar' });
  const r = await deleteRestEvent(calendarId, eventId, token());
  if (!r.ok && r.error.kind === 'not-found') return ok(true);
  if (!r.ok) return r;
  return ok(true);
}

export async function restListTaggedEvents(
  calendarId: string,
): Promise<Result<RecoveredEvent[]>> {
  const r = await listRestTaggedEvents(calendarId, token());
  if (!r.ok) return r;
  return ok(
    r.value.map((e) => ({
      fixtureId: e.fixtureId,
      eventId: e.id,
      title: e.title,
      startUtc: e.startUtc,
      endUtc: e.endUtc,
      allDay: e.allDay,
    })),
  );
}
