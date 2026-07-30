// Venue photography resolver (docs/IMAGERY.md Tier 1): team name →
// Wikidata entity → P115 home venue → P18 image → Commons licence
// check. Zero likeness risk (no person is the subject), zero cost —
// public APIs, resolved once per follow and cached on the Followable.
// Every failure returns null: the tone-mapped gradient is the designed
// floor, not an error state.

import {
  commonsThumbUrl,
  isAllowedLicence,
  stripHtml,
  VenueArt,
} from '../domain/venueArtRules';

const WD = 'https://www.wikidata.org/w/api.php';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
const HEADERS = { 'User-Agent': 'Gameday-dev/1.0 (fixtures calendar app)' };

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

export async function resolveVenuePhoto(
  teamName: string,
): Promise<VenueArt | null> {
  try {
    const hit = await entityWithVenue(teamName);
    if (!hit) return null;
    const file = await claimValue(hit.venue, 'P18');
    if (!file) return null;
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
    const licence = meta?.LicenseShortName?.value;
    if (!isAllowedLicence(licence)) return null;
    return {
      url: commonsThumbUrl(file),
      artist: stripHtml(meta?.Artist?.value),
      licence: licence ?? '',
    };
  } catch {
    return null; // offline / API hiccup — the gradient floor carries it
  }
}
