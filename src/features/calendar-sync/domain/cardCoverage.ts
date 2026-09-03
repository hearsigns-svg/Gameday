// Which of a parent's children the TIER places — PURE (Round 7 item 7
// follow-up, found on device; widened 2026-09-03).
//
// Under "All matches" every match of a followed tournament is in the
// calendar, yet the expanded card offered "Add" on each row: a row's
// covered state read only the follow keys the CHILD carries (its
// appearance slice, its athletes), and the tournament key reaches a
// match only on the copies the tier pass hands the planner. So the
// card asks the SAME pass the planner runs — one parent, its children,
// the follow set, the global tier and the per-tournament overrides —
// and whatever the pass emits as a match copy is a match the calendar
// holds. One code path, one answer.
//
// The entity page asks the same question in a different shape: not
// "which ids are covered" but "which matches does this follow deliver
// under the tier it has right now" — so the copies themselves are
// exported too, and both surfaces read the planner's own arithmetic.

import { Fixture } from '../../fixtures/domain/fixture';
import { TournamentTier } from './prefs';
import { applyTournamentTiers } from './tournamentTiers';

// The match COPIES the tier pass emits for one parent — each stamped
// with the follow key it rides, exactly as the planner sees them.
export function tierChildrenOf(
  parent: Fixture,
  children: readonly Fixture[],
  followedKeys: readonly string[],
  globalTier: TournamentTier,
  overrides: ReadonlyMap<string, TournamentTier> = new Map(),
): Fixture[] {
  return applyTournamentTiers(
    [parent],
    globalTier,
    followedKeys,
    { byParent: new Map([[parent.id, children]]) },
    overrides,
  ).filter((f) => f.parentFixtureId !== undefined);
}

export function tierCoveredChildIds(
  parent: Fixture,
  children: readonly Fixture[],
  followedKeys: readonly string[],
  globalTier: TournamentTier,
  overrides: ReadonlyMap<string, TournamentTier> = new Map(),
): Set<string> {
  return new Set(
    tierChildrenOf(parent, children, followedKeys, globalTier, overrides).map((f) => f.id),
  );
}
