// The calendar feed sorts DESCENDING by date — offset 0 is the furthest
// future. Walking 0,100,200,… under the page cap therefore covered the
// far tail of the window and nothing near today: 406 stored athletics
// fixtures with ZERO inside 30 days, soonest October 17, found by the
// Prompt 6 slice audit in peak outdoor season. The nearest meetings
// live at the HIGHEST offsets; tailOffsets pins the corrected walk.

import { tailOffsets } from '../providers/worldAthletics';

test('REGRESSION: the page budget is spent on the tail, highest offset first', () => {
  // 693 hits (the live 6.5-week count on 2026-08-02), 4 pages: page 0
  // buys the total, the remaining three take the NEAREST 300 meetings.
  expect(tailOffsets(693, 4)).toEqual([600, 500, 400]);
  expect(tailOffsets(851, 4)).toEqual([800, 700, 600]);
});

test('small feeds need no tail walk', () => {
  expect(tailOffsets(0, 4)).toEqual([]);
  expect(tailOffsets(90, 4)).toEqual([]);
  expect(tailOffsets(100, 4)).toEqual([]);
  expect(tailOffsets(101, 4)).toEqual([100]);
});

test('the budget is respected even when the feed dwarfs it', () => {
  expect(tailOffsets(10_000, 4)).toEqual([9900, 9800, 9700]);
  expect(tailOffsets(693, 1)).toEqual([]);
});
