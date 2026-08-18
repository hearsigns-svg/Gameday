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

// EVERY NAME THIS SPORT GOES BY, ANYWHERE — for MATCHING, never display.
//
// The display half of this module and the matching half were drawing from
// different strings, which is the one thing a rename table must not allow.
// Search filtered on the bundled label while every screen showed the
// regional one, so a UK user typed the exact word the app had just shown
// them — "football" — and got nothing back. Worse than a wrong result,
// because it reads as "we don't have that sport".
//
// MATCHING IGNORES THE ACTIVE REGION ON PURPOSE. Someone who calls it
// soccer should find it in London and someone who calls it football
// should find it in Sydney; a search box is where people arrive with the
// word they already have, not the word we chose for them. The display
// name still comes from `sportLabelFor`, so the row answers in the local
// word whichever spelling found it.
//
// In North America "football" therefore matches BOTH this and NFL — which
// is correct, because there it genuinely names two sports, and the two
// rows are distinguishable precisely because they display their regional
// names ("Soccer" and "Football") rather than the word that was typed.
export function sportSearchTerms(
  sportKey: string,
  fallbackLabel: string,
): string[] {
  const variants = Object.values(TERMS[sportKey] ?? {});
  return [...new Set([fallbackLabel, ...variants])];
}

// Does any name this sport goes by contain the needle? Case-folded here
// rather than at each call site, so no caller can forget.
export function sportMatches(
  sportKey: string,
  fallbackLabel: string,
  needle: string,
): boolean {
  const n = needle.trim().toLowerCase();
  if (n === '') return false;
  return sportSearchTerms(sportKey, fallbackLabel).some((t) =>
    t.toLowerCase().includes(n),
  );
}

// Every sport whose name varies at all — for the report, and for a test
// that keeps this list and the table honest with each other.
export const REGIONALLY_NAMED_SPORTS = Object.keys(TERMS).sort();

// What this sport's SCHEDULE is called — the competition card's first
// footer segment (Prompt 27C). Same module as the regional terms
// because it is the same job: display vocabulary keyed by sport,
// identifiers untouched. Sparse: unlisted sports say "Fixtures", which
// is the owner's mockup default (the NBA card reads Fixtures).
const FIXTURES_WORDS: Readonly<Record<string, string>> = {
  boxing: 'Fights',
  ufc: 'Fights',
  cricket: 'Matches',
  tennis: 'Tournaments',
  golf: 'Tournaments',
  f1: 'Events',
  motorsport: 'Events',
  athletics: 'Events',
  olympics: 'Events',
};

export function fixturesWordFor(sportKey: string): string {
  return FIXTURES_WORDS[sportKey] ?? 'Fixtures';
}

// Same honesty pin as REGIONALLY_NAMED_SPORTS: a typo'd key here would
// silently say "Fixtures" forever.
export const FIXTURES_WORDED_SPORTS = Object.keys(FIXTURES_WORDS).sort();
