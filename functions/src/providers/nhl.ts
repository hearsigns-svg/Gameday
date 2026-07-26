// NHL api-web adapter (api-web.nhle.com) — official, free, no key.
// Teams are keyed by abbreviation (BOS, PHI …) throughout this provider.

import { Fixture, FixtureStatus } from '../fixture';

const BASE = 'https://api-web.nhle.com/v1';

export interface NhlGame {
  id: number;
  startTimeUTC: string;
  gameState: string; // FUT | PRE | LIVE | CRIT | OFF | FINAL | PPD | CNCL
  homeTeam: NhlTeamRef;
  awayTeam: NhlTeamRef;
}

interface NhlTeamRef {
  abbrev: string;
  placeName?: { default: string };
  commonName?: { default: string };
}

function teamName(t: NhlTeamRef): string {
  const name = [t.placeName?.default, t.commonName?.default]
    .filter(Boolean)
    .join(' ');
  return name || t.abbrev;
}

function nhlStatus(state: string): FixtureStatus {
  switch (state) {
    case 'LIVE':
    case 'CRIT':
      return 'in_play';
    case 'OFF':
    case 'FINAL':
      return 'finished';
    case 'PPD':
      return 'postponed';
    case 'CNCL':
      return 'cancelled';
    default: // FUT, PRE
      return 'scheduled';
  }
}

export function normaliseNhlGame(g: NhlGame, updatedAt: string): Fixture {
  const home = teamName(g.homeTeam);
  const away = teamName(g.awayTeam);
  return {
    id: `nhl-${g.id}`,
    sport: 'ice-hockey',
    competition: 'NHL',
    competitionId: 'nhl-league-1',
    title: `${away} at ${home}`,
    homeTeam: home,
    awayTeam: away,
    followKeys: [
      `nhl-team-${g.homeTeam.abbrev}`,
      `nhl-team-${g.awayTeam.abbrev}`,
      'nhl-league-1',
    ],
    startUtc: new Date(g.startTimeUTC).toISOString(),
    venueTz: 'UTC',
    status: nhlStatus(g.gameState),
    durationHours: 2.5,
    updatedAt,
  };
}

export async function fetchNhlTeamSeasonFixtures(
  abbrev: string,
  seasonId: string, // e.g. '20262027'
): Promise<Fixture[]> {
  const res = await fetch(`${BASE}/club-schedule-season/${abbrev}/${seasonId}`);
  if (!res.ok) throw new Error(`nhl api-web http ${res.status}`);
  const body = (await res.json()) as { games: NhlGame[] };
  const now = new Date().toISOString();
  return body.games.map((g) => normaliseNhlGame(g, now));
}

export interface NhlTeamRow {
  abbrev: string;
  name: string;
}

export async function fetchNhlTeams(): Promise<NhlTeamRow[]> {
  const res = await fetch(`${BASE}/standings/now`);
  if (!res.ok) throw new Error(`nhl api-web http ${res.status}`);
  const body = (await res.json()) as {
    standings: Array<{
      teamAbbrev: { default: string };
      teamName: { default: string };
    }>;
  };
  return body.standings.map((s) => ({
    abbrev: s.teamAbbrev.default,
    name: s.teamName.default,
  }));
}
