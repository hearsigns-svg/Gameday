// Round 3 B3 — tournament calendar tiers. The pass reshapes what the
// planner sees; these pins are the finalised model's contract.

import { Fixture } from '../../../fixtures/domain/fixture';
import { CalendarPrefs } from '../prefs';
import { desiredEventFor } from '../syncPlan';
import {
  applyTournamentTiers,
  CLOSE_ID_SUFFIX,
  isBlockParent,
  isKeyRound,
  TOURNAMENT_POINTER_NOTE,
} from '../tournamentTiers';

const PREFS: CalendarPrefs = {
  reminderMinutes: null,
  extraReminders: [null, null],
  allDayReminder: null,
  eventStyle: 'timed',
  seriesSessions: 'all',
  tournamentTier: 'key',
  autoDeletePast: false,
};

const parent: Fixture = {
  id: 'wta-905-2026',
  sport: 'tennis',
  competition: 'US Open',
  competitionId: 'tennis-wta',
  title: 'US Open',
  followKeys: ['tennis-wta', 'tennis-t-us-open'],
  startUtc: '2026-08-31T00:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'date_only',
  durationHours: 360, // 15 days
  updatedAt: '2026-08-29T00:00:00.000Z',
};

const match = (id: string, title: string): Fixture => ({
  id,
  sport: 'tennis',
  competition: 'US Open',
  competitionId: 'tennis-wta-appearances',
  title,
  followKeys: ['tennis-wta-appearances'],
  parentFixtureId: parent.id,
  startUtc: '2026-09-12T15:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'exact',
  durationHours: 3,
  updatedAt: '2026-08-29T00:00:00.000Z',
});

const FOLLOWED = ['tennis-t-us-open'];

test('the block shape is structural — every sport rides the same rule', () => {
  expect(isBlockParent(parent)).toBe(true);
  expect(isBlockParent(match('x', 'A vs B'))).toBe(false); // a child
  expect(
    isBlockParent({ ...parent, timePrecision: 'exact' }), // timed
  ).toBe(false);
  expect(
    isBlockParent({ ...parent, durationHours: 4 }), // single-day
  ).toBe(false);
  expect(isBlockParent({ ...parent, status: 'postponed' })).toBe(false);
});

test('key tier: block becomes two bookends, key-round matches between', () => {
  const final = match('m-final', 'Anisimova vs Gauff — Final');
  const r1 = match('m-r1', 'Eala vs Stoiana');
  const out = applyTournamentTiers([parent], 'key', FOLLOWED, {
    byParent: new Map([[parent.id, [final, r1]]]),
  });
  expect(out.map((f) => f.id)).toEqual([
    parent.id, // the opening note KEEPS the parent id — morphs in place
    `${parent.id}${CLOSE_ID_SUFFIX}`,
    'm-final',
  ]);
  const [open, close, kept] = out;
  expect(open.title).toBe('US Open begins');
  expect(close.title).toBe('US Open — final day');
  expect(close.startUtc).toBe('2026-09-14T00:00:00.000Z'); // day 15
  // The kept match rides the follow that carried its tournament.
  expect(kept.followKeys).toContain('tennis-t-us-open');
  // The first-round match is not a key round — bookends say the rest.
  expect(out.some((f) => f.id === 'm-r1')).toBe(false);
});

test('all tier keeps every match', () => {
  const out = applyTournamentTiers([parent], 'all', FOLLOWED, {
    byParent: new Map([
      [parent.id, [match('m-1', 'A vs B'), match('m-2', 'C vs D')]],
    ]),
  });
  expect(out).toHaveLength(4); // open + close + both matches
});

test('a single-day tournament stays its one note — never a bookend pair', () => {
  // Span maths (dateOnlySpanDays ROUNDS): 30h is a one-day span, so a
  // one-day tournament is not a block parent at all — it keeps its
  // ordinary single all-day banner, which IS the collapsed note.
  const oneDay = { ...parent, durationHours: 30 };
  expect(applyTournamentTiers([oneDay], 'key', FOLLOWED)).toEqual([oneDay]);
  // The shortest real block (36h → 2-day span) gets both notes.
  const two = applyTournamentTiers(
    [{ ...parent, durationHours: 36 }],
    'key',
    FOLLOWED,
  );
  expect(two.map((f) => f.title)).toEqual([
    'US Open begins',
    'US Open — final day',
  ]);
  expect(two[1].startUtc).toBe('2026-09-01T00:00:00.000Z');
});

