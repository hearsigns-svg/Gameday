// TheSportsDB adapter (premium key) — the multi-sport gap-filler:
// NBA, NFL, UFC cards, golf rounds, cricket, soccer cups. Events are
// league-scoped; teams are optional (UFC cards and golf rounds have
// none). The only file that knows this provider's shapes.

import { Fixture, FixtureStatus } from '../fixture';
import { ProviderFetch, requireArray } from './fetchResult';

const BASE = 'https://www.thesportsdb.com/api/v1/json';

export interface TsdbEvent {
  idEvent: string;
  strEvent: string;
  dateEvent: string; // YYYY-MM-DD
  strTime?: string | null; // HH:mm:ss UTC, often 00:00:00 placeholder
  strTimeLocal?: string | null; // HH:mm:ss at the venue — disambiguates
  strTimestamp?: string | null; // ISO (UTC, no suffix) when populated
  strStatus?: string | null;
  strPostponed?: string | null; // 'yes' | 'no'
  idHomeTeam?: string | null;
  idAwayTeam?: string | null;
  strHomeTeam?: string | null;
  strAwayTeam?: string | null;
  idLeague: string;
  strLeague: string;
  // Real venue names where TSDB has them ("Waialae Country Club" on
  // 141 of 148 PGA 2026 rounds, live-checked 2026-08-03) — the key the
  // licensed venue-photography layer uses. A venue NAME is a fact, not
  // imagery.
  strVenue?: string | null;
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

// Sports whose published event time is the CARD or BROADCAST start, not
// the moment the thing you care about happens. A boxing undercard can run
// long and the main event ringwalk drifts with it, so the time is real but
// nominal — a timed event that says so beats a confident wrong minute.
const CARD_TIME_SPORTS = new Set(['boxing', 'ufc']);

export function normaliseTsdbEvent(
  e: TsdbEvent,
  sport: string,
  durationHours: number,
  updatedAt: string,
): Fixture {
  // Midnight UTC is ambiguous: it is both this provider's "time unknown"
  // placeholder AND the true instant of a 7pm US Eastern tip-off
  // (19:00 EST + 5h = 00:00Z). Treating it as unknown downgraded 254 of
  // 1,380 real NBA fixtures to all-day placeholders with no reminder.
  // strTimeLocal breaks the tie: a real venue-local time means the time
  // IS known, whatever the UTC clock reads.
  const utcMidnight =
    (!e.strTime || e.strTime === '00:00:00') &&
    (!e.strTimestamp || e.strTimestamp.includes('T00:00:00'));
  const localKnown = Boolean(e.strTimeLocal && e.strTimeLocal !== '00:00:00');
  const hasTime = !utcMidnight || localKnown;
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
    ...(e.strVenue?.trim() ? { venue: e.strVenue.trim() } : {}),
    followKeys,
    startUtc,
    // TheSportsDB gives a venue-local TIME (strTimeLocal) but never a zone
    // name, and an offset is not an IANA zone. Omitted rather than guessed.
    status: tsdbStatus(e, startUtc, hasTime),
    durationHours,
    // The 45 midnight-UTC-but-scheduled fixtures land here explicitly:
    // strTimeLocal proved the time is real, so they are `exact` rather
    // than a sentinel that merely looks like one.
    timePrecision: !hasTime
      ? 'date_only'
      : CARD_TIME_SPORTS.has(sport)
        ? 'nominal'
        : 'exact',
    confidence: !hasTime || CARD_TIME_SPORTS.has(sport)
      ? 'provisional'
      : 'confirmed',
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
): Promise<ProviderFetch> {
  const body = (await tsdbGet(
    apiKey,
    `eventsseason.php?id=${leagueId}&s=${encodeURIComponent(season)}`,
  )) as { events?: TsdbEvent[] | null };
  const now = new Date().toISOString();
  const events = requireArray(body.events, 'thesportsdb', 'events');
  return {
    rawCount: events.length,
    fixtures: events.map((e) => normaliseTsdbEvent(e, sport, durationHours, now)),
  };
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
  )) as {
    teams: Array<{ idTeam: string; strTeam: string }> | null;
  };
  return (body.teams ?? []).map((t) => ({
    id: t.idTeam,
    name: t.strTeam,
  }));
}

export interface TsdbSearchHit {
  id: string;
  name: string;
  sport: string; // TSDB strSport, e.g. 'Basketball'
  leagueId: string; // idLeague
  league: string; // strLeague
}

// Free-text team search across all of TSDB — callers filter to leagues
// we actually serve.
export async function searchTsdbTeams(
  apiKey: string,
  q: string,
): Promise<TsdbSearchHit[]> {
  const body = (await tsdbGet(
    apiKey,
    `searchteams.php?t=${encodeURIComponent(q)}`,
  )) as {
    teams: Array<{
      idTeam: string;
      strTeam: string;
      strSport?: string;
      idLeague?: string;
      strLeague?: string;
    }> | null;
  };
  return (body.teams ?? []).map((t) => ({
    id: t.idTeam,
    name: t.strTeam,
    sport: t.strSport ?? '',
    leagueId: t.idLeague ?? '',
    league: t.strLeague ?? '',
  }));
}
