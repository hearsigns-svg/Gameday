// Competition logos for the client's STATIC competitions — PURE logic.
//
// Prompt 13 restored competition logos, but only for the soccer rows
// `listLeagues` serves. Everything else a user browses — NBA, NFL, the
// IPL, the rugby leagues, MotoGP, the golf tours — lives in the
// client's own `sportsConfig`, never touches that route, and so still
// rendered a monogram while its neighbours had logos.
//
// THE JOIN IS BY TSDB LEAGUE ID, which is the one fully safe join: the
// client's static competitions carry the TSDB id AS their `id`, so no
// name matching is involved and none of the country-scoped ambiguity
// that made the soccer join hard applies here.
//
// WHICH IDS: derived from the CATALOGUE rather than a hand-kept list.
// The catalogue already enumerates every competition browse offers —
// that is its purpose — so extracting `tsdb-league-<id>` keys from it
// means the artwork set cannot drift from the set of things we serve.
// A new competition gets its logo by existing, not by someone
// remembering a second list.

// The TSDB `strSport` values our competitions span. Verified live
// 2026-08-04 — every one returns leagues and EVERY league carries a
// badge: Soccer 670, Fighting 140, Basketball 122, Ice Hockey 60,
// Rugby 57, Motorsport 52, Cricket 34, Golf 31, Baseball 25, American
// Football 21. `search_all_leagues.php?s=<sport>` is the only route
// that carries badges at all — `all_leagues.php` omits them and
// `lookup_league.php` 404s on the premium path.
export const TSDB_ART_SPORTS: readonly string[] = [
  'Soccer',
  'Basketball',
  'American Football',
  'Ice Hockey',
  'Baseball',
  'Cricket',
  'Rugby',
  'Golf',
  'Fighting',
  'Motorsport',
];

const TSDB_LEAGUE_KEY = /^tsdb-league-(\d+)$/;

// The TSDB league ids browse actually offers, from catalogue keys.
export function tsdbLeagueIdsFrom(
  competitionIds: readonly (string | undefined)[],
): string[] {
  const ids = new Set<string>();
  for (const key of competitionIds) {
    const m = key?.match(TSDB_LEAGUE_KEY);
    if (m) ids.add(m[1]);
  }
  return [...ids].sort();
}

// Keep only the ids we serve. The full badge set across ten sports is
// well over a thousand leagues; shipping it would put ~80KB of URLs
// nobody renders into a payload the client fetches on every session.
export function narrowToServed(
  byId: ReadonlyMap<string, string>,
  servedIds: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of servedIds) {
    const url = byId.get(id);
    if (url) out[id] = url;
  }
  return out;
}

export const COMPETITION_ART_TTL_MS = 24 * 3_600_000;

export function artIsFresh(
  cachedAt: string | undefined,
  nowMs: number,
  ttlMs: number = COMPETITION_ART_TTL_MS,
): boolean {
  if (!cachedAt) return false;
  const at = Date.parse(cachedAt);
  if (Number.isNaN(at)) return false;
  return nowMs - at < ttlMs;
}
