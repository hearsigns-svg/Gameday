// Per-follow calendar control (owner brief 2026-09-23): the toggle
// writes the preference at once, syncs, and REVERTS if the calendar
// write fails — but never over a newer tap on the same follow.
jest.mock('../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});
const mockRunSync = jest.fn();
// setCalendar syncs through runSyncAwaited (a pass already running
// answers with the rerun that carries the change — pinned in
// calendar-sync/__tests__/runSyncAwaited.test.ts).
jest.mock('../../calendar-sync/syncEngine', () => ({
  runSync: () => mockRunSync(),
  runSyncAwaited: () => mockRunSync(),
}));
jest.mock('../../../core/analytics', () => ({ logFollow: jest.fn() }));
jest.mock('../../../core/firebase', () => ({ functionsBaseUrl: 'https://example.invalid' }));

import { calendarPrefOf, Followable, loadFollowables, replaceFollowables } from '../data/followStore';
import { setCalendar } from '../followActions';

const f = (key: string, calendar: 'in' | 'out'): Followable => ({
  key,
  label: key,
  sportKey: 'basketball',
  type: 'team',
  calendar,
});
const prefs = () => Object.fromEntries(loadFollowables().map((x) => [x.key, calendarPrefOf(x)]));

beforeEach(() => mockRunSync.mockReset());

test('a successful sync keeps the new preference', async () => {
  replaceFollowables([f('a', 'in'), f('b', 'in')]);
  mockRunSync.mockResolvedValue({ ok: true, value: {} });
  await expect(setCalendar(['a'], 'out')).resolves.toBe('applied');
  expect(prefs()).toEqual({ a: 'out', b: 'in' });
});

test('the store changes BEFORE the sync resolves — the glyph flips on the tap', async () => {
  replaceFollowables([f('a', 'in')]);
  let release: (v: unknown) => void = () => undefined;
  mockRunSync.mockReturnValue(new Promise((r) => (release = r)));
  const pending = setCalendar(['a'], 'out');
  expect(prefs()).toEqual({ a: 'out' });
  release({ ok: true, value: {} });
  await pending;
});

test('a failed calendar write reverts the preference', async () => {
  replaceFollowables([f('a', 'in'), f('b', 'out')]);
  mockRunSync.mockResolvedValue({ ok: false, error: { kind: 'offline' } });
  await expect(setCalendar(['a', 'b'], 'out')).resolves.toBe('failed');
  expect(prefs()).toEqual({ a: 'in', b: 'out' });
});

test('any failed pass reverts — a coalesced answer is never read as success', async () => {
  replaceFollowables([f('a', 'in')]);
  mockRunSync.mockResolvedValue({ ok: false, error: { kind: 'sync-in-progress' } });
  await expect(setCalendar(['a'], 'out')).resolves.toBe('failed');
  expect(prefs()).toEqual({ a: 'in' });
});

test('an earlier tap\'s failure never undoes a newer tap on the same follow', async () => {
  // A row tap puts `a` in; before its sync lands, the sport header puts
  // everything in (a and b). The row tap's sync then fails: `a` must keep
  // the header's answer, never revert to its pre-row-tap `out`.
  replaceFollowables([f('a', 'out'), f('b', 'out')]);
  let failFirst: (v: unknown) => void = () => undefined;
  mockRunSync
    .mockReturnValueOnce(new Promise((r) => (failFirst = r)))
    .mockResolvedValueOnce({ ok: true, value: {} });
  const rowTap = setCalendar(['a'], 'in');
  await setCalendar(['a', 'b'], 'in');
  failFirst({ ok: false, error: { kind: 'offline' } });
  await expect(rowTap).resolves.toBe('failed');
  expect(prefs()).toEqual({ a: 'in', b: 'in' });
});

test('keys that are not followed are ignored', async () => {
  replaceFollowables([f('a', 'in')]);
  mockRunSync.mockResolvedValue({ ok: true, value: {} });
  await expect(setCalendar(['zzz'], 'out')).resolves.toBe('applied');
  expect(mockRunSync).not.toHaveBeenCalled();
});
