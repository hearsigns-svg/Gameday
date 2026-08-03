// Session+persistent cache for resolved entity photos, keyed by name.
// Also the register the credits screen reads: every photo we render
// must be attributable, which is a licence condition, not a nicety.

import { readJson, writeJson } from '../../../core/storage';
import { VenueArt } from '../domain/venueArtRules';

const KEY = 'photoCache.v1';

// Venues share this cache but not its namespace: a ground and a fighter
// can plausibly answer to the same name, and one must never be served as
// the other. Keyed rather than typed so existing athlete entries survive.
const VENUE_PREFIX = 'venue:';
export const venueKey = (team: string): string => `${VENUE_PREFIX}${team}`;
// Venue-NAME entries (fixture.venue, Prompt 9b) live in their own
// namespace: they resolve differently (direct entity→P18, no P115
// hop) and their credit line is the place itself, not "home ground".
const PLACE_PREFIX = 'place:';
export const placeKey = (venueName: string): string =>
  `${PLACE_PREFIX}${venueName}`;

type Entry = { art: VenueArt | null; at: string };
type Cache = Record<string, Entry>;

const inflight = new Set<string>();

function load(): Cache {
  return readJson<Cache>(KEY, {});
}

export function cachedPhoto(name: string): VenueArt | null | undefined {
  return load()[name]?.art;
}

export function putPhoto(name: string, art: VenueArt | null): void {
  const all = load();
  all[name] = { art, at: new Date().toISOString() };
  writeJson(KEY, all);
}

export function claimResolve(name: string): boolean {
  if (inflight.has(name)) return false;
  inflight.add(name);
  return true;
}

export function releaseResolve(name: string): void {
  inflight.delete(name);
}

// Everything currently rendered, for the credits screen. Venue photos
// belong here as much as athlete ones do — attribution is a licence
// condition, and they were previously credited only on the card itself.
export function photoCredits(): Array<{ subject: string; art: VenueArt }> {
  return Object.entries(load())
    .filter(([, e]) => e.art !== null)
    .map(([key, e]) => ({
      subject: key.startsWith(PLACE_PREFIX)
        ? key.slice(PLACE_PREFIX.length)
        : key.startsWith(VENUE_PREFIX)
        ? `${key.slice(VENUE_PREFIX.length)} — home ground`
        : key,
      art: e.art as VenueArt,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}
