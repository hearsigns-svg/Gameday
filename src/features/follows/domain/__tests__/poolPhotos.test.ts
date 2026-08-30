// The pool rung's determinism contract (owner ruling, verify items):
// same card same shot across launches; different cards vary.

import { poolIndexFor } from '../poolPhotos';

test('the same fixture id always lands on the same pool index', () => {
  const a = poolIndexFor('tsdb-2612345', 8);
  for (let i = 0; i < 5; i++) expect(poolIndexFor('tsdb-2612345', 8)).toBe(a);
});

test('different cards spread across the pool, not onto one shot', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `tsdb-26${1000 + i}`);
  const used = new Set(ids.map((id) => poolIndexFor(id, 8)));
  // 40 ids over 8 slots must touch most of the pool — a degenerate
  // hash would funnel them into one or two.
  expect(used.size).toBeGreaterThanOrEqual(6);
  for (const idx of used) {
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(8);
  }
});

test('an empty or absent pool cannot produce an index out of range', () => {
  expect(poolIndexFor('anything', 0)).toBe(0);
});
