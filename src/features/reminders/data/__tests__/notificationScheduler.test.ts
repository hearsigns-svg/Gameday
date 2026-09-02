// expo-notifications is replaced wholesale by a scripted double; the
// scheduler must count successes, skip failures, never prompt on a read,
// and keep foreign notifications out of its list.

// The factory builds its own jest.fn()s: jest.mock is hoisted above every
// import, so a module-level object referenced from the factory would
// still be undefined when the scheduler's import first requires this.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
}));

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

interface MockNotifications {
  getPermissionsAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  getAllScheduledNotificationsAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  setNotificationHandler: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponse: jest.Mock;
}
const mockNotifications = Notifications as unknown as MockNotifications;
import {
  applyNotificationDiff,
  ensureFixturesChannel,
  FIXTURES_CHANNEL_ID,
  installForegroundHandler,
  listScheduledFixtureNotifications,
  onNotificationOpened,
  readNotificationPermission,
  requestNotificationPermission,
} from '../notificationScheduler';
import { DesiredNotification } from '../../domain/reminderPlan';

const T = Date.UTC(2026, 8, 10, 18);

const want = (id: string, fireAtMs: number): DesiredNotification => ({
  identifier: `fixture:${id}`,
  fixtureId: id,
  fireAtMs,
  title: `Title ${id}`,
  body: `Body ${id}`,
});

let warn: jest.SpyInstance;

