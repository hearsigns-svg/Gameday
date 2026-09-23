// Which follow(s) a hero card's calendar glyph acts on — PURE (owner
// brief "Per-follow calendar control", 2026-09-23).
//
// "That one follow": the entity the card IS — the follow whose crest and
// colour the card already wears (followIdentity.identityFollow), so the
// glyph and the card never name two different things. A card with no
// identity-bearing follow falls back to the most specific follow that
// matches it (a crest-less athlete, a league with no served mark);
// follow order breaks ties, the identity rule's own tie-break.
//
// ONE EXCEPTION: a joint tennis tournament is ONE card for up to two
// followed draws (Round 7 item 8), so its glyph acts on every followed
// draw of that tournament, and reads ✓ only when all of them are in.
//
// No match → no targets → no glyph ("shown only when the entity is
// followed"): a pinned fixture nobody follows has nothing to toggle.

import type { Followable } from '../data/followStore';
import {
  isTennisTournamentKey,
  tennisBaseKey,
} from '../../fixtures/domain/tennisKeys';
import { CalendarPref, specificityOf } from './calendarInclusion';
import { followQueryKeys } from './followScopes';
import { identityFollow } from './followIdentity';

export function calendarTargetsFor(
  fixtureKeys: readonly string[],
  follows: readonly Followable[],
  hasMark: (key: string) => boolean = () => false,
): Followable[] {
  const keys = new Set(fixtureKeys);
  const matched = follows.filter((f) => followQueryKeys(f).some((k) => keys.has(k)));
  if (matched.length === 0) return [];
  const identity = identityFollow(fixtureKeys, follows, hasMark);
  const owner =
    identity && matched.some((m) => m.key === identity.key)
      ? identity
      : [...matched].sort(
          (a, b) => specificityOf(a).rank - specificityOf(b).rank,
        )[0];
  if (isTennisTournamentKey(owner.key)) {
    const base = tennisBaseKey(owner.key);
    const draws = matched.filter(
      (f) => isTennisTournamentKey(f.key) && tennisBaseKey(f.key) === base,
    );
    if (draws.length > 0) return draws;
  }
  return [owner];
}

// ✓ only when EVERY target is in — the glyph always shows what a tap
// will do, and a tap on a mixed set puts all of them in.
export function targetsCalendarState(
  targets: ReadonlyArray<{ calendar?: CalendarPref }>,
): CalendarPref {
  return targets.length > 0 && targets.every((t) => (t.calendar ?? 'in') === 'in')
    ? 'in'
    : 'out';
}
