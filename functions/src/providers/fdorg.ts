// football-data.org v4 adapter — soccer current seasons, free tier
// (12 TIER_ONE competitions; cups are paid tiers — known gap, see
// docs/PROVIDERS.md). The only file that knows this provider's shapes.
//
// Status semantics that matter for the calendar: SCHEDULED means the
// provider has a date and a PLACEHOLDER kick-off, TIMED means the kick-off
// is settled. SCHEDULED used to map to `tbd`, which rendered an all-day
// banner — 380 of 380 Premier League fixtures, and 3,011 across the free
// tier. It is not an absent time, it is an unconfirmed one, so it is now
// `nominal`: written as a timed event that says so, and sharpened in place
// when TIMED lands.

import { Fixture, FixtureStatus } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://api.football-data.org/v4';

interface FdTeamRef {
  id: number;
  name: string;
  shortName?: string;
}

export interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED|TIMED|IN_PLAY|PAUSED|SUSPENDED|FINISHED|AWARDED|POSTPONED|CANCELLED
  competition: { id: number; name: string; code: string };
  homeTeam: FdTeamRef;
  awayTeam: FdTeamRef;
}

const STATUS_MAP: Record<string, FixtureStatus> = {
  SCHEDULED: 'scheduled',
  TIMED: 'scheduled',
  IN_PLAY: 'in_play',
  PAUSED: 'in_play',
  SUSPENDED: 'in_play',
  FINISHED: 'finished',
  AWARDED: 'finished',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
};

function teamLabel(t: FdTeamRef): string {
  return t.shortName || t.name;
}

export function normaliseFdMatch(m: FdMatch, updatedAt: string): Fixture {
  const home = teamLabel(m.homeTeam);
  const away = teamLabel(m.awayTeam);
  const competitionId = `fdorg-comp-${m.competition.code}`;
  return {
    id: `fdorg-${m.id}`,
    sport: 'soccer',
    competition: m.competition.name,
    competitionId,
    title: `${home} v ${away}`,
    homeTeam: home,
    awayTeam: away,
    followKeys: [
      `fdorg-team-${m.homeTeam.id}`,
      `fdorg-team-${m.awayTeam.id}`,
      competitionId,
    ],
    startUtc: new Date(m.utcDate).toISOString(),
    // football-data publishes no venue timezone.
    status: STATUS_MAP[m.status] ?? 'scheduled',
    durationHours: 2,
    // POSTPONED carries the OLD date and no new time, so its day is all
    // that is meaningful. Everything else has a real instant; whether it
    // is the settled one is what SCHEDULED vs TIMED tells us.
    timePrecision:
      m.status === 'POSTPONED'
        ? 'date_only'
        : m.status === 'SCHEDULED'
          ? 'nominal'
          : 'exact',
    confidence:
      m.status === 'SCHEDULED' || m.status === 'POSTPONED'
        ? 'provisional'
        : 'confirmed',
    updatedAt,
  };
}

async function fdGet(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) throw new Error(`football-data http ${res.status}`);
  return res.json();
}

// A team's matches across every competition the plan can see — the
// team-follow spans-all-competitions rule, minus the cup gap.
export async function fetchFdTeamSeasonFixtures(
  apiKey: string,
  teamId: number,
  season?: number, // omit for the team's CURRENT season across all comps
): Promise<ProviderFetch> {
  const body = (await fdGet(
    apiKey,
    season === undefined
      ? `/teams/${teamId}/matches`
      : `/teams/${teamId}/matches?season=${season}`,
  )) as { matches?: FdMatch[] };
  const now = new Date().toISOString();
  const matches = requireArray(body.matches, 'football-data', 'matches');
  return {
    rawCount: matches.length,
    fixtures: matches.map((m) => normaliseFdMatch(m, now)),
  };
}

export async function fetchFdCompetitionSeasonFixtures(
  apiKey: string,
  code: string, // e.g. 'PL', 'CL', 'WC'
  season: number,
): Promise<ProviderFetch> {
  const body = (await fdGet(
    apiKey,
    `/competitions/${code}/matches?season=${season}`,
  )) as { matches?: FdMatch[] };
  const now = new Date().toISOString();
  const matches = requireArray(body.matches, 'football-data', 'matches');
  return {
    rawCount: matches.length,
    fixtures: matches.map((m) => normaliseFdMatch(m, now)),
  };
}

export interface FdDirectoryTeam {
  id: number;
  name: string;
  aliases: string[]; // every published form, for cross-provider matching
  colours?: string; // clubColors free text, e.g. "Red / White"
}

export async function fetchFdCompetitionTeams(
  apiKey: string,
  code: string,
  season: number,
): Promise<FdDirectoryTeam[]> {
  const body = (await fdGet(
    apiKey,
    `/competitions/${code}/teams?season=${season}`,
  )) as {
    teams: Array<{
      id: number;
      name: string;
      shortName?: string;
      tla?: string;
      clubColors?: string;
    }>;
  };
  return body.teams.map((t) => ({
    id: t.id,
    name: t.shortName || t.name,
    // "Wolverhampton Wanderers FC" (name) and "Wolverhampton"
    // (shortName) must BOTH resolve to this club — providers pick
    // different forms.
    aliases: [t.name, t.shortName].filter(
      (n): n is string => typeof n === 'string' && n.length > 0,
    ),
    ...(t.clubColors ? { colours: t.clubColors } : {}),
  }));
}

// The 12 TIER_ONE competitions, curated for browse order.
export const FD_FREE_COMPETITIONS: Array<{
  code: string;
  name: string;
  country: string;
}> = [
  { code: 'PL', name: 'Premier League', country: 'England' },
  { code: 'ELC', name: 'Championship', country: 'England' },
  { code: 'CL', name: 'UEFA Champions League', country: 'Europe' },
  { code: 'PD', name: 'La Liga', country: 'Spain' },
  { code: 'SA', name: 'Serie A', country: 'Italy' },
  { code: 'BL1', name: 'Bundesliga', country: 'Germany' },
  { code: 'FL1', name: 'Ligue 1', country: 'France' },
  { code: 'DED', name: 'Eredivisie', country: 'Netherlands' },
  { code: 'PPL', name: 'Primeira Liga', country: 'Portugal' },
  { code: 'BSA', name: 'Brasileirão', country: 'Brazil' },
  { code: 'WC', name: 'World Cup', country: 'International' },
  { code: 'EC', name: 'European Championship', country: 'International' },
];
