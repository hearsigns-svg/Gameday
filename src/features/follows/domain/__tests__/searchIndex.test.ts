// The on-device index answers a keystroke without the network, folded
// and ranked the way the server ranks (2026-09-03 search audit).

import {
  localAthleteHits,
  localTeamHits,
  mergeHits,
  SearchIndex,
} from '../searchIndex';

const index: SearchIndex = {
  at: '2026-09-03T12:00:00.000Z',
  teams: [
    { k: 'fdorg-team-64', n: 'Liverpool', s: 'soccer', l: 'Premier League', a: ['Liverpool FC'], c: 'https://c/64.png' },
    { k: 'tsdb-team-1', n: 'Liverpool FC Women', s: 'soccer', l: 'WSL' },
    { k: 'tsdb-team-2', n: 'Liverpool Montevideo', s: 'soccer', l: 'Copa Libertadores' },
    { k: 'tsdb-team-3', n: 'Brasileirão XI', s: 'soccer', l: 'Brasileirão' },
    { k: 'tsdb-team-9', n: 'Liverpool Lions', s: 'rugby', l: 'Premiership Rugby', p: 'pollTsdbLeague?leagueId=4414' },
  ],
  athletes: [
    { k: 'athlete_1', n: 'Andy Ruiz Jr.', s: 'boxing', g: 'Heavyweight', c: 'MX', h: 10 },
    { k: 'athlete_2', n: 'Adelaida Ruiz', s: 'boxing', g: 'Women’s flyweight', h: 20, x: '2026-10-01T00:00:00.000Z' },
    { k: 'athlete_3', n: 'Rodrigo Fabian Ruiz', s: 'boxing', h: 30, i: 1 },
    { k: 'athlete_4', n: 'Moses Itauma', s: 'boxing', g: 'Heavyweight', c: 'GB', h: 40 },
    { k: 'athlete_5', n: 'Roger Federer', s: 'tennis', a: ['federer'], h: 50, i: 1, r: 'retired', y: 2022 },
  ],
};

test('teams: exact alias match leads, then prefix, then contained; the sport filter narrows', () => {
  expect(localTeamHits(index, 'liverpool fc').map((h) => h.name)).toEqual([
    'Liverpool',
    'Liverpool FC Women',
  ]);
  expect(localTeamHits(index, 'liverpool').map((h) => h.name)).toEqual([
    'Liverpool',
    'Liverpool Lions',
    'Liverpool FC Women',
    'Liverpool Montevideo',
  ]);
  expect(localTeamHits(index, 'liverpool', 'rugby').map((h) => h.key)).toEqual(['tsdb-team-9']);
  // Folded: the accent the keyboard never types.
  expect(localTeamHits(index, 'brasileirao')[0].name).toBe('Brasileirão XI');
  // The hit carries what the row and the follow need.
  expect(localTeamHits(index, 'liverpool fc')[0]).toEqual({
    key: 'fdorg-team-64',
    name: 'Liverpool',
    sportKey: 'soccer',
    league: 'Premier League',
    crestUrl: 'https://c/64.png',
  });
  expect(localTeamHits(index, 'liverpool', 'rugby')[0].pollPath).toBe('pollTsdbLeague?leagueId=4414');
});

test('athletes: active before inactive, sooner events first within a rung; retired stay findable', () => {
  expect(localAthleteHits(index, 'ruiz').map((h) => h.name)).toEqual([
    'Adelaida Ruiz', // active, has a next event
    'Andy Ruiz Jr.', // active, none scheduled
    'Rodrigo Fabian Ruiz', // inactive
  ]);
  expect(localAthleteHits(index, 'andy ruiz').map((h) => h.name)).toEqual(['Andy Ruiz Jr.']);
  expect(localAthleteHits(index, 'itauma')[0]).toMatchObject({
    key: 'athlete_4',
    grouping: 'Heavyweight',
    countryCode: 'GB',
    accentHue: 40,
  });
  expect(localAthleteHits(index, 'federer')[0]).toMatchObject({ careerStatus: 'retired', careerEndYear: 2022 });
});

test('short and empty queries and a missing index answer nothing', () => {
  expect(localTeamHits(index, 'l')).toEqual([]);
  expect(localAthleteHits(index, ' ')).toEqual([]);
  expect(localTeamHits(null, 'liverpool')).toEqual([]);
});

test('merge: server rows lead in server order, local rows the server lacks follow, one row per key', () => {
  const local = [{ key: 'a', v: 'local' }, { key: 'b', v: 'local' }];
  const server = [{ key: 'b', v: 'server' }, { key: 'c', v: 'server' }];
  expect(mergeHits(local, server)).toEqual([
    { key: 'b', v: 'server' },
    { key: 'c', v: 'server' },
    { key: 'a', v: 'local' },
  ]);
  expect(mergeHits(local, null)).toEqual(local);
});
