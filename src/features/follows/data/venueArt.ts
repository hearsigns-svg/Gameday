// Venue photography resolver (docs/IMAGERY.md Tier 1): team name →
// Wikidata entity → P115 home venue → P18 image → Commons licence
// check. Zero likeness risk (no person is the subject), zero cost —
// public APIs, resolved once per follow and cached on the Followable.
// Every failure returns null: the tone-mapped gradient is the designed
// floor, not an error state.

import {
  isPhotographFile,
  pickAthleteCandidate,
  pickCityCandidate,
  pickTournamentCandidate,
  teamCandidateOrder,
  venueCandidateOrder,
  VenueArt,
  verifiedArt,
} from '../domain/venueArtRules';

const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'KickOffCal-dev/1.0 (fixtures calendar app)' };

// ONE SERIALIZED CLIENT, ~1 request/second (Stage 4B). The Home
// carousel used to mount up to ten heroes at once, each firing its own
// burst of Wikidata/Commons requests — measured, the API 429-bans an IP
// after about ten near-simultaneous calls, which starved EVERY card's
// imagery at first paint. All requests now queue through one chain with
// enforced spacing; a 429 pauses the whole queue and surfaces as the
// retryable 'failed' state rather than being retried in place (the
// hooks own retry pacing). Requests run in mount order, and because the
// carousel renders near-viewport cards first, on-screen cards resolve
// first by construction.
const REQUEST_SPACING_MS = 1100;
const RATE_LIMIT_PAUSE_MS = 30_000;
let chain: Promise<void> = Promise.resolve();
let nextAllowedAt = 0;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function getJson(url: string): Promise<unknown> {
  const turn = chain.then(async () => {
    const now = Date.now();
    if (now < nextAllowedAt) await wait(nextAllowedAt - now);
    nextAllowedAt = Date.now() + REQUEST_SPACING_MS;
  });
  // The chain never carries a rejection — each caller's failure is its
  // own; the queue just spaces starts.
  chain = turn.catch(() => undefined);
  await turn;
  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 429) {
    // Back the whole queue off, not just this caller: the limit is per
    // client, and hammering on through it turns a pause into a ban.
    nextAllowedAt = Date.now() + RATE_LIMIT_PAUSE_MS;
    throw new Error('http 429');
  }
  if (!res.ok) throw new Error(`http ${res.status}`);
  return res.json();
}

async function claimValue(
  entity: string,
  property: string,
): Promise<string | null> {
  const d = (await getJson(
    `${WD}?action=wbgetclaims&entity=${entity}&property=${property}&format=json&origin=*`,
  )) as {
    claims?: Record<
      string,
      Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
    >;
  };
  const v = d.claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  if (typeof v === 'string') return v; // P18: file title
  if (v && typeof v === 'object' && 'id' in v) return String(v.id); // P115: entity
  return null;
}

// The entity for "Liverpool" is the city; the CLUB is the candidate
// that has a home venue. Candidates are tried in teamCandidateOrder —
// first teams before reserve/youth sides (Stage 4B: "Osasuna" used to
// resolve to Osasuna Promesas and photograph Tajonar instead of El
// Sadar) — keeping the first with P115.
async function entityWithVenue(
  name: string,
): Promise<{ venue: string } | null> {
  const d = (await getJson(
    `${WD}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json&origin=*`,
  )) as { search?: Array<{ id: string; description?: string }> };
  for (const id of teamCandidateOrder(d.search ?? [])) {
    const venue = await claimValue(id, 'P115');
    if (venue) return { venue };
  }
  return null;
}

// 'none' = resolved, nothing usable (persist so we never refetch).
// 'failed' = transient (offline, rate limit) — MUST NOT be persisted,
// or one bad moment denies a team its photo forever.
export type VenueArtResult =
  | { status: 'found'; art: VenueArt }
  | { status: 'none' }
  | { status: 'failed' };

// Shared tail: Commons file → licence gate → sized thumb.
async function artFromCommonsFile(file: string): Promise<VenueArtResult> {
  try {
    const info = (await getJson(
      `${COMMONS}?action=query&titles=${encodeURIComponent(`File:${file}`)}&prop=imageinfo&iiprop=extmetadata&format=json&origin=*`,
    )) as {
      query?: {
        pages?: Record<
          string,
          {
            imageinfo?: Array<{
              extmetadata?: Record<string, { value?: string }>;
            }>;
          }
        >;
      };
    };
    const pages = info.query?.pages ?? {};
    const meta = Object.values(pages)[0]?.imageinfo?.[0]?.extmetadata;
    // Fetch-time verification (Prompt 9b): licence allowlist AND a
    // named artist, with the source page recorded per image — an
    // authorless licence tag is exactly the user-asserted metadata
    // that deserves no trust.
    const art = verifiedArt({
      fileTitle: file,
      artistHtml: meta?.Artist?.value,
      licenceShort: meta?.LicenseShortName?.value,
      nowIso: new Date().toISOString(),
    });
    if (!art) return { status: 'none' };
    return { status: 'found', art };
  } catch {
    // Transient: the gradient floor carries this render, and the next
    // one retries.
    return { status: 'failed' };
  }
}

