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
//
// THE TARGET RECORD (Round 4 B4). Resolving the REST target now
// PERSISTS it through the same store the provider path writes
// (calendarTargetStore), so storedTarget() — Preferences' colour block,
// the priming screen's connected confirmation, the erase copy — reads
// the live truth. Before this the REST path wrote nothing there, and
// the pre-P28 provider record ("Social", kind 'user') sat frozen under
// a REST-created KickOffCal calendar forever.

import { err, ok, Result } from '../../../core/result';
import { readJson, removeKey, writeJson } from '../../../core/storage';
import { RecoveredEvent } from '../domain/recovery';
import {
  clearRestCalendarId,
  restCalendarId,
  setRestCalendarId,
} from './calendarBackend';
import { calendarColour } from './calendarColourStore';
import type { EventInput, ResolvedTarget } from './calendarDriver';
import { clearTarget, saveTarget } from './calendarTargetStore';
import { googleColorIdFor } from '../domain/googleEventColour';
import type { SportColourStatus } from '../domain/colourLayers';
import {
  calendarHasAnyEvent,
  createOwnedCalendar,
  deleteOwnedCalendar,
  deleteRestEvent,
  insertRestEvent,
  listRestTaggedEvents,
  patchCalendarListColour,
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
    extraRemindersBefore: input.extraRemindersBefore,
    ...(input.allDayReminder !== undefined
      ? { allDayReminder: input.allDayReminder }
      : {}),
    // Colour: Google events take an eleven-swatch colorId, not hex —
    // the chosen hex maps to the nearest swatch (Round 5 ruling 7);
    // without a chosen colour the event wears the calendar's colour.
    ...(() => {
      const id = input.colour ? googleColorIdFor(input.colour) : null;
      return id ? { colorId: id } : {};
    })(),
    ...(input.note ? { note: input.note } : {}),
  };
}

// The stored calendar id, or a freshly created KickOffCal calendar in
// the user's account. Kind is always 'ours': there is no other kind of
// calendar this backend can touch.
export async function ensureRestTarget(): Promise<Result<ResolvedTarget>> {
  let calendarId = restCalendarId();
  if (!calendarId) {
    const created = await createOwnedCalendar(REST_CAL_TITLE, token());
    if (!created.ok) return created;
    calendarId = created.value;
    setRestCalendarId(calendarId);
    // A fresh calendar wears Google's default until painted below.
    removeKey(REST_COLOUR_KEY);
  }
  const target = restTarget(calendarId);
  // B4 item 1: the SAME record the provider path writes, so every
  // reader of storedTarget() sees this calendar and not whatever the
  // old path left behind. Never 'chosen' — there is nothing to choose.
  saveTarget({ ...target, chosen: false });
  // B4 item 3: cosmetic and NON-FATAL, exactly like the provider path's
  // conform — a colour that cannot be painted never fails a sync.
  await conformRestColour(calendarId);
  return ok(target);
}

