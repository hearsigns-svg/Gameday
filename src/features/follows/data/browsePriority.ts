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
import { functionsBaseUrl } from '../../../core/firebase';
export { byPriority, byPriorityLive } from '../domain/browseOrder';

const CACHE_KEY = 'browsePriority.v1';

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
}

interface PriorityCache extends BrowsePriorities {
  fetchedAt: string;
}

export function cachedPriorities(): BrowsePriorities {
  const c = readJson<PriorityCache | null>(CACHE_KEY, null);
  return {
    priorities: c?.priorities ?? {},
    sportWeights: c?.sportWeights ?? {},
    dormant: c?.dormant ?? [],
    competitionArt: c?.competitionArt ?? {},
  };
}

// Fire-and-forget refresh; callers render from the cache and re-render
// on the next mount. A failed fetch keeps the previous cache — stale
// ordering beats config-order flapping.
export async function refreshPriorities(): Promise<void> {
  const cached = readJson<PriorityCache | null>(CACHE_KEY, null);
  if (
    cached &&
    Date.now() - Date.parse(cached.fetchedAt) < REFRESH_MIN_INTERVAL_MS
  ) {
    return;
  }
  try {
    const res = await fetch(`${functionsBaseUrl}/listPriorities`);
    if (!res.ok) return;
    const body = (await res.json()) as Partial<BrowsePriorities>;
    // Shape-checked: a wrong body must not blank a good cache.
    if (typeof body.priorities !== 'object' || body.priorities === null) return;
    writeJson(CACHE_KEY, {
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
      fetchedAt: new Date().toISOString(),
    } satisfies PriorityCache);
  } catch {
    // Offline: keep whatever we had.
  }
}
