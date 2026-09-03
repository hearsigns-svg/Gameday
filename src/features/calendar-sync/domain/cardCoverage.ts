// Which of a card's matches the TIER already places — PURE (Round 7
// item 7 follow-up, found on device).
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

import { Fixture } from '../../fixtures/domain/fixture';
import { TournamentTier } from './prefs';
import { applyTournamentTiers } from './tournamentTiers';

export function tierCoveredChildIds(
  parent: Fixture,
  children: readonly Fixture[],
  followedKeys: readonly string[],
  globalTier: TournamentTier,
  overrides: ReadonlyMap<string, TournamentTier> = new Map(),
): Set<string> {
  const out = applyTournamentTiers(
    [parent],
    globalTier,
    followedKeys,
    { byParent: new Map([[parent.id, children]]) },
    overrides,
  );
  return new Set(out.filter((f) => f.parentFixtureId !== undefined).map((f) => f.id));
}
