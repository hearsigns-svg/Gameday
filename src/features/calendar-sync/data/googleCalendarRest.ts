// Google Calendar REST v3, typed. The Android native-sync write path
// (Prompt 28): no device provider, no sync adapter, no mass-deletion
// gate — requests go straight to Google under calendar.app.created,
// a scope that can only see calendars THIS APP created. The user's
// own calendars are structurally out of reach.
//
// This module is transport only: it takes an access token per call
// from a TokenProvider and returns typed Results. It holds no auth
// state, does no sign-in, and can be tested with a fake fetch.
//
// TOKEN CONTRACT. The provider is expected to hand back a token that
// is fresh enough to use (the sign-in SDK refreshes silently). A 401
// here therefore means the REFRESH path is dead — in Testing status
// Google expires refresh tokens after 7 days, and users can revoke at
// any time — and it maps to the dedicated 'auth-expired' kind so the
// failure reaches the sync chip as a reconnect ask. It must never
// melt into 'unknown': a sync that silently stops is the failure
// class this project keeps meeting.
//
// TAGGING. Provider-path events carry a notes tag; REST events carry
// extendedProperties.private instead — invisible in the user's UI and
// filterable server-side. MARKER identifies ours (the scan filters on
// it, so an event the user drops into our calendar by hand is
// invisible to us and can never be pruned); FIXTURE_KEY carries the
// fixture id the ledger keys on.

import { AppError, err, ok, Result } from '../../../core/result';
import { AllDayReminder } from '../domain/prefs';
import { allDayAlarmMinutesBefore } from '../domain/allDayAlarm';

const BASE = 'https://www.googleapis.com/calendar/v3';
export const MARKER_KEY = 'gameday';
export const MARKER_VALUE = '1';
export const FIXTURE_KEY = 'gamedayFixture';

export type TokenProvider = () => Promise<Result<string>>;

// Injectable for tests; real callers pass nothing.
export interface RestDeps {
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface RestEventInput {
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string; // all-day: EXCLUSIVE next-midnight, planner convention
  allDay: boolean;
  reminderMinutesBefore: number | null;
  // Slots 2/3 (Stage 5) — resolved by the plan; timed events only.
  extraRemindersBefore: number[];
  allDayReminder?: AllDayReminder;
  // Google's event palette is an enum ('1'..'11'), not arbitrary hex —
  // the driver maps the product colour to the nearest swatch.
  colorId?: string;
  note?: string;
}

export interface RestScannedEvent {
  id: string;
  fixtureId: string;
  title: string;
  startUtc: string;
  endUtc: string;
  allDay: boolean;
}

const RETRIES = 3;
const BACKOFF_MS = [1000, 2000, 4000];

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

// The planner's all-day end is already exclusive next-midnight — the
// same convention Google's end.date uses — so both dates pass through
// with NO ±1 arithmetic. The test pins this in both timezones.
function toRestBody(input: RestEventInput): Record<string, unknown> {
  const minutes = input.allDay
    ? allDayAlarmMinutesBefore(
        input.startUtc,
        input.allDayReminder ?? null,
        // The calendar this module writes into is created with
        // timeZone UTC below, which is what anchors a date-only
        // event's reminder offsets to UTC midnight — the same anchor
        // the Android provider path used, so the civil-hour
        // translation carries over unchanged.
        'utc-midnight',
      )
    : input.reminderMinutesBefore;
  return {
    summary: input.title,
    start: input.allDay
      ? { date: dateOnly(input.startUtc) }
      : { dateTime: input.startUtc, timeZone: 'UTC' },
    end: input.allDay
      ? { date: dateOnly(input.endUtc) }
      : { dateTime: input.endUtc, timeZone: 'UTC' },
    reminders: {
      useDefault: false,
      // Same invariant as the native driver: slots 2/3 ride only on
      // timed events (Google caps overrides at 5; three slots fit).
      overrides: [
        ...(minutes === null ? [] : [minutes]),
        ...(input.allDay ? [] : input.extraRemindersBefore),
      ].map((m) => ({ method: 'popup', minutes: m })),
    },
    ...(input.colorId ? { colorId: input.colorId } : {}),
    ...(input.note ? { description: input.note } : {}),
    extendedProperties: {
      private: {
        [MARKER_KEY]: MARKER_VALUE,
        [FIXTURE_KEY]: input.fixtureId,
      },
    },
  };
}

interface RequestSpec {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
}

async function request(
  spec: RequestSpec,
  token: TokenProvider,
  deps: RestDeps,
): Promise<Result<unknown>> {
  const fetchFn = deps.fetchFn ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    const t = await token();
    if (!t.ok) return t;
    let res: Response;
    try {
      res = await fetchFn(`${BASE}${spec.path}`, {
        method: spec.method,
        headers: {
          Authorization: `Bearer ${t.value}`,
          ...(spec.body !== undefined
            ? { 'Content-Type': 'application/json' }
            : {}),
        },
        ...(spec.body !== undefined ? { body: JSON.stringify(spec.body) } : {}),
      });
    } catch {
      return err({ kind: 'offline' });
    }
    if (res.status === 204) return ok(undefined);
    if (res.ok) {
      try {
        return ok(await res.json());
      } catch {
        return err({ kind: 'unknown', message: 'calendar API returned unreadable JSON' });
      }
    }
    // A 401 with a provider-fresh token means the refresh chain is
    // dead, not that this one call was unlucky. No retry: retrying an
    // expired grant just delays the reconnect ask.
    if (res.status === 401) return err({ kind: 'auth-expired' });
    if (res.status === 404 || res.status === 410) {
      return err({ kind: 'not-found', what: 'event' });
    }
    // Rate limiting (403 rateLimitExceeded / 429) and server errors
    // retry with backoff, per Google's own guidance. Anything else
    // 4xx is a real error and surfaces as one.
    const retriable =
      res.status === 429 || res.status === 403 || res.status >= 500;
    if (retriable && attempt < RETRIES) {
      await sleep(BACKOFF_MS[attempt] ?? 4000);
      continue;
    }
    return err({
      kind: 'provider',
      status: res.status,
      message: `calendar API ${spec.method} ${spec.path} failed`,
    });
  }
}

