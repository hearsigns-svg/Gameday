// The REST transport, against a fake fetch. The attack tests at the
// bottom are rule 15: the ownership filter and the auth-expired
// classification each get a deliberate attempt to defeat them.

import { ok, Result } from '../../../../core/result';
import {
  calendarColourPatch,
  contrastForeground,
  createOwnedCalendar,
  deleteRestEvent,
  FIXTURE_KEY,
  insertRestEvent,
  listRestTaggedEvents,
  MARKER_KEY,
  MARKER_VALUE,
  patchCalendarListColour,
  RestEventInput,
  updateRestEvent,
} from '../googleCalendarRest';

const token = async (): Promise<Result<string>> => ok('tok-1');
const noSleep = async () => {};

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(
  responses: Array<{ status: number; json?: unknown }>,
): { fetchFn: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json ?? {},
    } as Response;
  }) as typeof fetch;
  return { fetchFn, calls };
}

const timed: RestEventInput = {
  fixtureId: 'tsdb-777',
  title: 'Liverpool v Everton',
  startUtc: '2027-03-06T15:00:00.000Z',
  endUtc: '2027-03-06T17:00:00.000Z',
  allDay: false,
  reminderMinutesBefore: 60,
  extraRemindersBefore: [],
};

test('calendar create pins UTC timezone and returns the id', async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { id: 'cal-9' } }]);
  const r = await createOwnedCalendar('KickOffCal', token, { fetchFn, sleep: noSleep });
  expect(r).toEqual(ok('cal-9'));
  const body = JSON.parse(String(calls[0]!.init.body));
  expect(body).toEqual({ summary: 'KickOffCal', timeZone: 'UTC' });
});

test('timed insert carries UTC dateTimes, popup reminder, and both private tags', async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { id: 'ev-1' } }]);
  const r = await insertRestEvent('cal-9', timed, token, { fetchFn, sleep: noSleep });
  expect(r).toEqual(ok('ev-1'));
  const body = JSON.parse(String(calls[0]!.init.body));
  expect(body.start).toEqual({ dateTime: timed.startUtc, timeZone: 'UTC' });
  expect(body.end).toEqual({ dateTime: timed.endUtc, timeZone: 'UTC' });
  expect(body.reminders).toEqual({
    useDefault: false,
    overrides: [{ method: 'popup', minutes: 60 }],
  });
  expect(body.extendedProperties.private[MARKER_KEY]).toBe(MARKER_VALUE);
  expect(body.extendedProperties.private[FIXTURE_KEY]).toBe('tsdb-777');
});

test('reminder slots 2/3 land as additional popup overrides (Stage 5)', async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { id: 'ev-2' } }]);
  const r = await insertRestEvent(
    'cal-9',
    { ...timed, extraRemindersBefore: [360, 1440] },
    token,
    { fetchFn, sleep: noSleep },
  );
  expect(r).toEqual(ok('ev-2'));
  const body = JSON.parse(String(calls[0]!.init.body));
  expect(body.reminders).toEqual({
    useDefault: false,
    overrides: [
      { method: 'popup', minutes: 60 },
      { method: 'popup', minutes: 360 },
      { method: 'popup', minutes: 1440 },
    ],
  });
});

test('all-day dates pass through with NO ±1 arithmetic — planner end is already exclusive', () => {
  // Run in both TZ passes: the date strings must be sliced from the
  // UTC ISO, never round-tripped through a local Date.
  const allDay: RestEventInput = {
    ...timed,
    allDay: true,
    reminderMinutesBefore: null,
    startUtc: '2027-07-02T00:00:00.000Z',
    endUtc: '2027-07-03T00:00:00.000Z', // exclusive next-midnight
  };
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { id: 'ev-2' } }]);
  return insertRestEvent('cal-9', allDay, token, { fetchFn, sleep: noSleep }).then(() => {
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.start).toEqual({ date: '2027-07-02' });
    expect(body.end).toEqual({ date: '2027-07-03' });
  });
});

