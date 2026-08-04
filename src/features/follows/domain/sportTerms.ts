// Same sport, different name. A DISPLAY LAYER ONLY — PURE.
//
// `sport: 'soccer'` is an identifier: it keys config, catalogue rows,
// fixture documents, follow keys and every server route. None of that
// changes here and none of it may. This module answers one question —
// what does this region CALL that sport — and nothing else.
//
// SPARSE BY DESIGN. A region lists only what differs from the bundled
// label; everything unlisted falls through to sportsConfig. Most sports
// are called the same thing everywhere and belong in no table.

import { RegionKey } from '../../../core/region';

// Overrides keyed sport → region → label. Sport-major because the
// interesting question is always "who calls this something else".
const TERMS: Readonly<Record<string, Partial<Record<RegionKey, string>>>> = {
  // The obvious one. "Football" everywhere the sport is dominant;
  // "Soccer" where another code owns the word. AUSTRALIA AND NEW
  // ZEALAND KEEP "Soccer" DELIBERATELY: "football" there means the AFL
  // or rugby league depending on which state you are in, and the
  // association-football audience uses "soccer" itself — the national
  // team is the Socceroos.
  soccer: {
    'uk-ie': 'Football',
    europe: 'Football',
    'south-asia': 'Football',
    latam: 'Football',
  },
  // In North America "football" is unambiguous and means this. The
  // collision is only apparent: soccer is "Soccer" in exactly the
  // region where this is "Football", so the two never both claim the
  // word on one screen.
  nfl: { 'north-america': 'Football' },
  // "Track and field" is the North American term; "athletics" reads as
  // a school subject there.
  athletics: { 'north-america': 'Track and field' },
  // "Hockey" alone means ICE hockey ONLY in North America. In South
  // Asia and Oceania it overwhelmingly means field hockey — and this
  // app already lists "Field hockey" as an Olympic discipline, so a
  // bare "Hockey" elsewhere would be genuinely ambiguous on our own
  // screens, not merely in principle. Renamed for one region only.
  'ice-hockey': { 'north-america': 'Hockey' },
  // "Motorsport" is the British and Commonwealth term; North America
  // says "auto racing".
  motorsport: { 'north-america': 'Auto racing' },
};

// Deliberately NOT translated, and why:
//   cricket, tennis, golf, basketball, baseball, boxing, MMA — one word
//     everywhere we ship.
//   rugby — ambiguous between union and league in the UK, Australia and
//     New Zealand alike, so a region cannot disambiguate it; the fix is
//     naming the competitions, which we already do (Six Nations, NRL).
//   Formula 1, Olympics — proper nouns.
// Competition names are proper nouns too and never vary: "Premier
// League" is "Premier League" in Ohio.

export function sportLabelFor(
  sportKey: string,
  fallbackLabel: string,
  region: RegionKey,
): string {
  return TERMS[sportKey]?.[region] ?? fallbackLabel;
}

// Every sport whose name varies at all — for the report, and for a test
// that keeps this list and the table honest with each other.
export const REGIONALLY_NAMED_SPORTS = Object.keys(TERMS).sort();
