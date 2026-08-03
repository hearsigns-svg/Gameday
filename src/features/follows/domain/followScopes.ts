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

import type { Followable } from '../data/followStore';

export type FollowScope =
  | 'finals' // tennis tournament: block + the final
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

const TENNIS_FINALS_NOTE =
  'The final as a calendar event comes from the WTA feed — for joint ' +
  'events that is the women’s final. ATP match times have no approved ' +
  'source, so ATP-only tournaments deliver the tournament banner alone.';

const GOLF_FINAL_NOTE =
  'Only rounds the provider publishes as “Final Round” — a tournament ' +
  'without one delivers nothing under this setting.';

// The options a follow's page offers. Empty = no selector rendered.
export function scopesFor(f: Followable): ScopeOption[] {
  if (f.type === 'competition' && f.key.startsWith('tennis-t-')) {
    return [
      { scope: null, label: 'Tournament' },
      { scope: 'finals', label: 'Tournament + final', note: TENNIS_FINALS_NOTE },
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
export function followQueryKeys(f: Followable): string[] {
  if (f.scope === 'finals' && f.key.startsWith('tennis-t-')) {
    return [f.key, `${f.key}-finals`];
  }
  if (f.scope === 'final-round' && GOLF_LEAGUES.has(f.key)) {
    return [`${f.key}-final`];
  }
  return [f.key];
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
