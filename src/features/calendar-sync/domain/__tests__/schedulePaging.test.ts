// Pure paging maths for the Schedule list. Every instant here is an ISO
// UTC string and every month boundary is a UTC one: the suite runs
// under UTC and America/Los_Angeles and must produce identical results
// in both. Only localDayEndUtc is zone-dependent, by design — its tests
// assert the local invariant rather than a fixed instant.

import {
  fixturesInWindow,
  loadedWindow,
  localDayEndUtc,
  nextPageAvailable,
  nextPagesLoaded,
  nextStartBeyond,
  pagesToFirst,
  pagesToReach,
  pageWindows,
} from '../schedulePaging';
import { horizonStartFrom } from '../syncPlan';

const NOW = Date.parse('2026-09-02T15:00:00.000Z');
const at = (iso: string) => ({ startUtc: iso });

describe('pageWindows', () => {
  it('page 0 runs from the horizon start to the end of NEXT month', () => {
    expect(pageWindows(NOW, 1)).toEqual([
      { fromUtc: horizonStartFrom(NOW), toUtc: '2026-11-01T00:00:00.000Z' },
    ]);
  });

  it('each further page is one contiguous calendar month', () => {
    expect(pageWindows(NOW, 3)).toEqual([
      { fromUtc: horizonStartFrom(NOW), toUtc: '2026-11-01T00:00:00.000Z' },
      { fromUtc: '2026-11-01T00:00:00.000Z', toUtc: '2026-12-01T00:00:00.000Z' },
      { fromUtc: '2026-12-01T00:00:00.000Z', toUtc: '2027-01-01T00:00:00.000Z' },
    ]);
  });

  it('crosses the year boundary', () => {
    const december = Date.parse('2026-12-15T12:00:00.000Z');
    expect(pageWindows(december, 2).map((w) => w.toUtc)).toEqual([
      '2027-02-01T00:00:00.000Z',
      '2027-03-01T00:00:00.000Z',
    ]);
  });

  it('never returns fewer than one page', () => {
    expect(pageWindows(NOW, 0)).toHaveLength(1);
    expect(pageWindows(NOW, -3)).toHaveLength(1);
  });

  it('aligns to the UTC month whatever the local month says', () => {
    // 23:30Z on 30 Sept is already 1 Oct in Sydney and still 30 Sept in
    // Los Angeles; the boundary is September's UTC end in every zone.
    const lateSeptember = Date.parse('2026-09-30T23:30:00.000Z');
    expect(loadedWindow(lateSeptember, 1).toUtc).toBe('2026-11-01T00:00:00.000Z');
    // 00:30Z on 1 Oct is still the evening of 30 Sept in Los Angeles.
    const earlyOctober = Date.parse('2026-10-01T00:30:00.000Z');
    expect(loadedWindow(earlyOctober, 1).toUtc).toBe('2026-12-01T00:00:00.000Z');
  });
});

describe('loadedWindow', () => {
  it('is the union of the loaded pages', () => {
    expect(loadedWindow(NOW, 3)).toEqual({
      fromUtc: horizonStartFrom(NOW),
      toUtc: '2027-01-01T00:00:00.000Z',
    });
  });
});

describe('fixturesInWindow', () => {
  const all = [
    at('2026-09-02T10:00:00.000Z'),
    at('2026-10-31T23:59:59.000Z'),
    at('2026-11-01T00:00:00.000Z'),
    at('2026-11-15T18:00:00.000Z'),
  ];

  it('is half-open: the start is in, the end is out', () => {
    expect(
      fixturesInWindow(all, '2026-09-02T10:00:00.000Z', '2026-11-01T00:00:00.000Z'),
    ).toEqual([all[0], all[1]]);
  });

  it('compares instants, not strings', () => {
    // As a string '+00:00' sorts before '.000Z' and would slip inside;
    // as an instant it IS the boundary and belongs to the next page.
    expect(
      fixturesInWindow(
        [at('2026-11-01T00:00:00+00:00')],
        '2026-09-01T00:00:00.000Z',
        '2026-11-01T00:00:00.000Z',
      ),
    ).toEqual([]);
  });
});

