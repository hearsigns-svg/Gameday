// What the app SHOWS of what the calendar wants — PURE (Round 7 item 7,
// owner ruling 2026-09-03).
//
// The presentation snapshot Home and Schedule render was built from the
// planner's parents only, so a tournament's matches — placed in the
// calendar under the "Key rounds" and "All matches" tiers — never
// appeared in the app: the Schedule said "US Open" while the calendar
// held twenty-nine matches. The snapshot is now the parents PLUS the
// tier pass's match copies, so the in-app Schedule mirrors the calendar
// entry for entry. The bookend NOTES stay out: they are calendar
// shapes ("US Open begins") of the parent the snapshot already shows.
//
// The Home carousel answers a different question — when do I next care
// — so it keeps ONE card per tournament: a match whose parent is in the
// set is represented by the parent's card, where the matches are
// listed, and never fills the carousel on its own.

import { isTennisTournamentKey, tennisBaseKey } from '../../fixtures/domain/tennisKeys';

export interface PresentationLike {
  id: string;
  parentFixtureId?: string;
  tournamentNote?: 'open' | 'close';
  followKeys?: readonly string[];
}

export function presentationFixtures<T extends PresentationLike>(
  planFixtures: readonly T[],
  tiered: readonly T[],
): T[] {
  const seen = new Set(planFixtures.map((f) => f.id));
  const out = [...planFixtures];
  for (const f of tiered) {
    if (f.tournamentNote !== undefined) continue; // a note, not a fixture
    if (f.parentFixtureId === undefined) continue; // parents come from the plan
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

// A match is REPRESENTED when its own parent card is in the set — or,
// for a joint tennis tournament, when the OTHER tour's parent is: the
// same-event dedupe keeps one of the two parents, so a men's match
// whose ATP parent was dropped still has the tournament's card (the
// WTA doc) standing for it. The link is the tournament key the tier
// pass stamped on the copy, read by its BASE (the sexed `-m` on the
// copy, the bare or `-w` on the surviving parent).
export function carouselFixtures<T extends PresentationLike>(
  upcoming: readonly T[],
): T[] {
  const ids = new Set(upcoming.map((f) => f.id));
  const parentTournaments = new Set(
    upcoming
      .filter((f) => f.parentFixtureId === undefined)
      .flatMap((f) => (f.followKeys ?? []).filter(isTennisTournamentKey).map(tennisBaseKey)),
  );
  return upcoming.filter((f) => {
    if (f.parentFixtureId === undefined) return true;
    if (ids.has(f.parentFixtureId)) return false;
    return !(f.followKeys ?? [])
      .filter(isTennisTournamentKey)
      .some((k) => parentTournaments.has(tennisBaseKey(k)));
  });
}