test('update is a full PUT to the event path', async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: {} }]);
  const r = await updateRestEvent('cal-9', 'ev-1', timed, token, { fetchFn, sleep: noSleep });
  expect(r).toEqual(ok('ev-1'));
  expect(calls[0]!.init.method).toBe('PUT');
  expect(calls[0]!.url).toContain('/calendars/cal-9/events/ev-1');
});

test('delete 204 succeeds; 410 comes back as typed not-found for the driver to map', async () => {
  const gone = fakeFetch([{ status: 410 }]);
  const r = await deleteRestEvent('cal-9', 'ev-x', token, {
    fetchFn: gone.fetchFn,
    sleep: noSleep,
  });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe('not-found');
  const fine = fakeFetch([{ status: 204 }]);
  const r2 = await deleteRestEvent('cal-9', 'ev-y', token, {
    fetchFn: fine.fetchFn,
    sleep: noSleep,
  });
  expect(r2.ok).toBe(true);
});

test('429 retries with backoff then succeeds', async () => {
  const { fetchFn, calls } = fakeFetch([
    { status: 429 },
    { status: 429 },
    { status: 200, json: { id: 'ev-3' } },
  ]);
  const slept: number[] = [];
  const r = await insertRestEvent('cal-9', timed, token, {
    fetchFn,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  expect(r).toEqual(ok('ev-3'));
  expect(calls.length).toBe(3);
  expect(slept).toEqual([1000, 2000]);
});

test('tagged scan pages through and maps fixture ids', async () => {
  const item = (id: string, fid: string) => ({
    id,
    summary: 't',
    start: { dateTime: '2027-03-06T15:00:00Z' },
    end: { dateTime: '2027-03-06T17:00:00Z' },
    extendedProperties: { private: { [MARKER_KEY]: MARKER_VALUE, [FIXTURE_KEY]: fid } },
  });
  const { fetchFn, calls } = fakeFetch([
    { status: 200, json: { items: [item('e1', 'f1')], nextPageToken: 'p2' } },
    { status: 200, json: { items: [item('e2', 'f2')] } },
  ]);
  const r = await listRestTaggedEvents('cal-9', token, { fetchFn, sleep: noSleep });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.map((e) => e.fixtureId)).toEqual(['f1', 'f2']);
  expect(calls[0]!.url).toContain(
    `privateExtendedProperty=${MARKER_KEY}%3D${MARKER_VALUE}`,
  );
  expect(calls[1]!.url).toContain('pageToken=p2');
});

// ── Rule 15: attack the guards ──────────────────────────────────────

test('ATTACK: a user event dropped into our calendar is invisible to the scan', async () => {
  // The user can add their own events to our calendar via the Google
  // Calendar UI. If one ever came back from the scan, the prune
  // invariant (calendar ⊆ ledger) would see an unledgered orphan and
  // DELETE the user's event. Reintroduce the threat: an item with no
  // marker properties in the response — it must not survive mapping.
  const userEvent = {
    id: 'user-1',
    summary: 'Dentist',
    start: { dateTime: '2027-03-08T09:00:00Z' },
    end: { dateTime: '2027-03-08T10:00:00Z' },
  };
  const { fetchFn } = fakeFetch([
    { status: 200, json: { items: [userEvent] } },
  ]);
  const r = await listRestTaggedEvents('cal-9', token, { fetchFn, sleep: noSleep });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value).toEqual([]);
  // Belt AND braces: the request itself filters server-side, so the
  // item above could only appear if Google ignored the filter — and
  // the client-side fixtureId check still drops it.
});

test('ATTACK: 401 becomes auth-expired, never unknown, and never retries', async () => {
  // The failure class that silently stopped syncs all evening: if a
  // dead grant classified as 'unknown', the chip would show a generic
  // shrug and nothing would say "reconnect". And retrying an expired
  // grant would just delay the ask.
  const { fetchFn, calls } = fakeFetch([{ status: 401 }]);
  const r = await insertRestEvent('cal-9', timed, token, { fetchFn, sleep: noSleep });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe('auth-expired');
  expect(calls.length).toBe(1);
});

