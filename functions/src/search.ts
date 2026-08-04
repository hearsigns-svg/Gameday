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
//
// SINCE PROMPT 8 search hits the CANONICAL DIRECTORY (the `athletes`
// collection), not the fixture store: an athlete with no scheduled
// event must be findable and followable — that empty state is the
// feature. The old rule ("offered only while something upcoming
// exists") was exactly the Usyk failure: no announced fight, no search
// result, and when the fight lands weeks later the user who couldn't
// follow never finds out.
//
// Hits carry NO pollPath. An athlete follow needs no poll route of its
// own — the Prompt 7 catalogue keeps the athlete's sources warm
// regardless of followers, and the moment a bout or draw is announced
// the appearance carrying this athlete's canonical key flows to the
// follower through the ordinary query path.

import { accentHueOf, Athlete, groupTitleOf } from './athletes';
import { loadAthletes } from './rosterStore';

export interface SearchAthleteHit {
  key: string; // the CANONICAL athlete id (athlete_000184)
  name: string;
  sportKey: string;
  grouping?: string; // 'Heavyweight' | 'WTA Tour — Women' — the caption
  nextStartUtc?: string;
  accentHue: number; // generated colour identity (Prompt 9b)
  // Recorded retirement (Prompt 12) — search is the ONLY way most
  // retired men are ever reached (1,484 of the 1,513 carry no browse
  // group at all), so the marker matters more here than in browse.
  careerStatus?: 'retired';
  careerEndYear?: number;
}

const athleteHit = (a: Athlete): SearchAthleteHit => ({
  key: a.id,
  name: a.displayName,
  sportKey: a.sport,
  ...(groupTitleOf(a.groupingKey, a.grouping)
    ? { grouping: groupTitleOf(a.groupingKey, a.grouping)! }
    : {}),
  ...(a.nextStartUtc ? { nextStartUtc: a.nextStartUtc } : {}),
  ...(a.careerStatus ? { careerStatus: a.careerStatus } : {}),
  ...(a.careerEndYear !== undefined
    ? { careerEndYear: a.careerEndYear }
    : {}),
  accentHue: a.accentHue ?? accentHueOf(a.id),
});

// Substring match on the normalised name and aliases, same as team
// search, so "nurmagomedov" finds "Usman Nurmagomedov" and "Teófimo"
// finds "Teofimo Lopez". Inactive athletes stay findable — their page
// shows the honest empty state — they just rank below active ones.
export async function searchAthletes(
  db: Firestore,
  rawQuery: string,
  cap = 10,
): Promise<SearchAthleteHit[]> {
  const q = normaliseName(rawQuery);
  if (q.length < 2) return [];
  const athletes = await loadAthletes(db);
  return athletes
    .filter((a) => [a.searchName, ...a.aliases].some((n) => n.includes(q)))
    .sort((a, b) => {
      const ap = a.searchName.startsWith(q) ? 0 : 1;
      const bp = b.searchName.startsWith(q) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      const aa = a.active ? 0 : 1;
      const ba = b.active ? 0 : 1;
      if (aa !== ba) return aa - ba;
      // Sooner events first, then the better-ranked.
      const an = a.nextStartUtc ?? '~';
      const bn = b.nextStartUtc ?? '~';
      if (an !== bn) return an.localeCompare(bn);
      return (a.rank ?? 9999) - (b.rank ?? 9999);
    })
    .slice(0, cap)
    .map(athleteHit);
}

// ─── Individual-sport browse ──────────────────────────────────────────
//
// Curated entry points so the athlete screen is never empty: champions
// and rated fighters by weight class, tennis by ranking, F1's driver
// list — plus a "competing soon" row from the appearance-maintained
// nextStartUtc. Groups are built from the directory in memory (the
// collection is bounded); inactive athletes are excluded from curated
// lists but remain searchable.

export interface AthleteCard {
  key: string;
  name: string;
  sportKey: string;
  rank?: number;
  championOf?: string[];
  countryCode?: string;
  grouping?: string;
  nextStartUtc?: string;
  accentHue: number; // generated colour identity (Prompt 9b)
  // Recorded retirement (Prompt 12). Present only where a source states
  // it; absent means UNKNOWN, and no consumer may render absence as
  // "active".
  careerStatus?: 'retired';
  careerEndYear?: number;
}

export interface AthleteBrowse {
  groups: Array<{ grouping: string; groupingKey: string; athletes: AthleteCard[] }>;
  competingSoon: AthleteCard[];
}

const card = (a: Athlete): AthleteCard => ({
  key: a.id,
  name: a.displayName,
  sportKey: a.sport,
  accentHue: a.accentHue ?? accentHueOf(a.id),
  ...(a.rank !== undefined ? { rank: a.rank } : {}),
  ...(a.championOf !== undefined ? { championOf: a.championOf } : {}),
  ...(a.countryCode ? { countryCode: a.countryCode } : {}),
  // Resolved through GROUP_TITLES rather than read raw: a card's
  // caption and its section header must be the same words.
  ...(groupTitleOf(a.groupingKey, a.grouping)
    ? { grouping: groupTitleOf(a.groupingKey, a.grouping)! }
    : {}),
  ...(a.nextStartUtc ? { nextStartUtc: a.nextStartUtc } : {}),
  ...(a.careerStatus ? { careerStatus: a.careerStatus } : {}),
  ...(a.careerEndYear !== undefined
    ? { careerEndYear: a.careerEndYear }
    : {}),
});

