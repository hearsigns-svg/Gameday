// The follow toast names WHY nothing was added (per-follow calendar
// control, Stage 4). Found in Stage 1: following the Warriors under an NBA
// follow that is in read "no upcoming fixtures yet" over 82 fixtures.
jest.mock('../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});
const mockToasts: string[] = [];
jest.mock('../../../core/toast', () => ({
  showToast: (t: { message: string }) => mockToasts.push(t.message),
}));
const mockUpcoming: Record<string, number> = {};
jest.mock('../../calendar-sync/syncEngine', () => ({
  upcomingByFollow: () => mockUpcoming,
}));
jest.mock('../../calendar-sync/data/calendarChoice', () => ({ calendarChoice: () => 'enabled' }));
jest.mock('../followActions', () => ({ refollow: jest.fn(), unfollow: jest.fn() }));

import { Followable, replaceFollowables } from '../data/followStore';
import { followFeedback } from '../followFeedback';

const WARRIORS: Followable = {
  key: 'tsdb-team-134865',
  label: 'Golden State Warriors',
  sportKey: 'basketball',
  type: 'team',
};
const nothingAdded = { ok: true as const, value: { created: 0, updated: 0, deleted: 0, at: '' } };

beforeEach(() => {
  mockToasts.length = 0;
  for (const k of Object.keys(mockUpcoming)) delete mockUpcoming[k];
});

test('a follow that starts OUT says it is not in your calendar', () => {
  replaceFollowables([{ ...WARRIORS, calendar: 'out' }]);
  mockUpcoming[WARRIORS.key] = 82;
  followFeedback(nothingAdded, WARRIORS, true, () => undefined);
  expect(mockToasts).toEqual(['Following Golden State Warriors — not in your calendar']);
});

test('a follow that is in but covered says its games are already there', () => {
  replaceFollowables([{ ...WARRIORS, calendar: 'in' }]);
  mockUpcoming[WARRIORS.key] = 82;
  followFeedback(nothingAdded, WARRIORS, true, () => undefined);
  expect(mockToasts).toEqual(['Following Golden State Warriors — already in your calendar']);
});

test('only a follow with nothing ahead is the off-season case', () => {
  replaceFollowables([{ ...WARRIORS, calendar: 'in' }]);
  followFeedback(nothingAdded, WARRIORS, true, () => undefined);
  expect(mockToasts).toEqual(['Following Golden State Warriors — no upcoming fixtures yet']);
});
