// Browse directory: curated leagues + team lists with a write-through
// Firestore cache so repeat browsing never re-hits the provider.

import { getFirestore } from 'firebase-admin/firestore';
import { ACTIVE_SEASON, CURATED_SOCCER_LEAGUES } from './config';
import { fetchFdCompetitionTeams, FD_FREE_COMPETITIONS } from './providers/fdorg';
import { fetchMlbTeams } from './providers/mlb';
import { fetchNhlTeams } from './providers/nhl';

const BASE = 'https://v3.football.api-sports.io';

export interface DirectoryTeam {
  id: number | string;
  name: string;
  key: string; // followable key
}

// Generic 24h write-through cache for team directories.
async function cachedTeams(
  cacheKey: string,
  load: () => Promise<DirectoryTeam[]>,
): Promise<DirectoryTeam[]> {
  const db = getFirestore();
  const ref = db.collection('teamDirectory').doc(cacheKey);
  const cached = await ref.get();
  if (cached.exists) {
    return (cached.data() as { teams: DirectoryTeam[] }).teams;
  }
  const teams = (await load()).sort((a, b) => a.name.localeCompare(b.name));
  await ref.set({ teams, cachedAt: new Date().toISOString() });
  return teams;
}

// Soccer browse now serves football-data.org's free competitions
// (current seasons). The API-Sports curated list remains below for a
// possible paid-tier upgrade path.
export function listSoccerLeagues() {
  return FD_FREE_COMPETITIONS.map((c) => ({
    id: c.code,
    name: c.name,
    country: c.country,
    key: `fdorg-comp-${c.code}`,
  }));
}

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
  return cachedTeams(`soccer-fd-${code}-${season}`, async () =>
    (await fetchFdCompetitionTeams(apiKey, code, season)).map((t) => ({
      id: t.id,
      name: t.name,
      key: `fdorg-team-${t.id}`,
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

export async function listMlbTeams(season: number): Promise<DirectoryTeam[]> {
  return cachedTeams(`baseball-mlb-${season}`, async () =>
    (await fetchMlbTeams(season)).map((t) => ({
      id: t.id,
      name: t.name,
      key: `mlb-team-${t.id}`,
    })),
  );
}

export async function listNhlTeams(): Promise<DirectoryTeam[]> {
  return cachedTeams('ice-hockey-nhl', async () =>
    (await fetchNhlTeams()).map((t) => ({
      id: t.abbrev,
      name: t.name,
      key: `nhl-team-${t.abbrev}`,
    })),
  );
}
