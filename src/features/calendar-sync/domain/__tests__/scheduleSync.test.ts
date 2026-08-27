import { dayMarks, monthOfDay, sectionIndexForDay } from '../scheduleSync';

const KEYS = ['2026-08-27', '2026-08-30', '2026-09-02'];

describe('sectionIndexForDay', () => {
  it('lands on the exact section when the day has one', () => {
    expect(sectionIndexForDay(KEYS, '2026-08-30')).toBe(1);
  });

  it('snaps an empty day to the nearest FOLLOWING section', () => {
    expect(sectionIndexForDay(KEYS, '2026-08-28')).toBe(1);
    expect(sectionIndexForDay(KEYS, '2026-08-31')).toBe(2);
  });

  it('a day before the first section lands on the first', () => {
    expect(sectionIndexForDay(KEYS, '2026-08-01')).toBe(0);
  });

  it('a day past the last section lands on the last — there is no following section', () => {
    expect(sectionIndexForDay(KEYS, '2026-12-25')).toBe(2);
  });

  it('null when there are no sections at all', () => {
    expect(sectionIndexForDay([], '2026-08-27')).toBeNull();
  });

  it('orders across a year boundary (zero-padded keys are date order)', () => {
    expect(sectionIndexForDay(['2026-12-30', '2027-01-02'], '2026-12-31')).toBe(1);
  });
});

describe('dayMarks', () => {
  const entries = [
    { id: 'a', day: '2026-08-27' },
    { id: 'b', day: '2026-08-27' },
    { id: 'c', day: '2026-08-30' },
  ];

  it('marks a day shown when any fixture is still in the calendar', () => {
    expect(dayMarks(entries, new Set(['a']))).toEqual(
      new Map([
        ['2026-08-27', 'shown'],
        ['2026-08-30', 'shown'],
      ]),
    );
  });

  it('marks a day removed only when EVERYTHING that day is opted out', () => {
    expect(dayMarks(entries, new Set(['a', 'b']))).toEqual(
      new Map([
        ['2026-08-27', 'removed'],
        ['2026-08-30', 'shown'],
      ]),
    );
  });

  it('shown wins regardless of entry order', () => {
    const reversed = [...entries].reverse();
    expect(dayMarks(reversed, new Set(['b']))?.get('2026-08-27')).toBe('shown');
  });

  it('no fixtures, no marks', () => {
    expect(dayMarks([], new Set())).toEqual(new Map());
  });
});

describe('monthOfDay', () => {
  it('reads the grid month (0-based) out of a day key', () => {
    expect(monthOfDay('2026-08-27')).toEqual({ year: 2026, month: 7 });
    expect(monthOfDay('2027-01-02')).toEqual({ year: 2027, month: 0 });
  });
});
