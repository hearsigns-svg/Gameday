// The REST driver's glue, with storage mocked in-memory (MMKV is
// native and never loads under jest — the mock factory replaces the
// module before the import graph reaches it).

const mockStore = new Map<string, string>();
jest.mock('../../../../core/storage', () => ({
  readJson: (key: string, fallback: unknown) => {
    const raw = mockStore.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  },
  writeJson: (key: string, value: unknown) => {
    mockStore.set(key, JSON.stringify(value));
  },
  removeKey: (key: string) => {
    mockStore.delete(key);
  },
}));

import {
  configureRestAuth,
  ensureRestTarget,
  restDeleteFixtureEvent,
} from '../restCalendarDriver';
import { ok } from '../../../../core/result';
import { setRestCalendarId } from '../calendarBackend';

beforeEach(() => {
  mockStore.clear();
});

test('unconfigured auth answers auth-expired — a wiring gap can never look like a working sync', async () => {
  // No configureRestAuth call has happened. Every verb must produce
  // the same loud typed state a dead grant produces, so a startup
  // ordering bug surfaces on the chip instead of silently no-opping.
  setRestCalendarId('cal-1');
  const r = await restDeleteFixtureEvent('ev-1');
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.kind).toBe('auth-expired');
});

test('ensureRestTarget creates once, stores the id, and reuses it after', async () => {
  let creates = 0;
  configureRestAuth(async () => ok('tok'));
  // Fake fetch at the global level: the transport uses global fetch
  // when no fetchFn is injected — stub it for the create call.
  const realFetch = global.fetch;
  global.fetch = (async () => {
    creates++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'cal-77' }),
    } as Response;
  }) as typeof fetch;
  try {
    const first = await ensureRestTarget();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.calendarId).toBe('cal-77');
      expect(first.value.kind).toBe('ours');
    }
    const second = await ensureRestTarget();
    expect(second.ok).toBe(true);
    expect(creates).toBe(1); // stored id reused; no second calendar
  } finally {
    global.fetch = realFetch;
  }
});

test('deleting an already-gone event is vacuous success; other failures abort', async () => {
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-1');
  const realFetch = global.fetch;
  global.fetch = (async () =>
    ({ ok: false, status: 410, json: async () => ({}) }) as Response) as typeof fetch;
  try {
    const gone = await restDeleteFixtureEvent('ev-gone');
    expect(gone).toEqual(ok(true));
  } finally {
    global.fetch = realFetch;
  }
});
