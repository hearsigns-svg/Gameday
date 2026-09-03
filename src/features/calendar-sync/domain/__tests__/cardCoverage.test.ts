import { Fixture } from '../../../fixtures/domain/fixture';
import { tierCoveredChildIds } from '../cardCoverage';

const parent: Fixture = {
  id: 'wta-905-2026',
  sport: 'tennis',
  competition: 'WTA Tour',
  competitionId: 'tennis-wta',
  title: 'US Open',
  followKeys: ['tennis-wta', 'tennis-t-us-open', 'tennis-t-us-open-w'],
  startUtc: '2026-08-30T00:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'date_only',
  durationHours: 360,
  updatedAt: '2026-08-29T00:00:00.000Z',
};
const child = (id: string, title: string, competitionId: string, round?: 'f' | 'r64'): Fixture => ({
  id,
  sport: 'tennis',
  competition: 'US Open',
  competitionId,
  title,
  followKeys: [competitionId],
  parentFixtureId: parent.id,
  startUtc: '2026-09-05T15:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'exact',
  durationHours: 3,
  updatedAt: '2026-08-29T00:00:00.000Z',
  ...(round ? { stage: { round } } : {}),
});
const w1 = child('w1', 'A vs B — US Open', 'tennis-wta-appearances');
const wFinal = child('wf', 'C vs D — US Open, Final', 'tennis-wta-appearances', 'f');
const m1 = child('m1', 'E vs F — US Open, Round of 64', 'tennis-atp-appearances', 'r64');

test('All matches covers every match of the followed draws; Key rounds only the key ones; Dates only none', () => {
  const kids = [w1, wFinal, m1];
  expect([...tierCoveredChildIds(parent, kids, ['tennis-t-us-open-m', 'tennis-t-us-open-w'], 'all')].sort()).toEqual(['m1', 'w1', 'wf']);
  expect([...tierCoveredChildIds(parent, kids, ['tennis-t-us-open-m', 'tennis-t-us-open-w'], 'key')]).toEqual(['wf']);
  expect(tierCoveredChildIds(parent, kids, ['tennis-t-us-open-w'], 'block').size).toBe(0);
});

test('a women’s-only follow covers the women’s matches only; an unfollowed tournament covers nothing', () => {
  const kids = [w1, wFinal, m1];
  expect([...tierCoveredChildIds(parent, kids, ['tennis-t-us-open-w'], 'all')].sort()).toEqual(['w1', 'wf']);
  expect(tierCoveredChildIds(parent, kids, ['tsdb-league-4328'], 'all').size).toBe(0);
});

test('the per-tournament override beats the global tier, as it does in the planner', () => {
  const kids = [w1, wFinal];
  const overrides = new Map<string, 'block' | 'key' | 'all'>([['tennis-t-us-open-w', 'block']]);
  expect(tierCoveredChildIds(parent, kids, ['tennis-t-us-open-w'], 'all', overrides).size).toBe(0);
});
