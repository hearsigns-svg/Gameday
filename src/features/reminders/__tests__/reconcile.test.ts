// The two gates and the list → diff → apply pipeline, with the data layer
// scripted. The property under test: no OS call before both gates pass,
// and the permission gate READS, never prompts.

jest.mock('../data/reminderChoice', () => ({ reminderChoice: jest.fn() }));
jest.mock('../data/notificationScheduler', () => ({
  readNotificationPermission: jest.fn(),
  requestNotificationPermission: jest.fn(),
  listScheduledFixtureNotifications: jest.fn(),
  applyNotificationDiff: jest.fn(),
  ensureFixturesChannel: jest.fn(),
}));

import { err, ok } from '../../../core/result';
import { reminderChoice } from '../data/reminderChoice';
import {
  applyNotificationDiff,
  ensureFixturesChannel,
  listScheduledFixtureNotifications,
  readNotificationPermission,
  requestNotificationPermission,
} from '../data/notificationScheduler';
import { ReminderFixture } from '../domain/reminderPlan';
import { reconcileFixtureReminders } from '../reconcile';

const mockChoice = reminderChoice as jest.Mock;
const mockRead = readNotificationPermission as jest.Mock;
const mockRequest = requestNotificationPermission as jest.Mock;
const mockList = listScheduledFixtureNotifications as jest.Mock;
const mockApply = applyNotificationDiff as jest.Mock;
const mockChannel = ensureFixturesChannel as jest.Mock;

const NOW = Date.UTC(2026, 8, 2, 12);
const HOUR = 3_600_000;

const fixtures: ReminderFixture[] = [
  { id: 'a', title: 'A v B', startUtc: '2026-09-10T19:00:00.000Z', status: 'scheduled' },
  { id: 'b', title: 'C v D', startUtc: '2026-09-11T19:00:00.000Z', status: 'scheduled' },
  { id: 'gone', title: 'Old', startUtc: '2026-01-01T19:00:00.000Z', status: 'scheduled' },
  { id: 'cancelled', title: 'Off', startUtc: '2026-09-12T19:00:00.000Z', status: 'cancelled' },
];
const body = (f: ReminderFixture, m: number) => `${f.title} in ${m}`;
const opts = { nowMs: NOW, minutesBefore: 60, body };

let log: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockApply.mockResolvedValue(ok({ cancelled: 0, scheduled: 0 }));
  mockList.mockResolvedValue(ok([]));
  mockChannel.mockResolvedValue(undefined);
});

afterEach(() => log.mockRestore());

function expectNoOsCalls() {
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockList).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
  expect(mockChannel).not.toHaveBeenCalled();
}

test('choice unset: skipped on choice, and not even the permission is read', async () => {
  mockChoice.mockReturnValue('unset');
  const r = await reconcileFixtureReminders(fixtures, opts);
  expect(r).toEqual({ ok: true, value: { scheduled: 0, cancelled: 0, skipped: 'choice' } });
  expect(mockRead).not.toHaveBeenCalled();
  expectNoOsCalls();
});

test('choice deferred: same silence', async () => {
  mockChoice.mockReturnValue('deferred');
  const r = await reconcileFixtureReminders(fixtures, opts);
  expect(r).toEqual({ ok: true, value: { scheduled: 0, cancelled: 0, skipped: 'choice' } });
  expect(mockRead).not.toHaveBeenCalled();
  expectNoOsCalls();
});

test('enabled but OS not granted: skipped on permission — read once, NEVER requested', async () => {
  mockChoice.mockReturnValue('enabled');
  for (const state of [
    { status: 'denied', canAskAgain: false },
    { status: 'undetermined', canAskAgain: true },
    { status: 'undetermined', canAskAgain: false }, // unreadable sentinel
  ]) {
    jest.clearAllMocks();
    mockRead.mockResolvedValue(state);
    const r = await reconcileFixtureReminders(fixtures, opts);
    expect(r).toEqual({ ok: true, value: { scheduled: 0, cancelled: 0, skipped: 'permission' } });
    expect(mockRead).toHaveBeenCalledTimes(1);
    expectNoOsCalls();
  }
});

