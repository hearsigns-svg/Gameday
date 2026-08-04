// WTA singles rankings — the tennis roster source.
//
// Same approved host as the draws/OOP connector (api.wtatennis.com,
// owner ruling 2026-08-02): the WTA's own API, no key, no auth. The
// rankings are the companion to the draws — NUMERIC PLAYER IDS are the
// thing this fetch is actually for: they are the disambiguation source
// canonical identity is built on (F34's input, banked in Prompt 5b).
//
// Depth: top RANKING_DEPTH (200). Deep enough to cover anyone plausibly
// followed; players outside it who appear in a draw still become
// athletes at appearance time — WITH their numeric id — via the
// fixture-derived path, so the cut-off costs identity nothing.
//
// ORDERING, stated per the Prompt 6 rule: the feed is requested
// sort=asc on rank and each row carries its `ranking`; the fetch
// verifies contiguous coverage of 1..N and THROWS on a gap or shuffle —
// a capped fetch over an unproven order is how PBC starved its upcoming
// card. ALL-OR-NOTHING: a failed page fails the whole roster run, so
// absence accounting can never run against a half-fetched truth.

import { groupTitleOf, RosterEntry } from '../athletes';
import { requireArray } from './fetchResult';

const BASE = 'https://api.wtatennis.com/tennis';

export const USER_AGENT =
  'KickOffCal/1.0 (+https://kickoffcal.app; calendar sync; contact hearsigns@gmail.com)';

export const RANKING_DEPTH = 200;
const PAGE_SIZE = 100;
export const WTA_REQUEST_GAP_MS = 1_000;

interface RankedRow {
  player?: {
    id?: number;
    fullName?: string;
    countryCode?: string;
  };
  ranking?: number;
}

export function rankedRowsToEntries(
  rows: readonly RankedRow[],
): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const r of rows) {
    const id = r.player?.id;
    const name = r.player?.fullName?.trim();
    const rank = r.ranking;
    // A row without an id or name cannot join anything — shape rot, not
    // an empty ranking. Fail loudly rather than skipping quietly.
    if (id === undefined || !name || typeof rank !== 'number') {
      throw new Error(
        `wta rankings: row missing id/name/rank: ${JSON.stringify(r).slice(0, 120)}`,
      );
    }
    out.push({
      source: 'wta',
      externalId: String(id),
      name,
      sport: 'tennis',
      // The title itself lives in GROUP_TITLES (athletes.ts) so browse,
      // search and the draw-mint path cannot drift apart; this is the
      // stored fallback.
      grouping: groupTitleOf('wta')!,
      groupingKey: 'wta',
      rank,
      ...(r.player?.countryCode ? { countryCode: r.player.countryCode } : {}),
    });
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchWtaRankings(
  depth: number = RANKING_DEPTH,
): Promise<{ rawCount: number; entries: RosterEntry[] }> {
  const pages = Math.ceil(depth / PAGE_SIZE);
  const entries: RosterEntry[] = [];
  let raw = 0;
  for (let page = 0; page < pages; page++) {
    if (page > 0) await wait(WTA_REQUEST_GAP_MS);
    const res = await fetch(
      `${BASE}/players/ranked?page=${page}&pageSize=${PAGE_SIZE}&type=rankSingles&sort=asc&metric=SINGLES`,
      { headers: { 'User-Agent': USER_AGENT } },
    );
    if (!res.ok) throw new Error(`wta rankings http ${res.status}`);
    const rows = requireArray(
      (await res.json()) as RankedRow[] | null | undefined,
      'wta',
      'ranked players',
    );
    raw += rows.length;
    entries.push(...rankedRowsToEntries(rows));
  }
  const inDepth = entries.filter((e) => (e.rank ?? Infinity) <= depth);
  // Prove the ordering the slice depends on: ranks must cover 1..depth
  // contiguously (ties don't exist in this table). A gap means the feed
  // paged differently than believed — refuse to publish a roster whose
  // "top 200" is secretly something else.
  const seen = new Set(inDepth.map((e) => e.rank));
  for (let r = 1; r <= Math.min(depth, entries.length); r++) {
    if (!seen.has(r)) {
      throw new Error(`wta rankings: rank ${r} missing from fetched pages`);
    }
  }
  return { rawCount: raw, entries: inDepth };
}