describe('nextStartBeyond / nextPageAvailable', () => {
  const all = [
    at('2026-12-05T12:00:00.000Z'),
    at('2026-09-10T12:00:00.000Z'),
    at('2026-11-20T12:00:00.000Z'),
  ];

  it('finds the soonest start at or after the boundary, unsorted input', () => {
    expect(nextStartBeyond(all, '2026-11-01T00:00:00.000Z')).toBe(
      '2026-11-20T12:00:00.000Z',
    );
    expect(nextPageAvailable(all, '2026-11-01T00:00:00.000Z')).toBe(true);
  });

  it('a start exactly on the boundary belongs to the next page', () => {
    expect(
      nextStartBeyond([at('2026-11-01T00:00:00.000Z')], '2026-11-01T00:00:00.000Z'),
    ).toBe('2026-11-01T00:00:00.000Z');
  });

  it('nothing beyond: null and false', () => {
    expect(nextStartBeyond(all, '2027-01-01T00:00:00.000Z')).toBeNull();
    expect(nextPageAvailable(all, '2027-01-01T00:00:00.000Z')).toBe(false);
    expect(nextPageAvailable([], '2026-01-01T00:00:00.000Z')).toBe(false);
  });
});

describe('pagesToReach', () => {
  it('one page covers this month and next', () => {
    expect(pagesToReach(NOW, '2026-09-30T23:59:59.000Z')).toBe(1);
    expect(pagesToReach(NOW, '2026-10-31T23:59:59.000Z')).toBe(1);
  });

  it('then one page per further UTC month', () => {
    expect(pagesToReach(NOW, '2026-11-01T00:00:00.000Z')).toBe(2);
    expect(pagesToReach(NOW, '2027-03-15T00:00:00.000Z')).toBe(6);
  });

  it('the past reads as page one', () => {
    expect(pagesToReach(NOW, '2026-01-01T00:00:00.000Z')).toBe(1);
  });

  it('an unparseable target reads as page one rather than NaN', () => {
    expect(pagesToReach(NOW, 'not-a-date')).toBe(1);
  });

  it('agrees with the windows it names', () => {
    for (let p = 1; p <= 6; p++) {
      const { toUtc } = loadedWindow(NOW, p);
      // The last instant inside p pages needs exactly p; the boundary
      // itself is the first instant of page p + 1.
      const lastInside = new Date(Date.parse(toUtc) - 1).toISOString();
      expect(pagesToReach(NOW, lastInside)).toBe(p);
      expect(pagesToReach(NOW, toUtc)).toBe(p + 1);
    }
  });
});

describe('pagesToFirst', () => {
  it('one page when the first two months hold a fixture, or nothing exists', () => {
    expect(pagesToFirst([at('2026-10-20T12:00:00.000Z')], NOW)).toBe(1);
    expect(pagesToFirst([], NOW)).toBe(1);
  });

  it('reaches an off-season follow whose soonest fixture is months out', () => {
    // Nothing until January: the list opens on January, not on two
    // empty months. Sept + Oct are page 1; Nov 2, Dec 3, Jan 4.
    expect(
      pagesToFirst(
        [at('2027-03-01T12:00:00.000Z'), at('2027-01-09T15:00:00.000Z')],
        NOW,
      ),
    ).toBe(4);
  });

  it('a fixture already under way still reads as page one', () => {
    expect(pagesToFirst([at('2026-09-02T14:30:00.000Z')], NOW)).toBe(1);
  });
});

describe('nextPagesLoaded', () => {
  it('advances one page when the next month has fixtures', () => {
    expect(nextPagesLoaded([at('2026-11-03T12:00:00.000Z')], NOW, 1)).toBe(2);
  });

  it('skips empty months so every load reveals a row', () => {
    // Sept + Oct are page 1; Nov 2, Dec 3, Jan 4, Feb 5.
    expect(nextPagesLoaded([at('2027-02-10T12:00:00.000Z')], NOW, 1)).toBe(5);
  });

  it('holds when nothing more exists', () => {
    expect(nextPagesLoaded([at('2026-09-10T12:00:00.000Z')], NOW, 1)).toBe(1);
    expect(nextPagesLoaded([], NOW, 4)).toBe(4);
  });
});

describe('localDayEndUtc', () => {
  it('is the local midnight that follows the day, in UTC', () => {
    const end = new Date(localDayEndUtc('2026-10-31'));
    expect([
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
      end.getHours(),
      end.getMinutes(),
    ]).toEqual([2026, 10, 1, 0, 0]);
  });

  it('rolls the year', () => {
    const end = new Date(localDayEndUtc('2026-12-31'));
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2027, 0, 1]);
  });

  it('is DST-safe: a clocks-change day still ends at local midnight', () => {
    // 2026-11-01 is the US fall-back Sunday, 2026-03-08 the spring-forward
    // one; 2026-10-25 is the EU change. Local midnight exists in every
    // zone the suite runs under.
    for (const day of ['2026-11-01', '2026-03-08', '2026-10-25']) {
      const end = new Date(localDayEndUtc(day));
      expect([end.getHours(), end.getMinutes()]).toEqual([0, 0]);
    }
  });
});
