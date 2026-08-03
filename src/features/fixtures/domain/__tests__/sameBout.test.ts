// One real fight, one entry — the cross-provider bout dedupe. Pinned to
// the pair observed on-device 2026-08-03: the TSDB "Major fight cards"
// doc ("Time TBC") beside the PBC bout appearance ("23:00") for
// Romero–Lopez, both in the carousel and both headed for the calendar.

import { Fixture } from '../fixture';
import { dedupeSameBout, dedupeSameEvent } from '../sameBout';

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

describe('joint tennis tournaments — one tournament, two feeds (Prompt 9)', () => {
  const { dedupeSameEvent } = jest.requireActual<
    typeof import('../sameBout')
  >('../sameBout');
  const parent = (over: Partial<Fixture> & { id: string }): Fixture => ({
    sport: 'tennis',
    competition: 'ATP Tour',
    competitionId: 'tennis-atp',
    title: 'US Open',
    followKeys: ['tennis-atp', 'tennis-t-us-open'],
    startUtc: '2026-08-30T00:00:00.000Z',
    status: 'scheduled',
    durationHours: 15 * 24,
    timePrecision: 'date_only',
    updatedAt: '2026-08-03T00:00:00.000Z',
    ...over,
  });
  const icsDoc = parent({ id: 'tennis-28pln73q7br6q1565elv65bikk' });
  const wtaDoc = parent({
    id: 'wta-905-2026',
    competition: 'WTA Tour',
    competitionId: 'tennis-wta',
    followKeys: ['tennis-wta', 'tennis-t-us-open'],
    durationHours: 14 * 24,
  });

  test('the joint pair collapses; the WTA doc (the richer side) wins', () => {
    const out = dedupeSameEvent([icsDoc, wtaDoc]);
    expect(out.map((f) => f.id)).toEqual(['wta-905-2026']);
    expect(dedupeSameEvent([wtaDoc, icsDoc]).map((f) => f.id)).toEqual([
      'wta-905-2026',
    ]);
  });

  test('editions a year apart NEVER collapse — a Wimbledon follow yields every year', () => {
    const nextYear = parent({
      id: 'tennis-7uvqhvg8328fka8oqsu3383kt6',
      startUtc: '2027-08-29T00:00:00.000Z',
    });
    expect(dedupeSameEvent([icsDoc, nextYear])).toHaveLength(2);
  });

  test('different tournaments sharing a window never collapse', () => {
    const cincy = parent({
      id: 'tennis-4794lkna6clm0saahcuhjo274i',
      title: 'Cincinnati Open',
      followKeys: ['tennis-atp', 'tennis-t-cincinnati-open'],
      startUtc: '2026-08-13T00:00:00.000Z',
      durationHours: 11 * 24,
    });
    expect(dedupeSameEvent([icsDoc, cincy])).toHaveLength(2);
  });

  test('a pinned parent survives; appearances are never touched', () => {
    expect(
      dedupeSameEvent([icsDoc, wtaDoc], new Set([icsDoc.id])),
    ).toHaveLength(2);
    const appearance = parent({
      id: 'wta-905-2026-app-somebody-someone',
      parentFixtureId: 'wta-905-2026',
      followKeys: ['tennis-wta-appearances', 'athlete_000001', 'tennis-t-us-open'],
    });
    // Even if an appearance somehow carried the key, parentFixtureId
    // excludes it from the pair rule.
    expect(dedupeSameEvent([wtaDoc, appearance])).toHaveLength(2);
  });

  test('docs without a tournament key are untouched', () => {
    const legacy = parent({ id: 'tennis-legacydoc', followKeys: ['tennis-atp'] });
    expect(dedupeSameEvent([legacy, wtaDoc])).toHaveLength(2);
  });
});

// ── Tennis finals slot vs a followed finalist (Prompt 11) ─────────────

const slotDoc = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'wta-1045-2026-slot-final',
  sport: 'tennis',
  competition: 'WTA Tour',
  competitionId: 'tennis-wta-appearances',
  title: 'Jessica Pegula vs Alexandra Eala — Mubadala DC Open Final',
  followKeys: ['tennis-wta-appearances', 'tennis-t-dc-open-finals'],
  startUtc: '2026-08-02T17:30:00.000Z',
  status: 'scheduled',
  durationHours: 3,
  timePrecision: 'exact',
  confidence: 'confirmed',
  parentFixtureId: 'wta-1045-2026',
  athletes: ['Jessica Pegula', 'Alexandra Eala'],
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