// ── Calendar colour (Round 4 B4 item 3) ─────────────────────────────

test('calendar colour PATCH hits the calendarList entry with colorRgbFormat=true and an RGB pair', async () => {
  const { fetchFn, calls } = fakeFetch([{ status: 200, json: { id: 'cal-9' } }]);
  const r = await patchCalendarListColour('cal-9', '#1463F3', token, {
    fetchFn,
    sleep: noSleep,
  });
  expect(r).toEqual(ok(undefined));
  expect(calls[0]!.init.method).toBe('PATCH');
  expect(calls[0]!.url).toBe(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList/cal-9?colorRgbFormat=true',
  );
  expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
    backgroundColor: '#1463f3',
    foregroundColor: '#ffffff',
  });
});

test('the patch builder: encoded id, lowercase hex with a leading #, contrast-picked foreground', () => {
  expect(calendarColourPatch('a b@group.calendar.google.com', '52525B')).toEqual({
    path: '/users/me/calendarList/a%20b%40group.calendar.google.com?colorRgbFormat=true',
    body: { backgroundColor: '#52525b', foregroundColor: '#ffffff' },
  });
  // Every swatch the picker offers gets the higher-contrast foreground
  // (WCAG luminance break-even 0.179): the mid-tone green and orange
  // take dark text, the deep red and blue take white.
  expect(contrastForeground('#EA580C')).toBe('#000000'); // orange, L≈0.25
  expect(contrastForeground('#C81E1E')).toBe('#ffffff'); // red, L≈0.13
  expect(contrastForeground('#16A34A')).toBe('#000000'); // green, L≈0.27
  expect(contrastForeground('#1463F3')).toBe('#ffffff'); // KickOffCal blue
  expect(contrastForeground('#ffffff')).toBe('#000000');
  expect(contrastForeground('#000000')).toBe('#ffffff');
  expect(contrastForeground('nonsense')).toBe('#ffffff'); // never throws
});

test('ATTACK: a 403 insufficientPermissions surfaces ONCE as a typed refusal — never retried as rate limiting', async () => {
  // If the scope does not cover calendarList for an app-created entry,
  // Google answers 403 with reason insufficientPermissions. The old
  // transport treated EVERY 403 as a rate limit: three retries, seven
  // seconds of backoff, then a generic provider error — the refusal
  // would have looked like flakiness. Reintroduce the response and
  // require the immediate, typed answer.
  const forbidden = {
    error: {
      code: 403,
      message: 'Insufficient Permission',
      errors: [
        {
          domain: 'global',
          reason: 'insufficientPermissions',
          message: 'Insufficient Permission',
        },
      ],
    },
  };
  const { fetchFn, calls } = fakeFetch([{ status: 403, json: forbidden }]);
  const slept: number[] = [];
  const r = await patchCalendarListColour('cal-9', '#1463F3', token, {
    fetchFn,
    sleep: async (ms) => {
      slept.push(ms);
    },
  });
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.error.kind).toBe('provider');
    if (r.error.kind === 'provider') expect(r.error.status).toBe(403);
  }
  expect(calls.length).toBe(1);
  expect(slept).toEqual([]);
});

test('403 rateLimitExceeded still retries with backoff, and a reasonless 403 keeps the rate-limit assumption', async () => {
  const limited = { error: { code: 403, errors: [{ reason: 'rateLimitExceeded' }] } };
  const a = fakeFetch([{ status: 403, json: limited }, { status: 200, json: {} }]);
  const r = await patchCalendarListColour('cal-9', '#1463F3', token, {
    fetchFn: a.fetchFn,
    sleep: noSleep,
  });
  expect(r).toEqual(ok(undefined));
  expect(a.calls.length).toBe(2);
  const bare = fakeFetch([{ status: 403 }, { status: 200, json: { id: 'ev-1' } }]);
  const r2 = await insertRestEvent('cal-9', timed, token, {
    fetchFn: bare.fetchFn,
    sleep: noSleep,
  });
  expect(r2).toEqual(ok('ev-1'));
  expect(bare.calls.length).toBe(2);
});
