// The REST driver's glue, with storage mocked in-memory (MMKV is
// native and never loads under jest — the mock factory replaces the
// module before the import graph reaches it). Round 4 B4 added the
// target record and the calendar colour to what a resolve does; both
// are pinned here against a scripted fetch, refusals included.

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
  applyRestCalendarColour,
  configureRestAuth,
  ensureRestTarget,
  eraseRestCalendar,
  restColourState,
  restDeleteFixtureEvent,
} from '../restCalendarDriver';
import { ok } from '../../../../core/result';
import { restCalendarId, setRestCalendarId } from '../calendarBackend';
import { calendarColour, saveCalendarColour } from '../calendarColourStore';
import { saveTarget, storedTarget } from '../calendarTargetStore';

interface Call {
  method: string;
  url: string;
  body: unknown;
}

type Answer = { status: number; json?: unknown } | 'offline';

// A scripted global fetch: answers by (method, url), records every call.
// The transport uses global fetch when no fetchFn is injected, which is
// how the driver calls it.
function scriptFetch(answer: (method: string, url: string) => Answer): {
  calls: Call[];
  restore: () => void;
} {
  const calls: Call[] = [];
  const realFetch = global.fetch;
  global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const a = answer(method, String(url));
    if (a === 'offline') throw new TypeError('Network request failed');
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      json: async () => a.json ?? {},
    } as Response;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      global.fetch = realFetch;
    },
  };
}

const isCreate = (m: string, u: string) => m === 'POST' && u.endsWith('/calendars');
const isColour = (m: string, u: string) =>
  m === 'PATCH' && u.includes('/users/me/calendarList/');

const FORBIDDEN = {
  error: {
    code: 403,
    errors: [{ reason: 'insufficientPermissions', message: 'Insufficient Permission' }],
  },
};

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

test('ensureRestTarget creates once, persists the target record, paints the colour — then reuses all three', async () => {
  configureRestAuth(async () => ok('tok'));
  const f = scriptFetch((m, u) =>
    isCreate(m, u) ? { status: 200, json: { id: 'cal-77' } } : { status: 200, json: {} },
  );
  try {
    const first = await ensureRestTarget();
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(first.value.calendarId).toBe('cal-77');
      expect(first.value.kind).toBe('ours');
    }
    // B4 item 1: the SAME record the provider path writes.
    expect(storedTarget()).toEqual({
      calendarId: 'cal-77',
      kind: 'ours',
      label: 'KickOffCal',
      accountLabel: 'Google Calendar',
      sourceKind: 'cloud',
      chosen: false,
    });
    // B4 item 3: painted with the saved colour, on the calendarList entry.
    const paints = f.calls.filter((c) => isColour(c.method, c.url));
    expect(paints).toHaveLength(1);
    expect(paints[0]!.url).toContain('/users/me/calendarList/cal-77?colorRgbFormat=true');
    expect(paints[0]!.body).toEqual({
      backgroundColor: calendarColour().toLowerCase(),
      foregroundColor: '#ffffff',
    });
    expect(restColourState()).toEqual({ hex: calendarColour(), status: 'applied' });

    const second = await ensureRestTarget();
    expect(second.ok).toBe(true);
    expect(f.calls.filter((c) => isCreate(c.method, c.url))).toHaveLength(1); // no second calendar
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1); // no repaint
  } finally {
    f.restore();
  }
});

test('a REST calendar created BEFORE this code (id stored, no records) is painted and recorded on the next resolve', async () => {
  // The owner's Pixel: calendar exists, restCalendarColour.v1 and
  // calendarTarget.v1 both absent.
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-old');
  const f = scriptFetch(() => ({ status: 200, json: {} }));
  try {
    const r = await ensureRestTarget();
    expect(r.ok).toBe(true);
    expect(f.calls.filter((c) => isCreate(c.method, c.url))).toHaveLength(0);
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
    expect(storedTarget()?.label).toBe('KickOffCal');
    expect(restColourState()?.status).toBe('applied');
    await ensureRestTarget();
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
  } finally {
    f.restore();
  }
});

