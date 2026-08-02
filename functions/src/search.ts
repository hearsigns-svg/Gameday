// Federated team search: everything the app can actually follow.
// Sources: the teamDirectory cache (fdorg soccer comps, MLB, NHL, and
// browsed TSDB leagues) plus a live TSDB name search FILTERED to the
// leagues we serve with team-level follows. Results outside served
// leagues never appear — search must not promise fixtures we can't
// deliver.

import { Firestore } from 'firebase-admin/firestore';
import { normaliseName } from './identity';
import { TSDB_TEAM_LEAGUES as TSDB_LEAGUES } from './tsdbTeamLeagues';
import { searchTsdbTeams } from './providers/tsdb';

export interface SearchTeamHit {
  key: string;
  name: string;
  sportKey: string; // client sportsConfig key
  league: string; // display label
  crestUrl?: string;
  colours?: string;
  pollPath?: string; // only where the client can't derive it (tsdb)
}

// Single-sourced TSDB team-league table — shared with the listTeams
// route; pinned to client sportsConfig by the drift test.
export { TSDB_TEAM_LEAGUES } from './tsdbTeamLeagues';

const FD_LABELS: Record<string, string> = {
  PL: 'Premier League',
  ELC: 'Championship',
  CL: 'Champions League',
  BL1: 'Bundesliga',
  SA: 'Serie A',
  PD: 'La Liga',
  FL1: 'Ligue 1',
  DED: 'Eredivisie',
  PPL: 'Primeira Liga',
  BSA: 'Brasileirão',
  EC: 'Euros',
  WC: 'World Cup',
};

// Domestic leagues first: on a key collision (Arsenal in both the PL
// and CL docs) the domestic label wins.
const FD_ORDER = ['PL', 'ELC', 'BL1', 'SA', 'PD', 'FL1', 'DED', 'PPL', 'BSA', 'CL', 'EC', 'WC'];
const FD_SEASON = 2026;

interface DirectoryDocTeam {
  name?: string;
  key?: string;
  aliases?: string[];
  crestUrl?: string;
  colours?: string;
}

interface LoadedDoc {
  sportKey: string;
  league: string;
  tsdbPollPath?: string;
  teams: DirectoryDocTeam[];
}

// The searchable doc set is fully enumerable — never scan the whole
// collection (legacy apisports docs and stale seasons stay out), and
// cache per warm instance: this is a per-keystroke path.
const DIR_CACHE_MS = 60_000;
let dirCache: { at: number; docs: LoadedDoc[] } | null = null;

async function loadDirectory(db: Firestore): Promise<LoadedDoc[]> {
  if (dirCache && Date.now() - dirCache.at < DIR_CACHE_MS) return dirCache.docs;
  const specs: Array<{ id: string; sportKey: string; league: string; tsdbPollPath?: string }> = [
    ...FD_ORDER.map((code) => ({
      id: `soccer-fd-${code}-${FD_SEASON}`,
      sportKey: 'soccer',
      league: FD_LABELS[code] ?? 'Soccer',
    })),
    { id: `baseball-mlb-${FD_SEASON}`, sportKey: 'baseball', league: 'MLB' },
    { id: 'ice-hockey-nhl', sportKey: 'ice-hockey', league: 'NHL' },
    ...Object.values(TSDB_LEAGUES).map((l) => ({
      id: l.cacheKey,
      sportKey: l.sportKey,
      league: l.label,
      tsdbPollPath: l.pollPath,
    })),
  ];
  const snaps = await db.getAll(
    ...specs.map((s) => db.collection('teamDirectory').doc(s.id)),
  );
  const docs: LoadedDoc[] = [];
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const spec = specs[i];
    docs.push({
      sportKey: spec.sportKey,
      league: spec.league,
      ...(spec.tsdbPollPath ? { tsdbPollPath: spec.tsdbPollPath } : {}),
      teams: (snap.data() as { teams?: DirectoryDocTeam[] }).teams ?? [],
    });
  });
  dirCache = { at: Date.now(), docs };
  return docs;
}

