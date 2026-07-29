// Time-zone correctness is the product's core promise: a fixture must
// reach the calendar as the RIGHT INSTANT, so it renders correctly
// wherever the user is. These pin the two halves of that:
//   1. timed events carry a true UTC instant (never a wall-clock time)
//   2. all-day placeholders are anchored to a UTC day boundary, so the
//      write path can pin timeZone:'UTC' and stop them landing a day
//      early for users west of UTC.

import { Fixture } from '../../../fixtures/domain/fixture';
import { DEFAULT_PREFS } from '../prefs';
import { desiredEventFor } from '../syncPlan';

function fixture(over: Partial<Fixture>): Fixture {
  return {
    id: 'f-1',
    sport: 'basketball',
    competition: 'NBA',
    competitionId: 'tsdb-league-4387',
    title: 'Lakers vs Suns',
    followKeys: ['tsdb-team-1'],
    // 19:00 in Los Angeles (PDT, UTC-7) on 3 Oct = 02:00Z on 4 Oct.
    startUtc: '2025-10-04T02:00:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2025-09-01T00:00:00.000Z',
    ...over,
  };
}

it('a timed event keeps the provider instant exactly — no wall-clock drift', () => {
  const d = desiredEventFor(fixture({}), DEFAULT_PREFS);
  expect(d).not.toBeNull();
  expect(d!.allDay).toBe(false);
  // The instant is preserved: a UK viewer sees 03:00 BST, an LA viewer
  // 19:00 PDT — the same moment, which is the whole point.
  expect(d!.startUtc).toBe('2025-10-04T02:00:00.000Z');
  expect(new Date(d!.startUtc).getTime()).toBe(
    Date.parse('2025-10-04T02:00:00Z'),
  );
});

it.each(['tbd', 'postponed'] as const)(
  '%s placeholders anchor to a UTC midnight boundary (wrong-day guard)',
  (status) => {
    const d = desiredEventFor(fixture({ status }), DEFAULT_PREFS);
    expect(d).not.toBeNull();
    expect(d!.allDay).toBe(true);
    // Must be exactly UTC midnight — calendarDriver pins timeZone:'UTC'
    // for all-day events on that basis. A non-midnight value here would
    // silently shift the day for users in negative UTC offsets.
    expect(d!.startUtc).toMatch(/T00:00:00\.000Z$/);
    expect(d!.endUtc).toMatch(/T00:00:00\.000Z$/);
    const span =
      new Date(d!.endUtc).getTime() - new Date(d!.startUtc).getTime();
    expect(span).toBe(86_400_000); // exactly one day, never 0 or 2
  },
);

it('a provisional record becomes a UTC-anchored all-day placeholder too', () => {
  const d = desiredEventFor(
    fixture({ confidence: 'provisional' }),
    DEFAULT_PREFS,
  );
  expect(d!.allDay).toBe(true);
  expect(d!.startUtc).toMatch(/T00:00:00\.000Z$/);
});

it('DST-crossing instants survive the round trip', () => {
  // 2026-03-29 is the UK DST switch. A 14:00Z fixture must stay 14:00Z
  // (15:00 BST locally) — not be shifted by an hour anywhere.
  const d = desiredEventFor(
    fixture({ startUtc: '2026-03-29T14:00:00.000Z' }),
    DEFAULT_PREFS,
  );
  expect(d!.startUtc).toBe('2026-03-29T14:00:00.000Z');
});
