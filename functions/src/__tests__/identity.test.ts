// Cross-source identity decides which calendar events survive a merge.
// A false positive silently deletes a real fixture from someone's
// calendar; a false negative leaves them with two events for one game.

import { Fixture } from '../fixture';
import {
  clusterFixtures,
  identityKey,
  isSameFixture,
  mergeCluster,
  normaliseName,
  participantsKey,
} from '../identity';

function fx(o: Partial<Fixture> = {}): Fixture {
  return {
    id: 'src-1',
    sport: 'soccer',
    competition: 'Premier League',
    competitionId: 'c1',
    title: 'Liverpool v Everton',
    homeTeam: 'Liverpool',
    awayTeam: 'Everton',
    followKeys: ['team-a'],
    startUtc: '2026-09-01T15:00:00.000Z',
    venueTz: 'UTC',
    status: 'scheduled',
    updatedAt: '2026-07-27T00:00:00.000Z',
    ...o,
  };
}

describe('normaliseName', () => {
  test('strips diacritics, case and punctuation — but NOT club words', () => {
    expect(normaliseName('Filip Hrgović')).toBe('filip hrgovic');
    expect(normaliseName('Liverpool FC')).toBe('liverpool fc');
    expect(normaliseName('  Real   Madrid  ')).toBe('real madrid');
    // The bug this prevents: AFC Liverpool is a DIFFERENT club.
    expect(normaliseName('AFC Liverpool')).not.toBe(normaliseName('Liverpool'));
  });
});

describe('participantsKey — order independence', () => {
  test('home/away swap is the same fixture', () => {
    const a = fx({ homeTeam: 'Liverpool', awayTeam: 'Everton' });
    const b = fx({ homeTeam: 'Everton', awayTeam: 'Liverpool' });
    expect(participantsKey(a)).toBe(participantsKey(b));
  });

  test('teamless cards fall back to the title', () => {
    const a = fx({
      sport: 'boxing',
      homeTeam: undefined,
      awayTeam: undefined,
      title: 'Moses Itauma vs Filip Hrgovic',
    });
    const b = fx({
      sport: 'boxing',
      homeTeam: undefined,
      awayTeam: undefined,
      title: 'Filip Hrgović v Moses Itauma',
    });
    expect(identityKey(a)).toBe(identityKey(b));
  });
});

describe('isSameFixture', () => {
  test('same fight, different providers and a day apart → same', () => {
    const a = fx({ id: 'tsdb-1', startUtc: '2026-08-29T22:00:00.000Z' });
    const b = fx({ id: 'bd-9', startUtc: '2026-08-30T00:00:00.000Z' });
    expect(isSameFixture(a, b)).toBe(true);
  });

  test('same teams a month apart → NOT the same (league double-header)', () => {
    const a = fx({ id: 'x', startUtc: '2026-09-01T15:00:00.000Z' });
    const b = fx({ id: 'y', startUtc: '2026-12-01T15:00:00.000Z' });
    expect(isSameFixture(a, b)).toBe(false);
  });

  test('different sports never merge', () => {
    const a = fx({ id: 'x', sport: 'soccer' });
    const b = fx({ id: 'y', sport: 'rugby' });
    expect(isSameFixture(a, b)).toBe(false);
  });

  test('different opponents never merge', () => {
    const a = fx({ id: 'x', awayTeam: 'Everton' });
    const b = fx({ id: 'y', awayTeam: 'Arsenal' });
    expect(isSameFixture(a, b)).toBe(false);
  });

  test('unidentifiable participants never merge', () => {
    const a = fx({ id: 'x', homeTeam: undefined, awayTeam: undefined, title: '' });
    const b = fx({ id: 'y', homeTeam: undefined, awayTeam: undefined, title: '' });
    expect(isSameFixture(a, b)).toBe(false);
  });
});

