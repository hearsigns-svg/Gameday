// Federated team search: everything the app can actually follow.
// Sources: the teamDirectory cache (fdorg soccer comps, MLB, NHL, and
// browsed TSDB leagues) plus a live TSDB name search FILTERED to the
// leagues we serve with team-level follows. Results outside served
// leagues never appear — search must not promise fixtures we can't
// deliver.

import { Firestore } from 'firebase-admin/firestore';
import { normaliseName } from './identity';
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

// TSDB leagues with team-level follows. ONE table drives the live
// search filter, the directory doc handling, and the pollPath a
// search-created follow carries — and a test pins these strings to the
// client sportsConfig so a season roll can't drift them apart.
export const TSDB_TEAM_LEAGUES: Record<
  string,
  { docId: string; sportKey: string; league: string; pollPath: string }
> = {
  '4387': {
    docId: 'basketball-nba',
    sportKey: 'basketball',
    league: 'NBA',
    pollPath:
      'pollTsdbLeague?leagueId=4387&season=2025-2026&sport=basketball&durationHours=2.5',
  },
  '4391': {
    docId: 'nfl-nfl',
    sportKey: 'nfl',
    league: 'NFL',
    pollPath:
      'pollTsdbLeague?leagueId=4391&season=2026&sport=nfl&durationHours=3',
  },
  '4460': {
    docId: 'cricket-ipl',
    sportKey: 'cricket',
    league: 'IPL',
    pollPath:
      'pollTsdbLeague?leagueId=4460&season=2026&sport=cricket&durationHours=4',
  },
};

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
    ...Object.values(TSDB_TEAM_LEAGUES).map((l) => ({
      id: l.docId,
      sportKey: l.sportKey,
      league: l.league,
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
      const served = TSDB_TEAM_LEAGUES[hit.leagueId];
      if (!served) continue;
      const key = `tsdb-team-${hit.id}`;
      if (seenKeys.has(key) || seenNames.has(normaliseName(hit.name))) continue;
      seenKeys.add(key);
      hits.push({
        key,
        name: hit.name,
        sportKey: served.sportKey,
        league: served.league,
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
