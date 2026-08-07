// Canonical athlete identity — the matcher, the roster reconciliation,
// and the two failures this stage exists to close: F31 (a compound
// surname defeating a word-count gate) and F34 (two athletes, one
// rendered name, one surviving doc). The rules pinned here are the
// brief's, verbatim:
//   full name + provider id            → certain
//   full name, unique in the directory → confident
//   surname, or matching more than one → ambiguous: no link, no key
//   MISSES_BEFORE_INACTIVE roster absences → inactive, NEVER deleted

import {
  Athlete,
  athleteIdFrom,
  buildAthleteIndex,
  isCanonicalAthleteKey,
  matchAthlete,
  MISSES_BEFORE_INACTIVE,
  reconcileRoster,
  resolveDrafts,
  rosterAthlete,
  RosterEntry,
  stampDriverKeys,
} from '../athletes';
import { appearanceFor } from '../appearances';
import { Fixture } from '../fixture';
import { athleteNames, normaliseName, toSearchName } from '../identity';

const NOW = '2026-08-03T00:00:00.000Z';

const athlete = (over: Partial<Athlete> & { id: string }): Athlete => ({
  ...athleteNames(over.displayName ?? 'Nobody'),
  sport: 'tennis',
  providerIds: {},
  identities: [],
  provenance: 'roster',
  nameKeyed: true,
  active: true,
  missedRefreshes: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('canonical ids', () => {
  test('format, and the range guard', () => {
    expect(athleteIdFrom(184)).toBe('athlete_000184');
    expect(isCanonicalAthleteKey('athlete_000184')).toBe(true);
    expect(isCanonicalAthleteKey('athlete-teofimo-lopez')).toBe(false);
    expect(() => athleteIdFrom(0)).toThrow();
    expect(() => athleteIdFrom(1_000_000)).toThrow();
  });
});

describe('matchAthlete — the certainty ladder', () => {
  const sabalenka = athlete({
    id: 'athlete_000001',
    displayName: 'Aryna Sabalenka',
    providerIds: { wta: '320760' },
    nameKeyed: false,
  });
  const lopez = athlete({
    id: 'athlete_000002',
    displayName: 'Teofimo Lopez',
    sport: 'boxing',
  });
  const garcia1 = athlete({
    id: 'athlete_000003',
    displayName: 'Maria Garcia',
    providerIds: { wta: '111' },
    nameKeyed: false,
  });
  const garcia2 = athlete({
    id: 'athlete_000004',
    displayName: 'Maria Garcia',
    providerIds: { wta: '222' },
    nameKeyed: false,
  });
  const index = buildAthleteIndex([sabalenka, lopez, garcia1, garcia2]);

  test('provider id → CERTAIN, whatever the rendered name', () => {
    const m = matchAthlete(index, 'tennis', {
      name: 'A. Sabalenka',
      source: 'wta',
      externalId: '320760',
    });
    expect(m.kind).toBe('certain');
    expect(m.athlete!.id).toBe('athlete_000001');
  });

  test('unknown provider id with an id-backed name match → unknown (a DIFFERENT person), never a merge', () => {
    // Sabalenka already carries wta:320760; an entry claiming the same
    // name under wta:999999 is somebody else (or feed corruption) —
    // merging would hand her follows to the wrong record.
    expect(
      matchAthlete(index, 'tennis', {
        name: 'Aryna Sabalenka',
        source: 'wta',
        externalId: '999999',
      }).kind,
    ).toBe('unknown');
  });

  test('REGRESSION: an id arriving for a NAME-KEYED athlete upgrades, never twins', () => {
    // A WTA player minted name-keyed from a draw whose PlayerID was
    // blank must become ONE athlete when her id shows up — the
    // id-backed twin poisoned the name forever (review round).
    const nameKeyed = athlete({
      id: 'athlete_000050',
      displayName: 'Maya Joint',
      providerIds: {},
    });
    const m = matchAthlete(buildAthleteIndex([nameKeyed]), 'tennis', {
      name: 'Maya Joint',
      source: 'wta',
      externalId: '334444',
    });
    expect(m.kind).toBe('confident');
    expect(m.athlete!.id).toBe('athlete_000050');
    // And through reconcileRoster the identity attaches with the id.
    const r = reconcileRoster(
      [nameKeyed],
      [
        {
          source: 'wta',
          externalId: '334444',
          name: 'Maya Joint',
          sport: 'tennis',
          rank: 150,
        },
      ],
      NOW,
    );
    expect(r.toCreate).toHaveLength(0);
    const patch = r.toUpdate.find((u) => u.id === 'athlete_000050')!.patch;
    expect(patch.providerIds).toEqual({ wta: '334444' });
    expect(patch.nameKeyed).toBe(false);
  });

  test('unique full name → CONFIDENT; diacritics fold', () => {
    const m = matchAthlete(index, 'boxing', { name: 'Teófimo López' });
    expect(m.kind).toBe('confident');
    expect(m.athlete!.id).toBe('athlete_000002');
  });

  test('a surname is not an identity — ambiguous even when unique', () => {
    expect(matchAthlete(index, 'boxing', { name: 'Lopez' }).kind).toBe(
      'ambiguous',
    );
  });

  test('a name matching two athletes is ambiguous', () => {
    expect(matchAthlete(index, 'tennis', { name: 'Maria Garcia' }).kind).toBe(
      'ambiguous',
    );
  });

  test('sport scopes the name space — a boxer never matches a tennis query', () => {
    expect(matchAthlete(index, 'tennis', { name: 'Teofimo Lopez' }).kind).toBe(
      'unknown',
    );
  });

  test('aliases match too', () => {
    const withAlias = buildAthleteIndex([
      athlete({
        id: 'athlete_000005',
        displayName: 'Alexandra Eala',
        aliases: [toSearchName('Alex Eala')],
      }),
    ]);
    expect(matchAthlete(withAlias, 'tennis', { name: 'Alex Eala' }).kind).toBe(
      'confident',
    );
  });
});

describe('F34 — two players, one rendered name', () => {
  const parent: Fixture = {
    id: 'wta-1045-2026',
    sport: 'tennis',
    competition: 'WTA Tour',
    competitionId: 'tennis-wta',
    title: 'Somewhere Open',
    followKeys: ['tennis-wta'],
    startUtc: '2026-08-01T00:00:00.000Z',
    status: 'scheduled',
    durationHours: 168,
    timePrecision: 'date_only',
    updatedAt: NOW,
  };
  const garcia1 = athlete({
    id: 'athlete_000003',
    displayName: 'Maria Garcia',
    providerIds: { wta: '111' },
  });
  const garcia2 = athlete({
    id: 'athlete_000004',
    displayName: 'Maria Garcia',
    providerIds: { wta: '222' },
  });

  test('distinct ids at one name-built doc id: first kept, second REFUSED loudly', () => {
    const drafts = ['111', '222'].map(
      (id) =>
        appearanceFor(parent, {
          refs: [{ name: 'Maria Garcia', source: 'wta', externalId: id }],
          title: 'Maria Garcia — Somewhere Open',
          updatedAt: NOW,
        })!,
    );
    const r = resolveDrafts(drafts, buildAthleteIndex([garcia1, garcia2]), {
      create: 'structured',
    });
    // One doc survives (the ids collide on the name-built appearance id
    // — extending the id scheme is gated on an owner ruling), and the
    // collision is COUNTED, never silently absorbed. The surviving doc
    // carries only the surviving player's key: the other player's
    // follower gets nothing rather than someone else's schedule.
    expect(r.appearances).toHaveLength(1);
    expect(r.appearances[0].followKeys).toEqual([
      'tennis-wta-appearances',
      'athlete_000003',
    ]);
    expect(r.counts.nameCollisions).toBeGreaterThanOrEqual(1);
    expect(r.collisionDetails.length).toBeGreaterThanOrEqual(1);
  });
});

describe('roster reconciliation', () => {
  const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
    source: 'wta',
    externalId: '320760',
    name: 'Aryna Sabalenka',
    sport: 'tennis',
    grouping: 'WTA Tour',
    groupingKey: 'wta',
    rank: 1,
    countryCode: 'BLR',
    ...over,
  });

  test('a new entry creates; an id-matched entry updates in place', () => {
    const fresh = reconcileRoster([], [entry()], NOW);
    expect(fresh.toCreate).toHaveLength(1);
    const existing = rosterAthlete('athlete_000001', entry(), NOW);
    const again = reconcileRoster(
      [existing],
      [entry({ rank: 3, name: 'A. Sabalenka' })],
      '2026-08-10T00:00:00.000Z',
    );
    expect(again.toCreate).toHaveLength(0);
    const patch = again.toUpdate.find((u) => u.id === 'athlete_000001')!.patch;
    expect(patch.rank).toBe(3);
    // The drifted name form becomes an alias, so search finds both.
    expect(patch.aliases).toContain(normaliseName('A. Sabalenka'));
  });

  test('an id-less roster entry attaches to a unique name match — one athlete, two identities', () => {
    // An IBF-rated boxer who already exists as a PBC fixture-derived
    // athlete must become ONE athlete, not two.
    const pbcDerived = athlete({
      id: 'athlete_000009',
      displayName: 'Gary Antonio Russell',
      sport: 'boxing',
      provenance: 'fixture_derived',
      identities: [
        { source: 'pbc', externalId: null, name: 'Gary Antonio Russell', lastSeenAt: NOW },
      ],
    });
    const r = reconcileRoster(
      [pbcDerived],
      [
        entry({
          source: 'ibf',
          externalId: null,
          name: 'Gary Antonio Russell',
          sport: 'boxing',
          grouping: 'Bantamweight',
          groupingKey: 'boxing-bantamweight',
          rank: 4,
        }),
      ],
      NOW,
    );
    expect(r.toCreate).toHaveLength(0);
    const patch = r.toUpdate.find((u) => u.id === 'athlete_000009')!.patch;
    expect(patch.identities).toHaveLength(2);
    expect(patch.rank).toBe(4);
  });

  test('an id-less entry matching TWO athletes is skipped and reported, never guessed', () => {
    const g1 = athlete({ id: 'athlete_000003', displayName: 'Maria Garcia' });
    const g2 = athlete({ id: 'athlete_000004', displayName: 'Maria Garcia' });
    const r = reconcileRoster(
      [g1, g2],
      [entry({ externalId: null, name: 'Maria Garcia' })],
      NOW,
    );
    expect(r.toCreate).toHaveLength(0);
    expect(r.skippedAmbiguous).toEqual(['wta: Maria Garcia']);
  });

  test('absence marks inactive after MISSES_BEFORE_INACTIVE — and NEVER deletes', () => {
    const a = rosterAthlete('athlete_000001', entry(), NOW);
    const first = reconcileRoster([a], [entry({ externalId: '999', name: 'Somebody New' })], NOW);
    const patch1 = first.toUpdate.find((u) => u.id === 'athlete_000001')!.patch;
    expect(patch1.missedRefreshes).toBe(1);
    expect(patch1.active).toBeUndefined(); // one miss is not inactivity
    // A stale rank is a lie the moment the athlete drops off the list.
    expect('rank' in patch1 && patch1.rank === undefined).toBe(true);

    const missed = { ...a, missedRefreshes: MISSES_BEFORE_INACTIVE - 1 };
    const second = reconcileRoster(
      [missed],
      [entry({ externalId: '999', name: 'Somebody New' })],
      NOW,
    );
    const patch2 = second.toUpdate.find((u) => u.id === 'athlete_000001')!.patch;
    expect(patch2.active).toBe(false);
  });

  test('re-appearance reactivates and zeroes the miss counter', () => {
    const inactive = {
      ...rosterAthlete('athlete_000001', entry(), NOW),
      active: false,
      missedRefreshes: 3,
    };
    const r = reconcileRoster([inactive], [entry({ rank: 12 })], NOW);
    const patch = r.toUpdate.find((u) => u.id === 'athlete_000001')!.patch;
    expect(patch.active).toBe(true);
    expect(patch.missedRefreshes).toBe(0);
  });

  test('duplicate entries within one refresh create ONE athlete', () => {
    // A page overlap during a mid-fetch rank shift can repeat a player
    // and still pass the contiguity proof; the reconciliation must not
    // mint twins (review round).
    const r = reconcileRoster(
      [],
      [entry({ rank: 99 }), entry({ rank: 100 })],
      NOW,
    );
    expect(r.toCreate).toHaveLength(1);
  });

  test('absence is scoped to roster-PLACED athletes — a rank-less draw player is not the roster\'s to deactivate', () => {
    // A rank-250 player minted from a draw is absent from the top 200
    // BY CONSTRUCTION (review round: the unscoped pass deactivated
    // active players weekly, and the F1 twin stripped session keys).
    const drawPlayer = {
      ...athlete({
        id: 'athlete_000200',
        displayName: 'Maya Joint',
        providerIds: { wta: '334444' },
      }),
      provenance: 'fixture_derived' as const,
      identities: [
        {
          source: 'wta',
          externalId: '334444',
          name: 'Maya Joint',
          lastSeenAt: NOW,
        },
      ],
    };
    const r = reconcileRoster([drawPlayer], [entry()], NOW);
    expect(r.toUpdate.find((u) => u.id === 'athlete_000200')).toBeUndefined();
  });

  test('an already-inactive athlete is left alone — no unbounded counters, no recount', () => {
    const inactive = {
      ...rosterAthlete('athlete_000001', entry(), NOW),
      active: false,
      missedRefreshes: 2,
    };
    const r = reconcileRoster(
      [inactive],
      [entry({ externalId: '999', name: 'Somebody New' })],
      NOW,
    );
    expect(r.toUpdate.find((u) => u.id === 'athlete_000001')).toBeUndefined();
  });

  test('another source\'s refresh never touches this source\'s athletes', () => {
    const wta = rosterAthlete('athlete_000001', entry(), NOW);
    const r = reconcileRoster(
      [wta],
      [
        entry({
          source: 'ibf',
          externalId: null,
          name: 'Moses Itauma',
          sport: 'boxing',
        }),
      ],
      NOW,
    );
    expect(r.toUpdate.find((u) => u.id === 'athlete_000001')).toBeUndefined();
  });
});