test('enabled + granted: list → diff → apply, with the plan applied to the pending set', async () => {
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });
  mockList.mockResolvedValue(
    ok([
      { identifier: 'fixture:a', fireAtMs: Date.UTC(2026, 8, 10, 18) }, // exact → keep
      { identifier: 'fixture:stale', fireAtMs: NOW + HOUR }, // no longer desired → cancel
      { identifier: 'someone-elses', fireAtMs: null }, // never ours to cancel
    ]),
  );
  mockApply.mockResolvedValue(ok({ cancelled: 1, scheduled: 1 }));

  const r = await reconcileFixtureReminders(fixtures, opts);
  expect(r).toEqual({ ok: true, value: { scheduled: 1, cancelled: 1, skipped: null } });
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockApply).toHaveBeenCalledTimes(1);
  const diff = mockApply.mock.calls[0][0];
  expect(diff.toCancel).toEqual(['fixture:stale']);
  expect(diff.toSchedule).toEqual([
    {
      identifier: 'fixture:b',
      fixtureId: 'b',
      fireAtMs: Date.UTC(2026, 8, 11, 18),
      title: 'C v D',
      body: 'C v D in 60',
    },
  ]);
  expect(log).toHaveBeenCalledTimes(1);
  expect(log.mock.calls[0][0]).toMatch(/2 desired.*3 were pending.*1 scheduled.*1 cancelled/);
});

test('excluded ids are dropped from the plan', async () => {
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });
  await reconcileFixtureReminders(fixtures, { ...opts, excluded: new Set(['a']) });
  const diff = mockApply.mock.calls[0][0];
  expect(diff.toSchedule.map((d: { fixtureId: string }) => d.fixtureId)).toEqual(['b']);
});

test('the channel is ensured only when a name is given AND something is to be scheduled', async () => {
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });

  await reconcileFixtureReminders(fixtures, opts); // no name
  expect(mockChannel).not.toHaveBeenCalled();

  await reconcileFixtureReminders(fixtures, { ...opts, channelName: 'Fixtures' });
  expect(mockChannel).toHaveBeenCalledWith('Fixtures');
  expect(mockChannel.mock.invocationCallOrder[0]).toBeLessThan(mockApply.mock.invocationCallOrder[1]);

  jest.clearAllMocks();
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });
  mockList.mockResolvedValue(
    ok([
      { identifier: 'fixture:a', fireAtMs: Date.UTC(2026, 8, 10, 18) },
      { identifier: 'fixture:b', fireAtMs: Date.UTC(2026, 8, 11, 18) },
    ]),
  );
  mockApply.mockResolvedValue(ok({ cancelled: 0, scheduled: 0 }));
  await reconcileFixtureReminders(fixtures, { ...opts, channelName: 'Fixtures' });
  expect(mockChannel).not.toHaveBeenCalled(); // nothing new to schedule
});

test('a failed list is propagated and nothing is applied — a read failure is never an empty set', async () => {
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });
  mockList.mockResolvedValue(err({ kind: 'unknown', message: 'os read failed' }));
  const r = await reconcileFixtureReminders(fixtures, opts);
  expect(r).toEqual({ ok: false, error: { kind: 'unknown', message: 'os read failed' } });
  expect(mockApply).not.toHaveBeenCalled();
});

test('a failed apply is propagated', async () => {
  mockChoice.mockReturnValue('enabled');
  mockRead.mockResolvedValue({ status: 'granted', canAskAgain: true });
  mockApply.mockResolvedValue(err({ kind: 'unknown', message: 'apply blew up' }));
  const r = await reconcileFixtureReminders(fixtures, opts);
  expect(r).toEqual({ ok: false, error: { kind: 'unknown', message: 'apply blew up' } });
});
