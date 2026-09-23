// The on-device search index — PURE (2026-09-03 search audit).
//
// The server search answered every keystroke from a Cloud Function; a
// cold instance took 4–5 s and a phone on a slow network sat on a
// spinner that read as "broken". The index is the same served
// directories — every team of every served league with the aliases the
// providers publish, every directory athlete — kept on the device and
// refreshed daily, so typing answers immediately and offline. The
// server search still runs behind it and its answer MERGES in: it knows
// the live provider's teams and the freshest data, and on any key both
// know, the server's row wins.
//
// The fold and the ranking mirror the server (functions/src/search.ts):
// exact name-or-alias match first, then prefix, then contained; shorter
// names first within a rung; athletes rank active before inactive and
// sooner events first, as the server does.

import { foldName } from '../../../core/nameFold';
import type { SearchAthleteHit, SearchTeamHit } from '../data/directoryRepo';

// The compact wire shape — one-letter fields, named here.
export interface IndexedTeam {
  k: string; // follow key
  n: string; // display name
  s: string; // sport key
  l: string; // league label
  a?: string[]; // aliases
  c?: string; // crest url
  o?: string; // colours text
  b?: string[]; // burst colours
  p?: string; // poll path
}

export interface IndexedAthlete {
  k: string;
  n: string;
  s: string;
  a?: string[]; // aliases, normalised
  g?: string; // grouping title
  c?: string; // country code
  x?: string; // next start utc
  h: number; // accent hue
  r?: 'retired';
  y?: number;
  i?: 1; // inactive
}

export interface SearchIndex {
  teams: IndexedTeam[];
  athletes: IndexedAthlete[];
  at: string;
}

export const LOCAL_TEAM_CAP = 20;
export const LOCAL_ATHLETE_CAP = 10;

function rung(names: readonly string[], q: string): number {
  const folded = names.map(foldName);
  if (folded.some((n) => n === q)) return 0;
  if (folded.some((n) => n.startsWith(q))) return 1;
  if (folded.some((n) => n.includes(q))) return 2;
  return 3;
}

export function localTeamHits(
  index: SearchIndex | null,
  rawQuery: string,
  sportKey?: string,
): SearchTeamHit[] {
  const q = foldName(rawQuery.trim());
  if (!index || q.length < 2) return [];
  return index.teams
    .filter((t) => sportKey === undefined || t.s === sportKey)
    .map((t, i) => ({ t, i, rung: rung([t.n, ...(t.a ?? [])], q) }))
    .filter((x) => x.rung < 3)
    .sort((a, b) => a.rung - b.rung || a.t.n.length - b.t.n.length || a.i - b.i)
    .slice(0, LOCAL_TEAM_CAP)
    .map(({ t }) => ({
      key: t.k,
      name: t.n,
      sportKey: t.s,
      league: t.l,
      ...(t.c ? { crestUrl: t.c } : {}),
      ...(t.o ? { colours: t.o } : {}),
      ...(t.b ? { burstColours: t.b } : {}),
      ...(t.p ? { pollPath: t.p } : {}),
    }));
}

export function localAthleteHits(
  index: SearchIndex | null,
  rawQuery: string,
  sportKey?: string,
): SearchAthleteHit[] {
  const q = foldName(rawQuery.trim());
  if (!index || q.length < 2) return [];
  return index.athletes
    .filter((a) => sportKey === undefined || a.s === sportKey)
    .map((a, i) => ({ a, i, rung: rung([a.n, ...(a.a ?? [])], q) }))
    .filter((x) => x.rung < 3)
    .sort((x, y) => {
      if (x.rung !== y.rung) return x.rung - y.rung;
      const xa = x.a.i ? 1 : 0;
      const ya = y.a.i ? 1 : 0;
      if (xa !== ya) return xa - ya;
      // Sooner first; "nothing scheduled" last. Code-unit order, NOT
      // localeCompare: ICU collation sorts the '~' sentinel BEFORE
      // digits, which put athletes with no event above those with one.
      const xn = x.a.x ?? '~';
      const yn = y.a.x ?? '~';
      if (xn !== yn) return xn < yn ? -1 : 1;
      return x.i - y.i;
    })
    .slice(0, LOCAL_ATHLETE_CAP)
    .map(({ a }) => ({
      key: a.k,
      name: a.n,
      sportKey: a.s,
      accentHue: a.h,
      ...(a.g ? { grouping: a.g } : {}),
      ...(a.x ? { nextStartUtc: a.x } : {}),
      ...(a.c ? { countryCode: a.c } : {}),
      ...(a.r ? { careerStatus: a.r } : {}),
      ...(a.y !== undefined ? { careerEndYear: a.y } : {}),
    }));
}

// THE ROWS ON SCREEN NEVER MOVE (found on the simulator 2026-09-23):
// the device's rows paint first, and a tap aimed at one landed on a
// different team when the server's answer arrived and reordered the
// list under the finger ("warriors" → a follow of Winona State; the
// server led with NCAA sides whose nickname alias matched exactly).
// So the device's rows keep their places — refreshed IN PLACE with the
// server's fields where both know a key, the server's being the fresher
// — and rows only the server knows are appended below them.
export function mergeHits<T extends { key: string }>(
  local: readonly T[],
  server: readonly T[] | null,
): T[] {
  if (!server) return [...local];
  const fromServer = new Map(server.map((h) => [h.key, h] as const));
  const kept = local.map((h) => fromServer.get(h.key) ?? h);
  const shown = new Set(local.map((h) => h.key));
  return [...kept, ...server.filter((h) => !shown.has(h.key))];
}
