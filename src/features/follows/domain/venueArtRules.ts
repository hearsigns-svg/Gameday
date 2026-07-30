// Licensing rules for venue photography (docs/IMAGERY.md). Only
// commercially-safe licences pass; attribution is carried with the
// image and RENDERED (a visible credit is a condition of use, not a
// nicety). Pure — pinned by unit tests.

export interface VenueArt {
  url: string; // sized Commons thumb URL
  artist: string; // plain text, HTML stripped
  licence: string; // short licence name, e.g. 'CC BY-SA 4.0'
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
