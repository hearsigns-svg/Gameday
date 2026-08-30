// Round 3 B7 (reinstated mirrored structure): the sex facts the two
// views rest on.

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

test('unclassed cards ride in BOTH views — presence claims nothing', () => {
  expect(inSexView('m', null)).toBe(true);
  expect(inSexView('w', null)).toBe(true);
  expect(inSexView('m', 'w')).toBe(false);
  expect(inSexView('w', 'w')).toBe(true);
});
