// Children of the followed block-synced tournaments (Round 3 B3) — the
// fetch half the tier pass needs. Data layer: one parentFixtureId query
// per followed tournament, per sync pass.
//
// JOINT tournaments are one tournament stored as two parents (ATP +
// WTA under one tennis-t- key), and the planner sees only the dedupe's
// surviving parent — so the children of EVERY sibling are unioned and
// handed to every member id: whichever parent survives, it sees the
// whole draw. Selection rides jointCardEntries — the SAME dedupe the
// expanded card uses — so a per-player appearance pair becomes one
// match here exactly as it does on screen, and a cancelled or finished
// child never reaches the planner as a create.

import { Fixture } from '../../fixtures/domain/fixture';
import { fetchEventCard } from '../../fixtures/data/fixturesRepo';
import {
  jointCardEntries,
  jointTournamentKeyOf,
} from '../../fixtures/domain/card';
import { err, ok, Result } from '../../../core/result';
import {
  isBlockParent,
  TournamentChildren,
} from '../domain/tournamentTiers';

// Takes the PRE-dedupe fixture list — both joint parents are still
// present there, which is what makes the union possible.
export async function fetchTournamentChildrenFor(
  fixtures: readonly Fixture[],
  followedKeys: readonly string[],
  nowMs: number = Date.now(),
): Promise<Result<TournamentChildren>> {
  const followed = new Set(followedKeys);
  const parents = fixtures.filter(
    (f) => isBlockParent(f) && f.followKeys.some((k) => followed.has(k)),
  );
  if (parents.length === 0) return ok({ byParent: new Map() });

  const fetched: Array<{ parent: Fixture; children: Fixture[] }> = [];
  for (const parent of parents) {
    const r = await fetchEventCard(parent.id);
    // A failed read fails the PASS: children absent because a query
    // failed must never read as "the tournament has no matches" — the
    // planner would delete every previously synced one (standing
    // invariant).
    if (!r.ok) return err(r.error);
    fetched.push({ parent, children: r.value });
  }

  const groups = new Map<
    string,
    Array<{ parent: Fixture; children: Fixture[] }>
  >();
  for (const side of fetched) {
    const groupKey =
      jointTournamentKeyOf(side.parent.followKeys) ?? side.parent.id;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), side]);
  }

  const byParent = new Map<string, Fixture[]>();
  for (const sides of groups.values()) {
    const keep = new Set(
      jointCardEntries(
        sides.map((s) => ({ parent: s.parent, children: s.children })),
        nowMs,
      ).map((e) => e.id),
    );
    const union = sides.flatMap((s) => s.children).filter((c) => keep.has(c.id));
    for (const s of sides) byParent.set(s.parent.id, union);
  }
  return ok({ byParent });
}