test('block tier: pointer only where the card actually offers matches', () => {
  const withKids = applyTournamentTiers([parent], 'block', FOLLOWED, {
    byParent: new Map([[parent.id, [match('m-1', 'A vs B')]]]),
  });
  expect(withKids[0].tournamentPointer).toBe(true);
  const noKids = applyTournamentTiers([parent], 'block', FOLLOWED);
  expect(noKids[0].tournamentPointer).toBeUndefined();
});

test('an unfollowed tournament is not this feature’s business', () => {
  const out = applyTournamentTiers([parent], 'key', ['somebody-else'], {
    byParent: new Map([[parent.id, [match('m-1', 'The Final')]]]),
  });
  expect(out).toEqual([parent]);
});

test('cancelled children never reach the planner as creates', () => {
  const dead = { ...match('m-x', 'A vs B — Final'), status: 'cancelled' as const };
  const out = applyTournamentTiers([parent], 'all', FOLLOWED, {
    byParent: new Map([[parent.id, [dead]]]),
  });
  expect(out.some((f) => f.id === 'm-x')).toBe(false);
});

test('key rounds read title segments, never the competition’s own name', () => {
  expect(isKeyRound(match('a', 'Sinner vs Alcaraz — Final'))).toBe(true);
  expect(isKeyRound(match('b', 'Semifinal: Gauff vs Swiatek'))).toBe(true);
  expect(isKeyRound(match('c', 'Quarter-final — day session'))).toBe(true);
  expect(isKeyRound(match('d', 'PGA Championship — Final Round'))).toBe(true);
  // The tournament-name suffix every tennis appearance carries.
  expect(isKeyRound(match('e', 'Eala vs Stoiana — US Open'))).toBe(false);
  // A tournament NAMED "…Finals" must not make every match a key round.
  const atpFinals = {
    ...match('f', 'Sinner vs Zverev — Nitto ATP Finals'),
    competition: 'Nitto ATP Finals',
  };
  expect(isKeyRound(atpFinals)).toBe(false);
  expect(
    isKeyRound({ ...atpFinals, title: 'Sinner vs Zverev — Final' }),
  ).toBe(true);
});

test('bookend notes: single-day all-day, never “time TBC”, pointer on OPEN only', () => {
  const [open, close] = applyTournamentTiers([parent], 'key', FOLLOWED);
  const openEvent = desiredEventFor(open, PREFS);
  const closeEvent = desiredEventFor(close, PREFS);
  expect(openEvent).toMatchObject({
    title: 'US Open begins',
    allDay: true,
    startUtc: '2026-08-31T00:00:00.000Z',
    endUtc: '2026-09-01T00:00:00.000Z',
    note: TOURNAMENT_POINTER_NOTE,
  });
  expect(closeEvent).toMatchObject({
    title: 'US Open — final day',
    allDay: true,
    startUtc: '2026-09-14T00:00:00.000Z',
  });
  expect(closeEvent?.note).toBeUndefined();
  expect(openEvent?.title).not.toContain('TBC');
});

test('tier-1 block carries the pointer in its description', () => {
  const [block] = applyTournamentTiers([parent], 'block', FOLLOWED, {
    byParent: new Map([[parent.id, [match('m-1', 'A vs B')]]]),
  });
  expect(desiredEventFor(block, PREFS)?.note).toBe(TOURNAMENT_POINTER_NOTE);
  // Span shape unchanged from what blocks always were.
  expect(desiredEventFor(block, PREFS)).toMatchObject({
    allDay: true,
    startUtc: '2026-08-31T00:00:00.000Z',
    endUtc: '2026-09-15T00:00:00.000Z',
  });
});

test('a structured round beats title text — in BOTH directions', () => {
  const staged = (round: 'f' | 'sf' | 'qf' | 'r32', title: string) => ({
    ...match('s', title),
    stage: { round, label: 'x' },
  });
  expect(isKeyRound(staged('f', 'Eala vs Stoiana — US Open'))).toBe(true);
  expect(isKeyRound(staged('qf', 'A vs B'))).toBe(true);
  // Stated r32 wins over a title that happens to say "Final".
  expect(isKeyRound(staged('r32', 'A vs B — Final'))).toBe(false);
});
