// A re-follow restores EXACTLY what the unfollow took away (owner ruling
// 2026-09-23): the stored record — scope, calendar preference, artwork —
// and its place in the list, through the real unfollow / refollow path.
jest.mock('../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});
jest.mock('../../calendar-sync/syncEngine', () => ({
  runSync: () => Promise.resolve({ ok: true, value: { created: 0, updated: 0, deleted: 0, at: '' } }),
  runSyncAwaited: () => Promise.resolve({ ok: true, value: {} }),
  upcomingFixtures: () => [],
}));
jest.mock('../../calendar-sync/data/prefsStore', () => ({
  loadPrefs: () => ({ newFollowsInCalendar: true, sessionRungs: {} }),
  savePrefs: jest.fn(),
}));
jest.mock('../../../core/entitlementStore', () => ({ premiumLocked: () => false }));
jest.mock('../../calendar-sync/data/deviceRegistry', () => ({ registerDevice: jest.fn() }));
jest.mock('../../../core/analytics', () => ({ logFollow: jest.fn() }));
jest.mock('../../../core/firebase', () => ({ functionsBaseUrl: 'https://example.invalid' }));

import { Followable, loadFollowables, replaceFollowables } from '../data/followStore';
import { refollow, unfollow } from '../followActions';

const f = (key: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label: key,
  sportKey: 'basketball',
  type: 'team',
  calendar: 'in',
  ...extra,
});
const keys = () => loadFollowables().map((x) => x.key);

// What a screen hands the actions: a bare row, no scope, no preference.
const bare = (key: string): Followable => ({ key, label: key, sportKey: 'basketball', type: 'team' });

test('the record comes back whole — an OUT follow stays out, a scope stays, artwork stays', async () => {
  const golf = f('tsdb-league-4425', {
    sportKey: 'golf',
    type: 'competition',
    scope: 'final-round',
    calendar: 'out',
    crestUrl: 'https://example.invalid/pga.png',
  });
  replaceFollowables([f('a'), golf, f('b')]);
  const before = loadFollowables();
  await unfollow(bare('tsdb-league-4425'));
  expect(keys()).toEqual(['a', 'b']);
  await refollow(bare('tsdb-league-4425'));
  expect(loadFollowables()).toEqual(before);
});

test('it goes back in its place, not at the end', async () => {
  replaceFollowables([f('nba'), f('lakers'), f('f1'), f('pl')]);
  await unfollow(bare('lakers'));
  await refollow(bare('lakers'));
  expect(keys()).toEqual(['nba', 'lakers', 'f1', 'pl']);
});

test('neighbours unfollowed and re-followed in any order all land where they were', async () => {
  replaceFollowables([f('x'), f('a'), f('b'), f('c')]);
  await unfollow(bare('a'));
  await unfollow(bare('b'));
  // The Following page passes the rows it shows after each one.
  await refollow(bare('b'), ['c']);
  await refollow(bare('a'), ['b', 'c']);
  expect(keys()).toEqual(['x', 'a', 'b', 'c']);
});

test('a rapid unfollow → re-follow → unfollow ends unfollowed, with the record still remembered', async () => {
  replaceFollowables([f('nba'), f('lakers', { calendar: 'out' })]);
  const u1 = unfollow(bare('lakers'));
  const r1 = refollow(bare('lakers'));
  const u2 = unfollow(bare('lakers'));
  await Promise.all([u1, r1, u2]);
  expect(keys()).toEqual(['nba']);
  await refollow(bare('lakers'));
  expect(loadFollowables()[1]).toEqual(f('lakers', { calendar: 'out' }));
});
