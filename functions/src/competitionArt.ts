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
  // ART ONLY — no tennis fixtures come from TSDB; the sport is fetched
  // for the tour badges the aliases below serve (Round 2 item 4).
  'Tennis',
  // ART ONLY — athletics fixtures come from World Athletics, but TSDB
  // holds badged athletics leagues (22 of them, every one with a badge,
  // verified live 2026-08-29 — the older "no TSDB athletics art" note
  // was wrong) for the wa-* aliases below (Round 3 mark audit v2).
  'Athletics',
];

// Competitions served by NON-TSDB routes whose marks TSDB nevertheless
// holds (Round 2 item 4 — the Following-strip monogram audit). Keyed by
// the competition FOLLOW KEY, valued by the TSDB league id whose badge
// is that competition's real mark; the art map serves these under the
// follow key so the client's row-key lookup finds them. Every id was
// probed live with a badge present (2026-08-28; wa-*/cup rows
// 2026-08-29). Deliberately absent: the boxing promotions
// (PBC/boxingdata — TSDB has no per-promotion badge, and a generic
// boxing mark on a PBC follow is a wrong mark), the four tennis majors
// (a 1,530-league sweep found no per-slam league — genuinely
// markless), the wa-* group rows that union what TSDB splits (Cross
// Country Tour, U20s, National/Continental championships, wa-calendar
// — any single badge would be a wrong mark for the group), and every
// olympics-* key (excluded in code by statute — imagery.ts; TSDB's
// "Olympics Athletics"/"Olympics Tennis" badges must never be aliased).
export const COMPETITION_ART_ALIASES: Readonly<Record<string, string>> = {
  'f1-series-1': '4370', // Formula 1 (Motorsport)
  'nhl-league-1': '4380', // NHL (Ice Hockey)
  'mlb-league-1': '4424', // MLB (Baseball)
  'tennis-atp': '4464', // ATP World Tour (Tennis)
  'tennis-wta': '4517', // WTA Tour (Tennis)
  // Round 3 mark audit v2 — athletics rows (Athletics fetched above):
  'wa-wanda-diamond-league-meeting': '5282', // Diamond League
  'wa-world-athletics-championships-world-athletics-series': '5007', // World Championships
  'wa-world-athletics-continental-tour-gold': '5302', // Continental Tour Gold
  'wa-world-athletics-indoor-tour-gold': '5785', // Indoor Tour Gold
  'wa-world-athletics-label-road-races-platinum': '5443', // the Platinum label IS the Marathon Majors row
  'wa-world-athletics-label-road-races-gold': '5442', // Gold Label Road Races
  // Tennis cup rows (tournament keys — the client's tournament cards
  // read the art map by follow key):
  'tennis-t-laver-cup': '4581', // Laver Cup
  'tennis-t-united-cup': '5872', // United Cup
  // Eredivisie's serve-time badge join misses on a country-name split
  // (fd.org "Netherlands" vs TSDB "The Netherlands"); the alias heals
  // the follow-key surfaces regardless of the join.
  'fdorg-comp-DED': '4337', // Eredivisie (Soccer)
};

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

// CURATED marks merge (owner ruling 2026-08-30) — PURE. Curated
// entries FILL GAPS ONLY (a provider badge always wins), and the
// Olympic statute is enforced at merge as well as at import and at
// serve: no olympics-*/paralympics-* key can enter the art map from
// the curated layer whatever the import wrote.
export function mergeCuratedMarks(
  art: Record<string, string>,
  curated: Readonly<Record<string, { url?: string }>>,
): Record<string, string> {
  const out = { ...art };
  for (const [key, entry] of Object.entries(curated)) {
    if (/^(?:olympics|paralympics)/.test(key)) continue;
    if (!out[key] && entry.url) out[key] = entry.url;
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
