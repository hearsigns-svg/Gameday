// Session+persistent cache for resolved entity photos, keyed by name.
// Also the register the credits screen reads: every photo we render
// must be attributable, which is a licence condition, not a nicety.

import { readJson, writeJson } from '../../../core/storage';
import { VenueArt } from '../domain/venueArtRules';

const KEY = 'photoCache.v1';

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

// Everything currently rendered, for the credits screen.
export function photoCredits(): Array<{ subject: string; art: VenueArt }> {
  return Object.entries(load())
    .filter(([, e]) => e.art !== null)
    .map(([subject, e]) => ({ subject, art: e.art as VenueArt }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}
