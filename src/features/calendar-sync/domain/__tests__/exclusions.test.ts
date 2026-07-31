// Per-event opt-out: an excluded fixture behaves exactly like an
// unwanted one in the planner (delete if ledgered, never create), and
// restoring it re-creates on the next plan.

import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs } from '../prefs';
import { Ledger, planSync } from '../syncPlan';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  autoDeletePast: false,
};
const HORIZON = '2026-07-01T00:00:00.000Z';

function fixture(id: string): Fixture {
  return {
    id,
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: 'fdorg-comp-PL',
    title: `Match ${id}`,
    followKeys: ['fdorg-team-64'],
    startUtc: '2026-08-23T14:00:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: HORIZON,
  };
}

const FOLLOWS = ['fdorg-team-64'];

it('an excluded fixture is never created', () => {
  const ops = planSync(
    [fixture('a'), fixture('b')],
    {},
    FOLLOWS,
    PREFS,
    HORIZON,
    new Set(['a']),
  );
  expect(ops).toHaveLength(1);
  expect(ops[0].op).toBe('create');
  if (ops[0].op === 'create') expect(ops[0].fixture.id).toBe('b');
});

it('excluding a ledgered fixture deletes its event; restoring re-creates it', () => {
  const ledger: Ledger = {
    a: {
      eventId: 'ev-a',
      calendarId: 'cal',
      startUtc: '2026-08-23T14:00:00.000Z',
      endUtc: '2026-08-23T16:00:00.000Z',
      title: 'Match a',
      allDay: false,
    },
  };
  const removed = planSync(
    [fixture('a')],
    ledger,
    FOLLOWS,
    PREFS,
    HORIZON,
    new Set(['a']),
  );
  expect(removed).toHaveLength(1);
  expect(removed[0].op).toBe('delete');

  // Exclusion cleared, event gone from the ledger → created again.
  const restored = planSync([fixture('a')], {}, FOLLOWS, PREFS, HORIZON);
  expect(restored).toHaveLength(1);
  expect(restored[0].op).toBe('create');
});
