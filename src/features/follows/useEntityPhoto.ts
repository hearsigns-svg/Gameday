// Lazily resolve a licence-gated photo for a named entity and cache it.
// Returns undefined until resolved; null when nothing usable exists.
// Transient failures are NOT cached, so a network blip does not deny an
// entity its photo forever (the bug this pattern already cost us once).

import { useCallback, useEffect, useState } from 'react';
import { VenueArt } from './domain/venueArtRules';
import {
  cachedPhoto,
  claimResolve,
  putPhoto,
  releaseResolve,
  placeKey,
  tournamentPhotoKey,
  venueKey,
} from './data/photoCache';
import { resolveAthletePhoto, resolveTournamentVenue, resolveVenueByName, resolveVenuePhoto } from './data/venueArt';

type Resolver = (name: string) => Promise<
  Awaited<ReturnType<typeof resolveAthletePhoto>>
>;

// One lazy-resolve-and-cache loop; the two hooks below differ only in
// which resolver runs and which namespace they cache under.
function usePhoto(
  key: string | null,
  subject: string | null,
  resolve: Resolver,
): VenueArt | null | undefined {
  const [art, setArt] = useState<VenueArt | null | undefined>(() =>
    key ? cachedPhoto(key) : null,
  );

  useEffect(() => {
    if (!key || !subject) {
      setArt(null);
      return;
    }
    const cached = cachedPhoto(key);
    if (cached !== undefined) {
      setArt(cached);
      return;
    }
    if (!claimResolve(key)) return;
    let alive = true;
    void resolve(subject).then((r) => {
      releaseResolve(key);
      if (r.status === 'failed') return; // retry on a later render
      const resolved = r.status === 'found' ? r.art : null;
      putPhoto(key, resolved);
      if (alive) setArt(resolved);
    });
    return () => {
      alive = false;
    };
  }, [key, subject, resolve]);

  return art;
}

export function useAthletePhoto(name: string | null): VenueArt | null | undefined {
  return usePhoto(name, name, resolveAthletePhoto);
}

// The ground a fixture is PLAYED at — i.e. the home team's. Resolving it
// from the followed team instead put Anfield on Liverpool's away games,
// and gave a competition follow no photograph at all, because a league
// has no home venue to look up.
export function useVenuePhoto(
  homeTeam: string | null,
): VenueArt | null | undefined {
  return usePhoto(homeTeam ? venueKey(homeTeam) : null, homeTeam, resolveVenuePhoto);
}

// Venue-NAME photos (Prompt 9b): keyed on the provider-published venue
// itself (TSDB strVenue — golf courses, stadiums) and resolved as a
// DIRECT entity → P18 lookup. Separate namespace from the team→home-
// ground path, whose resolver a venue name can never satisfy.
export function useVenuePlacePhoto(
  venueName: string | null | undefined,
): VenueArt | null | undefined {
  return usePhoto(
    venueName ? placeKey(venueName) : null,
    venueName ?? null,
    resolveVenueByName,
  );
}

// TOURNAMENT venue photos (Prompt 9c): tennis parents have no venue
// name, so the tournament itself is the key — resolved via its
// Wikidata entity's location, city as disambiguator.
export function useTournamentVenuePhoto(
  tournamentName: string | null | undefined,
  city?: string,
): VenueArt | null | undefined {
  // Memoised: usePhoto's effect depends on resolver identity, and a
  // fresh closure per render would re-run it every render (the other
  // hooks pass stable module-level functions).
  const resolve = useCallback(
    (name: string) => resolveTournamentVenue(name, city),
    [city],
  );
  return usePhoto(
    tournamentName ? tournamentPhotoKey(tournamentName) : null,
    tournamentName ?? null,
    resolve,
  );
}
