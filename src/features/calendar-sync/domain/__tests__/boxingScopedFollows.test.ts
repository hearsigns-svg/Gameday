// B7 final shape, the no-churn invariant: one card carrying BOTH sexed
// keys, followed through BOTH sexed follows, is ONE calendar event —
// the planner's wanted-map is keyed by fixture id.

import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs } from '../prefs';
import { Ledger, planSync } from '../syncPlan';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  extraReminders: [null, null],
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  tournamentTier: 'block',
  autoDeletePast: false,
};

const card: Fixture = {
  id: 'tsdb-2593285',
  sport: 'boxing',
  competition: 'Major fight cards',
  competitionId: 'tsdb-league-4445',
  title: 'Mayer vs Cameron',
  followKeys: ['tsdb-league-4445', 'tsdb-league-4445-m', 'tsdb-league-4445-w'],
  startUtc: '2026-09-05T21:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'nominal',
  durationHours: 4,
  updatedAt: '2026-08-30T00:00:00.000Z',
};

const HORIZON = '2026-08-30T00:00:00.000Z';

test('both sexed follows + a both-keyed card = exactly one create', () => {
  const ops = planSync(
    [card],
    {} as Ledger,
    ['tsdb-league-4445-m', 'tsdb-league-4445-w'],
    PREFS,
    HORIZON,
  );
  expect(ops).toHaveLength(1);
  expect(ops[0].op).toBe('create');
});

test('a men-only card never reaches a women-only follower', () => {
  const mensOnly: Fixture = {
    ...card,
    id: 'tsdb-x',
    followKeys: ['tsdb-league-4445', 'tsdb-league-4445-m'],
  };
  expect(
    planSync([mensOnly], {} as Ledger, ['tsdb-league-4445-w'], PREFS, HORIZON),
  ).toEqual([]);
  // …while a migrated follower (both follows) still gets it once.
  expect(
    planSync(
      [mensOnly],
      {} as Ledger,
      ['tsdb-league-4445-m', 'tsdb-league-4445-w'],
      PREFS,
      HORIZON,
    ),
  ).toHaveLength(1);
});
