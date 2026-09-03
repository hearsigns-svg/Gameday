// Round 7 item 8: a bare tennis tournament follow becomes one follow per
// draw; Round 7 item 7: a global tier change clears per-tournament
// overrides.
jest.mock('../../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});

import {
  clearTournamentTierOverrides,
  Followable,
  loadFollowables,
  replaceFollowables,
} from '../followStore';
import { migrateTennisSexFollows } from '../followMigrations';

const follow = (key: string, label: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label,
  sportKey: 'tennis',
  type: 'competition',
  ...extra,
});

describe('migrateTennisSexFollows', () => {
  it('splits a bare follow into the men’s and women’s follows, keeping its scope', () => {
    replaceFollowables([follow('tennis-t-us-open', 'US Open', { scope: 'key-rounds' })]);
    migrateTennisSexFollows();
    const out = loadFollowables();
    expect(out.map((f) => f.key)).toEqual(['tennis-t-us-open-m', 'tennis-t-us-open-w']);
    expect(out.map((f) => f.label)).toEqual(['US Open — Men’s', 'US Open — Women’s']);
    expect(out.every((f) => f.scope === 'key-rounds')).toBe(true);
  });

  it('a sexed follow already held wins; other follows are untouched; idempotent', () => {
    replaceFollowables([
      follow('tennis-t-wimbledon-w', 'Wimbledon — Women’s'),
      follow('tennis-t-wimbledon', 'Wimbledon'),
      follow('tennis-atp', 'ATP Tour'),
      follow('tsdb-league-4328', 'Premier League', { sportKey: 'soccer' }),
    ]);
    migrateTennisSexFollows();
    const once = loadFollowables();
    // The copy takes the legacy follow's PLACE in the list (in-place, as
    // the PBC migration does), and the women's follow already held is
    // not duplicated.
    expect(once.map((f) => f.key)).toEqual([
      'tennis-t-wimbledon-w',
      'tennis-t-wimbledon-m',
      'tennis-atp',
      'tsdb-league-4328',
    ]);
    migrateTennisSexFollows();
    expect(loadFollowables()).toEqual(once);
  });
});

describe('clearTournamentTierOverrides (Round 7 item 7)', () => {
  it('drops tier scopes on every follow, leaves other scopes alone, reports what it cleared', () => {
    replaceFollowables([
      follow('tennis-t-us-open-m', 'US Open — Men’s', { scope: 'key-rounds' }),
      follow('tennis-t-us-open-w', 'US Open — Women’s', { scope: 'block' }),
      follow('tsdb-league-4425', 'PGA Tour', { sportKey: 'golf', scope: 'final-round' }),
      follow('f1-series-1', 'Formula 1', { sportKey: 'f1', type: 'series', scope: 'race-only' }),
    ]);
    expect(clearTournamentTierOverrides().sort()).toEqual(['tennis-t-us-open-m', 'tennis-t-us-open-w']);
    const out = loadFollowables();
    expect(out.find((f) => f.key === 'tennis-t-us-open-m')!.scope).toBeUndefined();
    expect(out.find((f) => f.key === 'tsdb-league-4425')!.scope).toBe('final-round');
    expect(out.find((f) => f.key === 'f1-series-1')!.scope).toBe('race-only');
    expect(clearTournamentTierOverrides()).toEqual([]); // nothing left to clear
  });
});
