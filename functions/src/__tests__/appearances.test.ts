// The appearance model — a named athlete competing within a parent
// event, as an ordinary fixtures-collection doc. The properties pinned
// here are the ones the calendar depends on:
//   - the id is BORN FINAL: identical across provisional → confirmed,
//     so the device ledger updates one entry in place;
//   - the id keeps the parent's provider prefix, so the reconcile
//     same-provider guard and coverage source attribution both hold;
//   - follow keys are CANONICAL athlete ids, decided by resolution
//     against the directory (Prompt 8) — certain by provider id,
//     confident by unique full name, ambiguous mints nothing, and a
//     surname is still not an identity.

import {
  appearanceFor,
  appearanceId,
  appearanceSliceKey,
  boutAppearance,
  deriveBoutAppearances,
  retiredAppearanceIds,
} from '../appearances';
import {
  AppearanceDraft,
  applyCreatedIds,
  Athlete,
  athleteIdFrom,
  buildAthleteIndex,
  CreationPolicy,
  providerKey,
  resolveDrafts,
} from '../athletes';
import { Fixture } from '../fixture';
import { isSameFixture, normaliseName } from '../identity';
import { enrichBoutParticipants } from '../participants';

const card = (over: Partial<Fixture> = {}): Fixture => ({
  id: 'pbc-fight-night-august-22-2026',
  sport: 'boxing',
  competition: 'Premier Boxing Champions',
  competitionId: 'pbc-cards',
  title: 'Rolando Romero vs Teofimo Lopez',
  followKeys: ['pbc-cards'],
  startUtc: '2026-08-22T22:00:00.000Z',
  status: 'scheduled',
  durationHours: 4,
  timePrecision: 'nominal',
  confidence: 'provisional',
  updatedAt: '2026-08-02T00:00:00.000Z',
  ...over,
});

const dirAthlete = (
  id: string,
  name: string,
  sport: string,
  ids: Record<string, string> = {},
): Athlete => ({
  id,
  displayName: name,
  searchName: normaliseName(name),
  aliases: [],
  sport,
  providerIds: ids,
  identities: [],
  provenance: 'roster',
  nameKeyed: Object.keys(ids).length === 0,
  active: true,
  missedRefreshes: 0,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
});

// The full pipeline as index.ts runs it: resolve, then swap created
// placeholders for deterministic ids (athlete_000001…).
const resolveForTest = (
  drafts: (AppearanceDraft | null)[],
  directory: Athlete[] = [],
  create: CreationPolicy = 'structured',
) => {
  const present = drafts.filter((d): d is AppearanceDraft => d !== null);
  const r = resolveDrafts(present, buildAthleteIndex(directory), { create });
  const idOf = new Map<string, string>();
  let n = 0;
  for (const s of r.toCreate) {
    const key =
      s.ref.source && s.ref.externalId
        ? providerKey(s.ref.source, s.ref.externalId)
        : `${s.sport}|${normaliseName(s.ref.name)}`;
    idOf.set(key, athleteIdFrom(++n));
  }
  return { ...r, fixtures: applyCreatedIds(r.appearances, idOf) };
};

