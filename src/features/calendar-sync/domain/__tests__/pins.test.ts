// Per-event opt-IN: a pin adds ONE fixture without following anything,
// an exclusion always wins over it, and pins age out like exclusions.

import { Fixture } from '../../../fixtures/domain/fixture';
import { isWanted, PinMap, prunePins } from '../pins';
import { CalendarPrefs } from '../prefs';
import { planSync } from '../syncPlan';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  autoDeletePast: false,
};
const HORIZON = '2026-07-01T00:00:00.000Z';
const DAY = 86_400_000;

function fixture(id: string, followKeys: string[] = ['comp-x']): Fixture {
  return {
    id,
    sport: 'soccer',
    competition: 'FA Cup',
    competitionId: 'comp-x',
    title: `Match ${id}`,
    followKeys,
    startUtc: '2026-08-23T14:00:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: HORIZON,
  };
}

describe('planner', () => {
  it('creates a pinned fixture even with NOTHING followed', () => {
    const ops = planSync(
      [fixture('a'), fixture('b')],
      {},
      [], // no follows at all
      PREFS,
      HORIZON,
      new Set(),
      new Set(['a']),
    );
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('create');
    if (ops[0].op === 'create') expect(ops[0].fixture.id).toBe('a');
  });

  it('an exclusion beats a pin — an explicit remove always wins', () => {
    const ops = planSync(
      [fixture('a')],
      {},
      [],
      PREFS,
      HORIZON,
      new Set(['a']), // excluded
      new Set(['a']), // and pinned
    );
    expect(ops).toHaveLength(0);
  });

  it('unpinning removes the event the pin created', () => {
    const ledger = {
      a: {
        eventId: 'ev-a',
        calendarId: 'cal',
        startUtc: '2026-08-23T14:00:00.000Z',
        endUtc: '2026-08-23T16:00:00.000Z',
        title: 'Match a',
        allDay: false,
      },
    };
    const ops = planSync([fixture('a')], ledger, [], PREFS, HORIZON, new Set(), new Set());
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('delete');
  });

  it('a follow still works with no pins (unchanged behaviour)', () => {
    const ops = planSync([fixture('a')], {}, ['comp-x'], PREFS, HORIZON);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('create');
  });
});

describe('isWanted', () => {
  const pins = new Set(['pinned']);
  const excl = new Set(['gone']);
  it('follows, pins, and exclusions compose predictably', () => {
    expect(isWanted(['comp-x'], 'f1', ['comp-x'], pins, excl)).toBe(true);
    expect(isWanted(['other'], 'pinned', [], pins, excl)).toBe(true);
    expect(isWanted(['comp-x'], 'gone', ['comp-x'], pins, excl)).toBe(false);
    expect(isWanted(['other'], 'f2', ['comp-x'], pins, excl)).toBe(false);
  });
});

it('pins age out, and a corrupt stamp is repaired not dropped', () => {
  const now = Date.parse('2026-07-30T00:00:00.000Z');
  const map: PinMap = {
    fresh: { id: 'fresh', title: 't', startUtc: '', competition: '', sport: '', followKey: 'k', at: new Date(now - 30 * DAY).toISOString() },
    stale: { id: 'stale', title: 't', startUtc: '', competition: '', sport: '', followKey: 'k', at: new Date(now - 500 * DAY).toISOString() },
    bad: { id: 'bad', title: 't', startUtc: '', competition: '', sport: '', followKey: 'k', at: 'nonsense' },
  };
  const kept = prunePins(map, now);
  expect(kept).toHaveProperty('fresh');
  expect(kept).not.toHaveProperty('stale');
  expect(kept.bad.at).toBe(new Date(now).toISOString());
});
