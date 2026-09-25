// Google's batch endpoint (owner ruling 2026-09-25): fifty calls to a
// request, each answering for itself. Against a fake Google that reads the
// multipart request the way the real one does and answers in its format —
// parts out of order, each echoing "response-" + the request's Content-ID.

import { ok, Result } from '../../../../core/result';
import {
  BATCH_MAX,
  batchRequest,
  deleteRestEvents,
  FIXTURE_KEY,
  insertRestEvents,
  MARKER_KEY,
  parseBatchAnswer,
  RestEventInput,
  updateRestEvents,
} from '../googleCalendarRest';

const token = async (): Promise<Result<string>> => ok('tok-1');
const noSleep = async () => {};

interface Inner {
  method: string;
  path: string;
  body: unknown;
  contentId: string;
}

type Reply = { status: number; json?: unknown };

// Reads a batch request as Google would.
function readBatch(init: RequestInit): Inner[] {
  const type = (init.headers as Record<string, string>)['Content-Type'];
  const boundary = /boundary=(.+)$/.exec(type)![1];
  return String(init.body)
    .split(`--${boundary}`)
    .filter((p) => p.trim() !== '' && !p.startsWith('--'))
    .map((part) => {
      const contentId = /Content-ID: <([^>]+)>/.exec(part)![1];
      const line = /(POST|PUT|DELETE) (\S+) HTTP\/1\.1/.exec(part)!;
      const json = part.slice(part.indexOf(line[0])).split('\r\n\r\n')[1]?.trim();
      return { method: line[1], path: line[2], body: json ? JSON.parse(json) : undefined, contentId };
    });
}

// Answers as Google does: its own boundary, parts in REVERSE order.
function answerBatch(inner: Inner[], reply: (c: Inner) => Reply): { text: string; boundary: string } {
  const boundary = 'batch_Gz9vGoogle';
  const parts = inner
    .map((c) => {
      const r = reply(c);
      const body = r.json === undefined ? '' : JSON.stringify(r.json, null, 2);
      return [
        `--${boundary}`,
        'Content-Type: application/http',
        `Content-ID: <response-${c.contentId}>`,
        '',
        `HTTP/1.1 ${r.status} ${r.status < 300 ? 'OK' : 'Error'}`,
        'Content-Type: application/json; charset=UTF-8',
        'Vary: Origin',
        '',
        body,
        '',
      ].join('\r\n');
    })
    .reverse();
  return { text: `${parts.join('')}--${boundary}--\r\n`, boundary };
}

function fakeGoogle(
  reply: (c: Inner, attempt: number) => Reply,
  outer: (n: number) => number | 'offline' = () => 200,
) {
  const requests: Array<{ url: string; auth: string; inner: Inner[] }> = [];
  const fetchFn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const inner = readBatch(init ?? {});
    requests.push({
      url: String(url),
      auth: (init?.headers as Record<string, string>).Authorization,
      inner,
    });
    const status = outer(requests.length);
    if (status === 'offline') throw new TypeError('Network request failed');
    if (status !== 200) {
      return { ok: false, status, headers: new Headers(), text: async () => '' } as unknown as Response;
    }
    const { text, boundary } = answerBatch(inner, (c) => reply(c, requests.length));
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': `multipart/mixed; boundary=${boundary}` }),
      text: async () => text,
    } as unknown as Response;
  }) as typeof fetch;
  return { fetchFn, requests };
}

const game = (n: number): RestEventInput => ({
  fixtureId: `fd-${n}`,
  title: `Game ${n}`,
  startUtc: '2027-03-06T15:00:00.000Z',
  endUtc: '2027-03-06T17:00:00.000Z',
  allDay: false,
  reminderMinutesBefore: 60,
  extraRemindersBefore: [],
});

beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => undefined));

