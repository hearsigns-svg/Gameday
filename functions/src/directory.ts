// Browse directory: curated leagues + team lists with a write-through
// Firestore cache so repeat browsing never re-hits the provider.

import { getFirestore } from 'firebase-admin/firestore';
import { ACTIVE_SEASON, CURATED_SOCCER_LEAGUES } from './config';
import { FdSeason } from './fdSeasons';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';
import { normaliseName } from './identity';
import { fetchFdCompetitionTeams, FD_FREE_COMPETITIONS } from './providers/fdorg';
import { fetchMlbTeams } from './providers/mlb';
import { fetchNhlTeams } from './providers/nhl';
import { fetchTsdbLeagueTeams } from './providers/tsdb';

const BASE = 'https://v3.football.api-sports.io';

export interface DirectoryTeam {
  id: number | string;
  name: string;
  key: string; // followable key
  // Every other name this club is published under, so fixtures from a
  // different provider can be matched back to this key.
  aliases?: string[];
  crestUrl?: string; // provider artwork (client filters SVG)
  colours?: string; // free-text kit colours, e.g. "Red / White"
  // The crest's two dominant colours, extracted server-side at cache
  // build (Round 3) — the follow burst's discrete palette. Absent when
  // the crest is missing, non-PNG, or nothing chromatic survived.
  burstColours?: string[];
}

// Generic 24h write-through cache for team directories.
//
// The TTL was documented and never implemented: `cachedAt` was written and
// never read, so a directory fetched once was served forever — promoted
// and relegated clubs never appeared or disappeared, and the alias table
// built from these documents could never improve.
import { enrichBurstColours } from './crestColours';

export const DIRECTORY_TTL_MS = 24 * 3_600_000;

// teamDirectory doc ids, SINGLE-SOURCED at the writer. search.ts and
// teamCounts.ts join on these docs; when the formats lived as separate
// literals in each reader, renaming a writer key would have silently
// orphaned every reader with nothing failing — the no-failure failure
// class rule 13 warns about. The TSDB family's ids are already
// single-sourced as TSDB_TEAM_LEAGUES[..].cacheKey.
export const fdTeamsDocId = (code: string, season: number): string =>
  `soccer-fd-${code}-${season}`;
export const mlbTeamsDocId = (season: number): string =>
  `baseball-mlb-${season}`;
export const NHL_TEAMS_DOC_ID = 'ice-hockey-nhl';

// SCHEMA EPOCH — a cache entry written before the shape changed is
// STALE regardless of its age (Prompt 13). Crests came back in the
// provider layer, but the 24h directory cache went on serving documents
// captured between the 9b removal and this restoration: NBA, NFL, the
// IPL, MLB and the Six Nations all had full team lists with zero
// crests, and would have kept serving them for another seventeen hours
// while every league that happened to be cached before 9b, or after
// this change, looked correct.
//
// A field addition is a schema change, and a time-based cache cannot
// see one. Bumping this timestamp invalidates every entry captured
// before it, so the next request repopulates from the provider —
// SELF-HEALING, and no production document has to be deleted by hand.
// Bump it whenever a field is added to DirectoryTeam or its providers.
export const DIRECTORY_SCHEMA_EPOCH = Date.parse('2026-08-28T15:00:00.000Z'); // burstColours joined the shape (Round 3)

export function isDirectoryFresh(
  cachedAt: string | undefined,
  nowMs: number,
  ttlMs: number = DIRECTORY_TTL_MS,
): boolean {
  if (!cachedAt) return false;
  const at = Date.parse(cachedAt);
  if (Number.isNaN(at)) return false;
  // Captured before the current shape: stale however recent it is.
  if (at < DIRECTORY_SCHEMA_EPOCH) return false;
  return nowMs - at < ttlMs;
}

async function cachedTeams(
  cacheKey: string,
  load: () => Promise<DirectoryTeam[]>,
): Promise<DirectoryTeam[]> {
  const db = getFirestore();
  const ref = db.collection('teamDirectory').doc(cacheKey);
  const cached = await ref.get();
  const data = cached.exists
    ? (cached.data() as { teams?: DirectoryTeam[]; cachedAt?: string })
    : undefined;
  if (data?.teams && isDirectoryFresh(data.cachedAt, Date.now())) {
    return data.teams;
  }
  let teams: DirectoryTeam[];
  try {
    teams = (await load()).sort((a, b) => a.name.localeCompare(b.name));
    // Crest colours ride the same refresh the crests do (Round 3): the
    // client never decodes an image.
    teams = await enrichBurstColours(teams);
  } catch (e) {
    // A refresh failure must not empty a directory the user can already
    // browse. Serve the stale copy and say so; only fail when there is
    // nothing to fall back to.
    if (data?.teams) {
      console.warn(`[kickoffcal] directory refresh failed for ${cacheKey}: ${e}`);
      return data.teams;
    }
    throw e;
  }
  await ref.set({ teams, cachedAt: new Date().toISOString() });
  return teams;
}

