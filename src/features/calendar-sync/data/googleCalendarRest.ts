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
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
}

// Google's 403s carry their reason in the body, and two very different
// things share the status: rate limiting (retry with backoff) and a
// scope that does not cover the call (insufficientPermissions — retrying
// only delays the honest answer). Unknown reasons keep the rate-limit
// assumption the transport always made.
const RATE_LIMIT_REASONS = new Set([
  'rateLimitExceeded',
  'userRateLimitExceeded',
  'quotaExceeded',
  'dailyLimitExceeded',
  'RESOURCE_EXHAUSTED',
]);

async function errorReason(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as {
      error?: { errors?: Array<{ reason?: string }>; status?: string };
    };
    return body.error?.errors?.[0]?.reason ?? body.error?.status ?? null;
  } catch {
    return null;
  }
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
    // 4xx is a real error and surfaces as one — including the 403
    // Google uses for "this scope does not cover that call", which
    // must surface at once rather than spend seven seconds of backoff
    // and then come back looking like a rate limit (B4 item 3).
    let retriable = res.status === 429 || res.status >= 500;
    if (res.status === 403) {
      const reason = await errorReason(res);
      retriable = reason === null || RATE_LIMIT_REASONS.has(reason);
      if (!retriable) {
        return err({
          kind: 'provider',
          status: 403,
          message: `calendar API ${spec.method} ${spec.path} forbidden: ${reason}`,
        });
      }
    }
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

// ─── Calendar colour (B4 item 3) ──────────────────────────────────────
//
// A calendar's colour lives on the user's calendarList ENTRY, not on the
// calendar resource: PATCH users/me/calendarList/{id}?colorRgbFormat=true
// with backgroundColor/foregroundColor as hex (colorRgbFormat=true is
// what makes the API read the hex pair instead of the eleven-swatch
// colorId; the index then snaps to the nearest swatch on its own).
// Google's reference for calendarList.patch lists calendar.app.created
// among its accepted scopes; that the server honours it for an
// app-created calendar's own entry is proven only by the first live
// PATCH — which is why a 403 here is an honest, recorded refusal (never
// retried as rate limiting, never a silent success) and the driver keeps
// the app's swatch truthful from it.

// Relative luminance (sRGB → linear, WCAG coefficients): white text on a
// dark calendar colour, black on a light one.
export function contrastForeground(hex: string): '#ffffff' | '#000000' {
  const digits = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1];
  if (!digits) return '#ffffff';
  const channel = (i: number): number => {
    const c = parseInt(digits.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}

// The request, as data — pinned by test so the URL, the query flag and
// the body shape cannot drift apart from the API's contract.
export function calendarColourPatch(
  calendarId: string,
  hex: string,
): {
  path: string;
  body: { backgroundColor: string; foregroundColor: string };
} {
  const h = hex.trim().toLowerCase();
  return {
    path: `/users/me/calendarList/${encodeURIComponent(calendarId)}?colorRgbFormat=true`,
    body: {
      backgroundColor: h.startsWith('#') ? h : `#${h}`,
      foregroundColor: contrastForeground(hex),
    },
  };
}

export async function patchCalendarListColour(
  calendarId: string,
  hex: string,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<undefined>> {
  const { path, body } = calendarColourPatch(calendarId, hex);
  const r = await request({ method: 'PATCH', path, body }, token, deps);
  if (!r.ok) return r;
  return ok(undefined);
}

// Deleting an app-created calendar removes every event in it — the
// user-invoked erase (Stage 7B). calendar.app.created scope can only
// delete calendars this app created, which is the API enforcing the
// only-ever-our-calendar rule for us.
export async function deleteOwnedCalendar(
  calendarId: string,
  token: TokenProvider,
  deps: RestDeps = {},
): Promise<Result<void>> {
  const r = await request(
    { method: 'DELETE', path: `/calendars/${encodeURIComponent(calendarId)}` },
    token,
    deps,
  );
  if (!r.ok) {
    // Already gone is the outcome the caller wanted.
    if (r.error.kind === 'not-found') return ok(undefined);
    return r;
  }
  return ok(undefined);
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