test('ATTACK: the stale provider-path record cannot survive a REST resolve', async () => {
  // The Android remnant itself: "Social", kind 'user', written by the
  // pre-P28 provider path and never touched by the REST path.
  saveTarget({
    calendarId: '5',
    kind: 'user',
    label: 'Social',
    accountLabel: 'you@gmail.com',
    sourceKind: 'cloud',
    chosen: false,
  });
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-77');
  const f = scriptFetch(() => ({ status: 200, json: {} }));
  try {
    await ensureRestTarget();
    expect(storedTarget()?.label).toBe('KickOffCal');
    expect(storedTarget()?.kind).toBe('ours');
    expect(storedTarget()?.calendarId).toBe('cal-77');
  } finally {
    f.restore();
  }
});

test('a colour refusal (403 insufficientPermissions) is recorded, never fails the resolve, and is not re-asked until the colour changes', async () => {
  configureRestAuth(async () => ok('tok'));
  const f = scriptFetch((m, u) =>
    isCreate(m, u)
      ? { status: 200, json: { id: 'cal-77' } }
      : isColour(m, u)
        ? { status: 403, json: FORBIDDEN }
        : { status: 200, json: {} },
  );
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const r = await ensureRestTarget();
    expect(r.ok).toBe(true); // cosmetic, non-fatal
    expect(restColourState()).toEqual({ hex: calendarColour(), status: 'refused' });
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
    // The next sync does not hammer a scope that said no.
    await ensureRestTarget();
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
    // A new swatch asks again — and reports the refusal to the user.
    saveCalendarColour('#C81E1E');
    expect(await applyRestCalendarColour('#C81E1E')).toBe('refused');
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(2);
    expect(restColourState()).toEqual({ hex: '#C81E1E', status: 'refused' });
  } finally {
    warn.mockRestore();
    f.restore();
  }
});

test('an offline paint stays pending and lands on the next resolve', async () => {
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-77');
  let online = false;
  const f = scriptFetch((m, u) =>
    isColour(m, u) && !online ? 'offline' : { status: 200, json: {} },
  );
  try {
    expect(await applyRestCalendarColour('#16A34A')).toBe('saved');
    expect(restColourState()).toEqual({ hex: '#16A34A', status: 'pending' });
    online = true;
    saveCalendarColour('#16A34A');
    await ensureRestTarget();
    expect(restColourState()).toEqual({ hex: '#16A34A', status: 'applied' });
    expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(2);
  } finally {
    f.restore();
  }
});

test('a swatch picked before any calendar exists saves for creation, and creation paints it', async () => {
  configureRestAuth(async () => ok('tok'));
  saveCalendarColour('#6D28D9');
  expect(await applyRestCalendarColour('#6D28D9')).toBe('saved');
  const f = scriptFetch((m, u) =>
    isCreate(m, u) ? { status: 200, json: { id: 'cal-new' } } : { status: 200, json: {} },
  );
  try {
    await ensureRestTarget();
    const paints = f.calls.filter((c) => isColour(c.method, c.url));
    expect(paints).toHaveLength(1);
    expect(paints[0]!.body).toEqual({ backgroundColor: '#6d28d9', foregroundColor: '#ffffff' });
  } finally {
    f.restore();
  }
});

test('eraseRestCalendar takes the target and colour records with the calendar', async () => {
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-77');
  const f = scriptFetch((m) => (m === 'DELETE' ? { status: 204 } : { status: 200, json: {} }));
  try {
    await ensureRestTarget(); // records exist
    expect(storedTarget()).not.toBeNull();
    expect(restColourState()).not.toBeNull();
    expect(await eraseRestCalendar()).toEqual(ok(true));
    expect(restCalendarId()).toBeNull();
    expect(storedTarget()).toBeNull();
    expect(restColourState()).toBeNull();
  } finally {
    f.restore();
  }
});

test('deleting an already-gone event is vacuous success; other failures abort', async () => {
  configureRestAuth(async () => ok('tok'));
  setRestCalendarId('cal-1');
  const f = scriptFetch(() => ({ status: 410 }));
  try {
    const gone = await restDeleteFixtureEvent('ev-gone');
    expect(gone).toEqual(ok(true));
  } finally {
    f.restore();
  }
});