const finalistApp = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'wta-1045-2026-app-jessica-pegula',
  sport: 'tennis',
  competition: 'WTA Tour',
  competitionId: 'tennis-wta-appearances',
  title: 'Jessica Pegula vs Alexandra Eala — Mubadala DC Open',
  followKeys: ['tennis-wta-appearances', 'athlete_000100'],
  startUtc: '2026-08-02T17:30:00.000Z',
  status: 'scheduled',
  durationHours: 3,
  timePrecision: 'exact',
  confidence: 'confirmed',
  parentFixtureId: 'wta-1045-2026',
  athletes: ['Jessica Pegula', 'Alexandra Eala'],
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
});

test('a confirmed finals slot yields to the FOLLOWED finalist’s appearance at the same instant', () => {
  const out = dedupeSameEvent(
    [slotDoc(), finalistApp()],
    new Set(),
    new Set(['tennis-t-dc-open', 'tennis-t-dc-open-finals', 'athlete_000100']),
  );
  expect(out.map((f) => f.id)).toEqual(['wta-1045-2026-app-jessica-pegula']);
});

test('REGRESSION: an UNWANTED twin never eats the slot — a pin slice key drags the whole tour into the fetch', () => {
  // The finalist's appearance arrived only because a pinned fixture's
  // 'tennis-wta-appearances' slice key joined the query; nothing
  // follows her. Dropping the slot would delete the followed final and
  // plan no replacement (review round, confirmed trace).
  const out = dedupeSameEvent(
    [slotDoc(), finalistApp()],
    new Set(),
    new Set(['tennis-t-dc-open', 'tennis-t-dc-open-finals']),
  );
  expect(out.map((f) => f.id).sort()).toEqual([
    'wta-1045-2026-app-jessica-pegula',
    'wta-1045-2026-slot-final',
  ]);
});

test('a PINNED twin counts as wanted', () => {
  const out = dedupeSameEvent(
    [slotDoc(), finalistApp()],
    new Set(['wta-1045-2026-app-jessica-pegula']),
    new Set(['tennis-t-dc-open', 'tennis-t-dc-open-finals']),
  );
  expect(out.map((f) => f.id)).toEqual(['wta-1045-2026-app-jessica-pegula']);
});

test('without follow-key context the finals rule stands down — keeping both beats deleting a wanted event', () => {
  const out = dedupeSameEvent([slotDoc(), finalistApp()]);
  expect(out.map((f) => f.id).sort()).toEqual([
    'wta-1045-2026-app-jessica-pegula',
    'wta-1045-2026-slot-final',
  ]);
});

test('a provisional slot coexists with a mid-week appearance — different statements, both stay', () => {
  const provisional = slotDoc({
    startUtc: '2026-08-02T00:00:00.000Z',
    timePrecision: 'date_only',
    confidence: 'provisional',
    durationHours: 24,
  });
  const midWeek = finalistApp({ startUtc: '2026-07-29T15:00:00.000Z' });
  const out = dedupeSameEvent([provisional, midWeek]);
  expect(out.map((f) => f.id).sort()).toEqual([
    'wta-1045-2026-app-jessica-pegula',
    'wta-1045-2026-slot-final',
  ]);
});

test('a slot with no matching appearance in the fetch survives — the tournament-only follower keeps the final', () => {
  const out = dedupeSameEvent([slotDoc()]);
  expect(out.map((f) => f.id)).toEqual(['wta-1045-2026-slot-final']);
});

test('a pinned slot is never dropped, even beside a followed twin', () => {
  const out = dedupeSameEvent(
    [slotDoc(), finalistApp()],
    new Set(['wta-1045-2026-slot-final']),
    new Set(['tennis-t-dc-open', 'tennis-t-dc-open-finals', 'athlete_000100']),
  );
  expect(out.map((f) => f.id).sort()).toEqual([
    'wta-1045-2026-app-jessica-pegula',
    'wta-1045-2026-slot-final',
  ]);
});
