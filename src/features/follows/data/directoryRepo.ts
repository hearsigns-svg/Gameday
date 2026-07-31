// Browse directory reads (leagues, teams) from the functions layer.

import { functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';

export interface DirectoryLeague {
  id: number | string;
  name: string;
  country: string;
  key: string;
  followOnly?: boolean;
  // Explicit false = browse its teams, but the competition itself has no
  // poller and must not offer "Follow all".
  followable?: boolean;
  season?: number;
  pollPath?: string;
  // May contain the literal {teamId}, substituted when a team inside this
  // competition is followed.
  teamPollPath?: string;
}

export interface DirectoryTeam {
  id: number | string;
  name: string;
  key: string;
  crestUrl?: string;
  colours?: string; // free-text kit colours ("Red / White")
}

export interface SearchTeamHit {
  key: string;
  name: string;
  sportKey: string;
  league: string;
  crestUrl?: string;
  colours?: string;
  pollPath?: string;
}

async function getJson<T>(path: string): Promise<Result<T>> {
  try {
    const res = await fetch(`${functionsBaseUrl}/${path}`);
    if (!res.ok) {
      return err({ kind: 'provider', status: res.status, message: await res.text() });
    }
    return ok((await res.json()) as T);
  } catch {
    return err({ kind: 'offline' });
  }
}

export async function fetchLeagues(): Promise<Result<DirectoryLeague[]>> {
  const r = await getJson<{ leagues: DirectoryLeague[] }>('listLeagues');
  return r.ok ? ok(r.value.leagues) : r;
}

export async function fetchTeams(
  sportKey: string,
  leagueId: number | string,
): Promise<Result<DirectoryTeam[]>> {
  const r = await getJson<{ teams: DirectoryTeam[] }>(
    `listTeams?sport=${encodeURIComponent(sportKey)}&leagueId=${leagueId}`,
  );
  return r.ok ? ok(r.value.teams) : r;
}

// Federated team search — server-filtered to leagues we actually serve.
export async function searchTeams(
  query: string,
): Promise<Result<SearchTeamHit[]>> {
  const r = await getJson<{ teams: SearchTeamHit[] }>(
    `searchEntities?q=${encodeURIComponent(query)}`,
  );
  // A 404 means the route isn't deployed (yet) — degrade to "no team
  // results" so local sports/competitions keep working; real provider
  // failures and offline stay visible.
  if (!r.ok && r.error.kind === 'provider' && r.error.status === 404) {
    return ok([]);
  }
  return r.ok ? ok(r.value.teams) : r;
}
