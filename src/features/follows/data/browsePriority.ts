// Browse ordering weights — data, not code (Prompt 11).
//
// The catalogue collection carries an ops-tunable `priority` per
// competition key (0–100, higher first) and the server rolls per-sport
// weights up from it (`listPriorities`). The client caches the payload
// and STABLE-sorts browse/search surfaces by it. With no cache yet
// (first launch, offline) every surface keeps its bundled config
// order: ordering is a rendering preference, not a data truth, so an
// empty map here is honest — the one place a silent fallback is right.

import { readJson, writeJson } from '../../../core/storage';
import { PoolPhoto } from '../domain/poolPhotos';
import { activeRegion } from '../../../core/regionStore';
import { functionsBaseUrl } from '../../../core/firebase';
import { lookupByMarkKeys } from '../domain/markKeys';
export { byPriority, byPriorityLive } from '../domain/browseOrder';

// Keyed BY REGION (Prompt 15): a device that switches region must not
// read the previous region's ordering out of the cache, and a user
// toggling the override should see the change immediately rather than
// after the hourly refresh window.
// v3 (27C): teamCounts joined the payload — the bump discards the old
// cache so the counts appear on first launch after update rather than
// after the hourly refresh window.
// v4 (Round 6): competitionArtTileFills + trimmed mark URLs — same
// first-launch reasoning.
const CACHE_KEY_BASE = 'browsePriority.v4';
const cacheKeyFor = (region: string) => `${CACHE_KEY_BASE}.${region}`;

// The doc changes when ops tune the catalogue — rarely. Hourly matches
// the freshness fetch's cadence reasoning.
const REFRESH_MIN_INTERVAL_MS = 3_600_000;

export interface BrowsePriorities {
  priorities: Record<string, number>; // competition/tournament key → weight
  sportWeights: Record<string, number>; // client sport key → weight
  // Competition keys with zero future fixtures right now (Prompt 11b):
  // demoted below live rows within their sport, never hidden.
  dormant: string[];
  // TSDB league id → competition logo (Prompt 13 follow-up). The
  // client's STATIC competitions carry the TSDB id as their `id`, so
  // this joins by id with no name matching. Absent on an old server and
  // absent for anything the imagery policy suppresses — both fall back
  // to the generated treatment, which is why an empty map is safe.
  competitionArt: Record<string, string>;
  // key → the badge's dominant colour pair (Round 3): the follow
  // burst's discrete palette, same keying as competitionArt above.
  competitionArtColours: Record<string, string[]>;
  // key → the tile fill behind that mark (Round 6 tile prep): an
  // adopted baked background (the Australian Open blue) or the
  // contrast-picked neutral. Absent = the theme container, as ever.
  competitionArtTileFills: Record<string, string>;
  // Row KEY → squad size for the static competitions' card subtitles
  // (27C). Keyed by key, not id — the NHL and MLB statics both carry
  // id 1. Absent on an old server; a missing entry means the subtitle
  // simply omits the count.
  teamCounts: Record<string, number>;
  // Sport-generic photo pools (owner ruling 2026-08-30): sportKey →
  // curated Commons shots for the pool rung between venue resolution
  // and the treatment floor. Absent on an old server and empty where
  // no pool is curated — both mean the rung simply never fires.
  photoPools: Record<string, PoolPhoto[]>;
}

interface PriorityCache extends BrowsePriorities {
  fetchedAt: string;
}

// Repaint-on-fetch (Round 6 follow-up). The cache is stale-first and
// the fetch is fire-and-forget — which meant a screen that rendered
// BEFORE the payload landed kept its stale (or, after a cache-version
// bump, EMPTY) art until the next navigation: the rail showed
// monograms for every mark on first launch of a bumped build. Screens
// that paint from this cache subscribe; a successful write notifies.
const listeners = new Set<() => void>();