test('fifty inserts go as ONE request, each an ordinary insert under /calendar/v3', async () => {
  const g = fakeGoogle((c) => ({ status: 200, json: { id: `ev-${(c.body as { summary: string }).summary}` } }));
  const items = Array.from({ length: BATCH_MAX }, (_, n) => ({ calendarId: 'cal@group', input: game(n) }));
  const r = await insertRestEvents(items, token, { fetchFn: g.fetchFn, sleep: noSleep });
  expect(g.requests).toHaveLength(1);
  expect(g.requests[0].url).toBe('https://www.googleapis.com/batch/calendar/v3');
  expect(g.requests[0].auth).toBe('Bearer tok-1');
  expect(g.requests[0].inner).toHaveLength(50);
  expect(g.requests[0].inner[0]).toMatchObject({
    method: 'POST',
    path: '/calendar/v3/calendars/cal%40group/events',
  });
  // Our marker rides every event, as on a single insert.
  expect(g.requests[0].inner[7].body).toMatchObject({
    summary: 'Game 7',
    extendedProperties: { private: { [MARKER_KEY]: '1', [FIXTURE_KEY]: 'fd-7' } },
  });
  // Answers come back out of order; each lands on its own call.
  expect(r).toEqual(ok(items.map((_, n) => ok(`ev-Game ${n}`))));
});

test('each call answers for itself: a gone calendar is not-found, a bad one a provider error', async () => {
  const g = fakeGoogle((c) =>
    c.path.includes('gone')
      ? { status: 404, json: { error: { code: 404 } } }
      : (c.body as { summary: string }).summary === 'Game 2'
        ? { status: 400, json: { error: { code: 400, errors: [{ reason: 'invalid' }] } } }
        : { status: 200, json: { id: 'ev-ok' } },
  );
  const r = await insertRestEvents(
    [
      { calendarId: 'cal', input: game(1) },
      { calendarId: 'cal', input: game(2) },
      { calendarId: 'gone', input: game(3) },
    ],
    token,
    { fetchFn: g.fetchFn, sleep: noSleep },
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value[0]).toEqual(ok('ev-ok'));
  expect(r.value[1].ok).toBe(false);
  if (!r.value[1].ok) expect(r.value[1].error).toMatchObject({ kind: 'provider', status: 400 });
  expect(r.value[2].ok).toBe(false);
  if (!r.value[2].ok) expect(r.value[2].error.kind).toBe('not-found');
  expect(g.requests).toHaveLength(1); // a 400 and a 404 are answers, not retries
});

test('deletes: done, or already gone — both are done', async () => {
  const g = fakeGoogle((c) => ({ status: c.path.endsWith('e2') ? 410 : c.path.endsWith('e3') ? 404 : 204 }));
  const r = await deleteRestEvents(
    ['e1', 'e2', 'e3'].map((eventId) => ({ calendarId: 'cal', eventId })),
    token,
    { fetchFn: g.fetchFn, sleep: noSleep },
  );
  expect(r).toEqual(ok([ok(true), ok(true), ok(true)]));
  expect(g.requests[0].inner.map((c) => c.method)).toEqual(['DELETE', 'DELETE', 'DELETE']);
});

test('a call Google asks us to slow down for is sent again — alone, not with the whole batch', async () => {
  const g = fakeGoogle((c, attempt) =>
    c.path.endsWith('e2') && attempt === 1
      ? { status: 403, json: { error: { errors: [{ reason: 'rateLimitExceeded' }] } } }
      : c.path.endsWith('e3') && attempt === 1
        ? { status: 503 }
        : { status: 204 },
  );
  const r = await deleteRestEvents(
    ['e1', 'e2', 'e3'].map((eventId) => ({ calendarId: 'cal', eventId })),
    token,
    { fetchFn: g.fetchFn, sleep: noSleep },
  );
  expect(r).toEqual(ok([ok(true), ok(true), ok(true)]));
  expect(g.requests).toHaveLength(2);
  expect(g.requests[1].inner.map((c) => c.path.split('/').pop())).toEqual(['e2', 'e3']);
});

