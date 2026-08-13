// The REST transport, against a fake fetch. The attack tests at the
// bottom are rule 15: the ownership filter and the auth-expired
// classification each get a deliberate attempt to defeat them.

import { ok, Result } from '../../../../core/result';
import {
  createOwnedCalendar,
  deleteRestEvent,
  FIXTURE_KEY,
  insertRestEvent,
  listRestTaggedEvents,
  MARKER_KEY,
  MARKER_VALUE,
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