// Boxing weight classes browse heavy → light, men then women — the
// order every boxing fan already knows. Other sports order groups
// alphabetically (they have one group today).
const BOXING_CLASS_ORDER = [
  'heavyweight', 'cruiserweight', 'light-heavyweight', 'super-middleweight',
  'middleweight', 'jr-middleweight', 'welterweight', 'jr-welterweight',
  'lightweight', 'jr-lightweight', 'featherweight', 'jr-featherweight',
  'bantamweight', 'jr-bantamweight', 'flyweight', 'jr-flyweight',
  'mini-flyweight', 'jr-mini-flyweight',
];

export function groupOrderKey(groupingKey: string): string {
  const mens = BOXING_CLASS_ORDER.indexOf(groupingKey.replace(/^boxing-/, ''));
  if (mens >= 0) return `0${String(mens).padStart(2, '0')}`;
  const womens = BOXING_CLASS_ORDER.indexOf(
    groupingKey.replace(/^boxing-w-/, ''),
  );
  if (womens >= 0 && groupingKey.startsWith('boxing-w-')) {
    return `1${String(womens).padStart(2, '0')}`;
  }
  // Tennis: the WTA top 50 (full live coverage) leads; then the men's
  // No. 1s who are STILL PLAYING; then the retired ones last. The
  // middle rank is the point of the ordering — the men's section used
  // to open on Agassi, Borg and Becker because the group had no rank
  // and fell to an alphabetical sort, which in an app about upcoming
  // events read as "there is nothing here for men" (Prompt 12).
  // The legacy unsplit key sorts BETWEEN the two it becomes, so a
  // partial refresh — some docs moved, some not — still reads top to
  // bottom as playing → unsplit → retired rather than interleaving.
  if (groupingKey === 'wta') return '20';
  if (groupingKey === 'atp-no1-active') return '21';
  if (groupingKey === 'atp-no1') return '22';
  if (groupingKey === 'atp-no1-retired') return '23';
  return `5${groupingKey}`;
}

export const GROUP_CAP = 50; // tennis top 50 — the curated cut, not the roster's
export const COMPETING_SOON_DAYS = 45;
export const COMPETING_SOON_CAP = 20;

export function shapeAthleteBrowse(
  athletes: readonly Athlete[],
  sport: string,
  nowIso: string,
): AthleteBrowse {
  const inSport = athletes.filter((a) => a.sport === sport);
  const byGroup = new Map<string, Athlete[]>();
  for (const a of inSport) {
    if (!a.active || !a.groupingKey) continue;
    // RETIRED ATHLETES ARE NOT BROWSABLE (owner ruling 2026-08-04).
    // They stay findable by name — someone will look for Federer — but
    // a curated list in an app about upcoming events must not surface
    // people who will never appear on one. Enforced HERE, at serve
    // time, rather than by withholding the group at the provider:
    // a groupingKey already written to a document survives every
    // refresh that stops emitting it, so the provider alone would keep
    // showing last week's retired group until the data caught up.
    if (a.careerStatus === 'retired') continue;
    const list = byGroup.get(a.groupingKey) ?? [];
    list.push(a);
    byGroup.set(a.groupingKey, list);
  }
  const groups = [...byGroup.entries()]
    .sort(([ka], [kb]) => groupOrderKey(ka).localeCompare(groupOrderKey(kb)))
    .map(([groupingKey, list]) => {
      const sorted = [...list].sort((a, b) => {
        // Champions first, then by rank, then name — the browse
        // structure users already understand.
        const ac = (a.championOf?.length ?? 0) > 0 ? 0 : 1;
        const bc = (b.championOf?.length ?? 0) > 0 ? 0 : 1;
        if (ac !== bc) return ac - bc;
        const r = (a.rank ?? 9999) - (b.rank ?? 9999);
        if (r !== 0) return r;
        return a.displayName.localeCompare(b.displayName);
      });
      return {
        // The header comes from the KEY, not from whichever athlete
        // happened to sort first — see GROUP_TITLES in athletes.ts.
        grouping: groupTitleOf(groupingKey, sorted[0].grouping)!,
        groupingKey,
        athletes: sorted.slice(0, GROUP_CAP).map(card),
      };
    });
  const horizon = new Date(
    Date.parse(nowIso) + COMPETING_SOON_DAYS * 86_400_000,
  ).toISOString();
  const competingSoon = inSport
    .filter(
      (a) =>
        a.nextStartUtc !== undefined &&
        a.nextStartUtc >= nowIso &&
        a.nextStartUtc <= horizon,
    )
    .sort((a, b) => a.nextStartUtc!.localeCompare(b.nextStartUtc!))
    .slice(0, COMPETING_SOON_CAP)
    .map(card);
  return { groups, competingSoon };
}
