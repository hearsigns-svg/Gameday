// Browse directory: curated leagues + team lists with a write-through
// Firestore cache so repeat browsing never re-hits the provider.

import { getFirestore } from 'firebase-admin/firestore';
import { ACTIVE_SEASON, CURATED_SOCCER_LEAGUES } from './config';

const BASE = 'https://v3.football.api-sports.io';

export interface DirectoryTeam {
  id: number;
  name: string;
  key: string; // followable key
}

export function listSoccerLeagues() {
  return CURATED_SOCCER_LEAGUES.map((l) => ({
    ...l,
    key: `apisports-league-${l.id}`,
  }));
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
