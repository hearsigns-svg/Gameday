// Who is fighting, parsed from a combat-sport event title. PURE.
//
// TheSportsDB publishes combat events as one card with a title and no
// participant fields at all — 222 of the 842 fixtures carrying no
// participants are boxing and MMA cards. The fighters ARE in the title,
// but the titles are event branding first and a bout second:
//
//   "Rolando Romero vs Teofimo Lopez"                 — clean
//   "UFC 330 Makhachev vs Machado Garry"              — promotion + number
//   "Prime Video Boxing 16 Inoue vs Tenshin II"       — broadcaster + rematch
//   "BKFC Fight Night Belgrade Faulkner vs Prašović"  — promotion + CITY
//   "ONE Fight Night 46"                              — no bout at all
//
// THE GOVERNING RULE IS CONSERVATISM. A wrong athlete key is far worse
// than a missing one: it becomes a followable the user can see and follow,
// and it silently matches nothing. Anything ambiguous returns null.

import { Fixture } from './fixture';
import { normaliseName } from './identity';

// Sports whose event titles name PEOPLE rather than clubs.
const PERSON_SPORTS = new Set(['boxing', 'ufc']);

export function namesPeople(sport: string): boolean {
  return PERSON_SPORTS.has(sport);
}

// Tolerates the double spaces TheSportsDB sometimes emits.
const VS = /\s+(?:vs\.?|v)\s+/i;

// Event-branding tokens that are never part of a fighter's name. Used only
// to DETECT branding we cannot strip safely, never to strip greedily.
const BRAND_TOKENS = new Set([
  'ufc', 'bkfc', 'pfl', 'one', 'bellator', 'mvpw', 'zuffa', 'boxing',
  'fight', 'night', 'nights', 'friday', 'fights', 'prime', 'video',
  'championship', 'series', 'card', 'live', 'presents',
]);

// Trailing rematch markers: "2", "3", "II", "III", "IV".
const REMATCH = /\s+(?:\d{1,2}|I{1,3}V?|VI{0,3})$/i;

// A person's name, for our purposes: one to four words of letters,
// apostrophes, hyphens or full stops, allowing diacritics.
const NAME_WORD = /^[\p{L}][\p{L}'’.-]*$/u;

function looksLikeName(raw: string): boolean {
  const cleaned = raw.trim();
  if (cleaned.length < 2 || cleaned.length > 40) return false;
  const words = cleaned.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (!words.every((w) => NAME_WORD.test(w))) return false;
  // Any branding word left in the name means we mis-sliced it.
  return !words.some((w) => BRAND_TOKENS.has(w.toLowerCase().replace(/[.'’-]/g, '')));
}

// The left side is event branding followed by a fighter. Where the
// branding carries a NUMBER ("UFC 330", "Prime Video Boxing 16") the
// number is a reliable boundary: the name is whatever follows the last
// numeric token. Where it does not ("BKFC Fight Night Belgrade", "PFL
// Dubai") the boundary is a city or a nickname we cannot distinguish from
// a surname, so we decline rather than guess.
function fighterFromLeft(left: string): string | null {
  const words = left.trim().split(/\s+/);
  const lastNumber = words.map((w) => /^\d+$/.test(w)).lastIndexOf(true);
  const tail = lastNumber >= 0 ? words.slice(lastNumber + 1) : words;
  const candidate = tail.join(' ');
  return looksLikeName(candidate) ? candidate : null;
}

function fighterFromRight(right: string): string | null {
  const candidate = right.replace(REMATCH, '').trim();
  return looksLikeName(candidate) ? candidate : null;
}

export interface Bout {
  first: string; // the first-named fighter
  second: string;
}

// Both fighters, or null when the title is a card with no named bout, or
// when the branding cannot be separated from the name with confidence.
export function parseBout(title: string, sport: string): Bout | null {
  if (!namesPeople(sport)) return null;
  if (!VS.test(title)) return null;
  const parts = title.split(VS);
  if (parts.length !== 2) return null; // "A vs B vs C" is not a bout
  const first = fighterFromLeft(parts[0]);
  const second = fighterFromRight(parts[1]);
  if (!first || !second) return null;
  // A title like "Smith vs Smith" is far more likely a parse artefact than
  // two fighters of the same name.
  if (normaliseName(first) === normaliseName(second)) return null;
  return { first, second };
}

// Fill in participants for combat-sport cards, which arrive with a title
// and nothing else. Fixtures we cannot parse confidently are returned
// untouched — no invented names, no invented follow keys.
export function enrichBoutParticipants(
  fixtures: readonly Fixture[],
): Fixture[] {
  return fixtures.map((f) => {
    if (!namesPeople(f.sport)) return f;
    if (f.homeTeam || f.awayTeam) return f; // provider already told us
    const bout = parseBout(f.title, f.sport);
    if (!bout) return f;
    const keys = [bout.first, bout.second]
      .filter(isFollowableName)
      .map(athleteKey);
    return {
      ...f,
      // For a bout these mean FIRST-NAMED and SECOND-NAMED; there is no
      // home or away. They reuse the existing pair so every consumer —
      // identity clustering, the alias table, the hero card — gets
      // participants for free.
      homeTeam: bout.first,
      awayTeam: bout.second,
      followKeys: [...new Set([...keys, ...f.followKeys])],
    };
  });
}

// Stable, provider-independent follow key for a person. Built from the
// same normalisation the alias table uses, so "Teófimo López" and
// "Teofimo Lopez" resolve to one athlete.
export function athleteKey(name: string): string {
  const slug = normaliseName(name).replace(/\s+/g, '-');
  return `athlete-${slug}`;
}

// Only a FULL name earns a follow key.
//
// UFC titles name fighters by surname alone — "UFC 330 Makhachev vs
// Machado Garry" — and a surname is not an identity: Nurmagomedov,
// Rodriguez and Silva are each several different fighters. A key built
// from one would quietly put another man's fights in somebody's calendar,
// which is the same failure as stripping "AFC" off a club name and is the
// one mistake this codebase has decided it will not make.
//
// Surname-only bouts still get their participants written — they are
// useful for display and for cross-provider identity — they just do not
// become something you can follow. 154 of the 295 parsed names qualify.
export function isFollowableName(name: string): boolean {
  return name.trim().split(/\s+/).length >= 2;
}
