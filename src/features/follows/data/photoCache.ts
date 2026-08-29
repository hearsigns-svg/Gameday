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
// Tournament-keyed venue photos (Prompt 9c): resolved via the
// tournament entity, credited as the tournament's ground.
const TOURNAMENT_PREFIX = 'tournament:';
export const tournamentPhotoKey = (name: string): string =>
  `${TOURNAMENT_PREFIX}${name}`;

type Entry = { art: VenueArt | null; at: string; v?: number };
type Cache = Record<string, Entry>;

// RULES VERSION for "none" verdicts — the client mirror of the server
// directory's schema epoch (Stage 4B), keyed on the RULES not the
// CLOCK. A null entry is a verdict of the resolver that wrote it, and
// this cache never expires: verdicts recorded before the hotel/casino
// venue shapes, the first-team ordering and the serialized client
// existed would deny those fixes forever on any long-lived install.
// A timestamp epoch cannot express that — a device that ran the OLD
// rules five minutes before installing the new build writes verdicts
// on the wrong side of any fixed instant — so the verdict carries the
// version of the rules that produced it, and a null under any OTHER
// version reads as absent and re-resolves once. FOUND entries are
// untouched: they were licence-verified at fetch and their credit is
// recorded. Bump when the resolution rules widen.
// v3: the host-city rung + photograph-preferred (Round 3 B5) — a
// pre-B5 "none" may now resolve through the city step.
const NONE_RULES_VERSION = 3;

const inflight = new Set<string>();

function load(): Cache {
  return readJson<Cache>(KEY, {});
}

export function cachedPhoto(name: string): VenueArt | null | undefined {
  const entry = load()[name];
  if (!entry) return undefined;
  if (entry.art === null && entry.v !== NONE_RULES_VERSION) return undefined;
  return entry.art;
}

export function putPhoto(name: string, art: VenueArt | null): void {
  const all = load();
  all[name] = {
    art,
    at: new Date().toISOString(),
    ...(art === null ? { v: NONE_RULES_VERSION } : {}),
  };
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
      subject: key.startsWith(TOURNAMENT_PREFIX)
        ? `${key.slice(TOURNAMENT_PREFIX.length)} — venue`
        : key.startsWith(PLACE_PREFIX)
        ? key.slice(PLACE_PREFIX.length)
        : key.startsWith(VENUE_PREFIX)
        ? `${key.slice(VENUE_PREFIX.length)} — home ground`
        : key,
      art: e.art as VenueArt,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}
