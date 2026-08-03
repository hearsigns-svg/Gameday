// One real fight, one entry — the cross-provider bout dedupe. Pinned to
// the pair observed on-device 2026-08-03: the TSDB "Major fight cards"
// doc ("Time TBC") beside the PBC bout appearance ("23:00") for
// Romero–Lopez, both in the carousel and both headed for the calendar.

import { Fixture } from '../fixture';
import { dedupeSameBout } from '../sameBout';

const base = (over: Partial<Fixture> & { id: string }): Fixture => ({
  sport: 'boxing',
  competition: 'Boxing',
  competitionId: 'tsdb-league-4445',
  title: 'Rolando Romero vs Teofimo Lopez',
  homeTeam: 'Rolando Romero',
  awayTeam: 'Teofimo Lopez',
  followKeys: ['tsdb-league-4445'],
  startUtc: '2026-08-22T00:00:00.000Z',
  status: 'tbd',
  durationHours: 3,
  updatedAt: '2026-08-03T00:00:00.000Z',
  ...over,
});

// The observed pair, verbatim shapes.
const tsdbCard = base({ id: 'tsdb-2540001' }); // midnight sentinel, tbd → date_only
const pbcBout = base({
  id: 'pbc-fight-night-august-22-2026-app-rolando-romero-teofimo-lopez',
  competition: 'Premier Boxing Champions',
  competitionId: 'pbc-cards-appearances',
  followKeys: ['pbc-cards-appearances', 'athlete-rolando-romero', 'athlete-teofimo-lopez'],
  startUtc: '2026-08-22T22:00:00.000Z',
  status: 'scheduled',
  timePrecision: 'nominal',
  confidence: 'provisional',
  parentFixtureId: 'pbc-fight-night-august-22-2026',
  athletes: ['Rolando Romero', 'Teofimo Lopez'],
});

test('THE OBSERVED BUG: TSDB card + PBC bout of one fight collapse to the better-informed doc', () => {
  const out = dedupeSameBout([tsdbCard, pbcBout]);
  expect(out.map((f) => f.id)).toEqual([pbcBout.id]); // nominal beats date_only
});

test('participant order and diacritics cannot defeat the pair identity', () => {
  const swapped = base({
    id: 'tsdb-2540002',
    homeTeam: 'Teófimo López',
    awayTeam: 'Rolando Romero',
  });
  expect(dedupeSameBout([swapped, pbcBout])).toHaveLength(1);
});

test('an undercard bout never collides with its card — two real things, two entries', () => {
  const undercard = base({
    id: 'pbc-fight-night-august-22-2026-app-carlos-utria-israel-mercado',
    homeTeam: 'Carlos Utria',
    awayTeam: 'Israel Mercado',
    parentFixtureId: 'pbc-fight-night-august-22-2026',
    startUtc: '2026-08-22T22:00:00.000Z',
  });
  expect(dedupeSameBout([tsdbCard, undercard])).toHaveLength(2);
});

test('a rematch outside the 36h window is a different fight', () => {
  const rematch = base({
    id: 'tsdb-2599999',
    startUtc: '2026-11-14T00:00:00.000Z',
  });
  expect(dedupeSameBout([tsdbCard, rematch])).toHaveLength(2);
});

test('team sports are never touched — league and cup are two real fixtures', () => {
  const league = base({
    id: 'fdorg-1',
    sport: 'soccer',
    homeTeam: 'Chelsea',
    awayTeam: 'Arsenal',
  });
  const cup = base({
    id: 'tsdb-2',
    sport: 'soccer',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    startUtc: '2026-08-22T19:00:00.000Z',
  });
  expect(dedupeSameBout([league, cup])).toHaveLength(2);
});

test('at equal precision the APPEARANCE wins; ties break by id, deterministically', () => {
  const cardNominal = base({
    id: 'tsdb-2540001',
    status: 'scheduled',
    timePrecision: 'nominal',
    startUtc: '2026-08-22T21:00:00.000Z',
  });
  const out = dedupeSameBout([cardNominal, pbcBout]);
  expect(out.map((f) => f.id)).toEqual([pbcBout.id]);
  // Input order must not matter.
  expect(dedupeSameBout([pbcBout, cardNominal]).map((f) => f.id)).toEqual([
    pbcBout.id,
  ]);
});

test('a pinned doc is never dropped — an explicit pin outranks the dedupe', () => {
  const out = dedupeSameBout([tsdbCard, pbcBout], new Set([tsdbCard.id]));
  expect(out).toHaveLength(2);
});

test('cancelled docs pass through so their deletion propagates', () => {
  const cancelled = { ...tsdbCard, status: 'cancelled' as const };
  const out = dedupeSameBout([cancelled, pbcBout]);
  expect(out).toHaveLength(2);
});

test('participantless cards are untouched', () => {
  const bare = base({
    id: 'tsdb-2541772',
    title: 'UFC Fight Night 290',
    homeTeam: undefined,
    awayTeam: undefined,
  });
  expect(dedupeSameBout([bare, pbcBout])).toHaveLength(2);
});
