// The Following page groups follows under their sport, in browse's
// regional order, with Formula 1 under Motorsport and every Olympic
// follow in one Olympics group (owner brief 2026-09-23).
import { followingSections, sectionSportKey } from '../followingSections';
import { SPORTS } from '../sportsConfig';

const f = (key: string, sportKey: string) => ({ key, sportKey });

test('Formula 1 sits under the tile that hosts it', () => {
  expect(sectionSportKey(f('f1-series-1', 'f1'), SPORTS)).toBe('motorsport');
  expect(sectionSportKey(f('athlete_000224', 'f1'), SPORTS)).toBe('motorsport');
  expect(sectionSportKey(f('tsdb-league-4407', 'motorsport'), SPORTS)).toBe('motorsport');
});

test('every Olympic follow is in the one Olympics group, whichever tile it came from', () => {
  expect(sectionSportKey(f('olympics-2028', 'olympics'), SPORTS)).toBe('olympics');
  expect(sectionSportKey(f('olympics-2028-athletics', 'athletics'), SPORTS)).toBe('olympics');
  expect(sectionSportKey(f('olympics-2030-curling', 'olympics'), SPORTS)).toBe('olympics');
  // …and nothing else is mistaken for one.
  expect(sectionSportKey(f('tsdb-league-4480', 'athletics'), SPORTS)).toBe('athletics');
});

test('sections follow the tile order; follows keep their followed order inside a section', () => {
  const sections = followingSections(
    [
      f('tennis-t-us-open-m', 'tennis'),
      f('fdorg-team-64', 'soccer'),
      f('f1-series-1', 'f1'),
      f('fdorg-comp-PL', 'soccer'),
      f('olympics-2028-athletics', 'athletics'),
    ],
    SPORTS,
    ['soccer', 'motorsport', 'tennis', 'olympics'],
  );
  expect(sections.map((s) => [s.sportKey, s.follows.map((x) => x.key)])).toEqual([
    ['soccer', ['fdorg-team-64', 'fdorg-comp-PL']],
    ['motorsport', ['f1-series-1']],
    ['tennis', ['tennis-t-us-open-m']],
    ['olympics', ['olympics-2028-athletics']],
  ]);
});

test('a sport the config no longer knows closes the list rather than vanishing', () => {
  const sections = followingSections([f('x-1', 'curling-league'), f('fdorg-team-64', 'soccer')], SPORTS, ['soccer']);
  expect(sections.map((s) => s.sportKey)).toEqual(['soccer', 'curling-league']);
});