// Soccer browse: football-data.org free competitions (current seasons)
// + TSDB-backed cups plugging the free-tier cup gap. Cups are follow-
// only (no team drill-down — TSDB team ids don't match fdorg follows).
// The API-Sports curated list remains below for a paid upgrade path.
// Soccer browse. football-data competitions appear ONLY when the provider
// says they have a current season that has not already ended — resolution
// comes from fdSeasons.ts, one call a day for all of them. A competition
// that cannot be resolved is omitted entirely rather than shown with a
// Follow button that rolls back: the Champions League and the European
// Championship both did exactly that, because one global season constant
// said 2026 while their current seasons were 2025 and 2024.
export function listSoccerLeagues(seasons: ReadonlyMap<string, FdSeason>) {
  return [
    ...FD_FREE_COMPETITIONS.filter((c) => seasons.has(c.code)).map((c) => {
      const season = seasons.get(c.code)!.seasonYear;
      return {
        id: c.code,
        name: c.name,
        country: c.country,
        key: `fdorg-comp-${c.code}`,
        season,
        pollPath: `pollFdCompetition?code=${c.code}&season=${season}`,
        // {teamId} is substituted by the client when a team is followed
        // from inside this competition.
        teamPollPath: `pollFdTeam?teamId={teamId}&season=${season}`,
      };
    }),
    {
      id: '4482',
      name: 'FA Cup',
      country: 'England',
      key: 'tsdb-league-4482',
      followOnly: true,
      pollPath:
        'pollTsdbLeague?leagueId=4482&season=2025-2026&sport=soccer&durationHours=2',
    },
    {
      id: '4570',
      name: 'EFL Cup',
      country: 'England',
      key: 'tsdb-league-4570',
      followOnly: true,
      pollPath:
        'pollTsdbLeague?leagueId=4570&season=2026-2027&sport=soccer&durationHours=2',
    },
    {
      id: '4481',
      name: 'UEFA Europa League',
      country: 'Europe',
      key: 'tsdb-league-4481',
      followOnly: true,
      pollPath:
        'pollTsdbLeague?leagueId=4481&season=2026-2027&sport=soccer&durationHours=2',
    },
    ...TSDB_SOCCER_EXTRAS.map((c) => {
      // A competition with a seeded team directory can be drilled into;
      // the rest stay follow-only because we have no squad list for them.
      const hasTeams = c.id in TSDB_TEAM_LEAGUES;
      const pollPath = `pollTsdbLeague?leagueId=${c.id}&season=${c.season}&sport=soccer&durationHours=2`;
      return {
        id: c.id,
        name: c.name,
        country: c.country,
        key: `tsdb-league-${c.id}`,
        ...(hasTeams ? {} : { followOnly: true }),
        pollPath,
        // Following a TEAM inside a TSDB league polls the whole league —
        // there is no per-team route — so the same path serves both.
        ...(hasTeams ? { teamPollPath: pollPath } : {}),
      };
    }),
  ];
}

// Competitions a fan expects that football-data's free tier omits.
// Verified live 2026-07-27: each returns real upcoming fixtures with
// real kick-off times.
const TSDB_SOCCER_EXTRAS = [
  { id: '5071', name: 'UEFA Conference League', country: 'Europe', season: '2026-2027' },
  { id: '4480', name: 'Champions League qualifying', country: 'Europe', season: '2026-2027' },
  { id: '4490', name: 'UEFA Nations League', country: 'Europe', season: '2026-2027' },
  { id: '4396', name: 'League One', country: 'England', season: '2026-2027' },
  { id: '4397', name: 'League Two', country: 'England', season: '2026-2027' },
  { id: '4330', name: 'Scottish Premiership', country: 'Scotland', season: '2026-2027' },
  { id: '4485', name: 'DFB-Pokal', country: 'Germany', season: '2026-2027' },
  { id: '4506', name: 'Coppa Italia', country: 'Italy', season: '2026-2027' },
];

