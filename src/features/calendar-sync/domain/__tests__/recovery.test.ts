import { entriesFromRecoveredEvents, orphanEventIds, RecoveredEvent } from '../recovery';

function event(overrides: Partial<RecoveredEvent> = {}): RecoveredEvent {
  return {
    fixtureId: 'apisports-1',
    eventId: 'evt-1',
    title: 'Liverpool v Everton',
    startUtc: '2023-10-21T11:30:00.000Z',
    endUtc: '2023-10-21T13:30:00.000Z',
    allDay: false,
    ...overrides,
  };
}

describe('entriesFromRecoveredEvents', () => {
  test('rebuilds one ledger entry per fixture with full fidelity', () => {
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(
      [
        event(),
        event({
          fixtureId: 'apisports-2',
          eventId: 'evt-2',
          title: 'Chelsea v Liverpool — postponed',
          startUtc: '2023-08-13T00:00:00.000Z',
          endUtc: '2023-08-14T00:00:00.000Z',
          allDay: true,
        }),
      ],
      'cal-1',
    );
    expect(surplusEventIds).toHaveLength(0);
    expect(ledger['apisports-1']).toEqual({
      eventId: 'evt-1',
      calendarId: 'cal-1',
      startUtc: '2023-10-21T11:30:00.000Z',
      endUtc: '2023-10-21T13:30:00.000Z',
      title: 'Liverpool v Everton',
      allDay: false,
    });
    expect(ledger['apisports-2'].allDay).toBe(true);
  });

  test('duplicate events for a LIVE fixture: first kept, rest surplus', () => {
    // `event()` is 2023-dated, so "now" has to be before it for the
    // fixture to still be live.
    const beforeIt = Date.parse('2023-10-20T00:00:00.000Z');
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(
      [
        event(),
        event({ eventId: 'evt-dup-a' }),
        event({ eventId: 'evt-dup-b' }),
      ],
      'cal-1',
      beforeIt,
    );
    expect(Object.keys(ledger)).toHaveLength(1);
    expect(ledger['apisports-1'].eventId).toBe('evt-1');
    expect(surplusEventIds).toEqual(['evt-dup-a', 'evt-dup-b']);
  });

  test('duplicate events for a FINISHED fixture are kept, not collected', () => {
    // The past-fixture rule outranks tidiness: a duplicate of a game that
    // has already been played stays in the calendar permanently, because
    // deleting a past event is exactly what the rule forbids. Owner's
    // explicit decision — see docs/DECISIONS.md 2026-07-31.
    const longAfter = Date.parse('2026-01-01T00:00:00.000Z');
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents(
      [event(), event({ eventId: 'evt-dup-a' })],
      'cal-1',
      longAfter,
    );
    // The fixture is still tracked — one entry, so prune sees a reference…
    expect(Object.keys(ledger)).toHaveLength(1);
    // …and the duplicate is left exactly where it is.
    expect(surplusEventIds).toEqual([]);
  });

  test('empty scan rebuilds nothing', () => {
    const { ledger, surplusEventIds } = entriesFromRecoveredEvents([], 'cal-1');
    expect(Object.keys(ledger)).toHaveLength(0);
    expect(surplusEventIds).toHaveLength(0);
  });
});

describe('orphanEventIds', () => {
  test('events unreferenced by the ledger are orphans', () => {
    const { ledger } = entriesFromRecoveredEvents([event()], 'cal-1');
    const orphans = orphanEventIds(
      [event(), event({ eventId: 'evt-orphan', fixtureId: 'apisports-9' })],
      ledger,
    );
    expect(orphans).toEqual(['evt-orphan']);
  });

  test('fully ledgered calendar has no orphans', () => {
    const events = [event(), event({ eventId: 'evt-2', fixtureId: 'apisports-2' })];
    const { ledger } = entriesFromRecoveredEvents(events, 'cal-1');
    expect(orphanEventIds(events, ledger)).toHaveLength(0);
  });
});

// ─── Scan windows (Stage 1c / F11) ────────────────────────────────────
//
// A single −5y…+3y predicate returned ZERO events from a calendar holding
// 1,790 of ours on iOS 26.5, while the same range returned all 964 on
// Android. Prune reads an empty scan as "no orphans" and recovery reads it
// as "no ledger to rebuild" — so the span is chunked.

import {
  scanWindows,
  SCAN_BACK_YEARS,
  SCAN_CHUNK_YEARS,
  SCAN_FORWARD_YEARS,
} from '../recovery';

const NOW = new Date('2026-07-31T12:00:00.000Z');
const years = (w: { start: Date; end: Date }): number =>
  (w.end.getTime() - w.start.getTime()) / (365.25 * 86_400_000);