beforeEach(() => {
  // Reset, not clear: several tests install throwing implementations.
  jest.resetAllMocks();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('readNotificationPermission', () => {
  test('reads only — requestPermissionsAsync is never touched', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'granted',
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
    expect(await readNotificationPermission()).toEqual({ status: 'granted', canAskAgain: true });
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('iOS provisional reads as granted', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      status: 'undetermined',
      granted: false,
      canAskAgain: true,
      ios: { status: 3 },
    });
    expect((await readNotificationPermission()).status).toBe('granted');
  });

  test('a throwing read is the unreadable sentinel, logged, and still never prompts', async () => {
    mockNotifications.getPermissionsAsync.mockRejectedValue(new Error('module missing'));
    expect(await readNotificationPermission()).toEqual({ status: 'undetermined', canAskAgain: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('requestNotificationPermission', () => {
  test('asks for alert + sound, never the badge', async () => {
    mockNotifications.requestPermissionsAsync.mockResolvedValue({
      status: 'denied',
      granted: false,
      canAskAgain: false,
    });
    expect(await requestNotificationPermission()).toEqual({ status: 'denied', canAskAgain: false });
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalledWith({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    });
  });

  test('a throwing request degrades to the unreadable sentinel', async () => {
    mockNotifications.requestPermissionsAsync.mockRejectedValue(new Error('nope'));
    expect(await requestNotificationPermission()).toEqual({ status: 'undetermined', canAskAgain: false });
  });
});

describe('ensureFixturesChannel', () => {
  test('is a no-op off Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await ensureFixturesChannel('Fixtures');
    expect(mockNotifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  test('creates the fixtures channel at DEFAULT importance on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNotifications.setNotificationChannelAsync.mockResolvedValue(null);
    await ensureFixturesChannel('Fixtures');
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith(FIXTURES_CHANNEL_ID, {
      name: 'Fixtures',
      importance: 5,
    });
  });

  test('swallows and logs a channel failure', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNotifications.setNotificationChannelAsync.mockRejectedValue(new Error('no channels'));
    await expect(ensureFixturesChannel('Fixtures')).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('listScheduledFixtureNotifications', () => {
  test('keeps only our prefix and reads fire times from trigger or data stamp', async () => {
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      // Android read-back
      {
        identifier: 'fixture:android',
        content: { title: 'x', data: { fixtureId: 'android', fireAtMs: T } },
        trigger: { type: 'date', repeats: false, value: T + 5 },
      },
      // iOS read-back: interval trigger, stamp carries the time
      {
        identifier: 'fixture:ios',
        content: { title: 'y', data: { fixtureId: 'ios', fireAtMs: T + 1 } },
        trigger: { class: 'UNTimeIntervalNotificationTrigger', type: 'timeInterval', repeats: false, seconds: 900 },
      },
      // ours but unreadable
      { identifier: 'fixture:blank', content: { title: 'z' }, trigger: null },
      // not ours — a remote push and someone else's local
      { identifier: 'abc-123', content: { title: 'push' }, trigger: { type: 'push' } },
      { identifier: 'fixtures:not-ours', content: { title: 'near miss' }, trigger: { type: 'date', value: T } },
    ]);
    const r = await listScheduledFixtureNotifications();
    expect(r).toEqual({
      ok: true,
      value: [
        { identifier: 'fixture:android', fireAtMs: T + 5 },
        { identifier: 'fixture:ios', fireAtMs: T + 1 },
        { identifier: 'fixture:blank', fireAtMs: null },
      ],
    });
  });

  test('a throwing OS read is an error, not an empty list', async () => {
    mockNotifications.getAllScheduledNotificationsAsync.mockRejectedValue(new Error('boom'));
    const r = await listScheduledFixtureNotifications();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ kind: 'unknown', message: 'Error: boom' });
  });
});

describe('applyNotificationDiff', () => {
  test('cancels then schedules with identifier, content data stamps and a DATE trigger', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue(undefined);
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('fixture:a');
    const r = await applyNotificationDiff({ toCancel: ['fixture:old'], toSchedule: [want('a', T)] });
    expect(r).toEqual({ ok: true, value: { cancelled: 1, scheduled: 1 } });
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('fixture:old');
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: 'fixture:a',
      content: { title: 'Title a', body: 'Body a', data: { fixtureId: 'a', fireAtMs: T } },
      trigger: { type: 'date', date: new Date(T) },
    });
    // Order: every cancel before any schedule.
    const cancelOrder = mockNotifications.cancelScheduledNotificationAsync.mock.invocationCallOrder[0];
    const scheduleOrder = mockNotifications.scheduleNotificationAsync.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  test('Android triggers carry the fixtures channel', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('fixture:a');
    await applyNotificationDiff({ toCancel: [], toSchedule: [want('a', T)] });
    expect(mockNotifications.scheduleNotificationAsync.mock.calls[0][0].trigger).toEqual({
      type: 'date',
      date: new Date(T),
      channelId: FIXTURES_CHANNEL_ID,
    });
  });

  test('a single failure is logged and skipped; the batch completes and counts successes only', async () => {
    mockNotifications.cancelScheduledNotificationAsync
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cancel failed'))
      .mockResolvedValueOnce(undefined);
    mockNotifications.scheduleNotificationAsync
      .mockRejectedValueOnce(new Error('schedule failed'))
      .mockResolvedValueOnce('fixture:b')
      .mockResolvedValueOnce('fixture:c');
    const r = await applyNotificationDiff({
      toCancel: ['fixture:1', 'fixture:2', 'fixture:3'],
      toSchedule: [want('a', T), want('b', T + 1), want('c', T + 2)],
    });
    expect(r).toEqual({ ok: true, value: { cancelled: 2, scheduled: 2 } });
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(3);
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  test('an empty diff makes no OS calls', async () => {
    const r = await applyNotificationDiff({ toCancel: [], toSchedule: [] });
    expect(r).toEqual({ ok: true, value: { cancelled: 0, scheduled: 0 } });
    expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('installForegroundHandler', () => {
  test('shows banner + list with sound and leaves the badge alone', async () => {
    installForegroundHandler();
    expect(mockNotifications.setNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mockNotifications.setNotificationHandler.mock.calls[0][0];
    await expect(handler.handleNotification({})).resolves.toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  test('a throwing SDK is logged, not propagated', () => {
    mockNotifications.setNotificationHandler.mockImplementation(() => {
      throw new Error('no handler module');
    });
    expect(() => installForegroundHandler()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('onNotificationOpened', () => {
  const response = (id: string, date: number, identifier = `fixture:${id}`) => ({
    actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
    notification: {
      date,
      request: { identifier, content: { title: 't', data: { fixtureId: id, fireAtMs: T } }, trigger: null },
    },
  });

  test('live taps reach the callback with the fixture id; unsubscribe removes the listener', () => {
    const remove = jest.fn();
    let listener: ((r: unknown) => void) | null = null;
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((l) => {
      listener = l;
      return { remove };
    });
    mockNotifications.getLastNotificationResponse.mockReturnValue(null);
    const cb = jest.fn();
    const off = onNotificationOpened(cb);
    expect(listener).not.toBeNull();
    listener!(response('a', 1));
    expect(cb).toHaveBeenCalledWith('a');
    off();
    expect(remove).toHaveBeenCalledTimes(1);
    listener!(response('b', 2));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('the cold-start response is delivered once on install', () => {
    mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: jest.fn() });
    mockNotifications.getLastNotificationResponse.mockReturnValue(response('cold', 5));
    const cb = jest.fn();
    onNotificationOpened(cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('cold');
  });

  test('the same tap reported by both paths reaches the callback once', () => {
    let listener: ((r: unknown) => void) | null = null;
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((l) => {
      listener = l;
      return { remove: jest.fn() };
    });
    const tap = response('same', 9);
    mockNotifications.getLastNotificationResponse.mockReturnValue(tap);
    const cb = jest.fn();
    onNotificationOpened(cb);
    listener!(tap);
    expect(cb).toHaveBeenCalledTimes(1);
    // A different delivery of the same fixture is a new tap.
    listener!(response('same', 10));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  test('foreign notifications are ignored', () => {
    let listener: ((r: unknown) => void) | null = null;
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation((l) => {
      listener = l;
      return { remove: jest.fn() };
    });
    mockNotifications.getLastNotificationResponse.mockReturnValue(null);
    const cb = jest.fn();
    onNotificationOpened(cb);
    listener!({
      actionIdentifier: 'x',
      notification: { date: 1, request: { identifier: 'remote-push', content: { data: {} }, trigger: { type: 'push' } } },
    });
    expect(cb).not.toHaveBeenCalled();
  });

  test('a throwing SDK still returns a working unsubscribe', () => {
    mockNotifications.addNotificationResponseReceivedListener.mockImplementation(() => {
      throw new Error('no emitter');
    });
    mockNotifications.getLastNotificationResponse.mockImplementation(() => {
      throw new Error('no emitter');
    });
    const off = onNotificationOpened(jest.fn());
    expect(() => off()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
