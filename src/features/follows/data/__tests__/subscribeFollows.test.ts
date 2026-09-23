// subscribeFollows (per-follow calendar control, 2026-09-23): every
// glyph on screen repaints the moment any follow changes — so the store
// must announce every WRITE, and never a read (a render-time read that
// announced itself would set state during render).
jest.mock('../../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});

import {
  Followable,
  loadFollowables,
  replaceFollowables,
  setFollowCalendar,
  setFollowed,
  setFollowScope,
  subscribeFollows,
} from '../followStore';

const f = (key: string): Followable => ({
  key,
  label: key,
  sportKey: 'basketball',
  type: 'team',
});

test('every write announces itself; a read never does', () => {
  replaceFollowables([f('a'), f('b')]);
  const heard = jest.fn();
  const stop = subscribeFollows(heard);

  loadFollowables();
  expect(heard).not.toHaveBeenCalled();

  setFollowCalendar(['a'], 'out');
  expect(heard).toHaveBeenCalledTimes(1);
  setFollowScope('b', null);
  expect(heard).toHaveBeenCalledTimes(2);
  setFollowed(f('c'), true);
  expect(heard).toHaveBeenCalledTimes(3);
  replaceFollowables([f('a')]);
  expect(heard).toHaveBeenCalledTimes(4);

  stop();
  setFollowCalendar(['a'], 'in');
  expect(heard).toHaveBeenCalledTimes(4);
});
