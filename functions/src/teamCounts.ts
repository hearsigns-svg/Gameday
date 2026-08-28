// Team counts for browse subtitles ("England · 20 teams") — 27C.
//
// No league row carries a count anywhere: fd.org's competitions payload
// has none, and the static competitions are client config. The ONE
// place a squad size exists is the teamDirectory write-through cache,
// whose docs hold the full team arrays — teams.length IS the count,
// read with the same enumerate-and-getAll join search.ts already runs
// on a per-keystroke path, cached per warm instance.
//
// A count is therefore "the cached directory's size": ≤24h stale for a
// league someone has browsed, older for one nobody opens, and ABSENT
// for a doc that does not exist yet (a just-rolled fd season before its
// first browse). Absent means the subtitle omits it — a count is
// decoration, like competitionArt, so every failure path here degrades
// to "no count", never to an error that costs the browse screen.

import { Firestore } from 'firebase-admin/firestore';
import { DERIVED_TEAM_LEAGUE_IDS } from './fixtureTeams';
import {
  derivedTeamsDocId, fdTeamsDocId, mlbTeamsDocId, NHL_TEAMS_DOC_ID } from './directory';
import { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';

const COUNT_CACHE_MS = 60_000;

// Per-doc entries, so different callers' doc sets share one cache and a
// doc that is genuinely missing (count: null) is remembered as missing
// rather than re-fetched — and never conflated with "not yet asked".
const entries = new Map<string, { at: number; count: number | null }>();

export function __resetCountCacheForTests(): void {
  entries.clear();
}

// docId → team count for every EXISTING doc among docIds. Missing docs
// (and empty team arrays — "· 0 teams" is worse than silence) are
// simply absent from the result.
export async function teamCountsByDoc(
  db: Firestore,
  docIds: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  const now = Date.now();
  const stale = [...new Set(docIds)].filter((id) => {
    const e = entries.get(id);
    return !e || now - e.at >= COUNT_CACHE_MS;
  });
  if (stale.length > 0) {
    try {
      const snaps = await db.getAll(
        ...stale.map((id) => db.collection('teamDirectory').doc(id)),
      );
      snaps.forEach((snap, i) => {
        const teams = snap.exists
          ? (snap.data() as { teams?: unknown[] }).teams
          : undefined;
        entries.set(stale[i], {
          at: now,
          count: Array.isArray(teams) ? teams.length : null,
        });
      });
    } catch (e) {
      // Decorative read: serve whatever the cache still holds.
      console.warn(`[kickoffcal] team counts unavailable: ${e}`);
    }
  }
  const out = new Map<string, number>();
  for (const id of docIds) {
    const c = entries.get(id)?.count;
    if (typeof c === 'number' && c > 0) out.set(id, c);
  }
  return out;
}

// THE STATED EXCEPTION (owner ruling 2026-08-18): a count earns its
// place when it says what's behind Teams — a league's clubs. Where the
// directory is a NATION LIST ("ODI Internationals · 108 teams") the
// number is true and useless, so these rows never emit one. The Teams
// segment itself stays live; only the subtitle count is suppressed.
// Keys are client static row keys; fd national competitions are the
// codes. Pinned to real client rows by teamCounts.test.ts.
export const NATION_LIST_ROW_KEYS: ReadonlySet<string> = new Set([
  'tsdb-league-4801', // ODI Internationals
  'tsdb-league-4979', // T20 Internationals
  'tsdb-league-4714', // Six Nations — six nations, same rule
]);
const NATION_LIST_FD_CODES: ReadonlySet<string> = new Set(['WC', 'EC']);

// Which teamDirectory doc holds a served soccer row's squad, if any.
// fd rows carry their resolved season (the doc id is per-season); the
// three TSDB-seeded leagues map through the shared table; follow-only
// cups have no directory at all. Doc ids come from the WRITER's own
// builders (directory.ts) — never restated as literals here.
export function soccerRowDocId(row: {
  id: number | string;
  season?: number;
  followOnly?: boolean;
}): string | undefined {
  if (row.followOnly) return undefined;
  if (NATION_LIST_FD_CODES.has(String(row.id))) return undefined;
  const tsdb = TSDB_TEAM_LEAGUES[String(row.id)];
  if (tsdb) return tsdb.cacheKey;
  return row.season !== undefined
    ? fdTeamsDocId(String(row.id), row.season)
    : undefined;
}

// The client's STATIC competition rows (every non-soccer sport) never
// touch listLeagues, so their counts ride listPriorities as a map keyed
// by ROW KEY — key, never id: the NHL and MLB statics both carry id 1
// in client sportsConfig, and the key is the collision-free identity.
// Pinned to client sportsConfig by functions/__tests__/teamCounts.test.ts.
//
// A function, not a const: the MLB directory doc is per-season and the
// listTeams route resolves the season from the current year the same way.
export function staticCountRows(): Array<{ docId: string; rowKey: string }> {
  return [
    ...Object.entries(TSDB_TEAM_LEAGUES)
      .filter(([, l]) => l.sportKey !== 'soccer')
      .map(([id, l]) => ({ docId: l.cacheKey, rowKey: `tsdb-league-${id}` })),
    { docId: NHL_TEAMS_DOC_ID, rowKey: 'nhl-league-1' },
    { docId: mlbTeamsDocId(new Date().getFullYear()), rowKey: 'mlb-league-1' },
    // Fixture-derived leagues (owner ruling 2026-08-28): their counts
    // ride the derived directory docs — now that Teams is BACKED, the
    // count says what's behind it, which is the 27C rule for showing
    // one.
    ...[...DERIVED_TEAM_LEAGUE_IDS].map((id) => ({
      docId: derivedTeamsDocId(`tsdb-league-${id}`),
      rowKey: `tsdb-league-${id}`,
    })),
  ].filter((r) => !NATION_LIST_ROW_KEYS.has(r.rowKey));
}

export async function staticTeamCounts(
  db: Firestore,
): Promise<Record<string, number>> {
  const rows = staticCountRows();
  const counts = await teamCountsByDoc(
    db,
    rows.map((r) => r.docId),
  );
  const out: Record<string, number> = {};
  for (const r of rows) {
    const c = counts.get(r.docId);
    if (c !== undefined) out[r.rowKey] = c;
  }
  return out;
}