export async function resolveVenuePhoto(
  teamName: string,
): Promise<VenueArtResult> {
  try {
    const hit = await entityWithVenue(teamName);
    if (!hit) return { status: 'none' };
    const file = await claimValue(hit.venue, 'P18');
    if (!file) return { status: 'none' };
    return artFromCommonsFile(file);
  } catch {
    return { status: 'failed' };
  }
}

// VENUE-NAME photos (Prompt 9b): providers like TSDB publish the real
// venue name ("Waialae Country Club"), which is a DIRECT entity — no
// team→P115 hop. The review round proved the team resolver dead for
// these (venues carry no P115): this one searches the name and takes
// P18 from a venue-shaped candidate only, so a venue name that
// happens to match a painting or a band can never supply a "photo of
// the ground". Candidate order lives in venueCandidateOrder (Stage 4B:
// purpose-built grounds beat hotels/resorts/casinos, which now qualify
// too by ruling; the feed's city breaks ties). Coverage is partial by
// nature (many venues carry no P18) — the framing is
// photo-when-verifiable, treatment otherwise.
export async function resolveVenueByName(
  venueName: string,
  city?: string,
): Promise<VenueArtResult> {
  try {
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(venueName)}&language=en&type=item&limit=3&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    for (const id of venueCandidateOrder(d.search ?? [], city)) {
      const file = await claimValue(id, 'P18');
      // A vector P18 is a diagram, not photography (Round 3 B5) —
      // skipped before any metadata fetch; the walk continues.
      if (file && !isPhotographFile(file)) continue;
      if (file) {
        const art = await artFromCommonsFile(file);
        // The first venue-shaped P18 still ends the venue walk — but a
        // gate refusal now falls THROUGH to the city rung instead of
        // ending resolution (Shanghai's artist-less circuit photo).
        if (art.status !== 'none') return art;
        break;
      }
    }
    return city ? resolveCityPhoto(city) : { status: 'none' };
  } catch {
    return { status: 'failed' };
  }
}

// HOST-CITY RUNG (Round 3 B5) — the deliberate second candidate shape.
// Runs only when the venue walk resolved to nothing usable, from the
// feed's own city string; the credit carries the place name because
// city imagery is not "the ground". Same client, same licence gate,
// same photograph preference.
async function resolveCityPhoto(city: string): Promise<VenueArtResult> {
  try {
    const label = city.split(',')[0].trim();
    if (label.length === 0) return { status: 'none' };
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(label)}&language=en&type=item&limit=5&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    const entity = pickCityCandidate(d.search ?? []);
    if (!entity) return { status: 'none' };
    const file = await claimValue(entity, 'P18');
    if (!file || !isPhotographFile(file)) return { status: 'none' };
    const art = await artFromCommonsFile(file);
    if (art.status !== 'found') return art;
    return { status: 'found', art: { ...art.art, subject: label } };
  } catch {
    return { status: 'failed' };
  }
}

// TOURNAMENT venue photos (Prompt 9c, owner-approved): tennis parents
// carry no venue name — the ICS LOCATION is city+country — so the key
// is the TOURNAMENT itself: name → tennis-shaped entity (city as
// disambiguator, both pure in venueArtRules) → P276 location → that
// venue's P18, falling back to the tournament entity's own P18. Same
// access path as every other resolver here — one Wikidata client,
// per the owner's instruction. Chain live-verified 2026-08-03:
// Wimbledon → Q41520 → P276 Q815369 → P18 "Centre court 2006.JPG".
export async function resolveTournamentVenue(
  tournamentName: string,
  city?: string,
): Promise<VenueArtResult> {
  try {
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(tournamentName)}&language=en&type=item&limit=5&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    const entity = pickTournamentCandidate(d.search ?? [], city);
    if (!entity) return { status: 'none' };
    const venue = await claimValue(entity, 'P276');
    const file = venue
      ? ((await claimValue(venue, 'P18')) ?? (await claimValue(entity, 'P18')))
      : await claimValue(entity, 'P18');
    if (!file) return { status: 'none' };
    return artFromCommonsFile(file);
  } catch {
    return { status: 'failed' };
  }
}

// PERSON photos (docs/IMAGERY.md Tier 2). Same licence gate; used ONLY
// to identify a named participant on that participant's own fixture —
// never as Home decoration, never in store screenshots or marketing,
// which is the advertising-shaped use the DraftKings case turned on.
export async function resolveAthletePhoto(
  personName: string,
  sportKey: string,
): Promise<VenueArtResult> {
  try {
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(personName)}&language=en&type=item&limit=5&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    // The candidate must be describable as THIS SPORT's competitor, and
    // must be the only one — see pickAthleteCandidate for the measured
    // wrong-person hits this replaces. No fallback to "first with an
    // image": that fallback WAS the bug.
    const entity = pickAthleteCandidate(d.search ?? [], sportKey, personName);
    if (!entity) return { status: 'none' };
    const file = await claimValue(entity, 'P18');
    if (!file) return { status: 'none' };
    return artFromCommonsFile(file);
  } catch {
    return { status: 'failed' };
  }
}
