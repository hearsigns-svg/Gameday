// The appearance model — a named athlete competing within a parent
// event, as an ordinary fixtures-collection doc. The properties pinned
// here are the ones the calendar depends on:
//   - the id is BORN FINAL: identical across provisional → confirmed,
//     so the device ledger updates one entry in place;
//   - the id keeps the parent's provider prefix, so the reconcile
//     same-provider guard and coverage source attribution both hold;
//   - athlete follow keys exist ONLY for full names (a surname is not an
//     identity), and only on appearances — never on the parent card.

import {
  appearanceFor,
  appearanceId,
  appearanceSliceKey,
  boutAppearance,
  deriveBoutAppearances,
  retiredAppearanceIds,
} from '../appearances';
import { Fixture } from '../fixture';
import { isSameFixture } from '../identity';
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

describe('appearance identity', () => {
  test('id embeds the parent id and keeps its provider prefix', () => {
    const a = boutAppearance(
      card(),
      { first: 'Yoenli Hernandez', second: 'Francisco Daniel Veron' },
      '2026-08-02T00:00:00.000Z',
    )!;
    expect(a.id).toBe(
      'pbc-fight-night-august-22-2026-app-yoenli-hernandez-francisco-daniel-veron',
    );
    expect(a.id.split('-')[0]).toBe('pbc'); // providerOf / sourceOfFixtureId
    expect(a.parentFixtureId).toBe('pbc-fight-night-august-22-2026');
  });

  test('id is identical across provisional and confirmed builds', () => {
    const parent = card();
    const provisional = appearanceFor(parent, {
      athletes: ['Iga Swiatek'],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-02T00:00:00.000Z',
    })!;
    const confirmed = appearanceFor(parent, {
      athletes: ['Iga Swiatek'],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-27T00:00:00.000Z',
      slot: { startUtc: '2026-08-31T15:00:00.000Z', durationHours: 3 },
    })!;
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
    )!;
    const sibling = boutAppearance(
      parent,
      { first: 'Victor Santillan', second: 'Gary Antonio Russell' },
      '2026-08-02T00:00:00.000Z',
    )!;
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
    )!;
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
      athletes: ['Iga Swiatek'],
      title: 'Iga Swiatek — US Open',
      updatedAt: '2026-08-27T00:00:00.000Z',
    })!;
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
      athletes: ['Faith Kipyegon'],
      title: 'Faith Kipyegon — 1500m — Weltklasse Zürich',
      updatedAt: '2026-09-02T00:00:00.000Z',
      slot: { startUtc: '2026-09-03T19:24:00.000Z', durationHours: 1 },
    })!;
    expect(a.timePrecision).toBe('exact');
    expect(a.confidence).toBe('confirmed');
    expect(a.startUtc).toBe('2026-09-03T19:24:00.000Z');
    expect(a.durationHours).toBe(1);
  });
});

describe('follow keys', () => {
  test('slice key plus one key per FULL-named athlete', () => {
    const a = boutAppearance(
      card(),
      { first: 'Rolando Romero', second: 'Teofimo Lopez' },
      '2026-08-02T00:00:00.000Z',
    )!;
    expect(a.followKeys).toEqual([
      'pbc-cards-appearances',
      'athlete-rolando-romero',
      'athlete-teofimo-lopez',
    ]);
    expect(a.athletes).toEqual(['Rolando Romero', 'Teofimo Lopez']);
  });

  test('a surname-only fighter gets no key; the bout still carries both names', () => {
    const a = boutAppearance(
      card({ title: 'Conor Benn vs Eubank' }),
      { first: 'Conor Benn', second: 'Eubank' },
      '2026-08-02T00:00:00.000Z',
    )!;
    expect(a.followKeys).toEqual([
      'pbc-cards-appearances',
      'athlete-conor-benn',
    ]);
    expect(a.athletes).toEqual(['Conor Benn', 'Eubank']);
  });

  test('a bout with NO followable name yields no appearance at all', () => {
    expect(
      boutAppearance(
        card({ title: 'Gaethje vs Pimblett' }),
        { first: 'Gaethje', second: 'Pimblett' },
        '2026-08-02T00:00:00.000Z',
      ),
    ).toBeNull();
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
    )!;
    expect(a.sessionKind).toBeUndefined();
  });
});

describe('deriveBoutAppearances (the TSDB headline consumer)', () => {
  test('full-named combat titles yield the headline bout; surname titles yield nothing', () => {
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
    const out = deriveBoutAppearances(cards, '2026-08-02T00:00:00.000Z');
    expect(out).toHaveLength(1);
    expect(out[0].parentFixtureId).toBe('tsdb-2540001');
    expect(out[0].followKeys).toEqual([
      'tsdb-league-4445-appearances',
      'athlete-rolando-romero',
      'athlete-teofimo-lopez',
    ]);
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
    );
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
  )!;
  const boutAC = boutAppearance(
    parent,
    { first: 'Alpha Adams', second: 'Charlie Cruz' },
    NOW,
  )!;

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
    )!;
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