// User-invoked erase (Stage 7B): delete the KickOffCal calendar we
// created — and with it every event in it, past ones included; that is
// the feature's entire purpose. `false` means there was nothing of
// ours to erase. The scope makes over-reach structurally impossible:
// calendar.app.created cannot delete any calendar this app did not
// create. The target record and the colour record go with the
// calendar they described; the next connected sync recreates cleanly.
export async function eraseRestCalendar(): Promise<Result<boolean>> {
  const calendarId = restCalendarId();
  if (!calendarId) return ok(false);
  const r = await deleteOwnedCalendar(calendarId, token());
  if (!r.ok) return r;
  clearRestCalendarId();
  clearTarget();
  removeKey(REST_COLOUR_KEY);
  return ok(true);
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

// ─── Calendar colour (B4 item 3) ──────────────────────────────────────
//
// What the calendarList entry is KNOWN to wear. 'applied' = the PATCH
// succeeded for this hex; 'pending' = saved but not yet painted
// (offline, expired grant, no calendar yet) — retried on the next
// resolve; 'refused' = Google answered 403/400 for this hex — recorded
// so the app never claims a colour Google did not take, and NOT retried
// until the user picks again (one request per sync against a scope that
// has said no is noise).

const REST_COLOUR_KEY = 'restCalendarColour.v1';

export type RestColourStatus = 'applied' | 'pending' | 'refused';

export interface RestColourState {
  hex: string;
  status: RestColourStatus;
}

export function restColourState(): RestColourState | null {
  return readJson<RestColourState | null>(REST_COLOUR_KEY, null);
}

const sameHex = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// Runs on every resolve (each sync). A colour picked offline or before
// the calendar existed lands on the next pass; a REST calendar created
// before this code shipped (no record at all) is painted once.
async function conformRestColour(calendarId: string): Promise<void> {
  const want = calendarColour();
  const state = restColourState();
  if (state && sameHex(state.hex, want) && state.status !== 'pending') return;
  await paintRestColour(calendarId, want);
}

async function paintRestColour(
  calendarId: string,
  hex: string,
): Promise<RestColourStatus> {
  const r = await patchCalendarListColour(calendarId, hex, token());
  if (r.ok) {
    writeJson(REST_COLOUR_KEY, { hex, status: 'applied' } satisfies RestColourState);
    return 'applied';
  }
  // A 403 (scope) or 400 (shape) is Google refusing THIS request;
  // anything else — offline, expired grant, a 5xx that outlasted the
  // backoff — is a retry on the next pass.
  const refused =
    r.error.kind === 'provider' &&
    (r.error.status === 403 || r.error.status === 400);
  const status: RestColourStatus = refused ? 'refused' : 'pending';
  writeJson(REST_COLOUR_KEY, { hex, status } satisfies RestColourState);
  if (refused) {
    // Logcat is the only instrument a hardware session has (rule 15 of
    // the sync engine): the raw error, not friendly copy.
    console.warn(`[gameday] calendar colour refused: ${JSON.stringify(r.error)}`);
  }
  return status;
}

// The user picked a swatch under REST (facade setCalendarColour). No
// calendar yet — connected but never synced — saves for creation, the
// same 'saved' the provider path reports before its calendar exists.
export type RestColourOutcome = 'applied' | 'saved' | 'refused';

export async function applyRestCalendarColour(
  hex: string,
): Promise<RestColourOutcome> {
  const calendarId = restCalendarId();
  if (!calendarId) {
    writeJson(REST_COLOUR_KEY, { hex, status: 'pending' } satisfies RestColourState);
    return 'saved';
  }
  const status = await paintRestColour(calendarId, hex);
  return status === 'applied'
    ? 'applied'
    : status === 'refused'
      ? 'refused'
      : 'saved';
}

export async function restCreateFixtureEvent(
  calendarId: string,
  input: EventInput,
): Promise<Result<string>> {
  return insertRestEvent(calendarId, toRestInput(input), token());
}

// Not-found propagates as the typed kind — the engine answers it by
// RECREATING (a hand-deleted event whose fixture is still wanted),
// exactly as on the provider path. The calendar is the entry's own
// (2026-09-24: events can live in a sport calendar); absent → the one
// KickOffCal calendar, as before.
export async function restUpdateFixtureEvent(
  eventId: string,
  input: EventInput,
  inCalendarId?: string,
): Promise<Result<string>> {
  const calendarId = inCalendarId ?? restCalendarId();
  if (!calendarId) return err({ kind: 'not-found', what: 'calendar' });
  return updateRestEvent(calendarId, eventId, toRestInput(input), token());
}

// A delete of an already-gone event is the desired state, not a
// failure — same vacuous-success contract the provider path settled on
// the hard way. Every OTHER failure aborts before the ledger entry is
// dropped.
export async function restDeleteFixtureEvent(
  eventId: string,
  inCalendarId?: string,
): Promise<Result<true>> {
  const calendarId = inCalendarId ?? restCalendarId();
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

// ─── Sport calendars (owner brief 2026-09-24) ─────────────────────────
//
// One Google calendar per sport, created the first time that sport has an
// event, in the same account as KickOffCal — calendar.app.created lets
// this app create them and address nothing else. The colour is set ONCE
// here and never repainted: from then on it is the user's, in Google
// Calendar. A failed paint never fails the create.
// Its colour is painted by the caller (data/driver.ts createSportCalendar),
// which records whether it took — a paint that fails here is retried on
// the next pass instead of being lost with a log line (2026-09-25).
export async function restCreateSportCalendar(title: string): Promise<Result<string>> {
  return createOwnedCalendar(title, token());
}

// One sport calendar's colour, and what Google made of it. A 403/400 is
// Google refusing this colour; anything else — offline, an expired grant,
// a 5xx that outlasted the backoff — is worth another try next pass.
export async function restPaintCalendarColour(
  calendarId: string,
  hex: string,
): Promise<SportColourStatus> {
  const r = await patchCalendarListColour(calendarId, hex, token());
  if (r.ok) return 'applied';
  console.warn(`[gameday] sport calendar colour not set: ${JSON.stringify(r.error)}`);
  return r.error.kind === 'provider' && (r.error.status === 403 || r.error.status === 400)
    ? 'refused'
    : 'pending';
}

// Which of these calendars of ours still exist (2026-09-24) — asked
// before a pass places events by them. The app-created scope cannot list
// calendars, so each one is asked about by id: a one-row event read, and
// only "not found" means gone. Any other failure fails the survey.
export async function restPresentCalendars(
  calendarIds: readonly string[],
): Promise<Result<Set<string>>> {
  const present = new Set<string>();
  for (const id of new Set(calendarIds)) {
    const r = await calendarHasAnyEvent(id, token());
    if (r.ok) present.add(id);
    else if (r.error.kind !== 'not-found') return r;
  }
  return ok(present);
}

// Remove a calendar of ours once it holds NOTHING — not one of our events
// and not one the user added by hand in Google Calendar. `true` when it is
// gone (deleted now, or already); `false` keeps it for a later pass.
export async function restDeleteCalendarIfEmpty(calendarId: string): Promise<boolean> {
  const any = await calendarHasAnyEvent(calendarId, token());
  if (!any.ok) return any.error.kind === 'not-found';
  if (any.value) return false;
  const r = await deleteOwnedCalendar(calendarId, token());
  return r.ok;
}

// A separate calendar for each sport leaves the one KickOffCal calendar
// unused; once it holds nothing it goes, with the records that described
// it (the next combined pass creates it afresh, in the saved colour).
export async function restVacateTargetIfEmpty(): Promise<boolean> {
  const calendarId = restCalendarId();
  if (!calendarId) return false;
  const gone = await restDeleteCalendarIfEmpty(calendarId);
  if (gone) {
    clearRestCalendarId();
    clearTarget();
    removeKey(REST_COLOUR_KEY);
  }
  return gone;
}

// The erase (Data & privacy) takes every calendar of ours, sport ones
// included — the user asked for everything KickOffCal put there.
export async function restEraseCalendars(calendarIds: readonly string[]): Promise<Result<number>> {
  let erased = 0;
  for (const id of calendarIds) {
    const r = await deleteOwnedCalendar(id, token());
    if (!r.ok) return r;
    erased++;
  }
  return ok(erased);
}
