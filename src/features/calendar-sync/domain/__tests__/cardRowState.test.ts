// A card row is one two-state toggle whatever put it in the calendar
// (owner, 2026-09-03): covered rows remove through an exclusion, pinned
// rows through their pin; off rows come back the way they left.

import { rowOn, setRowsOps, toggleRowOps } from '../cardRowState';

const s = (covered: boolean, excluded: boolean, pinned: boolean) => ({
  covered,
  excluded,
  pinned,
});

test('on = covered and not excluded, or pinned', () => {
  expect(rowOn(s(true, false, false))).toBe(true);
  expect(rowOn(s(true, true, false))).toBe(false);
  expect(rowOn(s(false, false, true))).toBe(true);
  expect(rowOn(s(false, false, false))).toBe(false);
  // Excluded but pinned: the pin is an explicit later want — on.
  expect(rowOn(s(true, true, true))).toBe(true);
});

test('a covered row removes through an exclusion, never by unfollowing anything', () => {
  expect(toggleRowOps(s(true, false, false))).toEqual({ exclude: true });
});

test('a pinned row removes by dropping its pin', () => {
  expect(toggleRowOps(s(false, false, true))).toEqual({ pin: false });
});

test('a covered row that is ALSO pinned drops both on remove', () => {
  expect(toggleRowOps(s(true, false, true))).toEqual({ exclude: true, pin: false });
});

test('a covered-but-excluded row comes back by clearing the exclusion — no pin is minted', () => {
  expect(toggleRowOps(s(true, true, false))).toEqual({ exclude: false });
});

test('an uncovered row adds by pinning', () => {
  expect(toggleRowOps(s(false, false, false))).toEqual({ pin: true });
});

test('the master writes only what each row needs', () => {
  const rows = [s(true, false, false), s(true, true, false), s(false, false, true), s(false, false, false)];
  expect(setRowsOps(rows, false)).toEqual([{ exclude: true }, {}, { pin: false }, {}]);
  expect(setRowsOps(rows, true)).toEqual([{}, { exclude: false }, {}, { pin: true }]);
});