describe('appearance identity', () => {
  test('id embeds the parent id and keeps its provider prefix', () => {
    const a = boutAppearance(
      card(),
      { first: 'Yoenli Hernandez', second: 'Francisco Daniel Veron' },
      '2026-08-02T00:00:00.000Z',
    )!.fixture;
    expect(a.id).toBe(
      'pbc-fight-night-august-22-2026-app-yoenli-hernandez-francisco-daniel-veron',
    );
    expect(a.id.split('-')[0]).toBe('pbc'); // providerOf / sourceOfFixtureId
    expect(a.parentFixtureId).toBe('pbc-fight-night-august-22-2026');
  });

  test('id is identical across provisional and confirmed builds', () => {
    const parent = card();
    const provisional = appearanceFor(parent, {
      refs: [{ name: 'Iga Swiatek' }],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-02T00:00:00.000Z',
    })!.fixture;
    const confirmed = appearanceFor(parent, {
      refs: [{ name: 'Iga Swiatek' }],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-27T00:00:00.000Z',
      slot: { startUtc: '2026-08-31T15:00:00.000Z', durationHours: 3 },
    })!.fixture;
    expect(confirmed.id).toBe(provisional.id);
  });

  test('diacritics and case cannot fork the id', () => {
    expect(appearanceId('tennis-abc123', ['Teófimo López'])).toBe(
      appearanceId('tennis-abc123', ['teofimo lopez']),
    );
  });

  test('an appearance never merges with its parent or a sibling — the same-provider guard holds by id prefix', () => {
    const parent = card();
    const a = boutAppearance(
      parent,
      { first: 'Rolando Romero', second: 'Teofimo Lopez' },
      '2026-08-02T00:00:00.000Z',
    )!.fixture;
    const sibling = boutAppearance(
      parent,
      { first: 'Victor Santillan', second: 'Gary Antonio Russell' },
      '2026-08-02T00:00:00.000Z',
    )!.fixture;
    // Same participants, same competition, same instant as the parent —
    // the exact shape reconcile's clusterer hunts. Only providerOf saves
    // it, so pin it directly.
    expect(isSameFixture(a, parent)).toBe(false);
    expect(isSameFixture(a, sibling)).toBe(false);
  });
});

describe('provisional carries the parent window', () => {
  test('nominal combat card → timed nominal appearance at the card start', () => {
    const a = boutAppearance(
      card(),
      { first: 'Carlos Utria', second: 'Israel Mercado' },
      '2026-08-02T00:00:00.000Z',
    )!.fixture;
    expect(a.startUtc).toBe('2026-08-22T22:00:00.000Z');
    expect(a.durationHours).toBe(4);
    expect(a.timePrecision).toBe('nominal');
    expect(a.confidence).toBe('provisional');
    expect(a.status).toBe('scheduled');
  });

  test('date_only tournament → date_only appearance spanning the parent window', () => {
    const slam = card({
      id: 'tennis-usopen26',
      sport: 'tennis',
      competition: 'ATP Tour',
      competitionId: 'tennis-atp',
      title: 'US Open',
      followKeys: ['tennis-atp'],
      startUtc: '2026-08-31T00:00:00.000Z',
      durationHours: 15 * 24,
      timePrecision: 'date_only',
      confidence: 'confirmed',
    });
    const a = appearanceFor(slam, {
      refs: [{ name: 'Iga Swiatek' }],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-27T00:00:00.000Z',
    })!.fixture;
    expect(a.startUtc).toBe(slam.startUtc);
    expect(a.durationHours).toBe(360);
    expect(a.timePrecision).toBe('date_only');
    expect(a.confidence).toBe('provisional');
  });

  test('a confirmed slot is exact and confirmed', () => {
    const meeting = card({
      id: 'wa-7244804',
      sport: 'athletics',
      competition: 'Wanda Diamond League',
      competitionId: 'wa-wanda-diamond-league-meeting',
      title: 'Weltklasse Zürich',
      followKeys: ['wa-wanda-diamond-league-meeting', 'wa-calendar'],
      startUtc: '2026-09-03T00:00:00.000Z',
      durationHours: 24,
      timePrecision: 'date_only',
    });
    const a = appearanceFor(meeting, {
      refs: [{ name: 'Faith Kipyegon' }],
      title: 'Faith Kipyegon — 1500m — Weltklasse Zürich',
      updatedAt: '2026-09-02T00:00:00.000Z',
      slot: { startUtc: '2026-09-03T19:24:00.000Z', durationHours: 1 },
    })!.fixture;
    expect(a.timePrecision).toBe('exact');
    expect(a.confidence).toBe('confirmed');
    expect(a.startUtc).toBe('2026-09-03T19:24:00.000Z');
    expect(a.durationHours).toBe(1);
  });
});

