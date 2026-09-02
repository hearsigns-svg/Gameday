// Connect / disconnect own the TARGET RECORD's lifetime across the
// backend flip (Round 4 B4 item 1). Storage is in-memory; the sign-in
// native module is replaced by a scripted double.

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

const mockSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(),
  signInSilently: jest.fn(async () => ({ type: 'success' })),
  getTokens: jest.fn(async () => ({ accessToken: 'tok' })),
  signOut: jest.fn(async () => null),
};
jest.mock(
  '@react-native-google-signin/google-signin',
  () => ({ GoogleSignin: mockSignin }),
  { virtual: true },
);

import { ok } from '../../../../core/result';
import { activeBackend, setActiveBackend } from '../calendarBackend';
import { CalendarTarget, saveTarget, storedTarget } from '../calendarTargetStore';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
} from '../googleCalendarAuth';

// The Android remnant: the pre-P28 provider path's record.
const SOCIAL: CalendarTarget = {
  calendarId: '5',
  kind: 'user',
  label: 'Social',
  accountLabel: 'you@gmail.com',
  sourceKind: 'cloud',
  chosen: false,
};

const REST_RECORD: CalendarTarget = {
  calendarId: 'cal-77',
  kind: 'ours',
  label: 'KickOffCal',
  accountLabel: 'Google Calendar',
  sourceKind: 'cloud',
  chosen: false,
};

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

test('ATTACK: the stale provider record must not survive a connect — it is cleared before the backend flips', async () => {
  // Before B4 the record outlived the flip, and Preferences read it as
  // the truth about the REST calendar for as long as the install lived.
  saveTarget(SOCIAL);
  setActiveBackend('provider');
  mockSignin.signIn.mockResolvedValue({
    type: 'success',
    data: { user: { email: 'you@gmail.com' } },
  });
  const r = await connectGoogleCalendar();
  expect(r).toEqual(ok({ email: 'you@gmail.com' }));
  expect(activeBackend()).toBe('rest');
  expect(storedTarget()).toBeNull();
});

test('a closed account picker changes nothing: record kept, backend stays provider', async () => {
  saveTarget(SOCIAL);
  setActiveBackend('provider');
  mockSignin.signIn.mockResolvedValue({ type: 'cancelled', data: null });
  const r = await connectGoogleCalendar();
  expect(r.ok).toBe(false);
  expect(activeBackend()).toBe('provider');
  expect(storedTarget()).toEqual(SOCIAL);
});

test('disconnect falls the backend home and clears the REST target record', async () => {
  saveTarget(REST_RECORD);
  setActiveBackend('rest');
  await disconnectGoogleCalendar();
  expect(mockSignin.signOut).toHaveBeenCalledTimes(1);
  expect(activeBackend()).toBe('provider');
  expect(storedTarget()).toBeNull();
});

test('disconnect still flips and clears when sign-out itself throws — the flip is what stops writes', async () => {
  saveTarget(REST_RECORD);
  setActiveBackend('rest');
  mockSignin.signOut.mockRejectedValueOnce(new Error('no network'));
  await disconnectGoogleCalendar();
  expect(activeBackend()).toBe('provider');
  expect(storedTarget()).toBeNull();
});
