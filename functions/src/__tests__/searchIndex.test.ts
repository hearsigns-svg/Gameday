// 2026-09-03 search audit — the pure halves of the server search:
// ranking (exact beats prefix beats contained), the bounded live-provider
// wait, and the compact on-device index.

import { Athlete } from '../athletes';
import {
  compactAthletes,
  compactTeams,
  LIVE_SEARCH_BUDGET_MS,
  rankAthletes,
  rankTeamHits,
  withTimeout,
} from '../search';

describe('rankAthletes', () => {
  const a = (over: Partial<Athlete>): Athlete =>
    ({ aliases: [], active: true, sport: 'boxing', ...over }) as unknown as Athlete;
  test('exact, then prefix, then contained; active first; sooner events first and "nothing scheduled" LAST', () => {
    const ranked = rankAthletes(
      [
        a({ id: 'none', displayName: 'Andy Ruiz Jr.', searchName: 'andy ruiz jr.' as Athlete['searchName'] }),
        a({ id: 'soon', displayName: 'Adelaida Ruiz', searchName: 'adelaida ruiz' as Athlete['searchName'], nextStartUtc: '2026-10-01T00:00:00.000Z' }),
        a({ id: 'inactive', displayName: 'Rodrigo Ruiz', searchName: 'rodrigo ruiz' as Athlete['searchName'], active: false }),
        a({ id: 'prefix', displayName: 'Ruiz Diaz', searchName: 'ruiz diaz' as Athlete['searchName'] }),
        a({ id: 'exact', displayName: 'Ruiz', searchName: 'ruiz' as Athlete['searchName'] }),
      ],
      'ruiz',
    ).map((x) => x.id);
    expect(ranked).toEqual(['exact', 'prefix', 'soon', 'none', 'inactive']);
  });
});

describe('rankTeamHits', () => {
  const hits = [
    { name: 'Liverpool FC Women', names: ['Liverpool FC Women', 'Liverpool Women'] },
    { name: 'Liverpool Montevideo', names: ['Liverpool Montevideo'] },
    { name: 'Liverpool', names: ['Liverpool FC', 'Liverpool'] },
  ];
  const namesOf = (h: (typeof hits)[number]) => h.names;

  test('an exact name-or-alias match leads — "liverpool fc" finds the club above the women\'s side', () => {
    expect(rankTeamHits(hits, namesOf, 'liverpool fc').map((h) => h.name)).toEqual([
      'Liverpool',
      'Liverpool FC Women',
      'Liverpool Montevideo',
    ]);
  });

  test('prefix beats contained; shorter names first within a rung; stable otherwise', () => {
    const q = 'liverpool';
    expect(rankTeamHits(hits, namesOf, q).map((h) => h.name)).toEqual([
      'Liverpool', // exact
      'Liverpool FC Women', // prefix, shorter
      'Liverpool Montevideo', // prefix, longer
    ]);
    const contained = [
      { name: 'FC Liverpool Berlin', names: ['FC Liverpool Berlin'] },
      { name: 'Real Liverpool', names: ['Real Liverpool'] },
    ];
    expect(rankTeamHits(contained, (h) => h.names, q).map((h) => h.name)).toEqual([
      'Real Liverpool',
      'FC Liverpool Berlin',
    ]);
  });

  test('folds names the way the query is folded', () => {
    const acc = [{ name: 'Brasileirão', names: ['Brasileirão'] }];
    expect(rankTeamHits(acc, (h) => h.names, 'brasileirao')[0].name).toBe('Brasileirão');
  });
});

describe('withTimeout', () => {
  test('a prompt answer arrives; a slow one yields the fallback on time; a failure yields the fallback', async () => {
    await expect(withTimeout(Promise.resolve([1]), 50, [])).resolves.toEqual([1]);
    // Generous bounds: this suite shares the machine with builds, and a
    // timing test that fails under load tests the load, not the code.
    const slow = new Promise<number[]>((r) => setTimeout(() => r([2]), 3000));
    const started = Date.now();
    await expect(withTimeout(slow, 30, [])).resolves.toEqual([]);
    expect(Date.now() - started).toBeLessThan(2500);
    await expect(withTimeout(Promise.reject(new Error('x')), 50, ['fb'])).resolves.toEqual(['fb']);
    expect(LIVE_SEARCH_BUDGET_MS).toBeLessThanOrEqual(1500); // a keystroke path
  });
});

describe('the compact index', () => {
  test('teams: one entry per key, aliases and marks carried, optional fields omitted when absent', () => {
    const teams = compactTeams([
      {
        sportKey: 'soccer',
        league: 'Premier League',
        teams: [
          { key: 'fdorg-team-64', name: 'Liverpool', aliases: ['Liverpool FC'], crestUrl: 'https://c/64.png', colours: 'Red', burstColours: ['#c00', '#fff'] },
          { key: 'fdorg-team-64', name: 'Liverpool' }, // a second doc listing the same club
          { name: 'no key' },
        ],
      },
      {
        sportKey: 'rugby',
        league: 'Premiership Rugby',
        tsdbPollPath: 'pollTsdbLeague?leagueId=4414',
        teams: [{ key: 'tsdb-team-1', name: 'Bath', aliases: [] }],
      },
    ]);
    expect(teams).toEqual([
      { k: 'fdorg-team-64', n: 'Liverpool', s: 'soccer', l: 'Premier League', a: ['Liverpool FC'], c: 'https://c/64.png', o: 'Red', b: ['#c00', '#fff'] },
      { k: 'tsdb-team-1', n: 'Bath', s: 'rugby', l: 'Premiership Rugby', p: 'pollTsdbLeague?leagueId=4414' },
    ]);
  });

  test('athletes: retired and inactive stay in the index, marked, so a name search still finds them', () => {
    const base = {
      searchName: 'x' as Athlete['searchName'],
      aliases: [] as Athlete['aliases'],
      sport: 'boxing',
      active: true,
    } as Partial<Athlete>;
    const a = (over: Partial<Athlete>): Athlete =>
      ({ ...base, ...over }) as unknown as Athlete;
    const out = compactAthletes([
      a({ id: 'athlete_000001', displayName: 'Moses Itauma', groupingKey: 'boxing-heavyweight', grouping: 'Heavyweight', countryCode: 'GB', accentHue: 200 }),
      a({ id: 'athlete_000002', displayName: 'Roger Federer', sport: 'tennis', active: false, careerStatus: 'retired', careerEndYear: 2022, aliases: ['federer'] as Athlete['aliases'] }),
    ]);
    expect(out[0]).toMatchObject({ k: 'athlete_000001', n: 'Moses Itauma', s: 'boxing', g: 'Heavyweight', c: 'GB', h: 200 });
    expect(out[0]).not.toHaveProperty('i');
    expect(out[1]).toMatchObject({ k: 'athlete_000002', s: 'tennis', r: 'retired', y: 2022, i: 1, a: ['federer'] });
    expect(typeof out[1].h).toBe('number');
  });
});
