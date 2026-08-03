// Tennis tournaments as followable competitions. PURE.
//
// Users want Wimbledon and Roland-Garros, not "ATP Tour" — but a Grand
// Slam is one tournament in two feeds: the US Open is `wta-905-2026`
// from the WTA API and a VEVENT in the Tennis TV ICS. Listing
// tournaments naively gives the user two US Opens, and the F28 class
// says the reconciler can never merge them (different competition
// strings, and tennis parents carry no participants).
//
// THE JOIN IS A HEURISTIC, STATED PLAINLY: no shared id exists between
// the feeds (ICS uids are opaque; WTA ids are the WTA's own), so joint
// events are identified by NAME + DATES — the exact normalised title,
// with editions kept apart by their windows. Measured against the live
// store (2026-08-03): exact normalised equality pairs Cincinnati, the
// US Open and the China Open with zero false pairs and zero near
// misses; Toronto pairs too once case folds ("presented"/"Presented").
// Sponsor variants that exact matching cannot join are handled by a
// CURATED alias table with evidence per entry — never by fuzzy token
// matching, which is the "guess which words are noise" mistake the
// club-alias work already refused (AFC Liverpool).
//
// The canonical key `tennis-t-<slug>` is YEAR-AGNOSTIC: every edition
// of a tournament carries the same key, so following Wimbledon spans
// years exactly like following a team does. The key rides followKeys
// on the tour parents (competitionId stays the tour slice — ingest
// diffs, coverage and the reaper are untouched); appearances do NOT
// take it — a Wimbledon follow gets the tournament event, and match
// events come from the player follows they already have.

import { normaliseName } from './identity';

// slug of the full normalised title. No sponsor stripping.
export function tournamentSlug(title: string): string {
  return normaliseName(title).replace(/\s+/g, '-');
}

// Curated variant → canonical slug. Every entry cites its evidence.
// Alias both feeds' variants to a sponsor-light canonical so the key
// survives a sponsor change on either side.
const TOURNAMENT_ALIASES: Record<string, string> = {
  // WTA publishes "Mubadala DC Open" (banked wta-tournaments-sample,
  // group 1045); the ATP ICS publishes "Mubadala Citi DC Open" (live
  // feed, 2027-07-26 edition). One joint event in Washington.
  'mubadala-dc-open': 'dc-open',
  'mubadala-citi-dc-open': 'dc-open',
  // Toronto/Montreal: both feeds currently agree on the full sponsor
  // phrase, but a key that embeds "presented by Rogers" breaks every
  // follow the day the sponsor wording shifts — the exact failure the
  // DC alias exists to prevent (review round). Canonicalised
  // sponsor-light BEFORE any follows exist.
  'national-bank-open-presented-by-rogers': 'national-bank-open',
  // Roland Garros renders with and without the hyphen-fold equivalence
  // already ("Roland Garros" in the ICS; the WTA API is expected to
  // carry the same form — alias reserved the day it differs).
};

// Display names for aliased keys (unaliased tournaments display their
// feed title, which is already the name users know).
const CANONICAL_DISPLAY: Record<string, string> = {
  'dc-open': 'DC Open',
  'national-bank-open': 'National Bank Open',
};

// Null for a title that normalises to nothing: a punctuation-only
// summary must not mint the bare `tennis-t-` key and fold unrelated
// events into one followable (review round). Callers skip stamping.
export function tournamentKey(title: string): string | null {
  const slug = tournamentSlug(title);
  if (slug.length === 0) return null;
  return `tennis-t-${TOURNAMENT_ALIASES[slug] ?? slug}`;
}

export function canonicalDisplayName(title: string): string {
  const slug = TOURNAMENT_ALIASES[tournamentSlug(title)];
  return (slug && CANONICAL_DISPLAY[slug]) ?? title;
}

// ─── The browse list ──────────────────────────────────────────────────

export interface TournamentRow {
  key: string; // tennis-t-<slug> — the followable
  name: string;
  // Which draws the NEXT edition carries, from which feeds actually
  // hold a future doc under this key. 'joint' is the merged case.
  tours: 'atp' | 'wta' | 'joint';
  startUtc: string; // next edition's first day
  endUtc: string; // next edition's last day (exclusive midnight)
  level?: string; // 'Grand Slam' | 'WTA 1000' | … where a feed says
}

export interface TournamentSource {
  competitionId: string; // tennis-atp | tennis-wta
  title: string;
  startUtc: string;
  durationHours?: number;
  status: string;
}

// Group future tour parents by canonical key; one row per tournament,
// dated by its SOONEST upcoming edition. Editions beyond the next are
// implied — the follow covers them by key, and listing "US Open 2026"
// and "US Open 2027" as two rows would reintroduce the duplicate the
// key exists to remove.
export function shapeTournamentRows(
  parents: readonly TournamentSource[],
  nowIso: string,
): TournamentRow[] {
  interface Agg {
    name: string;
    tours: Set<'atp' | 'wta'>;
    startUtc: string;
    endUtc: string;
  }
  const byKey = new Map<string, Agg>();
  for (const p of parents) {
    if (p.status === 'cancelled') continue;
    const endMs =
      Date.parse(p.startUtc) + (p.durationHours ?? 24) * 3_600_000;
    if (new Date(endMs).toISOString() < nowIso) continue; // finished
    const key = tournamentKey(p.title);
    if (key === null) continue;
    const tour = p.competitionId === 'tennis-wta' ? 'wta' : 'atp';
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        name: canonicalDisplayName(p.title),
        tours: new Set([tour]),
        startUtc: p.startUtc,
        endUtc: new Date(endMs).toISOString(),
      });
      continue;
    }
    // Same tournament: union the tours; keep the SOONEST edition's
    // window (a doc a year out must not stretch the row's dates), and
    // treat docs within the same window as one edition.
    const isSameEdition =
      Math.abs(Date.parse(p.startUtc) - Date.parse(existing.startUtc)) <
      45 * 86_400_000;
    if (isSameEdition) {
      existing.tours.add(tour);
      if (p.startUtc < existing.startUtc) existing.startUtc = p.startUtc;
      const e = new Date(endMs).toISOString();
      if (e > existing.endUtc) existing.endUtc = e;
    } else if (p.startUtc < existing.startUtc) {
      // An earlier edition wins the row's dates; its tour union RESETS
      // to what that edition actually carries.
      byKey.set(key, {
        name: canonicalDisplayName(p.title),
        tours: new Set([tour]),
        startUtc: p.startUtc,
        endUtc: new Date(endMs).toISOString(),
      });
    }
    // A later edition adds nothing: the key already covers it.
  }
  return [...byKey.entries()]
    .map(([key, a]) => ({
      key,
      name: a.name,
      tours:
        a.tours.size === 2 ? ('joint' as const) : a.tours.has('wta') ? ('wta' as const) : ('atp' as const),
      startUtc: a.startUtc,
      endUtc: a.endUtc,
    }))
    .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
}
