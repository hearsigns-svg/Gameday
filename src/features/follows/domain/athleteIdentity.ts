// An athlete's identity mark, without drawing their face. PURE.
//
// Owner ruling (Prompt 16 B): no generated likenesses of real people.
// Making a picture of an identifiable athlete carries personality-rights
// exposure that a club badge does not, deriving one from promo
// photography adds copyright on top, and a nearly-right face reads as
// broken to the fans who know it. So an athlete's mark is built from
// facts we hold:
//
//   FLAG        — nationality, from the country code the rosters carry.
//                 Boxing is intensely nationality-coded; fighters walk
//                 out behind the flag, and 98.4% of our boxers have one.
//   DIVISION    — the tile's colour. For a boxer the weight class IS
//                 their category, so every heavyweight shares a tone and
//                 the flag does the distinguishing. Elsewhere the
//                 per-athlete accent hue stays as it was.
//   MONOGRAM    — the existing typographic mark, unchanged, underneath.
//
// A licensed photograph, where one verifiably exists, still outranks all
// of this — see data/venueArt.ts. This is the floor, and the floor is
// the common case: of 40 sampled boxers, 7 had a usable Commons image.

import { flagEmojiOf, nationOf } from '../../../core/nationality';

export interface AthleteIdentityInput {
  sportKey: string;
  countryCode?: string;
  // Browse grouping slug — 'boxing-heavyweight', 'wta', 'f1'.
  groupingKey?: string;
  // Per-athlete generated hue (Prompt 9b), used wherever a division
  // colour would say nothing.
  accentHue?: number;
}

export interface AthleteIdentity {
  flag: string | null;
  nation: string | null;
  // Hue for the tile, or null to leave the caller's existing choice
  // alone. Deliberately a HUE, not a hex: colour reaches a UI slot only
  // through teamTheme(), which guarantees the contrast.
  hue: number | null;
}

// The golden angle, as used for per-athlete hues: successive keys land
// far apart on the wheel instead of a plain modulo's near-neighbours.
const GOLDEN_ANGLE = 137.508;

// Deterministic hue for a division. A weight class is a category, so
// every fighter in it shares a tone — which is what makes the flag the
// distinguishing mark rather than one more colour among many.
export function divisionHue(groupingKey: string): number {
  let hash = 0;
  for (const ch of groupingKey) {
    hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  }
  return (hash * GOLDEN_ANGLE) % 360;
}

// Sports whose browse grouping is a real category of the athlete rather
// than an administrative bucket. 'wta'/'atp-directory' are tours, not
// divisions — colouring 1,374 players identically would remove
// information rather than add it.
const DIVISION_SPORTS = new Set(['boxing']);

export function athleteIdentity(a: AthleteIdentityInput): AthleteIdentity {
  const nation = nationOf(a.countryCode);
  const useDivision =
    DIVISION_SPORTS.has(a.sportKey) && a.groupingKey !== undefined;
  return {
    flag: flagEmojiOf(a.countryCode),
    nation: nation?.name ?? null,
    hue: useDivision
      ? divisionHue(a.groupingKey as string)
      : (a.accentHue ?? null),
  };
}

// The row caption's nationality fragment: the flag where a glyph exists,
// and the country CODE beside it — so a platform whose font has no flag
// glyphs still shows what these rows always showed. Null when we do not
// recognise the code, and null is silence, never a placeholder.
export function nationCaption(countryCode?: string): string | null {
  if (!countryCode) return null;
  const nation = nationOf(countryCode);
  if (!nation) return countryCode; // unknown code: say what the source said
  const flag = flagEmojiOf(countryCode);
  return flag ? `${flag} ${countryCode.toUpperCase()}` : countryCode.toUpperCase();
}