describe('scanWindows', () => {
  test('covers the whole span with no gap between windows', () => {
    const ws = scanWindows(NOW);
    expect(ws.length).toBeGreaterThan(1);
    expect(ws[0].start.getUTCFullYear()).toBe(2021); // now − 5y
    expect(ws[ws.length - 1].end.getUTCFullYear()).toBe(2029); // now + 3y
    for (let i = 1; i < ws.length; i++) {
      // Contiguous: each window starts exactly where the last ended, so
      // nothing falls between two scans.
      expect(ws[i].start.getTime()).toBe(ws[i - 1].end.getTime());
    }
  });

  test('no window exceeds the chunk size', () => {
    for (const w of scanWindows(NOW)) {
      expect(years(w)).toBeLessThanOrEqual(SCAN_CHUNK_YEARS + 0.01);
    }
  });

  test('the chunk is comfortably under the span that returned nothing', () => {
    // 8 years was empirically dead on EventKit. Whatever the real ceiling
    // is, the chunk must sit well below it.
    expect(SCAN_CHUNK_YEARS).toBeLessThan(4);
    expect(SCAN_BACK_YEARS + SCAN_FORWARD_YEARS).toBe(8);
  });

  test('the final window is clamped to the horizon, never overshooting', () => {
    const ws = scanWindows(NOW);
    const last = ws[ws.length - 1];
    const limit = new Date(NOW);
    limit.setFullYear(limit.getFullYear() + SCAN_FORWARD_YEARS);
    expect(last.end.getTime()).toBe(limit.getTime());
  });

  test('an event on a window boundary is coverable by both — callers dedupe', () => {
    // Documents why scanCalendar keys by event id: boundaries touch, and
    // EventKit predicates are inclusive at both ends.
    const ws = scanWindows(NOW);
    expect(ws[0].end.getTime()).toBe(ws[1].start.getTime());
  });

  test('a shorter chunk simply yields more windows, same coverage', () => {
    const coarse = scanWindows(NOW, 4);
    const fine = scanWindows(NOW, 1);
    expect(fine.length).toBeGreaterThan(coarse.length);
    expect(fine[0].start.getTime()).toBe(coarse[0].start.getTime());
    expect(fine[fine.length - 1].end.getTime()).toBe(
      coarse[coarse.length - 1].end.getTime(),
    );
  });
});

// ─── Scan anomaly guard (Stage 1d item 2) ─────────────────────────────

import { isScanAnomaly } from '../recovery';
import { planSync } from '../syncPlan';
import { DEFAULT_PREFS } from '../prefs';

describe('isScanAnomaly', () => {
  test('an empty scan against a populated ledger is the impossible state', () => {
    // Exactly the F13 state: 1,790 of our events in the calendar, and the
    // scan returns nothing.
    expect(isScanAnomaly(0, 1752)).toBe(true);
    expect(isScanAnomaly(0, 1)).toBe(true);
  });

  test('an empty scan against an EMPTY ledger is ordinary', () => {
    // A fresh install with a fresh calendar. Nothing to contradict.
    expect(isScanAnomaly(0, 0)).toBe(false);
  });

  test('any non-empty scan is not an anomaly, however incomplete', () => {
    // The guard is deliberately narrow — it catches the total blackout,
    // not partial truncation, because only the blackout is provably
    // impossible rather than merely suspicious.
    expect(isScanAnomaly(1, 1752)).toBe(false);
    expect(isScanAnomaly(1752, 1752)).toBe(false);
  });
});

describe('a blind scan must not be allowed to conclude anything', () => {
  const entry = (id: string) => ({
    eventId: `ev-${id}`,
    calendarId: 'cal-1',
    startUtc: '2026-12-25T15:00:00.000Z',
    endUtc: '2026-12-25T17:00:00.000Z',
    title: 'A v B',
    allDay: false,
  });
  const ledger = { a: entry('a'), b: entry('b'), c: entry('c') };

  test('the engine stops BEFORE planning, so no delete op is ever produced', () => {
    // The guard runs between loading the ledger and calling planSync
    // (syncEngine.ts). This pins what it is protecting: were the pass
    // allowed to continue with an unreadable calendar and an empty fetch,
    // the planner would delete every ledgered event.
    expect(isScanAnomaly(0, Object.keys(ledger).length)).toBe(true);

    const wouldHavePlanned = planSync(
      [], // fetch returned nothing
      ledger,
      [], // and nothing is followed
      DEFAULT_PREFS,
      '2026-01-01T00:00:00.000Z',
      new Set(),
      new Set(),
      Date.parse('2026-12-01T00:00:00.000Z'), // fixtures still in the future
    );
    expect(wouldHavePlanned.filter((o) => o.op === 'delete')).toHaveLength(3);
  });

  test('prune itself cannot over-delete on a blind scan — it under-collects', () => {
    // Worth pinning so the guard is understood correctly: an empty scan
    // makes prune do NOTHING, which is why the damage showed up as
    // duplicates rather than as deletions.
    expect(orphanEventIds([], ledger)).toEqual([]);
  });
});
