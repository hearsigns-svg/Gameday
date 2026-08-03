// Licensing rules for venue photography (docs/IMAGERY.md). Only
// commercially-safe licences pass; attribution is carried with the
// image and RENDERED (a visible credit is a condition of use, not a
// nicety). Pure — pinned by unit tests.

export interface VenueArt {
  url: string; // sized Commons thumb URL
  artist: string; // plain text, HTML stripped
  licence: string; // short licence name, e.g. 'CC BY-SA 4.0'
  // The Commons file page — the attribution LINK CC 4.0 asks for, and
  // the audit trail for the licence we verified (Prompt 9b: recorded
  // at FETCH time, per image). Optional because entries cached before
  // 9b lack them; every NEW fetch records both.
  sourceUrl?: string;
  verifiedAt?: string;
}

// Fetch-time verification (Prompt 9b): an image is usable only when
// its metadata carries BOTH an allowed licence AND a named artist —
// Commons metadata is user-asserted, and an image with no author
// claim is exactly the one whose licence tag deserves no trust.
export function verifiedArt(fields: {
  fileTitle: string;
  artistHtml?: string;
  licenceShort?: string;
  nowIso: string;
}): VenueArt | null {
  if (!isAllowedLicence(fields.licenceShort)) return null;
  const artist = stripHtml(fields.artistHtml);
  if (artist.length === 0) return null;
  const clean = fields.fileTitle.replace(/^File:/, '').replace(/ /g, '_');
  return {
    url: commonsThumbUrl(fields.fileTitle),
    artist,
    licence: (fields.licenceShort ?? '').trim(),
    sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(clean)}`,
    verifiedAt: fields.nowIso,
  };
}

// Commercial-use allowlist. NC (non-commercial) and ND (no-derivative)
// never pass; unknown licence strings never pass.
export function isAllowedLicence(short: string | undefined): boolean {
  if (!short) return false;
  const s = short.trim().toUpperCase();
  if (s.includes('NC') || s.includes('ND')) return false;
  return (
    s.startsWith('CC BY') || // CC BY x.x and CC BY-SA x.x
    s === 'CC0' ||
    s.startsWith('CC0') ||
    s.startsWith('PUBLIC DOMAIN') ||
    s === 'PD'
  );
}

// Commons Artist fields arrive as HTML anchors — credit lines render
// plain text.
export function stripHtml(html: string | undefined): string {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stable sized-thumbnail URL for a Commons file title.
export function commonsThumbUrl(fileTitle: string, width = 1280): string {
  const clean = fileTitle.replace(/^File:/, '').replace(/ /g, '_');
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(clean)}?width=${width}`;
}

// Tournament-entity candidate selection (Prompt 9c). "Wimbledon"
// returns tube stops, a tram stop, a suburb AND the tournament — the
// live probe measured 4 of 5 candidates as transit/geography. Only a
// tennis-shaped description qualifies, and when several do (a
// name-sharing golf major, a defunct edition) the CITY the feeds
// publish breaks the tie. Pure, so the choice is pinned by tests.
export interface WikidataCandidate {
  id: string;
  description?: string;
}

const TENNIS_SHAPED = /tennis|grand slam/;

export function pickTournamentCandidate(
  candidates: readonly WikidataCandidate[],
  city?: string,
): string | null {
  const shaped = candidates.filter((c) =>
    TENNIS_SHAPED.test((c.description ?? '').toLowerCase()),
  );
  if (shaped.length === 0) return null;
  if (shaped.length === 1 || !city) return shaped[0].id;
  const needle = city.toLowerCase().split(/[,\s]+/)[0];
  const inCity = shaped.find((c) =>
    (c.description ?? '').toLowerCase().includes(needle),
  );
  return (inCity ?? shaped[0]).id;
}
