// B7 final shape: the classification core and the fallback rule.

import {
  carryScopedKeys,
  isScopedCardKey,
  scopedKeysFor,
  sexOfGroupingKey,
  touchesCardScopes,
  withoutScopedKeys,
} from '../boxingSexScopes';
import { Fixture } from '../fixture';

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

// Round 4 regression pins: the stamp pass's pair must be invisible to
// ingest's change compare and survive a real rewrite — otherwise every
// poll rewrites every card and re-stamps it (the 45s poller, the frozen
// coverage stamp, the three-day banner).
const card = (keys: string[]): Fixture => ({
  id: 'tsdb-2600001',
  sport: 'boxing',
  competition: 'Boxing',
  competitionId: 'tsdb-league-4445',
  title: 'Fight Night',
  followKeys: keys,
  startUtc: '2026-09-20T20:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'exact',
  durationHours: 3,
  updatedAt: '2026-09-01T00:00:00.000Z',
});

test('the scoped pair is recognised only on the two card slices', () => {
  expect(isScopedCardKey('tsdb-league-4445-m', 'tsdb-league-4445')).toBe(true);
  expect(isScopedCardKey('pbc-cards-w', 'pbc-cards')).toBe(true);
  expect(isScopedCardKey('tsdb-league-4445-m', 'tsdb-league-4443')).toBe(false);
  expect(isScopedCardKey('tsdb-league-4445', 'tsdb-league-4445')).toBe(false);
});

test('a stored card with the pair compares EQUAL to its incoming twin without it', () => {
  const incoming = card(['tsdb-league-4445']);
  const stored = card(['tsdb-league-4445', 'tsdb-league-4445-m', 'tsdb-league-4445-w']);
  expect(withoutScopedKeys(stored)).toEqual(withoutScopedKeys(incoming));
  // Non-card slices are untouched — no accidental key stripping.
  const ufc = { ...card(['tsdb-league-4443', 'tsdb-league-4443-m']), competitionId: 'tsdb-league-4443' };
  expect(withoutScopedKeys(ufc)).toBe(ufc);
});

test('a real rewrite CARRIES the earned pair instead of stripping it', () => {
  const prev = card(['tsdb-league-4445', 'tsdb-league-4445-m']);
  const incoming = { ...card(['tsdb-league-4445']), title: 'Fight Night — new headline' };
  const stored = carryScopedKeys(incoming, prev);
  expect(stored.followKeys).toEqual(['tsdb-league-4445', 'tsdb-league-4445-m']);
  expect(stored.title).toBe('Fight Night — new headline');
  // No previous record, or no pair on it: incoming is returned as-is.
  expect(carryScopedKeys(incoming, undefined)).toBe(incoming);
  expect(carryScopedKeys(incoming, card(['tsdb-league-4445']))).toBe(incoming);
});
