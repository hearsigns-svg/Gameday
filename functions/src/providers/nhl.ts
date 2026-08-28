// NHL api-web adapter (api-web.nhle.com) — official, free, no key.
// Teams are keyed by abbreviation (BOS, PHI …) throughout this provider.

import { Fixture, FixtureStatus } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://api-web.nhle.com/v1';

export interface NhlGame {
  id: number;
  startTimeUTC: string;
  gameState: string; // FUT | PRE | LIVE | CRIT | OFF | FINAL
  gameScheduleState?: string; // OK | PPD | CNCL | TBD — disruptions live HERE
  venueTimezone?: string; // IANA zone, e.g. 'US/Eastern'
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

// api-web splits state across TWO fields: gameState is the live
// lifecycle (FUT/PRE/LIVE/CRIT/OFF/FINAL) while gameScheduleState
// carries schedule DISRUPTIONS (OK/PPD/CNCL/TBD). Reading only
// gameState made cancelled and postponed games invisible — a called-off
// game never left anyone's calendar.
function nhlStatus(state: string, scheduleState?: string): FixtureStatus {
  switch (scheduleState) {
    case 'PPD':
      return 'postponed';
    case 'CNCL':
      return 'cancelled';
    case 'TBD':
      return 'tbd';
  }
  switch (state) {
    case 'LIVE':
    case 'CRIT':
      return 'in_play';
    case 'OFF':
    case 'FINAL':
      return 'finished';
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
    // api-web is the only provider that hands us a real IANA zone.
    ...(g.venueTimezone ? { venueTz: g.venueTimezone } : {}),
    status: nhlStatus(g.gameState, g.gameScheduleState),
    durationHours: 2.5,
    // gameScheduleState TBD means the date is set and the time is not.
    timePrecision: g.gameScheduleState === 'TBD' ? 'date_only' : 'exact',
    confidence:
      g.gameScheduleState === 'TBD' || g.gameScheduleState === 'PPD'
        ? 'provisional'
        : 'confirmed',
    updatedAt,
  };
}

export async function fetchNhlTeamSeasonFixtures(
  abbrev: string,
  seasonId: string, // e.g. '20262027'
): Promise<ProviderFetch> {
  const res = await fetch(`${BASE}/club-schedule-season/${abbrev}/${seasonId}`);
  if (!res.ok) throw new Error(`nhl api-web http ${res.status}`);
  const body = (await res.json()) as { games?: NhlGame[] };
  const now = new Date().toISOString();
  const games = requireArray(body.games, 'nhl api-web', 'games');
  return {
    rawCount: games.length,
    fixtures: games.map((g) => normaliseNhlGame(g, now)),
  };
}

// The whole league, via the per-club schedule api-web actually offers
// (there is no full-season league endpoint): one standings call for the
// abbrevs, then one schedule call per club — 33 upstream requests.
// Every game appears on BOTH clubs' schedules, so the union dedupes by
// fixture id. The league-only freshness route (Stage 6 addendum
// ruling): a league-only follower's fixtures refresh without any team
// follower existing.
export async function fetchNhlLeagueSeasonFixtures(
  seasonId: string, // e.g. '20262027'
): Promise<ProviderFetch> {
  const teams = await fetchNhlTeams();
  if (teams.length === 0) throw new Error('nhl api-web returned zero teams');
  const byId = new Map<string, Fixture>();
  let rawCount = 0;
  for (const team of teams) {
    const r = await fetchNhlTeamSeasonFixtures(team.abbrev, seasonId);
    rawCount += r.rawCount;
    for (const f of r.fixtures) byId.set(f.id, f);
  }
  return { rawCount, fixtures: [...byId.values()] };
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
