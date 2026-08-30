// Fixture-derived team directories (owner ruling 2026-08-28) — PURE.
//
// Some competitions' fixtures carry first-class team follow keys while
// the provider's team-directory endpoint is empty (probed: TSDB's
// Rugby Championship team list is literally null). Where fixtures
// prove teams, the directory derives them: display name + team key,
// exactly what a Teams row needs to be followable and delivering.
//
// Deliberate behaviour per the ruling: invitational and one-off sides
// STAY IN (no appearance-count filtering — Barbarians beside the
// member nations is the honest list); partial early-season lists are
// accepted and grow as fixtures land; names are the fixture forms with
// no manual renames.

import { Fixture } from './fixture';

// The leagues the 2026-08-28 sweep proved derivable — an EXPLICIT set,
// because the legacy per-sport listTeams branches would otherwise
// swallow these ids and serve the wrong league entirely (cricket's
// fallback is the IPL list, basketball's is the NBA: T20 World Cup and
// the FIBA qualifiers would both have shown someone else's teams).
// Sweep sizes at ruling time: Copa Libertadores 47, T20 World Cup 20,
// County Championship 10, FIBA WC qualifiers 81, Nations Championship
// 12, Rugby League World Cup 10, Rugby Championship 16 (9 one-off,
// owner-accepted). Rugby World Cup joined in Round 5 (owner ruling:
// every national team with fixtures must be findable) — its 2027
// fixtures carry both sides' team keys, probed live 2026-08-30.
//
// sportKey/label feed SEARCH hits (Round 5): the derived teams were
// browsable but invisible to search, which is how South Africa Rugby
// hid while Wales (a directory league) was findable. Labels are pinned
// to the client competition rows by searchRoutes.test.ts.
export const DERIVED_TEAM_LEAGUES: Record<
  string,
  { sportKey: string; label: string }
> = {
  '4501': { sportKey: 'soccer', label: 'Copa Libertadores' },
  '5103': { sportKey: 'cricket', label: 'T20 World Cup' },
  '4458': { sportKey: 'cricket', label: 'County Championship' },
  '4549': { sportKey: 'basketball', label: 'FIBA World Cup qualifiers' },
  '5852': { sportKey: 'rugby', label: 'Nations Championship' },
  '5806': { sportKey: 'rugby', label: 'Rugby League World Cup' },
  '5479': { sportKey: 'rugby', label: 'Rugby Championship' },
  '4574': { sportKey: 'rugby', label: 'Rugby World Cup' },
};

export const DERIVED_TEAM_LEAGUE_IDS: ReadonlySet<string> = new Set(
  Object.keys(DERIVED_TEAM_LEAGUES),
);

const TEAM_KEY = /^(?:tsdb|fdorg|mlb|nhl)-team-(.+)$/;

export interface DerivedTeam {
  id: number | string;
  name: string;
  key: string;
}

// Adapters build followKeys as [homeTeamKey, awayTeamKey, leagueKey,
// ...aliases] — positions 0/1 are the sides, which is what pairs each
// key with its name. The majority name wins where a provider varied
// the spelling across fixtures; appearances (parentFixtureId) are
// people, never teams, and are skipped outright.
export function deriveTeamsFromFixtures(
  fixtures: readonly Fixture[],
): DerivedTeam[] {
  const byKey = new Map<string, Map<string, number>>();
  for (const f of fixtures) {
    if (f.parentFixtureId) continue;
    if (!f.homeTeam || !f.awayTeam) continue;
    const [k0, k1] = f.followKeys;
    if (!TEAM_KEY.test(k0 ?? '') || !TEAM_KEY.test(k1 ?? '')) continue;
    for (const [key, name] of [
      [k0, f.homeTeam],
      [k1, f.awayTeam],
    ] as const) {
      const names = byKey.get(key) ?? new Map<string, number>();
      names.set(name, (names.get(name) ?? 0) + 1);
      byKey.set(key, names);
    }
  }
  return [...byKey.entries()]
    .map(([key, names]) => ({
      key,
      id: TEAM_KEY.exec(key)![1],
      name: [...names.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
