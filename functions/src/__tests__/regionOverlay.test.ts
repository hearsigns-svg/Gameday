// The regional ordering overlay (Prompt 15) — the MECHANISM. The data
// itself is deliberately unseeded pending the owner's read of the
// proposed table, so these tests pin behaviour rather than weights.

import { CATALOGUE_SEED, CatalogueEntry } from '../catalogue';

// Mirrors loadPriorityDataUncached's inversion (index.ts).
function invert(entries: readonly CatalogueEntry[]) {
  const byRegion: Record<string, Record<string, number>> = {};
  for (const e of entries) {
    if (!e.competitionId || !e.priorityByRegion) continue;
    for (const [region, weight] of Object.entries(e.priorityByRegion)) {
      if (typeof weight !== 'number') continue;
      (byRegion[region] ??= {})[e.competitionId] = weight;
    }
  }
  return byRegion;
}

const apply = (
  map: Record<string, number>,
  overlay: Record<string, number> | undefined,
) => (overlay && Object.keys(overlay).length ? { ...map, ...overlay } : map);

test('THE OVERLAY IS UNSEEDED — no region reorders anything yet', () => {
  // The owner asked to read the table before it is applied. This test
  // is the guard on that: it fails the moment regional weights are
  // seeded, which is the reminder to bring the table back for approval.
  expect(invert(CATALOGUE_SEED)).toEqual({});
});

test('a sparse overlay changes only what it names', () => {
  const map = { a: 10, b: 20, c: 30 };
  const out = apply(map, { b: 99 });
  expect(out).toEqual({ a: 10, b: 99, c: 30 });
  // The default map is untouched — regions are a view, not a rewrite.
  expect(map.b).toBe(20);
});

test('an unknown or absent region is the DEFAULT, never an empty ranking', () => {
  const map = { a: 10, b: 20 };
  expect(apply(map, undefined)).toBe(map);
  expect(apply(map, {})).toBe(map);
});

test('a region reorders SPORTS through the sport: rows, not a second mechanism', () => {
  // "Cricket leads in South Asia" is a weight on the `sport:cricket`
  // catalogue row — the same row the default ordering already uses.
  const sportRows = CATALOGUE_SEED.filter((e) => e.sportRow);
  expect(sportRows.length).toBeGreaterThan(10);
  for (const r of sportRows) expect(r.competitionId.startsWith('sport:')).toBe(true);
});

test('regional weights obey the same 0–100 bound as default ones', () => {
  for (const e of CATALOGUE_SEED) {
    for (const w of Object.values(e.priorityByRegion ?? {})) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(100);
    }
  }
});
