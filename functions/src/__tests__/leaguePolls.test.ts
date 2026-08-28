// League-wide freshness fetchers (Stage 6 addendum): the NHL union must
// dedupe the double-listing (every game is on BOTH clubs' schedules),
// and the MLB call must be the WHOLE league — no teamId filter.

import { fetchMlbLeagueSeasonFixtures } from '../providers/mlb';
import { fetchNhlLeagueSeasonFixtures } from '../providers/nhl';

const nhlGame = (id: number, home: string, away: string) => ({
  id,
  startTimeUTC: '2026-10-08T23:00:00Z',
  gameState: 'FUT',
  homeTeam: { abbrev: home, commonName: { default: home } },
  awayTeam: { abbrev: away, commonName: { default: away } },
});

const jsonRes = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as Response;

afterEach(() => {
  (global.fetch as jest.Mock | undefined)?.mockRestore?.();
});

test('NHL league fetch unions every club schedule, deduped by game id', async () => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes('/standings/now')) {
      return jsonRes({
        standings: [
          { teamAbbrev: { default: 'BOS' }, teamName: { default: 'Bruins' } },
          { teamAbbrev: { default: 'WSH' }, teamName: { default: 'Capitals' } },
        ],
      });
    }
    if (u.includes('/club-schedule-season/BOS/20262027')) {
      return jsonRes({ games: [nhlGame(1, 'BOS', 'WSH'), nhlGame(2, 'BOS', 'MTL')] });
    }
    if (u.includes('/club-schedule-season/WSH/20262027')) {
      return jsonRes({ games: [nhlGame(1, 'BOS', 'WSH'), nhlGame(3, 'WSH', 'NYR')] });
    }
    throw new Error(`unexpected url ${u}`);
  }) as unknown as typeof fetch;

  const r = await fetchNhlLeagueSeasonFixtures('20262027');
  // The shared game appears once; nothing is lost.
  expect(r.fixtures.map((f) => f.id).sort()).toEqual([
    'nhl-1',
    'nhl-2',
    'nhl-3',
  ]);
  expect(r.rawCount).toBe(4); // what the wire actually carried
});

test('NHL league fetch refuses a zero-team standings answer', async () => {
  global.fetch = jest.fn(async () =>
    jsonRes({ standings: [] }),
  ) as unknown as typeof fetch;
  await expect(fetchNhlLeagueSeasonFixtures('20262027')).rejects.toThrow(
    'zero teams',
  );
});

test('MLB league fetch queries the whole league — no teamId filter', async () => {
  global.fetch = jest.fn(async (url: RequestInfo | URL) => {
    expect(String(url)).not.toContain('teamId');
    expect(String(url)).toContain('sportId=1');
    return jsonRes({
      dates: [
        {
          games: [
            {
              gamePk: 777,
              gameDate: '2026-04-01T18:00:00Z',
              status: { abstractGameState: 'Preview', detailedState: 'Scheduled' },
              teams: {
                home: { team: { id: 111, name: 'Boston Red Sox' } },
                away: { team: { id: 140, name: 'Texas Rangers' } },
              },
            },
          ],
        },
      ],
    });
  }) as unknown as typeof fetch;

  const r = await fetchMlbLeagueSeasonFixtures(2026);
  expect(r.fixtures).toHaveLength(1);
  expect(r.fixtures[0].id).toBe('mlb-777');
  expect(r.fixtures[0].followKeys).toContain('mlb-league-1');
});
