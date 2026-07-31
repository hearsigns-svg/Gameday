// football-data.org season resolution.
//
// `SOCCER_FD_SEASON = 2026` was one global constant for twelve
// competitions that do not share a season. Verified live 2026-07-31:
// the Premier League's current season starts 2026, the Champions League's
// starts 2025 and the European Championship's starts 2024 — so a single
// constant 404'd CL and EC outright, and the browse row for each offered a
// Follow button whose follow rolled straight back.
//
// The provider publishes the answer for every competition in ONE call, so
// resolution costs one request a day for all of them rather than one per
// competition.

import { Firestore } from 'firebase-admin/firestore';

const BASE = 'https://api.football-data.org/v4';

// Long enough that resolution costs one call a day; short enough that a
// newly published season is picked up the day after it lands.
export const FD_SEASON_TTL_MS = 24 * 3_600_000;
const CACHE_DOC = 'fdorg-seasons';

export interface FdSeason {
  code: string;
  seasonYear: number; // what /matches?season= expects: the START year
  startDate: string;
  endDate: string;
}

interface FdCompetitionRow {
  code?: string;
  currentSeason?: { startDate?: string; endDate?: string } | null;
}

// A competition is servable only if the provider knows a current season
// AND that season has not already ended. An ended season is exactly the
// "Follow button that yields nothing" case: it resolves, it 200s, and it
// hands back a completed fixture list. Determined from the season's own
// endDate, so it costs no extra request.
export function resolvableSeasons(
  rows: readonly FdCompetitionRow[],
  nowIso: string,
): FdSeason[] {
  const out: FdSeason[] = [];
  for (const c of rows) {
    const start = c.currentSeason?.startDate;
    const end = c.currentSeason?.endDate;
    if (!c.code || !start || !end) continue;
    if (end < nowIso.slice(0, 10)) continue; // season is over
    const seasonYear = Number(start.slice(0, 4));
    if (!Number.isInteger(seasonYear)) continue;
    out.push({ code: c.code, seasonYear, startDate: start, endDate: end });
  }
  return out;
}

interface CacheDoc {
  seasons?: FdSeason[];
  cachedAt?: string;
}

// Cached in Firestore rather than per-instance: the sweep and the browse
// routes run in different instances and should not each pay for a call.
export async function loadFdSeasons(
  db: Firestore,
  apiKey: string,
  nowMs: number = Date.now(),
): Promise<Map<string, FdSeason>> {
  const ref = db.collection('providerMeta').doc(CACHE_DOC);
  const snap = await ref.get();
  const cached = snap.exists ? (snap.data() as CacheDoc) : undefined;
  const fresh =
    cached?.cachedAt !== undefined &&
    nowMs - Date.parse(cached.cachedAt) < FD_SEASON_TTL_MS;
  if (fresh && cached?.seasons) {
    return new Map(cached.seasons.map((s) => [s.code, s]));
  }

  const res = await fetch(`${BASE}/competitions`, {
    headers: { 'X-Auth-Token': apiKey },
  });
  if (!res.ok) {
    // A refresh failure must not blank the directory: serve the stale copy
    // if we have one, and only fail when there is nothing to serve. An
    // empty list here would hide every soccer competition from browse.
    if (cached?.seasons) {
      console.warn(
        `[kickoffcal] fd season refresh failed (http ${res.status}), serving cache`,
      );
      return new Map(cached.seasons.map((s) => [s.code, s]));
    }
    throw new Error(`football-data http ${res.status}`);
  }
  const body = (await res.json()) as { competitions?: FdCompetitionRow[] };
  if (body.competitions === undefined) {
    throw new Error('football-data: response missing "competitions"');
  }
  const seasons = resolvableSeasons(
    body.competitions,
    new Date(nowMs).toISOString(),
  );
  await ref.set({ seasons, cachedAt: new Date(nowMs).toISOString() });
  return new Map(seasons.map((s) => [s.code, s]));
}
