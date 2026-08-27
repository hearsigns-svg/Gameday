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

// Failed-resolve retry pacing (Stage 4B). 'failed' used to say "retry
// on a later render", but the effect's deps never change on a render —
// retry actually needed a REMOUNT, so a card that hit the rate limiter
// at first paint stayed bare for as long as the user looked at it. Now
// a failure schedules its own retry with backoff, without remounting.
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000, 90_000];

// One lazy-resolve-and-cache loop; the hooks below differ only in
// which resolver runs and which namespace they cache under.
function usePhoto(
  key: string | null,
  subject: string | null,
  resolve: Resolver,
): VenueArt | null | undefined {
  const [art, setArt] = useState<VenueArt | null | undefined>(() =>
    key ? cachedPhoto(key) : null,
  );
  // Bumped to re-arm the effect after a transient failure — the retry
  // mechanism, not part of the cache.
  const [attempt, setAttempt] = useState(0);

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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void resolve(subject).then((r) => {
      releaseResolve(key);
      if (r.status === 'failed') {
        // Transient (offline, 429): NOT cached. Re-arm this effect
        // after a backoff; give up quietly after the last step — a
        // remount starts the ladder again.
        if (alive && attempt < RETRY_DELAYS_MS.length) {
          retryTimer = setTimeout(
            () => setAttempt((n) => n + 1),
            RETRY_DELAYS_MS[attempt],
          );
        }
        return;
      }
      const resolved = r.status === 'found' ? r.art : null;
      putPhoto(key, resolved);
      if (alive) setArt(resolved);
    });
    return () => {
      alive = false;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
    };
  }, [key, subject, resolve, attempt]);

  return art;
}

// The person named on a fixture, resolved WITHIN their sport: the same
// name can belong to a writer, a hacker or an ice dancer, and a wrong
// face is worse than none (domain/venueArtRules.ts::pickAthleteCandidate).
// Cached per sport as well as per name for the same reason.
export function useAthletePhoto(
  name: string | null,
  sportKey: string,
): VenueArt | null | undefined {
  const resolve = useCallback(
    (person: string) => resolveAthletePhoto(person, sportKey),
    [sportKey],
  );
  return usePhoto(name ? `${sportKey}:${name}` : null, name, resolve);
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
// ground path, whose resolver a venue name can never satisfy. The
// feed's city, where it publishes one, disambiguates same-name venues
// (Stage 4B); the cache stays keyed on the venue name alone.
export function useVenuePlacePhoto(
  venueName: string | null | undefined,
  city?: string,
): VenueArt | null | undefined {
  const resolve = useCallback(
    (name: string) => resolveVenueByName(name, city),
    [city],
  );
  return usePhoto(
    venueName ? placeKey(venueName) : null,
    venueName ?? null,
    resolve,
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
