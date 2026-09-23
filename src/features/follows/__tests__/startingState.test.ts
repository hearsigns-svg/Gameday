// Where a NEW follow starts (owner brief "Per-follow calendar control",
// Stage 4) — the brief's starting-state table, row by row, through the
// real follow() / unfollow() / refollow() wiring:
//
//   broader followed container | Settings default | new follow starts
//   NBA in                     | off              | in
//   NBA out                    | on               | in
//   NBA out                    | off              | out
//   none                       | on / off         | in / out
//
// plus the free state (the default reads off, as the switch shows it),
// "following twice never flips a preference", and Undo restoring the
// preference an unfollow took away.
jest.mock('../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});
const mockState = {
  newFollowsInCalendar: true,
  locked: false,
  upcoming: [] as Array<{ id: string; followKeys: string[] }>,
};
jest.mock('../../calendar-sync/syncEngine', () => ({
  runSync: () => Promise.resolve({ ok: true, value: { created: 0, updated: 0, deleted: 0, at: '' } }),
  runSyncAwaited: () => Promise.resolve({ ok: true, value: {} }),
  upcomingFixtures: () => mockState.upcoming,
}));
jest.mock('../../calendar-sync/data/prefsStore', () => ({
  loadPrefs: () => ({ newFollowsInCalendar: mockState.newFollowsInCalendar }),
}));
jest.mock('../../../core/entitlementStore', () => ({
  premiumLocked: () => mockState.locked,
}));
jest.mock('../../calendar-sync/data/deviceRegistry', () => ({ registerDevice: jest.fn() }));
jest.mock('../../../core/analytics', () => ({ logFollow: jest.fn() }));
jest.mock('../../../core/firebase', () => ({ functionsBaseUrl: 'https://example.invalid' }));

import { calendarPrefOf, Followable, loadFollowables, replaceFollowables } from '../data/followStore';
import { follow, refollow, startingCalendarFor, unfollow } from '../followActions';

const NBA = 'tsdb-league-4387';
const WARRIORS = 'tsdb-team-134865';
const CELTICS = 'tsdb-team-134860';

const nba = (calendar: 'in' | 'out'): Followable => ({
  key: NBA,
  label: 'NBA',
  sportKey: 'basketball',
  type: 'competition',
  calendar,
});
// A browse row: no stored preference, no poll path (so no fetch).
const warriors: Followable = {
  key: WARRIORS,
  label: 'Golden State Warriors',
  sportKey: 'basketball',
  type: 'team',
};
const prefOf = (key: string) => {
  const f = loadFollowables().find((x) => x.key === key);
  return f ? calendarPrefOf(f) : undefined;
};

beforeEach(() => {
  replaceFollowables([]);
  mockState.newFollowsInCalendar = true;
  mockState.locked = false;
  // The app already holds NBA games carrying the Warriors' key.
  mockState.upcoming = [
    { id: 'gsw-bos', followKeys: [NBA, WARRIORS, CELTICS] },
    { id: 'bos-lal', followKeys: [NBA, CELTICS, 'tsdb-team-134867'] },
  ];
  global.fetch = jest.fn(() => Promise.reject(new Error('offline in tests'))) as never;
});

describe('the brief’s starting-state table', () => {
  test('NBA in, Settings off → the new follow starts IN (covered by a broader in follow)', async () => {
    replaceFollowables([nba('in')]);
    mockState.newFollowsInCalendar = false;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('in');
  });

  test('NBA out, Settings on → IN (the Settings default)', async () => {
    replaceFollowables([nba('out')]);
    mockState.newFollowsInCalendar = true;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('in');
  });

  test('NBA out, Settings off → OUT', async () => {
    replaceFollowables([nba('out')]);
    mockState.newFollowsInCalendar = false;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('out');
  });

  test('nothing broader followed, Settings on → IN; off → OUT', async () => {
    mockState.newFollowsInCalendar = true;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('in');

    replaceFollowables([]);
    mockState.newFollowsInCalendar = false;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('out');
  });
});

describe('the free state', () => {
  test('the default reads OFF whatever the stored setting — nothing new is written', () => {
    mockState.locked = true;
    mockState.newFollowsInCalendar = true;
    expect(startingCalendarFor(warriors)).toBe('out');
  });

  test('…but a broader follow that is in still covers it, whatever the default', () => {
    mockState.locked = true;
    replaceFollowables([nba('in')]);
    expect(startingCalendarFor(warriors)).toBe('in');
  });
});

describe('a preference is never rewritten behind the user', () => {
  test('following something already followed keeps its own preference', async () => {
    replaceFollowables([{ ...warriors, calendar: 'out' }]);
    mockState.newFollowsInCalendar = true;
    await follow(warriors);
    expect(prefOf(WARRIORS)).toBe('out');
  });

  test('Undo after an unfollow restores the preference it had — not the default', async () => {
    replaceFollowables([{ ...warriors, calendar: 'out' }]);
    mockState.newFollowsInCalendar = true;
    await unfollow(warriors);
    expect(prefOf(WARRIORS)).toBeUndefined();
    await refollow(warriors);
    expect(prefOf(WARRIORS)).toBe('out');
  });

  test('changing the Settings default touches no existing follow', () => {
    replaceFollowables([nba('in'), { ...warriors, calendar: 'out' }]);
    const before = JSON.stringify(loadFollowables());
    mockState.newFollowsInCalendar = false;
    // The switch writes prefs only (PreferencesScreen); the follow store
    // is not part of that write. Reading the starting state for a NEW
    // follow must not write either.
    startingCalendarFor({ ...warriors, key: CELTICS, label: 'Boston Celtics' });
    expect(JSON.stringify(loadFollowables())).toBe(before);
  });
});
