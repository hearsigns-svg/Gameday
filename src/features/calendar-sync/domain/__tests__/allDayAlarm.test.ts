// The day-shaped alarm offsets. These run under BOTH suite zones (UTC
// and America/Los_Angeles), which is the whole point: the fire-at
// instant is civil-local while the anchors are platform facts, so a
// UTC-only pass would rubber-stamp offsets that are hours wrong for
// every real phone west of Greenwich.

import {
  allDayAlarmMinutesBefore,
  DAY_BEFORE_HOUR,
  MORNING_OF_HOUR,
} from '../allDayAlarm';

const DAY = '2026-09-05T00:00:00.000Z'; // Katie Taylor at Croke Park

const zoneOffsetMinutes = (y: number, m: number, d: number) =>
  // Local midnight − UTC midnight for that date, in minutes. Positive
  // west of UTC (LA: 420 in September), negative east.
  (new Date(y, m, d, 0, 0, 0, 0).getTime() - Date.UTC(y, m, d)) / 60_000;

describe('allDayAlarmMinutesBefore', () => {
  it('off means off, whatever the anchor', () => {
    expect(allDayAlarmMinutesBefore(DAY, null, 'utc-midnight')).toBeNull();
    expect(allDayAlarmMinutesBefore(DAY, null, 'local-midnight')).toBeNull();
  });

  it('an unreadable sentinel costs the alarm, never invents one', () => {
    expect(
      allDayAlarmMinutesBefore('garbage', 'day-before', 'utc-midnight'),
    ).toBeNull();
  });

  // The invariant that matters: whatever the device zone, the alarm
  // fires at the chosen CIVIL instant. Recovering the fire-time from the
  // returned offset and the anchor must land on 6pm (or 9am) local.
  it('day-before fires at 6pm local the previous day (utc-midnight anchor)', () => {
    const mins = allDayAlarmMinutesBefore(DAY, 'day-before', 'utc-midnight')!;
    const fireAt = new Date(Date.UTC(2026, 8, 5) - mins * 60_000);
    expect(fireAt.getHours()).toBe(DAY_BEFORE_HOUR);
    expect(fireAt.getDate()).toBe(4);
  });

  it('morning-of fires at 9am local the event day (utc-midnight anchor)', () => {
    const mins = allDayAlarmMinutesBefore(DAY, 'morning-of', 'utc-midnight')!;
    const fireAt = new Date(Date.UTC(2026, 8, 5) - mins * 60_000);
    expect(fireAt.getHours()).toBe(MORNING_OF_HOUR);
    expect(fireAt.getDate()).toBe(5);
  });

  it('local-midnight anchor: the zone cancels out entirely', () => {
    // Against a local anchor the offset is pure civil arithmetic —
    // 6 hours from 6pm to midnight, minus nothing for the zone.
    expect(
      allDayAlarmMinutesBefore(DAY, 'day-before', 'local-midnight'),
    ).toBe(6 * 60);
    expect(
      allDayAlarmMinutesBefore(DAY, 'morning-of', 'local-midnight'),
    ).toBe(-(MORNING_OF_HOUR * 60));
  });

  it('utc-midnight anchor differs from local by exactly the zone offset', () => {
    const utc = allDayAlarmMinutesBefore(DAY, 'day-before', 'utc-midnight')!;
    const local = allDayAlarmMinutesBefore(DAY, 'day-before', 'local-midnight')!;
    // utc − local = utcMidnight − localMidnight = −(local − utc): the
    // two anchors differ by the zone offset with the sign flipped.
    // toBeCloseTo, because under a UTC test zone both sides are zero and
    // Object.is distinguishes -0 from 0.
    expect(utc - local).toBeCloseTo(-zoneOffsetMinutes(2026, 8, 5), 5);
  });

  // Android reality check for the September date in the LA run: UTC
  // midnight is 5pm the previous evening local, so "6pm the day before"
  // is only ONE hour before the platform start — the naive 360 would
  // have fired at 11am.
  it('is DST-correct across a transition date', () => {
    // 2026-11-02: the morning after the US fall-back. The helper builds
    // fire-at via local constructors, so the offset absorbs the shift.
    const day = '2026-11-02T00:00:00.000Z';
    const mins = allDayAlarmMinutesBefore(day, 'day-before', 'utc-midnight')!;
    const fireAt = new Date(Date.UTC(2026, 10, 2) - mins * 60_000);
    expect(fireAt.getHours()).toBe(DAY_BEFORE_HOUR);
    expect(fireAt.getDate()).toBe(1);
  });
});
