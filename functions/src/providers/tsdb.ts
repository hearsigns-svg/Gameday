// TheSportsDB adapter (premium key) — the multi-sport gap-filler:
// NBA, NFL, UFC cards, golf rounds, cricket, soccer cups. Events are
// league-scoped; teams are optional (UFC cards and golf rounds have
// none). The only file that knows this provider's shapes.

import { Fixture, FixtureStatus } from '../fixture';

const BASE = 'https://www.thesportsdb.com/api/v1/json';

export interface TsdbEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string; // YYYY-MM-DD
  strTime?: string | null; // HH:mm:ss, often 00:00:00 placeholder
  strTimestamp?: string | null; // ISO when populated
  strStatus?: string | null;
  strPostponed?: string | null; // 'yes' | 'no'
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idLeague: string;
  strLeague: string;
}

function tsdbStatus(e: TsdbEvent, startUtc: string, hasTime: boolean): FixtureStatus {
  if (e.strPostponed === 'yes') return 'postponed';
  const s = (e.strStatus ?? '').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('postpon')) return 'postponed';
  if (['1h', '2h', 'ht', 'live', 'in progress'].some((k) => s.includes(k))) {
    return 'in_play';
  }
  if (s.includes('finished') || s === 'ft') return 'finished';
  // Midnight placeholder times on far-future events mean "date known,
  // time not" — the tbd placeholder machinery handles them honestly.
  if (!hasTime) return 'tbd';
  return 'scheduled';
}

export function normaliseTsdbEvent(
  e: TsdbEvent,
  sport: string,
  durationHours: number,
  updatedAt: string,
): Fixture {
  const hasTime = Boolean(
    (e.strTime && e.strTime !== '00:00:00') ||
      (e.strTimestamp && !e.strTimestamp.includes('T00:00:00')),
  );
  // strTimestamp comes without a zone suffix but is UTC — force Z so it
  // never parses as server-local time.
  const rawTs = e.strTimestamp
    ? /[Zz+]/.test(e.strTimestamp.slice(10))
      ? e.strTimestamp
      : `${e.strTimestamp}Z`
    : `${e.dateEvent}T${e.strTime ?? '00:00:00'}Z`;
  const startUtc = new Date(rawTs).toISOString();
  const competitionId = `tsdb-league-${e.idLeague}`;
  const followKeys = [competitionId];
  if (e.idHomeTeam) followKeys.unshift(`tsdb-team-${e.idHomeTeam}`);
  if (e.idAwayTeam) followKeys.splice(1, 0, `tsdb-team-${e.idAwayTeam}`);
  return {
    id: `tsdb-${e.idEvent}`,
    sport,
    competition: e.strLeague,
    competitionId,
    // strEvent is already idiomatic per sport ("Knicks vs 76ers" away-
    // first, "UFC 324 Gaethje vs Pimblett", "Sony Open Round 1") — use
    // it verbatim rather than rebuilding home-first titles.
    title: e.strEvent,
    ...(e.strHomeTeam ? { homeTeam: e.strHomeTeam } : {}),
    ...(e.strAwayTeam ? { awayTeam: e.strAwayTeam } : {}),
    followKeys,
    startUtc,
    venueTz: 'UTC',
    status: tsdbStatus(e, startUtc, hasTime),
    durationHours,
    updatedAt,
  };
}

async function tsdbGet(apiKey: string, path: string): Promise<unknown> {
  const res = await fetch(`${BASE}/${apiKey}/${path}`);
  if (!res.ok) throw new Error(`thesportsdb http ${res.status}`);
  return res.json();
}

export async function fetchTsdbLeagueSeasonFixtures(
  apiKey: string,
  leagueId: string,
  season: string, // exact TSDB season string; format varies per league
  sport: string,
  durationHours: number,
): Promise<Fixture[]> {
  const body = (await tsdbGet(
    apiKey,
    `eventsseason.php?id=${leagueId}&s=${encodeURIComponent(season)}`,
  )) as { events: TsdbEvent[] | null };
  const now = new Date().toISOString();
  return (body.events ?? []).map((e) =>
    normaliseTsdbEvent(e, sport, durationHours, now),
  );
}

export interface TsdbTeamRow {
  id: string;
  name: string;
}

// lookup_all_teams.php 404s on the premium v1 path (verified live) —
// search_all_teams by league NAME is the working route.
export async function fetchTsdbLeagueTeams(
  apiKey: string,
  leagueName: string,
): Promise<TsdbTeamRow[]> {
  const body = (await tsdbGet(
    apiKey,
    `search_all_teams.php?l=${encodeURIComponent(leagueName)}`,
  )) as { teams: Array<{ idTeam: string; strTeam: string }> | null };
  return (body.teams ?? []).map((t) => ({ id: t.idTeam, name: t.strTeam }));
}
