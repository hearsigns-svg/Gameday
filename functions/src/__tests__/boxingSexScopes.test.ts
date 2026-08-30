// B7 final shape: the classification core and the fallback rule.

import {
  scopedKeysFor,
  sexOfGroupingKey,
  touchesCardScopes,
} from '../boxingSexScopes';

test('scoped keys follow the evidence — zero classed bouts means BOTH', () => {
  expect(scopedKeysFor('tsdb-league-4445', new Set(['m']))).toEqual([
    'tsdb-league-4445-m',
  ]);
  expect(scopedKeysFor('pbc-cards', new Set(['w']))).toEqual(['pbc-cards-w']);
  expect(scopedKeysFor('pbc-cards', new Set(['m', 'w']))).toEqual([
    'pbc-cards-m',
    'pbc-cards-w',
  ]);
  // Deliver-don't-drop: an unclassified card reaches BOTH sexed
  // follows — silently missing a major card is the worse failure.
  expect(scopedKeysFor('tsdb-league-4445', new Set())).toEqual([
    'tsdb-league-4445-m',
    'tsdb-league-4445-w',
  ]);
});

test('sex of a grouping key is a prefix fact; non-boxing keys answer nothing', () => {
  expect(sexOfGroupingKey('boxing-heavyweight')).toBe('m');
  expect(sexOfGroupingKey('boxing-w-featherweight')).toBe('w');
  expect(sexOfGroupingKey('wta')).toBeNull();
  expect(sexOfGroupingKey(undefined)).toBeNull();
});

test('only the followable card slices and their bout slices trigger stamping', () => {
  expect(touchesCardScopes('tsdb-league-4445')).toBe(true);
  expect(touchesCardScopes('pbc-cards-appearances')).toBe(true);
  expect(touchesCardScopes('boxingdata-cards')).toBe(false); // server-only slice
  expect(touchesCardScopes('tsdb-league-4391')).toBe(false);
});
