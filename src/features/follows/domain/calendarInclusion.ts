// Per-follow calendar control — the INCLUSION RULE, PURE (owner brief
// "Per-follow calendar control and motorsport sessions", 2026-09-23).
//
// Every follow carries a calendar preference, `in` or `out`. What ends
// up in the calendar is decided per FIXTURE from the follows that match
// it:
//
//   1. MOST SPECIFIC LEVEL DECIDES. Matching follows are ranked
//      participant (team / athlete / fighter) → container (tournament /
//      Games edition) → competition (league / tour / series / card
//      stream) → sport, and only the follows at the most specific level
//      that has any match are consulted.
//   2. AMONG EQUALS, ANY `in` WINS — Warriors `out` and Lakers `in` keeps
//      Warriors @ Lakers.
//   3. FILTERS APPLY AFTER INCLUSION (tournament tier, M/W chips, the
//      motorsport session ladder, Olympic scoping) — they live in the
//      tier pass and the planner, never here.
//   4. ENTITLEMENT GATES WRITING, NOT PREFERENCES — the planner's
//      entitlement input, never this rule.
//
// A NARROWER SLICE OF THE SAME LEVEL COUNTS AS MORE SPECIFIC than the
// whole it belongs to (the judgement call the brief leaves open — "make
// the most reasonable call, apply it consistently"): one draw of a
// tournament beats the tournament, one sport at a Games edition beats
// the edition, one sex of a card stream beats the stream. Without it,
// "US Open `in`, US Open — Women's `out`" would keep the women's draw
// (two equals, any `in` wins), which is the opposite of what the narrower
// choice says. Every follow type in the app today has a place:
//
//   rank 0  participant   team, athlete (tennis player, boxer, MMA
//                          fighter, F1 driver)
//   rank 1  container ⊂   a tennis DRAW (tennis-t-<slug>-m/-w), a sport
//                          at a Games edition (olympics-2028-athletics)
//   rank 2  container     a tennis tournament's joint key
//                          (tennis-t-<slug>), a Games edition
//                          (olympics-2028)
//   rank 3  competition ⊂ one sex of a card stream (tsdb-league-4445-m)
//   rank 4  competition   league, cup, tour (tennis-atp), promotion,
//                          series (f1-series-1), everything else
//   rank 5  sport         (no sport-level follow exists in the app; the
//                          rung is kept so the rule states the full
//                          ladder)
//
// A single fight card and a single Games-edition match are not
// followable things today, so "card" as a container has no follow key
// to place; a card STREAM ("Major fight cards — Men's") is a competition.

import {
  isTennisTournamentKey,
  tennisBaseKey,
  tennisSexOfKey,
} from '../../fixtures/domain/tennisKeys';
import type { FollowableType } from './sportsConfig';

export type CalendarPref = 'in' | 'out';

export type SpecificityLevel = 'participant' | 'container' | 'competition' | 'sport';

export interface Specificity {
  level: SpecificityLevel;
  // Lower = more specific. Only the ORDER is meaningful.
  rank: number;
}

// What the rule needs to know about a follow. Structural, so the data
// layer's Followable and a test's literal both fit.
export interface InclusionFollow {
  key: string;
  type: FollowableType;
  calendar: CalendarPref;
  // The fixture keys this follow is found under — its scope-expanded
  // QUERY keys (a final-round golf follow matches its `-final` key), the
  // same set the fetch uses.
  queryKeys: readonly string[];
}

const OLYMPIC_SPORT_AT_GAMES = /^(olympics-\d{4})-[a-z0-9-]+$/;
const OLYMPIC_GAMES = /^olympics-\d{4}$/;
const SEXED_COMPETITION = /^((?:tsdb-league-\d+)|(?:pbc-cards))-(?:m|w)$/;

export function specificityOf(f: { key: string; type: FollowableType }): Specificity {
  if (f.type === 'team' || f.type === 'athlete') {
    return { level: 'participant', rank: 0 };
  }
  const key = f.key;
  if (isTennisTournamentKey(key)) {
    return { level: 'container', rank: tennisSexOfKey(key) === null ? 2 : 1 };
  }
  if (OLYMPIC_SPORT_AT_GAMES.test(key)) return { level: 'container', rank: 1 };
  if (OLYMPIC_GAMES.test(key)) return { level: 'container', rank: 2 };
  if (SEXED_COMPETITION.test(key)) return { level: 'competition', rank: 3 };
  return { level: 'competition', rank: 4 };
}

