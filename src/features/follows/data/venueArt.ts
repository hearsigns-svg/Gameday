// Venue photography resolver (docs/IMAGERY.md Tier 1): team name →
// Wikidata entity → P115 home venue → P18 image → Commons licence
// check. Zero likeness risk (no person is the subject), zero cost —
// public APIs, resolved once per follow and cached on the Followable.
// Every failure returns null: the tone-mapped gradient is the designed
// floor, not an error state.

import { VenueArt, verifiedArt } from '../domain/venueArtRules';

const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'KickOffCal-dev/1.0 (fixtures calendar app)' };

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
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
// that has a home venue. Trying candidates in search order and keeping
// the first with P115 disambiguates without any curated map.
async function entityWithVenue(
  name: string,
): Promise<{ venue: string } | null> {
  const d = (await getJson(
    `${WD}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&type=item&limit=5&format=json&origin=*`,
  )) as { search?: Array<{ id: string }> };
  for (const cand of d.search ?? []) {
    const venue = await claimValue(cand.id, 'P115');
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
// the ground". Coverage is partial by nature (many venues carry no
// P18) — the framing is photo-when-verifiable, treatment otherwise.
const VENUE_SHAPED =
  /stadium|arena|ground|golf|course|club|park|venue|circuit|track|hall|centre|center|field|speedway|links/;

export async function resolveVenueByName(
  venueName: string,
): Promise<VenueArtResult> {
  try {
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(venueName)}&language=en&type=item&limit=3&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    for (const cand of d.search ?? []) {
      const desc = (cand.description ?? '').toLowerCase();
      if (!VENUE_SHAPED.test(desc)) continue;
      const file = await claimValue(cand.id, 'P18');
      if (file) return artFromCommonsFile(file);
    }
    return { status: 'none' };
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
): Promise<VenueArtResult> {
  try {
    const d = (await getJson(
      `${WD}?action=wbsearchentities&search=${encodeURIComponent(personName)}&language=en&type=item&limit=3&format=json&origin=*`,
    )) as { search?: Array<{ id: string; description?: string }> };
    for (const cand of d.search ?? []) {
      // Only accept entities that look like people — a competition
      // named after a fighter must not supply a "portrait".
      const desc = (cand.description ?? '').toLowerCase();
      if (/competition|event|fight card|match|season/.test(desc)) continue;
      const file = await claimValue(cand.id, 'P18');
      if (file) return artFromCommonsFile(file);
    }
    return { status: 'none' };
  } catch {
    return { status: 'failed' };
  }
}
