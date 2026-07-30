// Lazily resolve a licence-gated photo for a named entity and cache it.
// Returns undefined until resolved; null when nothing usable exists.
// Transient failures are NOT cached, so a network blip does not deny an
// entity its photo forever (the bug this pattern already cost us once).

import { useEffect, useState } from 'react';
import { VenueArt } from './domain/venueArtRules';
import {
  cachedPhoto,
  claimResolve,
  putPhoto,
  releaseResolve,
} from './data/photoCache';
import { resolveAthletePhoto } from './data/venueArt';

export function useAthletePhoto(name: string | null): VenueArt | null | undefined {
  const [art, setArt] = useState<VenueArt | null | undefined>(() =>
    name ? cachedPhoto(name) : null,
  );

  useEffect(() => {
    if (!name) {
      setArt(null);
      return;
    }
    const cached = cachedPhoto(name);
    if (cached !== undefined) {
      setArt(cached);
      return;
    }
    if (!claimResolve(name)) return;
    let alive = true;
    void resolveAthletePhoto(name).then((r) => {
      releaseResolve(name);
      if (r.status === 'failed') return; // retry on a later render
      const resolved = r.status === 'found' ? r.art : null;
      putPhoto(name, resolved);
      if (alive) setArt(resolved);
    });
    return () => {
      alive = false;
    };
  }, [name]);

  return art;
}
