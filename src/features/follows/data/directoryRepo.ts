// Browse directory reads (leagues, teams) from the functions layer.

import { functionsBaseUrl } from '../../../core/firebase';
import { err, ok, Result } from '../../../core/result';
import { readJson, writeJson } from '../../../core/storage';

export interface DirectoryLeague {
  id: number | string;
  name: string;
  country: string;
  key: string;
  // Competition logo (Prompt 13). Optional in both directions: an old
  // server never sends it, and the imagery takedown switch can remove
  // it at any time without a client change.
  crestUrl?: string;
  followOnly?: boolean;
  season?: number;
  pollPath?: string;
  // May contain the literal {teamId}, substituted when a team inside this
  // competition is followed.
  teamPollPath?: string;
  // The FOLLOW's stored label where it must differ from the row's
  // display name (B7 final shape: boxing's sexed card rows display the
  // unsexed name — the section header carries the sex — while the
  // Followable needs "Major fight cards — Men's" to stay tellable on
  // the Following screen).
  followLabel?: string;
  // Squad size for the card subtitle ("England · 20 teams") — the cached
  // directory's size, server-joined (27C). Optional in both directions:
  // an old server never sends it, and a league whose directory has never
  // been browsed has none to send.
  teamCount?: number;
}

export interface DirectoryTeam {
  id: number | string;
  name: string;
  key: string;
  crestUrl?: string; // club crest (Prompt 13)
  colours?: string; // free-text kit colours ("Red / White")
  // The crest's extracted dominant pair (Round 3) — the follow burst's
  // discrete palette. Server-derived; absent falls back to treatment.
  burstColours?: string[];
  // THE SERVER HAS ALWAYS SENT THESE (functions/src/directory.ts:201) and
  // this type did not declare them, so they were parsed away and the
  // in-league filter matched the display name alone. Providers publish
  // their own alias lists — "Liverpool FC" AND "Liverpool" — and the
  // server's identity rules deliberately match against those rather than
  // guess which words are noise. The client was guessing by omission.
  aliases?: string[];
}

export interface SearchTeamHit {
  key: string;
  name: string;
  sportKey: string;
  league: string;
  crestUrl?: string;
  colours?: string;
  burstColours?: string[];
  pollPath?: string;
}

