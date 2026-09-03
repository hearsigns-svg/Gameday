// Per-follow granularity — what a competition follow actually delivers
// (Prompt 11). PURE.
//
// The mechanism is SCOPED FOLLOW KEYS, not a new follow model: the
// server stamps narrow keys onto the docs a finer scope wants
// (`tennis-t-<slug>-finals` on the final slot, `<golf league>-final` on
// the published Final Round doc), and a follow's scope decides which
// keys join the fixture query. The ledger, the ids and the
// provisional→confirmed lifecycle are untouched — a scope change is an
// ordinary follow-set change to the planner: narrower fetches fewer
// docs, and events no fetched fixture wants any more are removed by the
// same rule an unfollow uses.
//
// F1 is the exception that aligns with the EXISTING mechanism instead:
// sessions are filtered by `seriesSessions` in desiredEventFor (the
// global preference), so an F1 scope is a per-follow override of that
// preference, not a query change.

import { t } from '../../../core/i18n';
import type { Followable } from '../data/followStore';

export type FollowScope =
  // Tennis tournaments (Round 7): a per-tournament override of the
  // GLOBAL tournamentTier preference — the F1 pattern, in the tier
  // vocabulary Preferences already uses. The old 'finals' scope is
  // retired: its whole value (the early-confirmed final slot) arrives
  // through the tier pass's children fetch now, and the launch
  // migration maps stored 'finals' to 'key-rounds'.
  | 'block' // this tournament: the full-span block only
  | 'key-rounds' // this tournament: bookends + finals/semis/quarters
  | 'all-matches' // this tournament: bookends + every match
  | 'finals' // RETIRED (pre-Round-7 stored value; migration target only)
  | 'final-round' // golf: the published Final Round only
  | 'all-sessions' // F1: override the global pref to all
  | 'race-only'; // F1: override the global pref to race only

export interface ScopeOption {
  scope: FollowScope | null; // null = the default (no override stored)
  label: string;
  // Coverage honesty rendered under the selected option — the ATP/WTA
  // asymmetry note lives here, not in a calendar surprise.
  note?: string;
}

// The golf leagues whose provider titles a "Final Round" doc — the
// scoped key exists only where the provider publishes the name.
const GOLF_LEAGUES = new Set([
  'tsdb-league-4425', // PGA Tour
  'tsdb-league-4426', // DP World Tour
  'tsdb-league-4553', // LPGA Tour
  'tsdb-league-5329', // LIV Golf
]);

const GOLF_FINAL_NOTE =
  'Only rounds the provider publishes as “Final Round” — a tournament ' +
  'without one delivers nothing under this setting.';

// What the page knows about the follow's fixtures that the follow record
// alone cannot say: whether any of them is a block-shaped tournament
// (a multi-day all-day parent — domain/tournamentTiers.ts:isBlockParent).
// The tier chips are offered wherever the tier pass would act, so the
// mechanism reaches every tournament-shaped competition in every sport
// without naming them one by one (owner, 2026-09-03).
export interface ScopeContext {
  hasTournaments?: boolean;
}

// The options a follow's page offers. Empty = no selector rendered.
export function scopesFor(f: Followable, ctx: ScopeContext = {}): ScopeOption[] {
  const bespoke =
    (f.type === 'competition' && GOLF_LEAGUES.has(f.key)) ||
    (f.type === 'series' && f.key === 'f1-series-1');
  if (
    f.type === 'competition' &&
    !bespoke &&
    (f.key.startsWith('tennis-t-') || ctx.hasTournaments === true)
  ) {
    // The SAME three modes Preferences offers, as a per-tournament
    // override (Round 7 — replacing the Tournament / Tournament+final
    // pills, which predate the tier model). No null option: like F1,
    // the selected chip reflects the EFFECTIVE value, and tapping the
    // global default clears any stored override. Tennis tournaments
    // offer them unconditionally (their shape is known before any
    // fixture loads); everything else, once a block parent is in view.
    return [
      { scope: 'block', label: t('settings.events.block') },
      {
        scope: 'key-rounds',
        label: t('settings.events.keyRounds'),
        note: t('follows.scope.tennisKeyNote'),
      },
      { scope: 'all-matches', label: t('settings.events.allMatches') },
    ];
  }
  if (f.type === 'competition' && GOLF_LEAGUES.has(f.key)) {
    return [
      { scope: null, label: 'All rounds' },
      { scope: 'final-round', label: 'Final round only', note: GOLF_FINAL_NOTE },
    ];
  }
  if (f.type === 'series' && f.key === 'f1-series-1') {
    return [
      { scope: 'all-sessions', label: 'All sessions' },
      { scope: 'race-only', label: 'Race only' },
    ];
  }
  return [];
}

// The Firestore query keys this follow contributes. Scope narrows or
// widens the key set; everything else about the fetch is unchanged.
// The retired tennis 'finals' expansion is gone (Round 7): the final
// slot carries parentFixtureId and reaches the planner through the
// tier pass's children fetch, so no query key is needed to want it.
export function followQueryKeys(f: Followable): string[] {
  if (f.scope === 'final-round' && GOLF_LEAGUES.has(f.key)) {
    return [`${f.key}-final`];
  }
  return [f.key];
}

// Per-tournament tier overrides for the tier pass (Round 7) — the
// tennis analogue of seriesScopesFrom below: an explicit per-follow
// choice beats the global tournamentTier preference. Values are the
// tier literals the calendar domain already speaks.
export function tournamentTierOverridesFrom(
  follows: readonly Followable[],
): ReadonlyMap<string, 'block' | 'key' | 'all'> {
  const m = new Map<string, 'block' | 'key' | 'all'>();
  for (const f of follows) {
    if (f.scope === 'block') m.set(f.key, 'block');
    else if (f.scope === 'key-rounds') m.set(f.key, 'key');
    else if (f.scope === 'all-matches') m.set(f.key, 'all');
  }
  return m;
}

// Per-fixture seriesSessions override for the planner: the F1 scopes
// beat the global preference, and when several follows match one
// fixture the most permissive wins — follows are a union of wants, so
// one follow asking for the full weekend keeps it.
export function seriesScopesFrom(
  follows: readonly Followable[],
): ReadonlyMap<string, 'all' | 'race-only'> {
  const m = new Map<string, 'all' | 'race-only'>();
  for (const f of follows) {
    if (f.scope === 'all-sessions') m.set(f.key, 'all');
    else if (f.scope === 'race-only') m.set(f.key, 'race-only');
  }
  return m;
}
