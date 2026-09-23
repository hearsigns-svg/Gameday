// The Following page's sport sections — PURE (owner brief "Per-follow
// calendar control", 2026-09-23).
//
// Follows group under the sport they are BROWSED under, in the same
// regional sport order as browse (the Home grid's order: catalogue
// weights after the regional overlay). Two placements need saying:
//   * a sport with no tile of its own sits under the tile that hosts it —
//     Formula 1 follows are under Motorsport ("F1 & Motorsport"), where
//     Formula 1 is browsed (config: a static row's followAs);
//   * every Olympic follow — a Games edition or a sport at one — sits in
//     the ONE Olympics group, matching the strip's group node, whatever
//     sport tile it was followed from (Olympic athletics is followable
//     from Athletics too).
// Within a section the follows keep the order they were followed in. A
// follow whose sport the config no longer knows closes the list under
// its own key rather than vanishing.

import type { SportConfig } from './sportsConfig';

export interface FollowingSection<T> {
  sportKey: string; // the tile's key — the header's sport
  follows: T[];
}

const OLYMPIC_KEY = /^olympics-\d{4}(?:-|$)/;
export const OLYMPICS_SPORT_KEY = 'olympics';

// The tile a follow sits under.
export function sectionSportKey(
  follow: { key: string; sportKey: string },
  sports: readonly SportConfig[],
): string {
  if (OLYMPIC_KEY.test(follow.key)) return OLYMPICS_SPORT_KEY;
  const own = sports.find((s) => s.key === follow.sportKey);
  if (own && !own.hiddenTile) return own.key;
  // A tile-less sport lives where a static row follows AS it.
  const host = sports.find(
    (s) =>
      !s.hiddenTile &&
      (s.staticCompetitions ?? []).some((c) => c.followAs?.sportKey === follow.sportKey),
  );
  return host ? host.key : follow.sportKey;
}

export function followingSections<T extends { key: string; sportKey: string }>(
  follows: readonly T[],
  sports: readonly SportConfig[],
  // Browse's order: the tile keys, already sorted by regional weight.
  tileOrder: readonly string[],
): FollowingSection<T>[] {
  const bySport = new Map<string, T[]>();
  for (const f of follows) {
    const key = sectionSportKey(f, sports);
    const list = bySport.get(key);
    if (list) list.push(f);
    else bySport.set(key, [f]);
  }
  const rank = (key: string): number => {
    const i = tileOrder.indexOf(key);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...bySport.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([sportKey, list]) => ({ sportKey, follows: list }));
}