test('a scope refusal (403 insufficientPermissions) is an answer, never retried as a rate limit', async () => {
  const g = fakeGoogle(() => ({
    status: 403,
    json: { error: { errors: [{ reason: 'insufficientPermissions' }] } },
  }));
  const r = await deleteRestEvents([{ calendarId: 'cal', eventId: 'e1' }], token, {
    fetchFn: g.fetchFn,
    sleep: noSleep,
  });
  expect(g.requests).toHaveLength(1);
  expect(r.ok && !r.value[0].ok).toBe(true);
});

test('a call that keeps failing comes back failed after three more tries — never lost, never looped', async () => {
  const g = fakeGoogle(() => ({ status: 500 }));
  const r = await deleteRestEvents([{ calendarId: 'cal', eventId: 'e1' }], token, {
    fetchFn: g.fetchFn,
    sleep: noSleep,
  });
  expect(g.requests).toHaveLength(4);
  expect(r.ok && !r.value[0].ok).toBe(true);
});

test('the request as a whole: an expired grant, no network, a busy Google', async () => {
  const expired = fakeGoogle(() => ({ status: 204 }), () => 401);
  const r1 = await batchRequest([{ method: 'DELETE', path: '/calendars/c/events/e' }], token, {
    fetchFn: expired.fetchFn,
    sleep: noSleep,
  });
  expect(r1.ok ? null : r1.error.kind).toBe('auth-expired');
  expect(expired.requests).toHaveLength(1);

  const offline = fakeGoogle(() => ({ status: 204 }), () => 'offline');
  const r2 = await batchRequest([{ method: 'DELETE', path: '/calendars/c/events/e' }], token, {
    fetchFn: offline.fetchFn,
    sleep: noSleep,
  });
  expect(r2.ok ? null : r2.error.kind).toBe('offline');

  const busy = fakeGoogle(() => ({ status: 204 }), (n) => (n === 1 ? 503 : 200));
  const r3 = await batchRequest([{ method: 'DELETE', path: '/calendars/c/events/e' }], token, {
    fetchFn: busy.fetchFn,
    sleep: noSleep,
  });
  expect(r3).toEqual(ok([{ status: 204, json: null }]));
  expect(busy.requests).toHaveLength(2);
});

test('nothing to send sends nothing; more than fifty is refused, never split silently', async () => {
  const g = fakeGoogle(() => ({ status: 204 }));
  expect(await batchRequest([], token, { fetchFn: g.fetchFn })).toEqual(ok([]));
  const tooMany = Array.from({ length: BATCH_MAX + 1 }, () => ({
    method: 'DELETE' as const,
    path: '/calendars/c/events/e',
  }));
  const r = await batchRequest(tooMany, token, { fetchFn: g.fetchFn });
  expect(r.ok).toBe(false);
  expect(g.requests).toHaveLength(0);
});

test('a part missing from the answer is status 0 — unknown, never success', () => {
  const text = [
    '--b',
    'Content-Type: application/http',
    'Content-ID: <response-item1>',
    '',
    'HTTP/1.1 204 No Content',
    '',
    '',
    '--b--',
  ].join('\r\n');
  expect(parseBatchAnswer(text, 'b', 2)).toEqual([
    { status: 0, json: null },
    { status: 204, json: null },
  ]);
});