describe('follow keys are canonical, decided by resolution', () => {
  test('structured names create directory athletes and carry their ids', () => {
    const draft = boutAppearance(
      card(),
      { first: 'Rolando Romero', second: 'Teofimo Lopez' },
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest([draft]);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].followKeys).toEqual([
      'pbc-cards-appearances',
      'athlete_000001',
      'athlete_000002',
    ]);
    expect(fixtures[0].athletes).toEqual(['Rolando Romero', 'Teofimo Lopez']);
    expect(counts.created).toBe(2);
  });

  test('a directory athlete resolves CONFIDENT by unique full name', () => {
    const romero = dirAthlete('athlete_000007', 'Rolando Romero', 'boxing');
    const draft = boutAppearance(
      card(),
      { first: 'Rolando Romero', second: 'Teofimo Lopez' },
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest([draft], [romero], 'never');
    expect(fixtures[0].followKeys).toEqual([
      'pbc-cards-appearances',
      'athlete_000007',
    ]);
    expect(counts.confident).toBe(1);
    expect(counts.unknown).toBe(1); // Lopez: not in directory, no create
  });

  test('a provider id resolves CERTAIN, whatever the rendered name', () => {
    const sabalenka = dirAthlete('athlete_000010', 'Aryna Sabalenka', 'tennis', {
      wta: '320760',
    });
    const draft = appearanceFor(card({ sport: 'tennis' }), {
      refs: [{ name: 'A. Sabalenka', source: 'wta', externalId: '320760' }],
      title: 'A. Sabalenka — somewhere',
      updatedAt: 'x',
    });
    const { fixtures, counts } = resolveForTest([draft], [sabalenka], 'never');
    expect(fixtures[0].followKeys).toContain('athlete_000010');
    expect(counts.certain).toBe(1);
  });

  test('a surname-only fighter gets no key; the bout still carries both names', () => {
    const draft = boutAppearance(
      card({ title: 'Conor Benn vs Eubank' }),
      { first: 'Conor Benn', second: 'Eubank' },
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest([draft]);
    expect(fixtures[0].followKeys).toEqual([
      'pbc-cards-appearances',
      'athlete_000001',
    ]);
    expect(fixtures[0].athletes).toEqual(['Conor Benn', 'Eubank']);
    expect(counts.ambiguous).toBe(1);
  });

  test('a bout with NO resolvable participant yields no doc at all', () => {
    const draft = boutAppearance(
      card({ title: 'Gaethje vs Pimblett' }),
      { first: 'Gaethje', second: 'Pimblett' },
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest([draft]);
    expect(fixtures).toHaveLength(0);
    expect(counts.droppedNoKeys).toBe(1);
  });

  test('F31 CLOSED: a compound surname from a parsed title mints nothing', () => {
    // "Machado Garry" is two words and passes every word-count test —
    // that gate is gone. Directory membership is the test now: he is in
    // no directory, and a TITLE-PARSED name may never create one.
    const draft = boutAppearance(
      card({ sport: 'ufc', title: 'UFC 330 Makhachev vs Machado Garry' }),
      { first: 'Makhachev', second: 'Machado Garry' },
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest([draft], [], 'never');
    expect(fixtures).toHaveLength(0);
    expect(counts.unknown).toBe(1); // Machado Garry: full name, unknown, uncreatable
    expect(counts.ambiguous).toBe(1); // Makhachev: surname
  });

  test('a name matching TWO directory athletes is ambiguous — no link, no key', () => {
    const a1 = dirAthlete('athlete_000021', 'Maria Garcia', 'tennis', { wta: '1' });
    const a2 = dirAthlete('athlete_000022', 'Maria Garcia', 'tennis', { wta: '2' });
    const draft = appearanceFor(card({ sport: 'tennis' }), {
      refs: [{ name: 'Maria Garcia' }],
      title: 'Maria Garcia — somewhere',
      updatedAt: 'x',
    });
    const { fixtures, counts } = resolveForTest([draft], [a1, a2], 'structured');
    expect(fixtures).toHaveLength(0);
    expect(counts.ambiguous).toBe(1);
    expect(counts.created).toBe(0);
  });

  test('the slice key is derived from the parent competitionId', () => {
    expect(appearanceSliceKey('tsdb-league-4445')).toBe(
      'tsdb-league-4445-appearances',
    );
  });

  test('appearances never carry sessionKind — race-only prefs must not drop them', () => {
    const a = boutAppearance(
      card({ sessionKind: 'support' }),
      { first: 'Rolando Romero', second: 'Teofimo Lopez' },
      '2026-08-02T00:00:00.000Z',
    )!.fixture;
    expect(a.sessionKind).toBeUndefined();
  });
});

describe('deriveBoutAppearances (the TSDB headline consumer)', () => {
  test('full-named titles resolve against the directory; surname titles yield nothing', () => {
    const cards = [
      card({
        id: 'tsdb-2540001',
        competitionId: 'tsdb-league-4445',
        followKeys: ['tsdb-league-4445'],
        title: 'Rolando Romero vs Teofimo Lopez',
      }),
      card({
        id: 'tsdb-2389036',
        sport: 'ufc',
        competitionId: 'tsdb-league-4443',
        followKeys: ['tsdb-league-4443'],
        title: 'UFC 324 Gaethje vs Pimblett',
      }),
      card({
        id: 'tsdb-2541772',
        sport: 'ufc',
        competitionId: 'tsdb-league-4443',
        followKeys: ['tsdb-league-4443'],
        title: 'UFC Fight Night 290',
      }),
    ];
    const drafts = deriveBoutAppearances(cards, '2026-08-02T00:00:00.000Z');
    // Two parseable bouts draft ("UFC Fight Night 290" names nobody);
    // the surname bout dies at RESOLUTION now, not at parse time — same
    // outcome, one gate, and the drop is counted instead of silent.
    expect(drafts).toHaveLength(2);
    const directory = [
      dirAthlete('athlete_000031', 'Rolando Romero', 'boxing'),
      dirAthlete('athlete_000032', 'Teofimo Lopez', 'boxing'),
    ];
    const { fixtures, counts } = resolveForTest(drafts, directory, 'never');
    expect(fixtures).toHaveLength(1);
    expect(counts.ambiguous).toBe(2); // Gaethje, Pimblett: surnames
    expect(fixtures[0].parentFixtureId).toBe('tsdb-2540001');
    expect(fixtures[0].followKeys).toEqual([
      'tsdb-league-4445-appearances',
      'athlete_000031',
      'athlete_000032',
    ]);
  });

  test('a full-named title with NO directory backing stays display-only', () => {
    // Two journeymen the ratings never met: the bout parses, the draft
    // exists, and resolution drops it — a parsed title is not allowed
    // to invent identities (policy "never"), so there is nothing to
    // follow and no doc is stored.
    const drafts = deriveBoutAppearances(
      [
        card({
          id: 'tsdb-2599999',
          competitionId: 'tsdb-league-4445',
          followKeys: ['tsdb-league-4445'],
          title: 'Somebody Unrated vs Nobody Ranked',
        }),
      ],
      '2026-08-02T00:00:00.000Z',
    );
    const { fixtures, counts } = resolveForTest(drafts, [], 'never');
    expect(fixtures).toHaveLength(0);
    expect(counts.unknown).toBe(2);
  });

  test('never derives from a non-person sport or from an appearance doc', () => {
    const soccer = card({
      id: 'fdorg-1',
      sport: 'soccer',
      title: 'Liverpool v Everton',
    });
    const already = deriveBoutAppearances(
      [card({ title: 'Rolando Romero vs Teofimo Lopez' })],
      '2026-08-02T00:00:00.000Z',
    ).map((d) => d.fixture);
    expect(deriveBoutAppearances([soccer], 'x')).toHaveLength(0);
    expect(deriveBoutAppearances(already, 'x')).toHaveLength(0);
  });
});

describe('retirement — the yield proves a bout gone', () => {
  const NOW = '2026-08-10T00:00:00.000Z';
  const parent = card();
  const boutAB = boutAppearance(
    parent,
    { first: 'Alpha Adams', second: 'Bravo Brown' },
    NOW,
  )!.fixture;
  const boutAC = boutAppearance(
    parent,
    { first: 'Alpha Adams', second: 'Charlie Cruz' },
    NOW,
  )!.fixture;

  test('an opponent replacement retires the old bout doc', () => {
    expect(retiredAppearanceIds([boutAB], [boutAC], NOW)).toEqual([boutAB.id]);
  });

  test('THE EVIDENCE GUARD: a parent that yielded nothing retires nothing', () => {
    // A shape failure (or a page transiently missing its JSON-LD) must
    // never be read as "every bout was scratched".
    expect(retiredAppearanceIds([boutAB], [], NOW)).toEqual([]);
  });

  test('a parent absent from this yield cannot retire its bouts', () => {
    const otherParent = card({ id: 'pbc-fight-night-september-05-2026' });
    const otherBout = boutAppearance(
      otherParent,
      { first: 'Delta Diaz', second: 'Echo Evans' },
      NOW,
    )!.fixture;
    // Fresh yield covers only the September card; the August card's
    // bout must survive untouched.
    expect(retiredAppearanceIds([boutAB, otherBout], [otherBout], NOW)).toEqual(
      [],
    );
  });

  test('the past is frozen and the already-cancelled stay put', () => {
    const past = { ...boutAB, startUtc: '2026-08-01T00:00:00.000Z' };
    const cancelled = { ...boutAB, status: 'cancelled' as const };
    expect(retiredAppearanceIds([past], [boutAC], NOW)).toEqual([]);
    expect(retiredAppearanceIds([cancelled], [boutAC], NOW)).toEqual([]);
  });

  test('an unchanged bout is never its own retirement candidate', () => {
    expect(retiredAppearanceIds([boutAB, boutAC], [boutAB, boutAC], NOW)).toEqual(
      [],
    );
  });

  test('REGRESSION: the freeze is END-based — a mid-tournament elimination retires the week-long provisional doc', () => {
    // A WTA provisional appearance carries the PARENT window: day-1
    // startUtc, a week of durationHours, date_only. From day 2 onward a
    // startUtc-based freeze could never retire it, so an eliminated
    // player's "scheduled" event sat in followers' calendars through
    // the final. The event has not ENDED, so it must be retirable.
    const slam = card({
      id: 'wta-1045-2026',
      sport: 'tennis',
      competitionId: 'tennis-wta',
      followKeys: ['tennis-wta'],
      startUtc: '2026-07-27T00:00:00.000Z',
      durationHours: 7 * 24,
      timePrecision: 'date_only',
    });
    const linette = appearanceFor(slam, {
      refs: [{ name: 'Magda Linette' }],
      title: 'Magda Linette — Mubadala DC Open',
      updatedAt: '2026-07-26T00:00:00.000Z',
    })!.fixture;
    const survivor = appearanceFor(slam, {
      refs: [{ name: 'Alexandra Eala' }],
      title: 'Alexandra Eala — Mubadala DC Open',
      updatedAt: '2026-07-28T12:00:00.000Z',
    })!.fixture;
    // Lost R1 on the 27th; polled mid-tournament on the 28th: retired.
    expect(
      retiredAppearanceIds([linette], [survivor], '2026-07-28T12:00:00.000Z'),
    ).toEqual([linette.id]);
    // After the window (plus grace) has closed, the same doc is frozen
    // history — never cancelled out of anyone's calendar.
    expect(
      retiredAppearanceIds([linette], [survivor], '2026-08-03T12:00:00.000Z'),
    ).toEqual([]);
  });
});

describe('the parent card no longer carries athlete keys', () => {
  test('enrichBoutParticipants writes participants but not follow keys', () => {
    const enriched = enrichBoutParticipants([
      card({ followKeys: ['tsdb-league-4445'], homeTeam: undefined }),
    ])[0];
    expect(enriched.homeTeam).toBe('Rolando Romero');
    expect(enriched.awayTeam).toBe('Teofimo Lopez');
    // Athlete keys live on the appearance, and only there — a fighter's
    // follower must get the BOUT event, not the bout AND the card.
    expect(enriched.followKeys).toEqual(['tsdb-league-4445']);
  });
});