describe('F1 driver stamping', () => {
  const session = (id: string, kind: 'race' | 'support'): Fixture => ({
    id,
    sport: 'f1',
    competition: 'Formula 1',
    competitionId: 'f1-series-1',
    title: 'Dutch Grand Prix — Race',
    followKeys: ['f1-series-1'],
    startUtc: '2026-08-23T13:00:00.000Z',
    status: 'scheduled',
    durationHours: 2,
    sessionKind: kind,
    updatedAt: NOW,
  });

  test('active drivers with f1 ids are stamped, sorted, and re-stamping is stable', () => {
    const drivers = [
      athlete({
        id: 'athlete_000112',
        displayName: 'Max Verstappen',
        sport: 'f1',
        providerIds: { f1: 'max_verstappen' },
      }),
      athlete({
        id: 'athlete_000041',
        displayName: 'Fernando Alonso',
        sport: 'f1',
        providerIds: { f1: 'alonso' },
      }),
      athlete({
        id: 'athlete_000999',
        displayName: 'Retired Driver',
        sport: 'f1',
        providerIds: { f1: 'old_hand' },
        active: false,
      }),
    ];
    const stamped = stampDriverKeys(
      [session('f1-2026-zandvoort-race', 'race')],
      drivers,
    );
    expect(stamped[0].followKeys).toEqual([
      'f1-series-1',
      'athlete_000041',
      'athlete_000112',
    ]);
    // Idempotent: stamping the stamped output changes nothing — ingest
    // diffs by equality, so instability would rewrite every session
    // every poll.
    expect(stampDriverKeys(stamped, drivers)).toEqual(stamped);
    // sessionKind untouched: the race-only preference keeps working.
    expect(stamped[0].sessionKind).toBe('race');
  });

  test('an empty roster stamps nothing', () => {
    const f = session('f1-2026-zandvoort-race', 'race');
    expect(stampDriverKeys([f], [])[0].followKeys).toEqual(['f1-series-1']);
  });
});

