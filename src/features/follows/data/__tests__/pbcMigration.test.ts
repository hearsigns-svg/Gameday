// Round 6 item 4: PBC follow keys migrate onto Major fight cards.
jest.mock('../../../../core/storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
    removeKey: (k: string) => void mem.delete(k),
  };
});

import { Followable, loadFollowables, replaceFollowables } from '../followStore';
import { migrateBoxingSexFollows, migratePbcFollows, pbcTargetKey } from '../followMigrations';

const follow = (key: string, label: string, extra: Partial<Followable> = {}): Followable => ({
  key,
  label,
  sportKey: 'boxing',
  type: 'competition',
  pollPath: 'pollPbc',
  ...extra,
});

describe('pbcTargetKey', () => {
  it('maps the bare and the sexed PBC keys onto Major fight cards, nothing else', () => {
    expect(pbcTargetKey('pbc-cards')).toBe('tsdb-league-4445');
    expect(pbcTargetKey('pbc-cards-m')).toBe('tsdb-league-4445-m');
    expect(pbcTargetKey('pbc-cards-w')).toBe('tsdb-league-4445-w');
    expect(pbcTargetKey('tsdb-league-4445-m')).toBeNull();
    expect(pbcTargetKey('pbc-cards-x')).toBeNull();
  });
});

describe('migratePbcFollows', () => {
  it('rewrites a PBC follow in place onto the Major fight cards key, label and poll path', () => {
    replaceFollowables([follow('pbc-cards-m', 'Premier Boxing Champions — Men’s')]);
    migratePbcFollows();
    const keys = loadFollowables().map((f) => f.key);
    expect(keys).toEqual(['tsdb-league-4445-m']);
    const f = loadFollowables()[0];
    expect(f.label).toBe('Major fight cards — Men’s');
    expect(f.pollPath).toContain('leagueId=4445');
    expect(f.sportKey).toBe('boxing');
  });

  it('drops the PBC follow when the Major fight cards follow already exists (no duplicate)', () => {
    replaceFollowables([
      follow('tsdb-league-4445-w', 'Major fight cards — Women’s', { pollPath: 'pollTsdbLeague?leagueId=4445' }),
      follow('pbc-cards-w', 'Premier Boxing Champions — Women’s'),
    ]);
    migratePbcFollows();
    expect(loadFollowables().map((f) => f.key)).toEqual(['tsdb-league-4445-w']);
  });

  it('runs after the sex split: a legacy bare PBC follow ends as two Major fight cards follows', () => {
    replaceFollowables([follow('pbc-cards', 'Premier Boxing Champions')]);
    migrateBoxingSexFollows();
    migratePbcFollows();
    expect(loadFollowables().map((f) => f.key).sort()).toEqual(['tsdb-league-4445-m', 'tsdb-league-4445-w']);
  });

  it('is idempotent and leaves other follows alone', () => {
    replaceFollowables([follow('tsdb-league-4328', 'Premier League', { sportKey: 'soccer' })]);
    migratePbcFollows();
    const once = loadFollowables();
    migratePbcFollows();
    expect(loadFollowables()).toEqual(once);
    expect(once.map((f) => f.key)).toEqual(['tsdb-league-4328']);
  });
});
