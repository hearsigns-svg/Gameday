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
  colours?: string; // free-text kit colours ("Red / White")
}

export interface SearchTeamHit {
  key: string;
  name: string;
  sportKey: string;
  league: string;
  colours?: string;
  pollPath?: string;
}

export interface SearchAthleteHit {
  key: string; // CANONICAL athlete id (athlete_000184) — the follow key
  name: string;
  sportKey: string;
  grouping?: string; // 'Heavyweight' | 'WTA Tour — Women' — the caption
  nextStartUtc?: string;
  accentHue?: number; // generated colour identity (optional: deploy skew)
  // Recorded retirement (Prompt 12). Optional in BOTH directions: a
  // pre-Prompt-12 server never sends it, and a source that says nothing
  // about a career end never sets it. ABSENT MEANS UNKNOWN — never
  // render it as "active", and never infer the opposite.
  careerStatus?: 'retired';
  careerEndYear?: number;
  // Pre-Prompt-8 servers sent a pollPath; athlete follows no longer
  // need one (the catalogue keeps their sources warm), but the field is
  // kept optional so deploy skew in either direction stays harmless.
  pollPath?: string;
}

// ─── Individual-sport browse (Prompt 8) ───────────────────────────────

export interface AthleteCard {
  key: string;
  name: string;
  sportKey: string;
  rank?: number;
  championOf?: string[];
  countryCode?: string;
  grouping?: string;
  nextStartUtc?: string;
  accentHue?: number; // generated colour identity (optional: deploy skew)
  careerStatus?: 'retired'; // recorded retirement; absent = unknown
  careerEndYear?: number;
}

export interface AthleteBrowse {
  groups: Array<{
    grouping: string;
    groupingKey: string;
    athletes: AthleteCard[];
  }>;
  competingSoon: AthleteCard[];
}

export interface SearchHits {
  teams: SearchTeamHit[];
  athletes: SearchAthleteHit[];
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

// Tennis tournaments as followable competitions (Prompt 9): one row
// per canonical tournament, joint ATP+WTA events already merged
// server-side under the year-agnostic `tennis-t-` key.
export interface TournamentRow {
  key: string;
  name: string;
  tours: 'atp' | 'wta' | 'joint';
  startUtc: string;
  endUtc: string;
}

export async function fetchTournaments(): Promise<Result<TournamentRow[]>> {
  const r = await getJson<{ tournaments: TournamentRow[] }>('listTournaments');
  // A 404 means the route isn't deployed yet — degrade to "no
  // tournament rows" so the tour rows keep working; real failures stay
  // loud.
  if (!r.ok && r.error.kind === 'provider' && r.error.status === 404) {
    return ok([]);
  }
  return r.ok ? ok(r.value.tournaments) : r;
}

// The curated athlete lists for a sport's browse screen. A failure is a
// failure — an empty directory rendered from an error would read as
// "this sport has nobody", the standing invariant's failure mode.
export async function fetchAthleteBrowse(
  sportKey: string,
): Promise<Result<AthleteBrowse>> {
  return getJson<AthleteBrowse>(
    `listAthletes?sport=${encodeURIComponent(sportKey)}`,
  );
}

// Federated search — teams server-filtered to leagues we actually
// serve, athletes from the canonical directory (an athlete with no
// scheduled event is findable; that is the point of the directory).
export async function searchEntities(
  query: string,
): Promise<Result<SearchHits>> {
  const r = await getJson<{
    teams: SearchTeamHit[];
    athletes?: SearchAthleteHit[];
  }>(`searchEntities?q=${encodeURIComponent(query)}`);
  // A 404 means the route isn't deployed (yet) — degrade to "no server
  // results" so local sports/competitions keep working; real provider
  // failures and offline stay visible.
  if (!r.ok && r.error.kind === 'provider' && r.error.status === 404) {
    return ok({ teams: [], athletes: [] });
  }
  // `athletes` may be absent from a server still running the pre-Prompt-5
  // build; an absent GROUP is a deploy-skew fact, not an empty result
  // being faked from a failure (the failure path is above and stays loud).
  return r.ok
    ? ok({ teams: r.value.teams, athletes: r.value.athletes ?? [] })
    : r;
}
