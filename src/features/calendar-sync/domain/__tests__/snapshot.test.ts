// The presentation snapshot must show exactly what the calendar wants:
// never a cancelled fixture (deleted by the same sync), never a
// race-only-excluded support session — while keeping honest tbd and
// postponed placeholders.

import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs } from '../prefs';
import { upcomingSnapshot } from '../syncPlan';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  extraReminders: [null, null],
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  autoDeletePast: false,
};

const HORIZON = '2026-07-29T00:00:00.000Z';

function fixture(over: Partial<Fixture>): Fixture {
  return {
    id: 'f-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: 'fdorg-comp-PL',
    title: 'Home v Away',
    followKeys: ['fdorg-team-64'],
    startUtc: '2026-08-23T14:00:00.000Z',
    venueTz: 'Europe/London',
    status: 'scheduled',
    updatedAt: '2026-07-29T00:00:00.000Z',
    ...over,
  };
}

it('excludes cancelled fixtures — the calendar deletes them in the same run', () => {
  const snap = upcomingSnapshot(
    [fixture({ id: 'a', status: 'cancelled' }), fixture({ id: 'b' })],
    PREFS,
    HORIZON,
    60,
  );
  expect(snap.map((f) => f.id)).toEqual(['b']);
});

it('keeps tbd and postponed placeholders (they exist in the calendar)', () => {
  const snap = upcomingSnapshot(
    [
      fixture({ id: 'a', status: 'tbd' }),
      fixture({ id: 'b', status: 'postponed' }),
    ],
    PREFS,
    HORIZON,
    60,
  );
  expect(snap).toHaveLength(2);
});

it('excludes support sessions under race-only, keeps them under all', () => {
  const sessions = [
    fixture({ id: 'practice', sport: 'f1', sessionKind: 'support' }),
    fixture({ id: 'race', sport: 'f1', sessionKind: 'race' }),
  ];
  const raceOnly = upcomingSnapshot(
    sessions,
    { ...PREFS, seriesSessions: 'race-only' },
    HORIZON,
    60,
  );
  expect(raceOnly.map((f) => f.id)).toEqual(['race']);
  expect(upcomingSnapshot(sessions, PREFS, HORIZON, 60)).toHaveLength(2);
});

it('drops past fixtures, sorts ascending, and honours the cap', () => {
  const snap = upcomingSnapshot(
    [
      fixture({ id: 'past', startUtc: '2026-07-01T14:00:00.000Z' }),
      fixture({ id: 'later', startUtc: '2026-09-01T14:00:00.000Z' }),
      fixture({ id: 'sooner', startUtc: '2026-08-01T14:00:00.000Z' }),
      fixture({ id: 'mid', startUtc: '2026-08-15T14:00:00.000Z' }),
    ],
    PREFS,
    HORIZON,
    2,
  );
  expect(snap.map((f) => f.id)).toEqual(['sooner', 'mid']);
});
