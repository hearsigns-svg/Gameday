// B7 final shape: the base→sexed boxing follow migration. Equivalent
// coverage, no churn, idempotent, and a late-arriving legacy follow
// converts on the next start.

const mockMem = new Map<string, unknown>();
jest.mock('../../../../core/storage', () => ({
  readJson: (key: string, fallback: unknown) =>
    mockMem.has(key) ? mockMem.get(key) : fallback,
  writeJson: (key: string, value: unknown) => void mockMem.set(key, value),
  removeKey: (key: string) => void mockMem.delete(key),
  wipeAllLocalData: () => void mockMem.clear(),
}));

import { migrateBoxingSexFollows } from '../followMigrations';
import { Followable, loadFollowables } from '../followStore';

const base = (key: string, label: string): Followable => ({
  key,
  label,
  sportKey: 'boxing',
  type: 'competition',
  pollPath: 'pollTsdbLeague?leagueId=4445&season=2026&sport=boxing',
  crestUrl: 'https://x/badge.png',
});

beforeEach(() => mockMem.clear());

test('a base follow maps to BOTH sexed follows, carrying its art and path', () => {
  mockMem.set('follows.v2', [
    base('tsdb-league-4445', 'Major fight cards'),
    base('pbc-cards', 'Premier Boxing Champions'),
  ]);
  migrateBoxingSexFollows();
  const keys = loadFollowables().map((f) => f.key).sort();
  expect(keys).toEqual([
    'pbc-cards-m',
    'pbc-cards-w',
    'tsdb-league-4445-m',
    'tsdb-league-4445-w',
  ]);
  const mens = loadFollowables().find((f) => f.key === 'tsdb-league-4445-m');
  expect(mens?.label).toBe('Major fight cards — Men’s');
  // Coverage rides everything the old follow carried.
  expect(mens?.pollPath).toContain('leagueId=4445');
  expect(mens?.crestUrl).toBe('https://x/badge.png');
});

test('idempotent — a second run changes nothing', () => {
  mockMem.set('follows.v2', [base('tsdb-league-4445', 'Major fight cards')]);
  migrateBoxingSexFollows();
  const once = loadFollowables();
  migrateBoxingSexFollows();
  expect(loadFollowables()).toEqual(once);
});

test('an existing sexed follow wins over the migrated copy', () => {
  mockMem.set('follows.v2', [
    base('tsdb-league-4445', 'Major fight cards'),
    { ...base('tsdb-league-4445-w', 'Major fight cards — Women’s'), crestUrl: 'https://x/mine.png' },
  ]);
  migrateBoxingSexFollows();
  const w = loadFollowables().filter((f) => f.key === 'tsdb-league-4445-w');
  expect(w).toHaveLength(1);
  expect(w[0].crestUrl).toBe('https://x/mine.png');
});

test('non-boxing follows pass through untouched, in order', () => {
  mockMem.set('follows.v2', [
    base('fdorg-team-64', 'Liverpool'),
    base('tennis-t-us-open', 'US Open'),
  ]);
  migrateBoxingSexFollows();
  expect(loadFollowables().map((f) => f.key)).toEqual([
    'fdorg-team-64',
    'tennis-t-us-open',
  ]);
});