// The follow that CONTAINS this one by key grammar alone — no fixture
// needed: a draw sits in its tournament, a Games sport in its edition, a
// sexed card stream in its stream. Null when the key names no such
// parent. Used by the starting-state rule, which must work for things
// with nothing scheduled yet.
export function structuralParentKey(key: string): string | null {
  if (isTennisTournamentKey(key) && tennisSexOfKey(key) !== null) {
    return tennisBaseKey(key);
  }
  const games = OLYMPIC_SPORT_AT_GAMES.exec(key);
  if (games) return games[1];
  const sexed = SEXED_COMPETITION.exec(key);
  if (sexed) return sexed[1];
  return null;
}

// Fixture key → the follows found under it. Built once per decision
// batch; a planner pass asks thousands of fixtures the same question.
export type InclusionIndex = ReadonlyMap<string, readonly InclusionFollow[]>;

export function inclusionIndex(follows: readonly InclusionFollow[]): InclusionIndex {
  const index = new Map<string, InclusionFollow[]>();
  for (const f of follows) {
    for (const k of new Set(f.queryKeys)) {
      const list = index.get(k);
      if (list) list.push(f);
      else index.set(k, [f]);
    }
  }
  return index;
}

// The follows a fixture's keys match, each once.
export function matchedFollows(
  fixtureKeys: readonly string[],
  index: InclusionIndex,
): InclusionFollow[] {
  const seen = new Set<string>();
  const out: InclusionFollow[] = [];
  for (const k of fixtureKeys) {
    for (const f of index.get(k) ?? []) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      out.push(f);
    }
  }
  return out;
}

// THE RULE. False when nothing matches — a fixture no follow claims is
// not this rule's to include (pins are the caller's business).
export function isIncluded(
  fixtureKeys: readonly string[],
  index: InclusionIndex,
): boolean {
  let bestRank = Number.POSITIVE_INFINITY;
  let anyIn = false;
  for (const f of matchedFollows(fixtureKeys, index)) {
    const rank = specificityOf(f).rank;
    if (rank < bestRank) {
      bestRank = rank;
      anyIn = f.calendar === 'in';
    } else if (rank === bestRank && f.calendar === 'in') {
      anyIn = true;
    }
  }
  return anyIn;
}

// Convenience: the predicate for one follow set.
export function inclusionPredicate(
  follows: readonly InclusionFollow[],
): (fixtureKeys: readonly string[]) => boolean {
  const index = inclusionIndex(follows);
  return (fixtureKeys) => isIncluded(fixtureKeys, index);
}

// ─── Starting state of a new follow ───────────────────────────────────
//
// If any BROADER followed thing that is `in` already covers the new
// follow, it starts `in` whatever the Settings default says — it was in
// the calendar already. Otherwise it starts at the Settings default.
//
// "Covers" is judged two ways, either sufficient:
//   * by KEY GRAMMAR — a draw inside its followed tournament, a Games
//     sport inside its followed edition, a sexed card stream inside its
//     followed stream (works with nothing scheduled);
//   * by SHARED FIXTURES — some fixture already in view carries both the
//     new follow's key and the broader follow's key (a Warriors game in
//     a followed NBA). The caller hands in what is in view; a team with
//     nothing scheduled and no grammar link starts at the default, which
//     is the honest answer when nothing proves the coverage.
export function startingCalendarPref(
  newFollow: { key: string; type: FollowableType; queryKeys: readonly string[] },
  existing: readonly InclusionFollow[],
  fixturesInView: ReadonlyArray<{ followKeys: readonly string[] }>,
  settingDefault: CalendarPref,
): CalendarPref {
  const rank = specificityOf(newFollow).rank;
  const broaderIn = existing.filter(
    (f) =>
      f.key !== newFollow.key &&
      f.calendar === 'in' &&
      specificityOf(f).rank > rank,
  );
  if (broaderIn.length === 0) return settingDefault;
  const parent = structuralParentKey(newFollow.key);
  if (parent !== null && broaderIn.some((f) => f.key === parent)) return 'in';
  const own = new Set(newFollow.queryKeys);
  for (const fx of fixturesInView) {
    if (!fx.followKeys.some((k) => own.has(k))) continue;
    const keys = new Set(fx.followKeys);
    if (broaderIn.some((b) => b.queryKeys.some((k) => keys.has(k)))) return 'in';
  }
  return settingDefault;
}

// The Settings default as it applies to a new follow (Stage 4). In the
// free state it reads OFF, as the Settings switch shows it: nothing new
// is written without Premium, and a ✓ on a follow that places nothing
// would be a lie. Entitled, it is the switch.
export function settingDefaultFor(
  newFollowsInCalendar: boolean,
  premiumLocked: boolean,
): CalendarPref {
  if (premiumLocked) return 'out';
  return newFollowsInCalendar ? 'in' : 'out';
}