describe('mergeCluster — keeps the id users already have', () => {
  const older = fx({
    id: 'apisports-1',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    startUtc: '2026-09-01T12:00:00.000Z',
    confidence: 'provisional',
    followKeys: ['legacy-key'],
  });
  const better = fx({
    id: 'fdorg-2',
    firstSeenAt: '2026-07-01T00:00:00.000Z',
    startUtc: '2026-09-01T15:00:00.000Z',
    confidence: 'confirmed',
    updatedAt: '2026-07-27T10:00:00.000Z',
    followKeys: ['new-key'],
  });

  test('surviving id is the earliest seen — the one in calendars', () => {
    expect(mergeCluster([better, older]).keepId).toBe('apisports-1');
  });

  test('surviving DATA comes from the most trusted source', () => {
    const d = mergeCluster([older, better]);
    expect(d.data.startUtc).toBe('2026-09-01T15:00:00.000Z');
    expect(d.data.confidence).toBe('confirmed');
    expect(d.data.id).toBe('apisports-1'); // corrected in place, not replaced
  });

  test('follow keys union so nobody loses their follow', () => {
    const d = mergeCluster([older, better]);
    expect(d.data.followKeys.sort()).toEqual(['legacy-key', 'new-key']);
  });

  test('losing ids are reported for deletion', () => {
    expect(mergeCluster([older, better]).dropIds).toEqual(['fdorg-2']);
  });

  test('freshness breaks ties at equal confidence', () => {
    const stale = fx({ id: 'tsdb-a', updatedAt: '2026-07-01T00:00:00.000Z', title: 'STALE' });
    const fresh = fx({ id: 'fdorg-b', updatedAt: '2026-07-27T00:00:00.000Z', title: 'FRESH' });
    expect(mergeCluster([stale, fresh]).data.title).toBe('FRESH');
  });
});

