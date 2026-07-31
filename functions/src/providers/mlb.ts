// MLB Stats API adapter (statsapi.mlb.com) — official, free, no key.
// The only file that knows this provider's shapes.

import { Fixture, FixtureStatus } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://statsapi.mlb.com/api/v1';

export interface MlbGame {
  gamePk: number;
  gameDate: string; // ISO UTC
  status: {
    abstractGameState: string; // Preview | Live | Final
    detailedState: string; // Scheduled | Postponed | Cancelled | ...
    startTimeTBD?: boolean;
  };
  teams: {
    home: { team: { id: number; name: string } };
    away: { team: { id: number; name: string } };
  };
}

interface ScheduleResponse {
  dates?: Array<{ games?: MlbGame[] }>;
}

function mlbStatus(g: MlbGame): FixtureStatus {
  if (g.status.startTimeTBD) return 'tbd';
  const d = g.status.detailedState;
  if (d.startsWith('Postponed')) return 'postponed';
  if (d.startsWith('Cancelled')) return 'cancelled';
  if (d.startsWith('Suspended')) return 'in_play';
  switch (g.status.abstractGameState) {
    case 'Live':
      return 'in_play';
    case 'Final':
      return 'finished';
    default:
      return 'scheduled';
  }
}

export function normaliseMlbGame(g: MlbGame, updatedAt: string): Fixture {
  const home = g.teams.home.team;
  const away = g.teams.away.team;
  return {
    id: `mlb-${g.gamePk}`,
    sport: 'baseball',
    competition: 'MLB',
    competitionId: 'mlb-league-1',
    title: `${away.name} at ${home.name}`,
    homeTeam: home.name,
    awayTeam: away.name,
    followKeys: [`mlb-team-${home.id}`, `mlb-team-${away.id}`, 'mlb-league-1'],
    startUtc: new Date(g.gameDate).toISOString(),
    // statsapi publishes no venue timezone on the schedule endpoint.
    status: mlbStatus(g),
    durationHours: 3,
    // startTimeTBD is the provider saying the day is set and the first
    // pitch is not.
    timePrecision: g.status.startTimeTBD ? 'date_only' : 'exact',
    confidence: g.status.startTimeTBD ? 'provisional' : 'confirmed',
    updatedAt,
  };
}

export async function fetchMlbTeamSeasonFixtures(
  teamId: number,
  season: number,
): Promise<ProviderFetch> {
  const res = await fetch(
    `${BASE}/schedule?sportId=1&teamId=${teamId}&startDate=${season}-02-01&endDate=${season}-11-30`,
  );
  if (!res.ok) throw new Error(`mlb statsapi http ${res.status}`);
  const body = (await res.json()) as ScheduleResponse;
  const now = new Date().toISOString();
  const games = requireArray(body.dates, 'mlb statsapi', 'dates').flatMap((d) =>
    requireArray(d.games, 'mlb statsapi', 'dates[].games'),
  );
  return {
    rawCount: games.length,
    fixtures: games.map((g) => normaliseMlbGame(g, now)),
  };
}

export interface MlbTeamRow {
  id: number;
  name: string;
}

export async function fetchMlbTeams(season: number): Promise<MlbTeamRow[]> {
  const res = await fetch(`${BASE}/teams?sportId=1&season=${season}`);
  if (!res.ok) throw new Error(`mlb statsapi http ${res.status}`);
  const body = (await res.json()) as {
    teams: Array<{ id: number; name: string }>;
  };
  return body.teams.map((t) => ({ id: t.id, name: t.name }));
}
