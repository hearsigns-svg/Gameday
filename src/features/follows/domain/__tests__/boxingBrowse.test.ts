// Round 3 B7 (realigned 2026-08-30): the sex facts the two views rest
// on — and the strictness the realignment demands.

import { boxingCardSex, boxingGroupSex, inSexView } from '../boxingBrowse';

test('group sex is a fact of the key — and only boxing keys answer', () => {
  expect(boxingGroupSex('boxing-heavyweight')).toBe('m');
  expect(boxingGroupSex('boxing-w-heavyweight')).toBe('w');
  expect(boxingGroupSex('wta')).toBeNull(); // not boxing's to classify
  expect(boxingGroupSex(undefined)).toBeNull();
});

test('card sex rides the marked-female/unmarked-male label convention', () => {
  expect(boxingCardSex('Women’s Super Middleweight')).toBe('w');
  expect(boxingCardSex('Heavyweight')).toBe('m');
  expect(boxingCardSex(undefined)).toBeNull(); // unclassed, never guessed
});

test('sexed views are STRICT — unclassed appears on NEITHER screen', () => {
  // The realignment's own case: Andy Ruiz Jr. (unclassed vendor mint)
  // was rendering under a "Women's boxing" title. Excluded from both
  // sexed screens; still reachable via search and his cards' heroes.
  expect(inSexView('m', null)).toBe(false);
  expect(inSexView('w', null)).toBe(false);
  expect(inSexView('m', 'w')).toBe(false);
  expect(inSexView('w', 'w')).toBe(true);
  expect(inSexView('m', 'm')).toBe(true);
});
