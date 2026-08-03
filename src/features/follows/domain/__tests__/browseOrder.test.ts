// The one ordering rule (Prompt 11): weight descending, stable, and
// absence means "keep source order at the tail".

import { byPriority } from '../browseOrder';

const rows = [
  { key: 'eredivisie' },
  { key: 'wc' },
  { key: 'liga' },
  { key: 'pl' },
  { key: 'primeira' },
];

test('weighted rows lead, descending; unweighted keep source order after them', () => {
  const out = byPriority(rows, (r) => r.key, { wc: 100, pl: 90, liga: 78 });
  expect(out.map((r) => r.key)).toEqual(['wc', 'pl', 'liga', 'eredivisie', 'primeira']);
});

test('an empty weight map is the identity — first launch renders config order', () => {
  const out = byPriority(rows, (r) => r.key, {});
  expect(out.map((r) => r.key)).toEqual(rows.map((r) => r.key));
});

test('ties keep source order — the deliberate ATP/WTA case', () => {
  const out = byPriority(
    [{ key: 'tennis-atp' }, { key: 'tennis-wta' }],
    (r) => r.key,
    { 'tennis-atp': 66, 'tennis-wta': 66 },
  );
  expect(out.map((r) => r.key)).toEqual(['tennis-atp', 'tennis-wta']);
});

test('input is not mutated', () => {
  const input = [...rows];
  byPriority(input, (r) => r.key, { wc: 100 });
  expect(input).toEqual(rows);
});