// Create the KickoffCal-owned calendar in the user's account. UTC
// timezone, deliberately: date-only events then anchor their reminder
// offsets to UTC midnight, matching the translation the rest of the
// codebase already uses and tests.
export async function createOwnedCalendar(
  summary: string,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<string>> {
  const r = await request(
    { method: 'POST', path: '/calendars', body: { summary, timeZone: 'UTC' } },
    token,
    deps,
  );
  if (!r.ok) return r;
  const id = (r.value as { id?: string }).id;
  if (!id) return err({ kind: 'unknown', message: 'calendar create returned no id' });
  return ok(id);
}

export async function insertRestEvent(
  calendarId: string,
  input: RestEventInput,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<string>> {
  const r = await request(
    {
      method: 'POST',
      path: `/calendars/${encodeURIComponent(calendarId)}/events`,
      body: toRestBody(input),
    },
    token,
    deps,
  );
  if (!r.ok) return r;
  const id = (r.value as { id?: string }).id;
  if (!id) return err({ kind: 'unknown', message: 'event insert returned no id' });
  return ok(id);
}

// Full-write update: the engine always knows the complete desired
// shape, so this is PUT, not PATCH — no partial-merge ambiguity.
export async function updateRestEvent(
  calendarId: string,
  eventId: string,
  input: RestEventInput,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<string>> {
  const r = await request(
    {
      method: 'PUT',
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      body: toRestBody(input),
    },
    token,
    deps,
  );
  if (!r.ok) return r;
  return ok(eventId);
}

export async function deleteRestEvent(
  calendarId: string,
  eventId: string,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<undefined>> {
  const r = await request(
    {
      method: 'DELETE',
      path: `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    },
    token,
    deps,
  );
  if (!r.ok) return r;
  return ok(undefined);
}

// Every event WE wrote into the calendar, and nothing else. The
// server-side filter matches the private marker property, so an event
// the user added to our calendar by hand is not merely skipped — it is
// never returned, and the prune invariant cannot see it to delete it.
export async function listRestTaggedEvents(
  calendarId: string,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<RestScannedEvent[]>> {
  const events: RestScannedEvent[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      privateExtendedProperty: `${MARKER_KEY}=${MARKER_VALUE}`,
      maxResults: '2500',
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await request(
      {
        method: 'GET',
        path: `/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
      },
      token,
      deps,
    );
    if (!r.ok) return r;
    const page = r.value as {
      items?: Array<{
        id?: string;
        summary?: string;
        start?: { date?: string; dateTime?: string };
        end?: { date?: string; dateTime?: string };
        extendedProperties?: { private?: Record<string, string> };
      }>;
      nextPageToken?: string;
    };
    for (const item of page.items ?? []) {
      const fixtureId = item.extendedProperties?.private?.[FIXTURE_KEY];
      if (!item.id || !fixtureId) continue;
      const allDay = !!item.start?.date;
      events.push({
        id: item.id,
        fixtureId,
        title: item.summary ?? '',
        startUtc: allDay
          ? `${item.start?.date}T00:00:00.000Z`
          : new Date(item.start?.dateTime ?? 0).toISOString(),
        endUtc: allDay
          ? `${item.end?.date}T00:00:00.000Z`
          : new Date(item.end?.dateTime ?? 0).toISOString(),
        allDay,
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ok(events);
}

export type { AppError };