export function listApiSportsLeagues() {
  return CURATED_SOCCER_LEAGUES.map((l) => ({
    ...l,
    key: `apisports-league-${l.id}`,
  }));
}

export async function listFdSoccerTeams(
  apiKey: string,
  code: string,
  season: number,
): Promise<DirectoryTeam[]> {
  // Cache key carries the season, so a season roll re-fetches rather than
  // serving last year's squad forever.
  return cachedTeams(fdTeamsDocId(code, season), async () =>
    (await fetchFdCompetitionTeams(apiKey, code, season)).map((t) => ({
      id: t.id,
      name: t.name,
      key: `fdorg-team-${t.id}`,
      aliases: t.aliases,
      ...(t.crestUrl ? { crestUrl: t.crestUrl } : {}),
      ...(t.colours ? { colours: t.colours } : {}),
    })),
  );
}

interface ApiTeamRow {
  team: { id: number; name: string };
}

export async function listSoccerTeams(
  apiKey: string,
  leagueId: number,
): Promise<DirectoryTeam[]> {
  const db = getFirestore();
  const cacheRef = db.collection('teamDirectory').doc(`soccer-${leagueId}`);
  const cached = await cacheRef.get();
  if (cached.exists) {
    return (cached.data() as { teams: DirectoryTeam[] }).teams;
  }

  const res = await fetch(
    `${BASE}/teams?league=${leagueId}&season=${ACTIVE_SEASON}`,
    { headers: { 'x-apisports-key': apiKey } },
  );
  if (!res.ok) throw new Error(`api-sports http ${res.status}`);
  const body = (await res.json()) as {
    errors: unknown;
    response: ApiTeamRow[];
  };
  if (body.errors && Object.keys(body.errors).length > 0) {
    throw new Error(`api-sports error: ${JSON.stringify(body.errors)}`);
  }
  const teams = body.response
    .map((r) => ({
      id: r.team.id,
      name: r.team.name,
      key: `apisports-team-${r.team.id}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  await cacheRef.set({ teams, cachedAt: new Date().toISOString() });
  return teams;
}

// CREST/BADGE ENRICHMENT — RESTORED (Prompt 13, owner reversal of the
// 9b removal; risk accepted, takedown procedure in DECISIONS). NHL and
// MLB publish official logos as SVG only, which RN Image cannot
// render, so club badges come from TheSportsDB (PNG), joined by
// normalised name onto the official team list. Enrichment must never
// break the directory: any TSDB failure just means no badges, exactly
// as before — a badge-less directory beats a broken one.

async function tsdbBadgesByName(
  tsdbKey: string | undefined,
  leagueName: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!tsdbKey) return map;
  try {
    for (const t of await fetchTsdbLeagueTeams(tsdbKey, leagueName)) {
      if (t.crestUrl) map.set(normaliseName(t.name), t.crestUrl);
    }
  } catch {
    // badge-less directory beats a broken one
  }
  return map;
}

export async function listMlbTeams(
  season: number,
  tsdbKey?: string,
): Promise<DirectoryTeam[]> {
  return cachedTeams(mlbTeamsDocId(season), async () => {
    const badges = await tsdbBadgesByName(tsdbKey, 'MLB');
    return (await fetchMlbTeams(season)).map((t) => {
      const crestUrl = badges.get(normaliseName(t.name));
      return {
        id: t.id,
        name: t.name,
        key: `mlb-team-${t.id}`,
        ...(crestUrl ? { crestUrl } : {}),
      };
    });
  });
}

export async function listNhlTeams(tsdbKey?: string): Promise<DirectoryTeam[]> {
  return cachedTeams(NHL_TEAMS_DOC_ID, async () => {
    const badges = await tsdbBadgesByName(tsdbKey, 'NHL');
    return (await fetchNhlTeams()).map((t) => {
      const crestUrl = badges.get(normaliseName(t.name));
      return {
        id: t.abbrev,
        name: t.name,
        key: `nhl-team-${t.abbrev}`,
        ...(crestUrl ? { crestUrl } : {}),
      };
    });
  });
}

export async function listTsdbTeams(
  apiKey: string,
  leagueName: string,
  cacheKey: string,
): Promise<DirectoryTeam[]> {
  return cachedTeams(cacheKey, async () =>
    (await fetchTsdbLeagueTeams(apiKey, leagueName)).map((t) => ({
      id: t.id,
      name: t.name,
      key: `tsdb-team-${t.id}`,
      ...(t.crestUrl ? { crestUrl: t.crestUrl } : {}),
    })),
  );
}
