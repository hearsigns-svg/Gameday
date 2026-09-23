// Per-follow calendar control (owner brief 2026-09-23): the launch
// normalizer stamps every existing follow IN, the store's setter and
// reader agree, and a stated `out` is never overwritten.
jest.mock('../../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});

import {
  calendarPrefOf,
  fixtureWantedByFollows,
  Followable,
  loadFollowables,
  replaceFollowables,
  setFollowCalendar,
} from '../followStore';
import { migrateCalendarPrefs } from '../followMigrations';

const follow = (key: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label: key,
  sportKey: 'basketball',
  type: 'team',
  ...extra,
});

describe('migrateCalendarPrefs', () => {
  it('stamps every follow that predates the preference IN — what the calendar already holds', () => {
    replaceFollowables([follow('tsdb-team-1'), follow('tsdb-league-4387', { type: 'competition' })]);
    migrateCalendarPrefs();
    expect(loadFollowables().map((f) => f.calendar)).toEqual(['in', 'in']);
  });

  it('never overwrites a stated preference, and is idempotent', () => {
    replaceFollowables([follow('a', { calendar: 'out' }), follow('b')]);
    migrateCalendarPrefs();
    migrateCalendarPrefs();
    expect(loadFollowables().map((f) => [f.key, f.calendar])).toEqual([
      ['a', 'out'],
      ['b', 'in'],
    ]);
  });

  it('keeps every other field of the follow', () => {
    replaceFollowables([follow('c', { crestUrl: 'https://x/c.png', scope: 'all-matches' })]);
    migrateCalendarPrefs();
    expect(loadFollowables()[0]).toEqual(
      follow('c', { crestUrl: 'https://x/c.png', scope: 'all-matches', calendar: 'in' }),
    );
  });
});

describe('the store\'s calendar preference', () => {
  it('reads absent as in, sets in place, ignores keys not followed', () => {
    replaceFollowables([follow('tsdb-team-1'), follow('tsdb-team-2', { calendar: 'in' })]);
    expect(calendarPrefOf(loadFollowables()[0])).toBe('in');
    setFollowCalendar(['tsdb-team-2', 'not-followed'], 'out');
    expect(loadFollowables().map((f) => calendarPrefOf(f))).toEqual(['in', 'out']);
    expect(loadFollowables()).toHaveLength(2);
  });

  it('feeds the inclusion rule from the stored follows', () => {
    replaceFollowables([
      follow('tsdb-league-4387', { type: 'competition', calendar: 'in' }),
      follow('tsdb-team-134865', { calendar: 'out' }),
    ]);
    const wanted = fixtureWantedByFollows();
    expect(wanted(['tsdb-league-4387', 'tsdb-team-134865', 'tsdb-team-134867'])).toBe(false);
    expect(wanted(['tsdb-league-4387', 'tsdb-team-134860', 'tsdb-team-134867'])).toBe(true);
  });
});
