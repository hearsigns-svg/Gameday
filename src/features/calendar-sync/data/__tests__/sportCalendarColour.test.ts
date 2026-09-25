// A sport calendar's colour, painted until it sticks (owner rulings
// 2026-09-25) — through the facade, against a scripted Google and a
// scripted device calendar store. The Pixel is why: both colour requests
// at creation died and the calendars kept Google's default, with nothing
// recorded to try again.

const mockStorage = new Map<string, string>();
jest.mock('../../../../core/storage', () => ({
  readJson: (key: string, fallback: unknown) => {
    const raw = mockStorage.get(key);
    return raw === undefined ? fallback : JSON.parse(raw);
  },
  writeJson: (key: string, value: unknown) => {
    mockStorage.set(key, JSON.stringify(value));
  },
  removeKey: (key: string) => {
    mockStorage.delete(key);
  },
}));

const mockDevice = {
  calendars: new Map<string, { title: string; color?: string }>(),
  failing: false,
};
jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event' },
  CalendarAccessLevel: { OWNER: 'owner' },
  getCalendars: async () => [],
  getDefaultCalendarSync: () => ({ id: 'ek-default', source: { id: 'src-icloud' } }),
  createCalendar: async (details: { title: string; color?: string }) => {
    const id = `ek-${mockDevice.calendars.size + 1}`;
    mockDevice.calendars.set(id, { title: details.title, ...(details.color ? { color: details.color } : {}) });
    return { id, title: details.title };
  },
  ExpoCalendar: {
    get: async (id: string) => {
      if (mockDevice.failing) throw new Error('store unavailable');
      const cal = mockDevice.calendars.get(id);
      if (!cal) throw new Error('not found');
      return {
        id,
        title: cal.title,
        update: async (details: { color?: string }) => {
          if (details.color) cal.color = details.color;
        },
      };
    },
  },
}));

import { ok } from '../../../../core/result';
import { setActiveBackend } from '../calendarBackend';
import {
  conformSportCalendarColours,
  createSportCalendar,
  paintSportCalendar,
} from '../driver';
import { configureRestAuth } from '../restCalendarDriver';
import { sportCalendarColourStates } from '../sportCalendarStore';

type Answer = { status: number; json?: unknown } | 'offline';

function scriptFetch(answer: (method: string, url: string) => Answer) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const realFetch = global.fetch;
  global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const a = answer(method, String(url));
    if (a === 'offline') throw new TypeError('Network request failed');
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.json ?? {} } as Response;
  }) as typeof fetch;
  return { calls, restore: () => void (global.fetch = realFetch) };
}

const isCreate = (m: string, u: string) => m === 'POST' && u.endsWith('/calendars');
const isColour = (m: string, u: string) => m === 'PATCH' && u.includes('/users/me/calendarList/');
const FORBIDDEN = {
  error: { code: 403, errors: [{ reason: 'insufficientPermissions', message: 'Insufficient Permission' }] },
};

