// API-Sports (api-football v3) adapter: fetch + normalise into the
// canonical Fixture. The only file that knows this provider's shapes.

import { Fixture, FixtureStatus } from '../fixture';

const BASE = 'https://v3.football.api-sports.io';

// https://www.api-football.com/documentation-v3 status codes
const STATUS_MAP: Record<string, FixtureStatus> = {
  TBD: 'tbd',
  NS: 'scheduled',
  PST: 'postponed',
  CANC: 'cancelled',
  ABD: 'cancelled',
  AWD: 'finished',
  WO: 'finished',
  FT: 'finished',
  AET: 'finished',
  PEN: 'finished',
  '1H': 'in_play',
  HT: 'in_play',
  '2H': 'in_play',
  ET: 'in_play',
  BT: 'in_play',
  P: 'in_play',
  SUSP: 'in_play',
  INT: 'in_play',
  LIVE: 'in_play',
};

interface ApiFixtureRow {
  fixture: {
    id: number;
    date: string;
    timezone: string;
    status: { short: string };
  };
  league: { name: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

export async function fetchTeamSeasonFixtures(
  apiKey: string,
  teamId: number,
  season: number,
): Promise<Fixture[]> {
  const res = await fetch(`${BASE}/fixtures?team=${teamId}&season=${season}`, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) throw new Error(`api-sports http ${res.status}`);
  const body = (await res.json()) as {
    errors: unknown;
    response: ApiFixtureRow[];
  };
  const errors = body.errors;
  if (errors && Object.keys(errors).length > 0) {
    throw new Error(`api-sports error: ${JSON.stringify(errors)}`);
  }
  const now = new Date().toISOString();
  return body.response.map((row) => normaliseRow(row, now));
}

export function normaliseRow(row: ApiFixtureRow, updatedAt: string): Fixture {
  return {
    id: `apisports-${row.fixture.id}`,
    sport: 'soccer',
    competition: row.league.name,
    homeTeam: row.teams.home.name,
    awayTeam: row.teams.away.name,
    teamIds: [
      `apisports-team-${row.teams.home.id}`,
      `apisports-team-${row.teams.away.id}`,
    ],
    startUtc: new Date(row.fixture.date).toISOString(),
    venueTz:
      row.fixture.timezone && row.fixture.timezone !== 'UTC'
        ? row.fixture.timezone
        : 'UTC',
    status: STATUS_MAP[row.fixture.status.short] ?? 'scheduled',
    updatedAt,
  };
}
