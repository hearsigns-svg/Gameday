// The one ordering rule (Prompt 11): weight descending, stable, and
// absence means "keep source order at the tail".

import { byPriority, byPriorityLive } from '../browseOrder';

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

// ── Dormancy demotion (Prompt 11b) ────────────────────────────────────

test('live rows lead whatever their weight; dormant rows sink to the tail by weight', () => {
  // The census case: World Cup (100, dormant) must not lead soccer;
  // the athletics catch-all (live, unweighted) outranks a dormant
  // World Championships (57).
  const rows = [
    { key: 'wc' }, // 100, dormant
    { key: 'cl' }, // 92, dormant
    { key: 'pl' }, // 90, live
    { key: 'liga' }, // 78, live
    { key: 'catch-all' }, // unweighted, live
  ];
  const out = byPriorityLive(
    rows,
    (r) => r.key,
    { wc: 100, cl: 92, pl: 90, liga: 78 },
    new Set(['wc', 'cl']),
  );
  expect(out.map((r) => r.key)).toEqual(['pl', 'liga', 'catch-all', 'wc', 'cl']);
});

test('an empty dormant set reduces byPriorityLive to byPriority exactly', () => {
  const rows = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const weights = { b: 50, c: 90 };
  expect(byPriorityLive(rows, (r) => r.key, weights, new Set())).toEqual(
    byPriority(rows, (r) => r.key, weights),
  );
});

test('dormant demotes but never hides — every row survives', () => {
  const rows = [{ key: 'a' }, { key: 'b' }];
  const out = byPriorityLive(rows, (r) => r.key, {}, new Set(['a', 'b']));
  expect(out).toHaveLength(2);
});