describe('clusterFixtures', () => {
  test('only genuine duplicates are returned', () => {
    const solo = fx({ id: 'solo', awayTeam: 'Arsenal' });
    const dupA = fx({ id: 'tsdb-1', startUtc: '2026-09-01T15:00:00.000Z' });
    const dupB = fx({ id: 'fdorg-9', startUtc: '2026-09-02T15:00:00.000Z' });
    const clusters = clusterFixtures([solo, dupA, dupB]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((f) => f.id).sort()).toEqual(['fdorg-9', 'tsdb-1']);
  });

  test('two legs of a tie stay separate', () => {
    const leg1 = fx({ id: 'tsdb-l1', startUtc: '2026-09-01T15:00:00.000Z' });
    const leg2 = fx({ id: 'fdorg-l2', startUtc: '2026-09-15T15:00:00.000Z' });
    expect(clusterFixtures([leg1, leg2])).toHaveLength(0);
  });

  test('three sources for one fight collapse to one cluster', () => {
    const c = clusterFixtures([
      fx({ id: 'tsdb-a', startUtc: '2026-08-29T20:00:00.000Z' }),
      fx({ id: 'bd-b', startUtc: '2026-08-29T22:00:00.000Z' }),
      fx({ id: 'fdorg-c', startUtc: '2026-08-30T01:00:00.000Z' }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toHaveLength(3);
  });
});

// Regression suite built from REAL production data shapes. Each of these
// would silently delete a genuine fixture from someone's calendar if
// same-provider records were allowed to merge.
describe('same-provider records are never merged', () => {
  test('ODI series: same two nations, 2 days apart, all real matches', () => {
    const series = ['2026-09-22', '2026-09-24', '2026-09-27'].map((d, i) =>
      fx({
        id: `tsdb-odi-${i}`,
        sport: 'cricket',
        homeTeam: 'England Cricket',
        awayTeam: 'Sri Lanka Cricket',
        title: 'England Cricket vs Sri Lanka Cricket',
        startUtc: `${d}T10:00:00.000Z`,
      }),
    );
    expect(clusterFixtures(series)).toHaveLength(0);
    expect(isSameFixture(series[0], series[1])).toBe(false);
  });

  test('T20I series across a single week stays three fixtures', () => {
    const series = ['2026-10-06', '2026-10-09', '2026-10-11'].map((d, i) =>
      fx({
        id: `tsdb-t20-${i}`,
        sport: 'cricket',
        homeTeam: 'India Cricket',
        awayTeam: 'West Indies Cricket',
        title: 'India Cricket vs West Indies Cricket',
        startUtc: `${d}T14:00:00.000Z`,
      }),
    );
    expect(clusterFixtures(series)).toHaveLength(0);
  });

  test('golf rounds of one tournament stay four events', () => {
    const rounds = ['Round 1', 'Round 2', 'Round 3', 'Final Round'].map((r, i) =>
      fx({
        id: `tsdb-golf-${i}`,
        sport: 'golf',
        homeTeam: undefined,
        awayTeam: undefined,
        title: `Sony Open in Hawaii ${r}`,
        startUtc: `2026-01-1${6 + i}T01:00:00.000Z`,
      }),
    );
    expect(clusterFixtures(rounds)).toHaveLength(0);
  });

  test('F1 weekend sessions stay separate', () => {
    const sessions = ['Practice 1', 'Practice 2', 'Qualifying', 'Race'].map(
      (s, i) =>
        fx({
          id: `f1-2026-r1-${i}`,
          sport: 'f1',
          homeTeam: undefined,
          awayTeam: undefined,
          title: `Australian Grand Prix — ${s}`,
          startUtc: `2026-03-0${6 + i}T04:00:00.000Z`,
        }),
    );
    expect(clusterFixtures(sessions)).toHaveLength(0);
  });

  test('but the SAME fixture from two providers still merges', () => {
    const a = fx({
      id: 'apisports-1',
      homeTeam: 'Liverpool',
      awayTeam: 'Everton',
      startUtc: '2026-09-01T15:00:00.000Z',
    });
    const b = fx({
      id: 'fdorg-2',
      homeTeam: 'Liverpool',
      awayTeam: 'Everton',
      startUtc: '2026-09-01T14:00:00.000Z',
    });
    expect(clusterFixtures([a, b])).toHaveLength(1);
  });
});

// Both bugs below were found by adversarial review of code that was
// already deployed, before the weekly job ran. Each would have DELETED a
// real fixture from users' calendars.
describe('regression: merges that would destroy real fixtures', () => {
  test('league match and cup tie between the same clubs never merge', () => {
    const league = fx({
      id: 'fdorg-497331',
      competition: 'Premier League',
      competitionId: 'fdorg-comp-PL',
      homeTeam: 'Chelsea',
      awayTeam: 'Arsenal',
      title: 'Chelsea v Arsenal',
      startUtc: '2026-12-13T14:00:00.000Z',
    });
    const cup = fx({
      id: 'tsdb-2411905',
      competition: 'EFL Cup',
      competitionId: 'tsdb-league-4570',
      homeTeam: 'Chelsea',
      awayTeam: 'Arsenal',
      title: 'Chelsea vs Arsenal',
      startUtc: '2026-12-15T20:00:00.000Z',
    });
    expect(isSameFixture(league, cup)).toBe(false);
    expect(clusterFixtures([league, cup])).toHaveLength(0);
  });

  test('clusters cannot chain beyond the window', () => {
    // A~B and B~C must not admit A~C when A and C are 5 days apart.
    const a = fx({ id: 'fdorg-1', startUtc: '2026-09-01T15:00:00.000Z' });
    const b = fx({ id: 'tsdb-2', startUtc: '2026-09-03T15:00:00.000Z' });
    const c = fx({ id: 'apisports-3', startUtc: '2026-09-06T15:00:00.000Z' });
    expect(isSameFixture(a, c)).toBe(false);
    const clusters = clusterFixtures([a, b, c]);
    for (const cl of clusters) {
      for (const x of cl) {
        for (const y of cl) expect(isSameFixture(x, y)).toBe(true);
      }
    }
  });

  test('the same competition across providers still merges', () => {
    const a = fx({ id: 'fdorg-1', competition: 'Premier League' });
    const b = fx({
      id: 'apisports-2',
      competition: 'Premier League',
      startUtc: '2026-09-01T17:00:00.000Z',
    });
    expect(clusterFixtures([a, b])).toHaveLength(1);
  });
});
