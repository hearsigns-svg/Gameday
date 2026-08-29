// Round 3 B6: the two-card Olympics structure rests on these splits.

import { olympicSeasonOf, olympicsSubset } from '../olympicsBrowse';

const rows = [
  { key: 'olympics-2028', name: 'Los Angeles 2028' },
  { key: 'olympics-2030', name: 'Milano-Cortina 2030' },
  { key: 'olympics-2028-athletics', name: 'Athletics' },
  { key: 'olympics-2028-swimming', name: 'Swimming' },
  { key: 'olympics-2030-biathlon', name: 'Biathlon' },
];

test('Summer Games years divide by four; Winter years do not', () => {
  expect(olympicSeasonOf(2028)).toBe('summer');
  expect(olympicSeasonOf(2032)).toBe('summer');
  expect(olympicSeasonOf(2030)).toBe('winter');
  expect(olympicSeasonOf(2026)).toBe('winter');
});

test('a season’s SPORTS are its disciplines, never the editions', () => {
  expect(
    olympicsSubset(rows, { season: 'summer', view: 'sports' }).map((r) => r.key),
  ).toEqual(['olympics-2028-athletics', 'olympics-2028-swimming']);
  expect(
    olympicsSubset(rows, { season: 'winter', view: 'sports' }).map((r) => r.key),
  ).toEqual(['olympics-2030-biathlon']);
});

test('a season’s GAMES are its editions, never the disciplines', () => {
  expect(
    olympicsSubset(rows, { season: 'summer', view: 'games' }).map((r) => r.key),
  ).toEqual(['olympics-2028']);
  expect(
    olympicsSubset(rows, { season: 'winter', view: 'games' }).map((r) => r.key),
  ).toEqual(['olympics-2030']);
});

test('no view = the whole set — in-sport search matches everything', () => {
  expect(olympicsSubset(rows)).toHaveLength(rows.length);
});

test('a 2032 edition lands on the Summer card by existing', () => {
  const future = [...rows, { key: 'olympics-2032', name: 'Brisbane 2032' }];
  expect(
    olympicsSubset(future, { season: 'summer', view: 'games' }).map((r) => r.key),
  ).toEqual(['olympics-2028', 'olympics-2032']);
});