// Google's own answer to a two-insert batch sent with no credentials
// (captured from the live endpoint, 2026-09-25): the batch is PARSED and
// every call answers 401 inside a 200. Proof the request format is one
// Google reads, and the shape the parser must take.
const GOOGLE_BOUNDARY = "batch_TZHTZqo-U8bOJrHZpcNFolsCJFZPTOGq";
const GOOGLE_ANSWER = "\r\n--batch_TZHTZqo-U8bOJrHZpcNFolsCJFZPTOGq\r\nContent-Type: application/http\r\nContent-ID: <response-item0>\r\n\r\nHTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer realm=\"https://accounts.google.com/\"\r\nVary: Origin\r\nVary: X-Origin\r\nVary: Referer\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\n  \"error\": {\n    \"code\": 401,\n    \"message\": \"Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.\",\n    \"errors\": [\n      {\n        \"message\": \"Login Required.\",\n        \"domain\": \"global\",\n        \"reason\": \"required\",\n        \"location\": \"Authorization\",\n        \"locationType\": \"header\"\n      }\n    ],\n    \"status\": \"UNAUTHENTICATED\",\n    \"details\": [\n      {\n        \"@type\": \"type.googleapis.com/google.rpc.ErrorInfo\",\n        \"reason\": \"CREDENTIALS_MISSING\",\n        \"domain\": \"googleapis.com\",\n        \"metadata\": {\n          \"method\": \"calendar.v3.Events.Insert\",\n          \"service\": \"calendar-json.googleapis.com\"\n        }\n      }\n    ]\n  }\n}\n\r\n--batch_TZHTZqo-U8bOJrHZpcNFolsCJFZPTOGq\r\nContent-Type: application/http\r\nContent-ID: <response-item1>\r\n\r\nHTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Bearer realm=\"https://accounts.google.com/\"\r\nVary: Origin\r\nVary: X-Origin\r\nVary: Referer\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\n  \"error\": {\n    \"code\": 401,\n    \"message\": \"Request is missing required authentication credential. Expected OAuth 2 access token, login cookie or other valid authentication credential. See https://developers.google.com/identity/sign-in/web/devconsole-project.\",\n    \"errors\": [\n      {\n        \"message\": \"Login Required.\",\n        \"domain\": \"global\",\n        \"reason\": \"required\",\n        \"location\": \"Authorization\",\n        \"locationType\": \"header\"\n      }\n    ],\n    \"status\": \"UNAUTHENTICATED\",\n    \"details\": [\n      {\n        \"@type\": \"type.googleapis.com/google.rpc.ErrorInfo\",\n        \"reason\": \"CREDENTIALS_MISSING\",\n        \"domain\": \"googleapis.com\",\n        \"metadata\": {\n          \"method\": \"calendar.v3.Events.Insert\",\n          \"service\": \"calendar-json.googleapis.com\"\n        }\n      }\n    ]\n  }\n}\n\r\n--batch_TZHTZqo-U8bOJrHZpcNFolsCJFZPTOGq--\r\n";

test('Google’s real answer parses: each call, by its Content-ID', () => {
  const answers = parseBatchAnswer(GOOGLE_ANSWER, GOOGLE_BOUNDARY, 2);
  expect(answers.map((a) => a.status)).toEqual([401, 401]);
  expect((answers[1].json as { error: { code: number } }).error.code).toBe(401);
});

test('an expired grant answers every call 401 inside a 200 — that is the reconnect ask, not per-call errors', async () => {
  const g = fakeGoogle(() => ({ status: 401, json: { error: { code: 401 } } }));
  const r = await insertRestEvents([{ calendarId: 'cal', input: game(1) }], token, {
    fetchFn: g.fetchFn,
    sleep: noSleep,
  });
  expect(r.ok ? null : r.error.kind).toBe('auth-expired');
  expect(g.requests).toHaveLength(1);
});

test('updates are full writes (PUT) like one update; a hand-deleted event answers not-found for the caller to remake', async () => {
  const g = fakeGoogle((c) => (c.path.endsWith('gone') ? { status: 404 } : { status: 200, json: { id: 'x' } }));
  const r = await updateRestEvents(
    [
      { calendarId: 'cal', eventId: 'e1', input: game(1) },
      { calendarId: 'cal', eventId: 'gone', input: game(2) },
    ],
    token,
    { fetchFn: g.fetchFn, sleep: noSleep },
  );
  expect(g.requests[0].inner.map((c) => c.method)).toEqual(['PUT', 'PUT']);
  expect(g.requests[0].inner[0].body).toMatchObject({ summary: 'Game 1' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value[0]).toEqual(ok('e1'));
  expect(r.value[1].ok ? null : r.value[1].error.kind).toBe('not-found');
});
