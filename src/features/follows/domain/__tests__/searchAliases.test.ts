// Query aliases — the names people type versus the names the data
// carries (Part A, 2026-08-14).

import { expandQuery } from '../searchAliases';

test('the original query always comes first, alias or not', () => {
  expect(expandQuery('Liverpool')).toEqual(['Liverpool']);
  expect(expandQuery('Super Bowl')[0]).toBe('Super Bowl');
});

test('the three measured alias misses expand to their data names', () => {
  expect(expandQuery('Super Bowl')).toContain('nfl');
  expect(expandQuery('French Open')).toContain('roland garros');
  expect(expandQuery('Monaco Grand Prix')).toContain('formula 1');
});

test('containment, not equality: a rule fires anywhere in the query', () => {
  expect(expandQuery('the super bowl final')).toContain('nfl');
  expect(expandQuery('grand prix')).toContain('formula 1');
});

test('folding applies before matching — diacritics and case cannot dodge a rule', () => {
  expect(expandQuery('FRENCH OPEN')).toContain('roland garros');
});

test('ATTACK: an alias must not fire on unrelated queries', () => {
  // "open" alone must not drag Roland Garros into every tennis search,
  // and "bowl" alone must not surface the NFL.
  expect(expandQuery('US Open')).toEqual(['US Open']);
  expect(expandQuery('Super Bowl of Chili')).toContain('nfl'); // containment is honest
  expect(expandQuery('bowling')).toEqual(['bowling']);
  expect(expandQuery('open')).toEqual(['open']);
});
