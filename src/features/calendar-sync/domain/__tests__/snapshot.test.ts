// The presentation snapshot must show exactly what the calendar wants:
// never a cancelled fixture (deleted by the same sync), never a
// race-only-excluded support session — while keeping honest tbd and
// postponed placeholders. And ALL of it: the snapshot is uncapped
// (Round 5 ruling 4) — Schedule pages it by date window, so nothing the
// calendar wants may be trimmed before the screen sees it.

import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs } from '../prefs';
import { upcomingSnapshot } from '../syncPlan';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  extraReminders: [null, null],
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  // Round 3 B3: 'block' keeps these suites' pre-tier expectations —
  // they pin other features.
  tournamentTier: 'block',
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
  );
  expect(raceOnly.map((f) => f.id)).toEqual(['race']);
  expect(upcomingSnapshot(sessions, PREFS, HORIZON)).toHaveLength(2);
});

it('drops past fixtures and sorts ascending — nothing is trimmed', () => {
  const snap = upcomingSnapshot(
    [
      fixture({ id: 'past', startUtc: '2026-07-01T14:00:00.000Z' }),
      fixture({ id: 'later', startUtc: '2026-09-01T14:00:00.000Z' }),
      fixture({ id: 'sooner', startUtc: '2026-08-01T14:00:00.000Z' }),
      fixture({ id: 'mid', startUtc: '2026-08-15T14:00:00.000Z' }),
    ],
    PREFS,
    HORIZON,
  );
  expect(snap.map((f) => f.id)).toEqual(['sooner', 'mid', 'later']);
});

it('the full upcoming set survives: 200 fixtures in, 200 out, by start (Round 5 ruling 4)', () => {
  // Seven hours apart from 1 Aug 2026 — every one after the horizon —
  // handed over in REVERSE so the ordering is the snapshot's own work.
  const many = Array.from({ length: 200 }, (_, i) =>
    fixture({
      id: `f-${i}`,
      startUtc: new Date(
        Date.UTC(2026, 7, 1, 12) + i * 7 * 3_600_000,
      ).toISOString(),
    }),
  ).reverse();
  const snap = upcomingSnapshot(many, PREFS, HORIZON);
  expect(snap).toHaveLength(200);
  expect(snap[0].id).toBe('f-0');
  expect(snap[199].id).toBe('f-199');
  const starts = snap.map((f) => f.startUtc);
  expect(starts).toEqual([...starts].sort());
});
