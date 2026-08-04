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
  // Golf: the FINAL ROUND carries a scoped key so a tour follower can
  // choose "final rounds only" (Prompt 11) — the round name is the
  // provider's own title text, a fact not a guess. Anchored: the round
  // name ends the title on every live doc across all four golf
  // leagues, and \b keeps "Semifinal Round" (match play) out.
  if (sport === 'golf' && /\bfinal round\s*$/i.test(e.strEvent)) {
    followKeys.push(`${competitionId}-final`);
  }
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
  crestUrl?: string; // strBadge — restored, Prompt 13
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
    teams: Array<{
      idTeam: string;
      strTeam: string;
      strBadge?: string;
    }> | null;
  };
  return (body.teams ?? []).map((t) => ({
    id: t.idTeam,
    name: t.strTeam,
    ...(t.strBadge ? { crestUrl: t.strBadge } : {}),
  }));
}

export interface TsdbSearchHit {
  id: string;
  name: string;
  sport: string; // TSDB strSport, e.g. 'Basketball'
  leagueId: string; // idLeague
  league: string; // strLeague
  crestUrl?: string;
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
      strBadge?: string;
    }> | null;
  };
  return (body.teams ?? []).map((t) => ({
    id: t.idTeam,
    name: t.strTeam,
    sport: t.strSport ?? '',
    leagueId: t.idLeague ?? '',
    league: t.strLeague ?? '',
    ...(t.strBadge ? { crestUrl: t.strBadge } : {}),
  }));
}

// ─── Competition logos (Prompt 13) ────────────────────────────────────
//
// `lookup_league.php` 404s on the premium v1 path, exactly like
// `lookup_all_teams.php` (both verified live). The working route is
// `search_all_leagues.php?s=<sport>`, which returns EVERY league for a
// sport WITH `strBadge` — 670 soccer leagues, 670 badges, measured
// 2026-08-04. One call per sport, not per league, so the whole league
// set costs a handful of requests.
// Returns BOTH indexes because the two consumers key differently: the
// client's static competitions carry TSDB league ids, while the served
// soccer list is football-data.org and keys by competition NAME. The
// name index includes strLeagueAlternate ("Premier League, EPL,
// England"), which is what actually lets fd.org's "Premier League"
// find TSDB's "English Premier League".
export interface TsdbLeagueArt {
  byId: Map<string, string>;
  // `${country}|${name}` → badge, over strLeague AND every alternate.
  // COUNTRY-SCOPED because names alone are hopelessly ambiguous: TSDB
  // carries a "Serie A" in Brazil, Ecuador and Italy, a "Ligue 1" in
  // Algeria, DR Congo and France, and a "Championship" in Australia,
  // Canada and England. A global name index handed the Premier
  // League's neighbours somebody else's badge.
  byCountryName: Map<string, string>;
  // Same key space, but the candidate NAMES a country offers, so a
  // caller can fall back to containment ("Championship" inside
  // "English League Championship") without matching across borders.
  namesByCountry: Map<string, Array<{ name: string; badge: string }>>;
}

export async function fetchTsdbLeagueBadges(
  apiKey: string,
  tsdbSport: string,
  normalise: (s: string) => string,
): Promise<TsdbLeagueArt> {
  const body = (await tsdbGet(
    apiKey,
    `search_all_leagues.php?s=${encodeURIComponent(tsdbSport)}`,
  )) as {
    countries: Array<{
      idLeague?: string;
      strLeague?: string;
      strLeagueAlternate?: string;
      strCountry?: string;
      strBadge?: string;
    }> | null;
  };
  const byId = new Map<string, string>();
  const byCountryName = new Map<string, string>();
  const namesByCountry = new Map<string, Array<{ name: string; badge: string }>>();
  for (const l of body.countries ?? []) {
    if (!l.strBadge) continue;
    if (l.idLeague) byId.set(l.idLeague, l.strBadge);
    const country = normalise((l.strCountry ?? '').trim());
    if (!country) continue;
    const names = [l.strLeague, ...(l.strLeagueAlternate ?? '').split(',')];
    const bucket = namesByCountry.get(country) ?? [];
    for (const raw of names) {
      const n = normalise((raw ?? '').trim());
      if (n.length <= 2) continue;
      const k = `${country}|${n}`;
      if (!byCountryName.has(k)) byCountryName.set(k, l.strBadge);
      bucket.push({ name: n, badge: l.strBadge });
    }
    namesByCountry.set(country, bucket);
  }
  return { byId, byCountryName, namesByCountry };
}

// Resolve one competition's logo. Tries, in order: the TSDB league id
// where the caller has one (exact, and the only fully safe join); an
// exact country-scoped name or alternate; then containment WITHIN THE
// SAME COUNTRY, shortest candidate first, which is what turns fd.org's
// "Championship" into "English League Championship" and its "Serie A"
// into "Italian Serie A" without ever reaching Brazil's.
export function leagueBadgeFor(
  art: TsdbLeagueArt,
  opts: { id?: string; name: string; country: string },
  normalise: (s: string) => string,
): string | undefined {
  if (opts.id && /^\d+$/.test(opts.id)) {
    const byId = art.byId.get(opts.id);
    if (byId) return byId;
  }
  const country = normalise(opts.country.trim());
  const name = normalise(opts.name.trim());
  if (!country || !name) return undefined;
  const exact = art.byCountryName.get(`${country}|${name}`);
  if (exact) return exact;
  const candidates = (art.namesByCountry.get(country) ?? [])
    .filter((c) => c.name.includes(name))
    .sort((a, b) => a.name.length - b.name.length);
  return candidates[0]?.badge;
}