describe('accentHue — the generated colour identity (Prompt 9b)', () => {
  const { accentHueOf } = jest.requireActual<typeof import('../athletes')>(
    '../athletes',
  );
  test('deterministic, in range, distinct across neighbours, present on new docs', () => {
    expect(accentHueOf('athlete_000184')).toBe(accentHueOf('athlete_000184'));
    for (const id of ['athlete_000001', 'athlete_000002', 'athlete_000750']) {
      const h = accentHueOf(id);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
    // Sequential ids must land PERCEPTUALLY apart, not 1° neighbours
    // (review round): golden-angle spread guarantees it.
    const d = Math.abs(
      accentHueOf('athlete_000001') - accentHueOf('athlete_000002'),
    );
    expect(Math.min(d, 360 - d)).toBeGreaterThan(30);
    const a = rosterAthlete(
      'athlete_000123',
      { source: 'wta', externalId: '1', name: 'A B', sport: 'tennis' },
      NOW,
    );
    expect(a.accentHue).toBe(accentHueOf('athlete_000123'));
  });
});

// ── Prompt 10b: multi-identity roster entries + the population guard ──

describe('ATP roster reconciliation (Prompt 10b)', () => {
  const nowIso = '2026-08-03T00:00:00.000Z';
  const atpEntry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
    source: 'wikidata',
    externalId: 'Q5812',
    name: 'Novak Djokovic',
    sport: 'tennis',
    grouping: 'Former world No. 1s',
    groupingKey: 'atp-no1',
    extraIdentities: [
      { source: 'atp', externalId: 'D643' },
      { source: 'itf', externalId: '100004087' },
    ],
    ...over,
  });

  // ── Prompt 12: career status is all-or-nothing for the owning source ──

  test('a refresh that no longer records a retirement CLEARS it, group and caption together', () => {
    // The contradiction this prevents: a doc sitting in "still
    // playing" whose every caption reads "Retired 2024". Firestore
    // merge only touches keys present in the patch, so an omitted
    // field would otherwise survive forever — applyRoster turns the
    // `undefined` below into a real field delete.
    const existing = rosterAthlete(
      'athlete_000950',
      atpEntry({
        groupingKey: 'atp-no1-retired',
        grouping: "Men's world No. 1s — retired",
        careerStatus: 'retired',
        careerEndYear: 2024,
      }),
      nowIso,
    );
    const rec = reconcileRoster(
      [existing],
      [
        atpEntry({
          groupingKey: 'atp-no1-active',
          grouping: "Men's world No. 1s — still playing",
        }),
      ],
      '2026-08-10T00:00:00.000Z',
      { ownsCareerStatus: true },
    );
    const patch = rec.toUpdate.find((u) => u.id === 'athlete_000950')!.patch;
    expect(patch.groupingKey).toBe('atp-no1-active');
    // Present-and-undefined, NOT absent: absent would mean "leave it".
    expect('careerStatus' in patch).toBe(true);
    expect(patch.careerStatus).toBeUndefined();
    expect('careerEndYear' in patch).toBe(true);
    expect(patch.careerEndYear).toBeUndefined();
  });

  test('a source that does NOT own career status leaves an existing marker alone', () => {
    // A WTA or IBF refresh must never blank a marker it knows nothing
    // about. Without the flag, nothing is written either way.
    const existing = rosterAthlete(
      'athlete_000951',
      atpEntry({ careerStatus: 'retired', careerEndYear: 2012 }),
      nowIso,
    );
    const rec = reconcileRoster(
      [existing],
      [atpEntry()],
      '2026-08-10T00:00:00.000Z',
    );
    const patch = rec.toUpdate.find((u) => u.id === 'athlete_000951')!.patch;
    expect('careerStatus' in patch).toBe(false);
    expect('careerEndYear' in patch).toBe(false);
  });

  test('a newly recorded retirement lands with its year', () => {
    const existing = rosterAthlete('athlete_000952', atpEntry(), nowIso);
    const rec = reconcileRoster(
      [existing],
      [
        atpEntry({
          groupingKey: 'atp-no1-retired',
          careerStatus: 'retired',
          careerEndYear: 2026,
        }),
      ],
      '2026-08-10T00:00:00.000Z',
      { ownsCareerStatus: true },
    );
    const patch = rec.toUpdate.find((u) => u.id === 'athlete_000952')!.patch;
    expect(patch.careerStatus).toBe('retired');
    expect(patch.careerEndYear).toBe(2026);
    expect(patch.groupingKey).toBe('atp-no1-retired');
  });

  test('a created athlete carries all three identities', () => {
    const rec = reconcileRoster([], [atpEntry()], nowIso);
    expect(rec.toCreate).toHaveLength(1);
    const a = rosterAthlete('athlete_000900', rec.toCreate[0], nowIso);
    expect(a.providerIds).toEqual({
      wikidata: 'Q5812',
      atp: 'D643',
      itf: '100004087',
    });
    expect(a.identities.map((i) => i.source).sort()).toEqual(['atp', 'itf', 'wikidata']);
    expect(a.nameKeyed).toBe(false);
  });

  test('THE GUARD: a name-colliding WTA woman never receives a man\'s identity', () => {
    // Same rendered name, same sport — two different people. Without
    // the guard this is a CONFIDENT unique-name match and the ATP
    // identity lands on the woman's doc.
    const woman = rosterAthlete(
      'athlete_000001',
      {
        source: 'wta',
        externalId: '999001',
        name: 'Novak Djokovic', // synthetic collision
        sport: 'tennis',
      },
      nowIso,
    );
    const guarded = reconcileRoster([woman], [atpEntry()], nowIso, {
      nameMatchExcludesSources: ['wta'],
    });
    expect(guarded.toUpdate).toHaveLength(0);
    expect(guarded.toCreate).toHaveLength(1); // a second, distinct athlete
    // And WITHOUT the guard it would have merged — pinning why it exists.
    const unguarded = reconcileRoster([woman], [atpEntry()], nowIso);
    expect(unguarded.toUpdate).toHaveLength(1);
  });

  test('re-running the roster against its own athlete matches CERTAIN by Q-id and refreshes identities', () => {
    const a = rosterAthlete('athlete_000900', atpEntry(), '2026-07-01T00:00:00.000Z');
    const rec = reconcileRoster([a], [atpEntry()], nowIso, {
      nameMatchExcludesSources: ['wta'],
    });
    expect(rec.toCreate).toHaveLength(0);
    expect(rec.toUpdate).toHaveLength(1);
    const patch = rec.toUpdate[0].patch;
    expect(patch.providerIds).toMatchObject({ wikidata: 'Q5812', atp: 'D643' });
    expect(patch.identities!.filter((i) => i.source === 'wikidata')).toHaveLength(1);
    expect(patch.identities!.every((i) => i.lastSeenAt === nowIso)).toBe(true);
  });

  test('THE GUARD also covers a NAME-KEYED woman — a blank-PlayerID draw mint has no wta id to check', () => {
    // wtaTennis mints a draw participant with a blank PlayerID as
    // name-keyed: providerIds {}, no source id anywhere. The id-marker
    // check alone missed her (review round) — the man's identities
    // would have landed on her doc and flipped nameKeyed false.
    const nameKeyed = rosterAthlete(
      'athlete_000002',
      {
        source: 'derived',
        externalId: null,
        name: 'Novak Djokovic', // synthetic collision
        sport: 'tennis',
      },
      nowIso,
    );
    expect(nameKeyed.nameKeyed).toBe(true);
    const guarded = reconcileRoster([nameKeyed], [atpEntry()], nowIso, {
      nameMatchExcludesSources: ['wta'],
    });
    expect(guarded.toUpdate).toHaveLength(0);
    expect(guarded.toCreate).toHaveLength(1);
    // Without the guard active, the confident merge still happens for
    // the OTHER rosters — behaviour unchanged where no exclusion is
    // named.
    const unguarded = reconcileRoster([nameKeyed], [atpEntry()], nowIso);
    expect(unguarded.toUpdate).toHaveLength(1);
  });
});