beforeEach(() => {
  mockStorage.clear();
  mockDevice.calendars.clear();
  mockDevice.failing = false;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('Google Calendar', () => {
  beforeEach(() => {
    setActiveBackend('rest');
    configureRestAuth(async () => ok('tok'));
  });

  test('making a sport calendar asks nothing more — its colour is asked for once it is recorded', async () => {
    const f = scriptFetch((m, u) =>
      isCreate(m, u) ? { status: 200, json: { id: 'cal-football' } } : { status: 200, json: {} },
    );
    try {
      const r = await createSportCalendar('KickOffCal · Football', '#16A34A');
      expect(r).toEqual({ ok: true, value: 'cal-football' });
      // No request between the calendar's creation and its record.
      expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(0);
      await conformSportCalendarColours([{ calendarId: 'cal-football', hex: '#16A34A' }]);
      expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
      expect(sportCalendarColourStates()['cal-football']).toEqual({ hex: '#16A34A', status: 'applied' });
    } finally {
      f.restore();
    }
  });

  test('a paint that dies (the Pixel) is pending, and the next pass lands it', async () => {
    let online = false;
    const f = scriptFetch((m, u) =>
      isColour(m, u) && !online ? 'offline' : { status: 200, json: {} },
    );
    try {
      await conformSportCalendarColours([{ calendarId: 'cal-football', hex: '#16A34A' }]);
      expect(sportCalendarColourStates()['cal-football']).toEqual({ hex: '#16A34A', status: 'pending' });
      online = true;
      await conformSportCalendarColours([{ calendarId: 'cal-football', hex: '#16A34A' }]);
      expect(sportCalendarColourStates()['cal-football']).toEqual({ hex: '#16A34A', status: 'applied' });
      // Applied: later passes ask nothing more.
      const asked = f.calls.length;
      await conformSportCalendarColours([{ calendarId: 'cal-football', hex: '#16A34A' }]);
      expect(f.calls.length).toBe(asked);
    } finally {
      f.restore();
    }
  });

  test('a calendar made before colours were recorded is painted once', async () => {
    const f = scriptFetch(() => ({ status: 200, json: {} }));
    try {
      await conformSportCalendarColours([{ calendarId: 'cal-old', hex: '#DB2777' }]);
      await conformSportCalendarColours([{ calendarId: 'cal-old', hex: '#DB2777' }]);
      expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
      expect(f.calls[0].body).toMatchObject({ backgroundColor: '#db2777' });
    } finally {
      f.restore();
    }
  });

  test('a refused colour is not asked again — until the user picks another', async () => {
    const f = scriptFetch((m, u) => (isColour(m, u) ? { status: 403, json: FORBIDDEN } : { status: 200, json: {} }));
    try {
      expect(await paintSportCalendar('cal-boxing', '#D50000')).toBe('refused');
      await conformSportCalendarColours([{ calendarId: 'cal-boxing', hex: '#D50000' }]);
      expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(1);
      await conformSportCalendarColours([{ calendarId: 'cal-boxing', hex: '#8E24AA' }]);
      expect(f.calls.filter((c) => isColour(c.method, c.url))).toHaveLength(2);
    } finally {
      f.restore();
    }
  });
});

describe('the device’s own calendar store (EventKit)', () => {
  beforeEach(() => setActiveBackend('provider'));

  test('a sport calendar made on the device carries its colour from the start — nothing to paint after', async () => {
    const created = await createSportCalendar('KickOffCal · Rugby', '#4338CA');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(mockDevice.calendars.get(created.value)?.color).toBe('#4338CA');
    expect(sportCalendarColourStates()[created.value]).toEqual({ hex: '#4338CA', status: 'applied' });
  });

  test('a sport calendar of ours takes the colour', async () => {
    mockDevice.calendars.set('ek-1', { title: 'KickOffCal · Tennis' });
    expect(await paintSportCalendar('ek-1', '#F6BF26')).toBe('applied');
    expect(mockDevice.calendars.get('ek-1')?.color).toBe('#F6BF26');
    expect(sportCalendarColourStates()['ek-1']).toEqual({ hex: '#F6BF26', status: 'applied' });
  });

  test('a calendar no longer titled as ours is left alone, and not asked about again', async () => {
    mockDevice.calendars.set('ek-2', { title: 'Family' });
    expect(await paintSportCalendar('ek-2', '#F6BF26')).toBe('refused');
    expect(mockDevice.calendars.get('ek-2')?.color).toBeUndefined();
    await conformSportCalendarColours([{ calendarId: 'ek-2', hex: '#F6BF26' }]);
    expect(mockDevice.calendars.get('ek-2')?.color).toBeUndefined();
  });

  test('a store that cannot answer leaves it pending for the next pass', async () => {
    mockDevice.calendars.set('ek-3', { title: 'KickOffCal · Golf' });
    mockDevice.failing = true;
    expect(await paintSportCalendar('ek-3', '#0B8043')).toBe('pending');
    mockDevice.failing = false;
    await conformSportCalendarColours([{ calendarId: 'ek-3', hex: '#0B8043' }]);
    expect(mockDevice.calendars.get('ek-3')?.color).toBe('#0B8043');
  });
});
