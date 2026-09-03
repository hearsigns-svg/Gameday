import { FORMULA_KEYS, motorsportSections } from '../motorsportBrowse';
import { SPORTS } from '../sportsConfig';

const rows = (SPORTS.find((s) => s.key === 'motorsport')?.staticCompetitions ?? []).map((c) => ({
  key: c.key,
  name: c.name,
}));

test('the Formula group is exactly the three Formula rows the tile configures', () => {
  const keys = rows.map((r) => r.key);
  for (const k of FORMULA_KEYS) expect(keys).toContain(k);
});

test('F1 regions: Formula leads, then the series — rows keep their incoming order within a run', () => {
  const s = motorsportSections(rows, 'uk-ie');
  expect(s.map((x) => x.id)).toEqual(['formula', 'motorsport']);
  expect(s[0].rows.map((r) => r.name)).toEqual(['Formula 1', 'Formula 2', 'Formula E']);
  expect(s[1].rows.map((r) => r.name)).toEqual([
    'MotoGP',
    'NASCAR Cup Series',
    'IndyCar',
    'World Endurance Championship',
  ]);
  expect(motorsportSections(rows, 'default').map((x) => x.id)).toEqual(['formula', 'motorsport']);
});

test('North America: the order flips — the series lead, Formula follows', () => {
  expect(motorsportSections(rows, 'north-america').map((x) => x.id)).toEqual(['motorsport', 'formula']);
});

test('an empty run is omitted, never rendered as a bare header', () => {
  const formulaOnly = rows.filter((r) => FORMULA_KEYS.includes(r.key));
  expect(motorsportSections(formulaOnly, 'north-america').map((x) => x.id)).toEqual(['formula']);
  expect(motorsportSections([], 'uk-ie')).toEqual([]);
});