// ─── id_backed (22d) ──────────────────────────────────────────────────
//
// "Never mint from this vendor" was relaxed to "mint only from a vendor
// id observed on a scheduled card". The relaxation is exactly as wide as
// the reasoning behind the original rule, and these pin the edge — a
// policy VALUE is not something a type can guard, so it is guarded here.

describe('CreationPolicy id_backed', () => {
  const card = (id: string): Fixture => ({
    id,
    sport: 'boxing',
    competition: 'Boxing',
    competitionId: 'boxingdata-cards',
    title: 'A vs B',
    followKeys: ['boxingdata-cards'],
    startUtc: '2026-09-01T20:00:00.000Z',
    status: 'scheduled',
    durationHours: 4,
    timePrecision: 'nominal',
    confidence: 'provisional',
    updatedAt: NOW,
  });

  it('mints from a ref carrying a provider id', () => {
    const r = resolveDrafts(
      [
        {
          fixture: card('c1'),
          refs: [
            { name: 'Callum Simpson', source: 'boxingdata', externalId: 'abc123' },
          ],
        },
      ],
      buildAthleteIndex([]),
      { create: 'id_backed', provenance: 'vendor' },
    );
    expect(r.counts.created).toBe(1);
    expect(r.toCreate[0].provenance).toBe('vendor');
    expect(r.toCreate[0].ref.externalId).toBe('abc123');
  });

  // THE SCOPING RULE. A full, plausible, structured name with no id must
  // NOT mint — that is precisely the name-only path F34 exists to stop.
  it('refuses to mint from a name alone, however good the name looks', () => {
    const r = resolveDrafts(
      [{ fixture: card('c2'), refs: [{ name: 'Callum Simpson' }] }],
      buildAthleteIndex([]),
      { create: 'id_backed', provenance: 'vendor' },
    );
    expect(r.counts.created).toBe(0);
    expect(r.toCreate).toHaveLength(0);
  });

  it('refuses a source with no externalId, and an externalId with no source', () => {
    const r = resolveDrafts(
      [
        {
          fixture: card('c3'),
          refs: [
            { name: 'Callum Simpson', source: 'boxingdata' },
            { name: 'Sean Hemphill', externalId: 'abc123' },
          ],
        },
      ],
      buildAthleteIndex([]),
      { create: 'id_backed', provenance: 'vendor' },
    );
    expect(r.counts.created).toBe(0);
  });

  // `structured` is unchanged — the relaxation must not have widened the
  // policy every other connector uses.
  it('leaves structured able to mint from a name, as before', () => {
    const r = resolveDrafts(
      [{ fixture: card('c4'), refs: [{ name: 'Callum Simpson' }] }],
      buildAthleteIndex([]),
      { create: 'structured' },
    );
    expect(r.counts.created).toBe(1);
  });

  it('never mints under the never policy, id or not', () => {
    const r = resolveDrafts(
      [
        {
          fixture: card('c5'),
          refs: [
            { name: 'Callum Simpson', source: 'boxingdata', externalId: 'abc123' },
          ],
        },
      ],
      buildAthleteIndex([]),
      { create: 'never' },
    );
    expect(r.counts.created).toBe(0);
  });
});