export async function searchTeams(
  db: Firestore,
  tsdbKey: string,
  rawQuery: string,
  cap = 20,
): Promise<SearchTeamHit[]> {
  const q = normaliseName(rawQuery);
  if (q.length < 2) return [];

  // 1. Cached directories — instant, alias-aware. Key-level dedup:
  // one club, one hit, domestic label preferred (doc order).
  const hits: SearchTeamHit[] = [];
  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();
  for (const doc of await loadDirectory(db)) {
    for (const t of doc.teams) {
      if (!t.key || !t.name) continue;
      const names = [t.name, ...(t.aliases ?? [])];
      if (!names.some((n) => normaliseName(n).includes(q))) continue;
      if (seenKeys.has(t.key)) continue;
      seenKeys.add(t.key);
      for (const n of names) seenNames.add(normaliseName(n));
      hits.push({
        key: t.key,
        name: t.name,
        sportKey: doc.sportKey,
        league: doc.league,
        ...(t.crestUrl ? { crestUrl: t.crestUrl } : {}),
        ...(t.colours ? { colours: t.colours } : {}),
        ...(doc.tsdbPollPath ? { pollPath: doc.tsdbPollPath } : {}),
      });
    }
  }

  // 2. Live TSDB search for served team-followable leagues the cache
  // hasn't met yet. Key AND name dedup drops cross-provider doubles
  // (a club already found via fdorg must not reappear as tsdb).
  try {
    for (const hit of await searchTsdbTeams(tsdbKey, rawQuery)) {
      const served = TSDB_LEAGUES[hit.leagueId];
      if (!served) continue;
      const key = `tsdb-team-${hit.id}`;
      if (seenKeys.has(key) || seenNames.has(normaliseName(hit.name))) continue;
      seenKeys.add(key);
      hits.push({
        key,
        name: hit.name,
        sportKey: served.sportKey,
        league: served.label,
        pollPath: served.pollPath,
        ...(hit.crestUrl ? { crestUrl: hit.crestUrl } : {}),
      });
    }
  } catch {
    // Search stays useful on cached data when the provider hiccups.
  }

  // Rank: prefix matches first, then shorter names; stable slice.
  return hits
    .sort((a, b) => {
      const ap = normaliseName(a.name).startsWith(q) ? 0 : 1;
      const bp = normaliseName(b.name).startsWith(q) ? 0 : 1;
      return ap - bp || a.name.length - b.name.length;
    })
    .slice(0, cap);
}

// ─── Athletes ─────────────────────────────────────────────────────────

export interface SearchAthleteHit {
  key: string; // athlete-<slug> follow key
  name: string;
  sportKey: string;
  pollPath?: string; // absent for review-sourced athletes (no poll route)
}

interface AthleteDirectoryDoc {
  key?: string;
  name?: string;
  sportKey?: string;
  searchName?: string;
  pollPath?: string;
  nextStartUtc?: string;
}

// The directory is written through by appearance ingest and bounded by
// "athletes with a future-dated appearance", which today is tens of
// docs. The scan is capped and the cap is REPORTED via the truncated
// flag on the cache rather than silently shrinking the search space.
const ATHLETE_SCAN_CAP = 1000;
const ATHLETE_CACHE_MS = 60_000;
let athleteCache: {
  at: number;
  docs: AthleteDirectoryDoc[];
  truncated: boolean;
} | null = null;

async function loadAthletes(
  db: Firestore,
): Promise<{ docs: AthleteDirectoryDoc[]; truncated: boolean }> {
  if (athleteCache && Date.now() - athleteCache.at < ATHLETE_CACHE_MS) {
    return athleteCache;
  }
  // Soonest upcoming first, so if the cap ever bites it drops the
  // athletes furthest from mattering.
  const snap = await db
    .collection('athleteDirectory')
    .orderBy('nextStartUtc', 'asc')
    .limit(ATHLETE_SCAN_CAP)
    .get();
  const docs = snap.docs.map((d) => d.data() as AthleteDirectoryDoc);
  athleteCache = {
    at: Date.now(),
    docs,
    truncated: snap.size >= ATHLETE_SCAN_CAP,
  };
  if (athleteCache.truncated) {
    console.warn(
      `athleteDirectory scan hit its ${ATHLETE_SCAN_CAP}-doc cap — athlete search is no longer complete`,
    );
  }
  return athleteCache;
}

// An athlete is offered only while something upcoming exists for them —
// search must not promise fixtures we cannot deliver. Substring match on
// the normalised name, same as team search, so "nurmagomedov" finds
// "Usman Nurmagomedov".
export async function searchAthletes(
  db: Firestore,
  rawQuery: string,
  cap = 10,
): Promise<SearchAthleteHit[]> {
  const q = normaliseName(rawQuery);
  if (q.length < 2) return [];
  const nowIso = new Date().toISOString();
  const { docs } = await loadAthletes(db);
  return docs
    .filter(
      (d) =>
        d.key &&
        d.name &&
        d.sportKey &&
        (d.nextStartUtc ?? '') >= nowIso &&
        (d.searchName ?? normaliseName(d.name)).includes(q),
    )
    .sort((a, b) => {
      const ap = (a.searchName ?? '').startsWith(q) ? 0 : 1;
      const bp = (b.searchName ?? '').startsWith(q) ? 0 : 1;
      return ap - bp || (a.nextStartUtc ?? '').localeCompare(b.nextStartUtc ?? '');
    })
    .slice(0, cap)
    .map((d) => ({
      key: d.key!,
      name: d.name!,
      sportKey: d.sportKey!,
      ...(d.pollPath ? { pollPath: d.pollPath } : {}),
    }));
}
