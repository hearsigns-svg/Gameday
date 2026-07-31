// API-Sports (api-football v3) adapter.
//
// QUARANTINED 2026-07-31. The account is suspended: every call returns
// HTTP 200 with `{"errors":{"access":"Your account is suspended..."}}`,
// and the free tier never covered current seasons anyway (2022-24 only).
// Nothing routes here — pollTeam/pollLeague are out of the sweep's
// allowlist and out of the client's pollPathFor — but the adapter, its
// contract test and the two endpoints are KEPT: the shapes are correct,
// and a paid tier would make this file live again unchanged.
//
// The 63 apisports-* fixtures already in the cache are left alone; they
// are all in the past and the horizon rule freezes them.

import { Fixture, FixtureStatus } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

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

export interface ApiFixtureRow {
  fixture: {
    id: number;
    date: string;
    timezone: string;
    status: { short: string };
  };
  league: { id: number; name: string };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
}

async function fetchRows(
  apiKey: string,
  query: string,
): Promise<ApiFixtureRow[]> {
  const res = await fetch(`${BASE}/fixtures?${query}`, {
    headers: { 'x-apisports-key': apiKey },
  });
  if (!res.ok) throw new Error(`api-sports http ${res.status}`);
  const body = (await res.json()) as {
    errors: unknown;
    response?: ApiFixtureRow[];
  };
  const errors = body.errors;
  if (errors && Object.keys(errors).length > 0) {
    throw new Error(`api-sports error: ${JSON.stringify(errors)}`);
  }
  return requireArray(body.response, 'api-sports', 'response');
}

export async function fetchTeamSeasonFixtures(
  apiKey: string,
  teamId: number,
  season: number,
): Promise<ProviderFetch> {
  const now = new Date().toISOString();
  const rows = await fetchRows(apiKey, `team=${teamId}&season=${season}`);
  return {
    rawCount: rows.length,
    fixtures: rows.map((row) => normaliseRow(row, now)),
  };
}

export async function fetchLeagueSeasonFixtures(
  apiKey: string,
  leagueId: number,
  season: number,
): Promise<ProviderFetch> {
  const now = new Date().toISOString();
  const rows = await fetchRows(apiKey, `league=${leagueId}&season=${season}`);
  return {
    rawCount: rows.length,
    fixtures: rows.map((row) => normaliseRow(row, now)),
  };
}

export function normaliseRow(row: ApiFixtureRow, updatedAt: string): Fixture {
  const competitionId = `apisports-league-${row.league.id}`;
  return {
    id: `apisports-${row.fixture.id}`,
    sport: 'soccer',
    competition: row.league.name,
    competitionId,
    title: `${row.teams.home.name} v ${row.teams.away.name}`,
    homeTeam: row.teams.home.name,
    awayTeam: row.teams.away.name,
    followKeys: [
      `apisports-team-${row.teams.home.id}`,
      `apisports-team-${row.teams.away.id}`,
      competitionId,
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
