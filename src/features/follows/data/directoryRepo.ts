// Browse directory reads (leagues, teams) from the functions layer.

import { functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';

export interface DirectoryLeague {
  id: number;
  name: string;
  country: string;
  key: string;
}

export interface DirectoryTeam {
  id: number;
  name: string;
  key: string;
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
  leagueId: number,
): Promise<Result<DirectoryTeam[]>> {
  const r = await getJson<{ teams: DirectoryTeam[] }>(
    `listTeams?leagueId=${leagueId}`,
  );
  return r.ok ? ok(r.value.teams) : r;
}
