// Display-side timezone correctness. Date-only fixtures (tbd/postponed)
// carry a DAY sentinel, not an instant — labels must come from the UTC
// day regardless of the device zone. These run in BOTH the UTC and the
// TZ=America/Los_Angeles test passes (see package.json), so a local-zone
// leak fails CI instead of shipping.

import {
  countdownLabel,
  dayHeading,
  dayKey,
  isDateOnly,
  spanDays,
  spanDaysLabel,
  spanLabel,
  timeLabel,
  whenLabel,
} from '../when';

describe('a tournament block is a SPAN, not a day missing its time (2026-09-03)', () => {
  it('counts whole days from the duration, never below one', () => {
    expect(spanDays(360)).toBe(15);
    expect(spanDays(36)).toBe(2);
    expect(spanDays(24)).toBe(1);
    expect(spanDays(undefined)).toBe(1);
  });

  it('names the first and last UTC day of the span, in any zone', () => {
    // 2026-08-31T00:00Z for 15 days ends in Sep 14 — in Los Angeles the
    // start instant is still Aug 30 evening; the label must say 31.
    const label = spanLabel('2026-08-31T00:00:00.000Z', 360);
    expect(label).toMatch(/31/);
    expect(label).toMatch(/14/);
    expect(label).toContain(' – ');
    // A one-day span is one date, no dash.
    expect(spanLabel('2026-08-31T00:00:00.000Z', 24)).not.toContain(' – ');
  });

  it('the running-time text pluralises', () => {
    expect(spanDaysLabel(360)).toBe('15 days');
    expect(spanDaysLabel(24)).toBe('1 day');
  });
});

// A Saturday fixture whose fd.org noon sentinel is 2026-08-23T12:00Z.
// In Los Angeles that instant is Sunday 05:00 *minus* a day — Aug 22.
const SENTINEL = '2026-08-23T12:00:00.000Z';
const NOW = new Date('2026-08-18T15:00:00.000Z');

describe('date-only fixtures label from the UTC day in any zone', () => {
  it('whenLabel names the UTC day', () => {
    // Aug 23 2026 is a Sunday; 5 days ahead of NOW → weekday form.
    expect(whenLabel(SENTINEL, true, NOW)).toBe('Sunday');
  });

  it('dayKey groups by the UTC day', () => {
    expect(dayKey(SENTINEL, true)).toBe('2026-08-23');
  });

  it('dayHeading carries the UTC date', () => {
    expect(dayHeading(SENTINEL, true, NOW)).toContain('23');
    expect(dayHeading(SENTINEL, true, NOW)).toContain('August');
  });

  it('countdownLabel counts to the UTC day', () => {
    expect(countdownLabel(SENTINEL, true, NOW)).toBe('IN 5 DAYS');
  });

  it('a midnight-UTC sentinel still labels its own day', () => {
    // 00:00Z is Aug 22 17:00 in LA — dateOnly must pin Aug 23 anyway.
    const midnight = '2026-08-23T00:00:00.000Z';
    expect(dayKey(midnight, true)).toBe('2026-08-23');
    expect(whenLabel(midnight, true, NOW)).toBe('Sunday');
  });
});

describe('timed fixtures stay in the viewer zone', () => {
  it('dayKey for a timed fixture follows the LOCAL day', () => {
    // 00:30Z on Aug 24 is still Aug 23 evening in LA — and that is
    // correct for a real instant: the viewer attends in their own zone.
    const instant = '2026-08-24T00:30:00.000Z';
    const local = new Date(instant);
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    expect(dayKey(instant, false)).toBe(expected);
  });
});

describe('status labels', () => {
  it('postponed says so instead of hiding behind TBC', () => {
    expect(timeLabel(SENTINEL, 'postponed')).toBe('Postponed');
    expect(timeLabel(SENTINEL, 'tbd')).toBe('Time TBC');
  });

  it('isDateOnly covers exactly the sentinel statuses', () => {
    expect(isDateOnly('tbd')).toBe(true);
    expect(isDateOnly('postponed')).toBe(true);
    expect(isDateOnly('scheduled')).toBe(false);
    expect(isDateOnly('cancelled')).toBe(false);
  });
});