export interface SearchAthleteHit {
  key: string; // CANONICAL athlete id (athlete_000184) — the follow key
  name: string;
  sportKey: string;
  grouping?: string; // 'Heavyweight' | 'WTA Tour — Women' — the caption
  nextStartUtc?: string;
  accentHue?: number; // generated colour identity (optional: deploy skew)
  // Nationality (Prompt 16 B) — the flag IS the athlete's identity
  // mark. Optional in both directions: a server from before this
  // shipped never sends it, and plenty of athletes have none.
  countryCode?: string;
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
  // Round 6 item 5: a derived MMA fighter carries the promotion's poll
  // path, so a fighter-only follower keeps that source warm.
  pollPath?: string;
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

// STALE-WHILE-REVALIDATE (Round 2 perf ruling, free tier): the browse
// payloads persist, so a repeat entry paints the last answer instantly
// while the fetch lands behind it. The cache never substitutes for a
// FAILED first fetch — with nothing cached a failure is still an error
// on screen, because "we could not ask" must never render as "empty".
const LEAGUES_CACHE_KEY = 'browseLeagues.v1';
const TOURNAMENTS_CACHE_KEY = 'browseTournaments.v1';

export function cachedLeagues(): DirectoryLeague[] | null {
  return readJson<DirectoryLeague[] | null>(LEAGUES_CACHE_KEY, null);
}

export function cachedTournaments(): TournamentRow[] | null {
  return readJson<TournamentRow[] | null>(TOURNAMENTS_CACHE_KEY, null);
}

export async function fetchLeagues(): Promise<Result<DirectoryLeague[]>> {
  const r = await getJson<{ leagues: DirectoryLeague[] }>('listLeagues');
  if (r.ok) writeJson(LEAGUES_CACHE_KEY, r.value.leagues);
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
  // Which draws the tournament HAS. Absent when the server cannot tell —
  // a feed that has never published anything as late as this edition has
  // not looked, and its silence is not a men's-only draw.
  tours?: ('atp' | 'wta')[];
  // Which of them we currently hold. Server truth, deliberately not
  // rendered: "we only have the men's banner for Wimbledon" is an
  // operational fact, not something a browse row should confess.
  coverage?: ('atp' | 'wta')[];
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
  if (r.ok) writeJson(TOURNAMENTS_CACHE_KEY, r.value.tournaments);
  return r.ok ? ok(r.value.tournaments) : r;
}

// The curated athlete lists for a sport's browse screen. A failure is a
// failure — an empty directory rendered from an error would read as
// "this sport has nobody", the standing invariant's failure mode.
export async function fetchAthleteBrowse(
  sportKey: string,
): Promise<Result<AthleteBrowse>> {
  const r = await getJson<AthleteBrowse>(
    `listAthletes?sport=${encodeURIComponent(sportKey)}`,
  );
  if (r.ok) rememberAthleteCounts(sportKey, r.value);
  return r;
}

// ── Athlete counts for the people rows (Round 6 item 2) ─────────────
// "Tap to follow players (N)" needs N without loading a 1,400-name
// directory on every Competitions screen: the count is remembered
// whenever the directory IS fetched, per group so a tour or a sex can be
// counted the same way the list screen filters, and refreshed in the
// background at most once a day.
interface AthleteCountEntry {
  total: number;
  groups: Array<{ grouping: string; groupingKey: string; count: number }>;
  at: string;
}
const ATHLETE_COUNTS_KEY = 'athleteCounts.v1';
const ATHLETE_COUNTS_TTL_MS = 24 * 3_600_000;
const countRefreshInFlight = new Set<string>();

function rememberAthleteCounts(sportKey: string, browse: AthleteBrowse): void {
  const all = readJson<Record<string, AthleteCountEntry>>(ATHLETE_COUNTS_KEY, {});
  const groups = browse.groups.map((g) => ({
    grouping: g.grouping,
    groupingKey: g.groupingKey,
    count: g.athletes.length,
  }));
  all[sportKey] = {
    total: groups.reduce((n, g) => n + g.count, 0),
    groups,
    at: new Date().toISOString(),
  };
  writeJson(ATHLETE_COUNTS_KEY, all);
}

export function cachedAthleteCount(
  sportKey: string,
  filter: { tour?: string; groupMatches?: (groupingKey: string) => boolean } = {},
): number | null {
  const entry = readJson<Record<string, AthleteCountEntry>>(ATHLETE_COUNTS_KEY, {})[sportKey];
  if (!entry) return null;
  let groups = entry.groups;
  if (filter.tour) {
    // The same narrowing the list screen applies (Prompt 19): the tour
    // word in the group title.
    const re = new RegExp(`\\b${filter.tour}\\b`, 'i');
    groups = groups.filter((g) => re.test(g.grouping));
  }
  if (filter.groupMatches) groups = groups.filter((g) => filter.groupMatches!(g.groupingKey));
  return groups.reduce((n, g) => n + g.count, 0);
}

// Fire-and-forget; a failure leaves the caption without its count.
export function refreshAthleteCount(sportKey: string): void {
  const entry = readJson<Record<string, AthleteCountEntry>>(ATHLETE_COUNTS_KEY, {})[sportKey];
  if (entry && Date.now() - Date.parse(entry.at) < ATHLETE_COUNTS_TTL_MS) return;
  if (countRefreshInFlight.has(sportKey)) return;
  countRefreshInFlight.add(sportKey);
  void fetchAthleteBrowse(sportKey).finally(() => countRefreshInFlight.delete(sportKey));
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