export function subscribePriorities(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function cachedPriorities(): BrowsePriorities {
  const c = readJson<PriorityCache | null>(cacheKeyFor(activeRegion()), null);
  return {
    priorities: c?.priorities ?? {},
    sportWeights: c?.sportWeights ?? {},
    dormant: c?.dormant ?? [],
    competitionArt: c?.competitionArt ?? {},
    competitionArtColours: c?.competitionArtColours ?? {},
    competitionArtTileFills: c?.competitionArtTileFills ?? {},
    teamCounts: c?.teamCounts ?? {},
    photoPools: c?.photoPools ?? {},
  };
}

// Fire-and-forget refresh; callers render from the cache and re-render
// on the next mount. A failed fetch keeps the previous cache — stale
// ordering beats config-order flapping.
export async function refreshPriorities(): Promise<void> {
  const region = activeRegion();
  const cached = readJson<PriorityCache | null>(cacheKeyFor(region), null);
  if (
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MIN_INTERVAL_MS
  ) {
    return;
  }
  try {
    const res = await fetch(
      `${functionsBaseUrl}/listPriorities?region=${encodeURIComponent(region)}`,
    );
    if (!res.ok) return;
    const body = (await res.json()) as Partial<BrowsePriorities>;
    // Shape-checked: a wrong body must not blank a good cache.
    if (typeof body.priorities !== 'object' || body.priorities === null) return;
    writeJson(cacheKeyFor(region), {
      priorities: body.priorities,
      sportWeights:
        typeof body.sportWeights === 'object' && body.sportWeights !== null
          ? body.sportWeights
          : {},
      dormant: Array.isArray(body.dormant) ? body.dormant : [],
      // Same shape discipline as the rest: a wrong type degrades to no
      // artwork, never to a broken cache.
      competitionArt:
        typeof body.competitionArt === 'object' && body.competitionArt !== null
          ? body.competitionArt
          : {},
      competitionArtColours:
        typeof body.competitionArtColours === 'object' &&
        body.competitionArtColours !== null
          ? body.competitionArtColours
          : {},
      teamCounts:
        typeof body.teamCounts === 'object' && body.teamCounts !== null
          ? body.teamCounts
          : {},
      photoPools:
        typeof body.photoPools === 'object' && body.photoPools !== null
          ? body.photoPools
          : {},
      competitionArtTileFills:
        typeof body.competitionArtTileFills === 'object' &&
        body.competitionArtTileFills !== null
          ? body.competitionArtTileFills
          : {},
      fetchedAt: new Date().toISOString(),
    } satisfies PriorityCache);
    for (const fn of listeners) fn();
  } catch {
    // Offline: keep whatever we had.
  }
}

// The served mark for a COMPETITION follow key, from the cached art
// map — direct for the aliased marks (f1-series-1, the tours, NHL/MLB)
// and by TSDB id for tsdb-league keys. The display fallback for
// follows stored before their mark existed: the strip should not wait
// for a browse-screen visit to heal the record before showing what the
// server already serves.
// A follow's mark keys walk from the follow to its EVENT (Round 7
// follow-up): a sexed draw key reads the tournament's mark, a sexed
// boxing key its league's — domain/markKeys.ts.
export function competitionMarkFor(key: string): string | undefined {
  return lookupByMarkKeys(cachedPriorities().competitionArt, key);
}

// The tile fill behind that mark (Round 6 tile prep), same key walk as
// the mark itself. Undefined = the theme container.
export function competitionTileFillFor(key: string): string | undefined {
  return lookupByMarkKeys(cachedPriorities().competitionArtTileFills, key);
}

// The follow-identity predicate (domain/followIdentity.ts): a follow
// with a SERVED mark can own a hero or a row even when it stored no
// crest — a tournament follow never carries one of its own.
export function hasServedMark(key: string): boolean {
  return competitionMarkFor(key) !== undefined;
}

// The DISPLAY mark for a follow. THE SERVED MAP WINS for competition
// keys (Round 6): the map is where prepared marks land (trimmed
// copies, replaced assets), and a stored crestUrl captured at follow
// time would pin the stale original forever. The stored crest remains
// the answer for everything the map does not carry — team and athlete
// follows, and any mark the server stops serving. Display-time, never
// a store write (Round 5 item 1).
export function followMarkUrl(
  f: { key: string; crestUrl?: string } | undefined,
): string | undefined {
  if (!f) return undefined;
  return competitionMarkFor(f.key) ?? f.crestUrl;
}
