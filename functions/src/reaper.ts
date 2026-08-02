// The reaper — what a fresh, successful fetch proves ABSENT. PURE.
//
// Ingest never deletes (a design choice from day one), so a fixture a
// provider withdraws — cancelled without a status, rescheduled under a
// new id, or simply removed — sat in the cache forever, and in
// calendars with it (F30). The reaper closes that: after a successful
// non-empty fetch of a slice, future-dated docs of that slice that the
// fetch did not return are soft-cancelled. The horizon rule makes this
// safe by construction: only future-dated docs are ever candidates, so
// the reaper cannot destroy history.
//
// THE GUARDS, in the order they matter:
//   - Never on an errored or empty fetch (the caller's precondition —
//     an empty result must never impersonate "everything was
//     withdrawn"; that is the standing invariant).
//   - SOURCE-scoped: a slice query returns cross-provider docs (alias
//     keys, merged fixtures). A TSDB fetch proves nothing about an
//     fdorg-id doc that carries a tsdb followKey — reaping it would
//     cancel a live merged fixture. Only docs whose id belongs to the
//     fetching source are candidates.
//   - SEASON-scoped via the date envelope: fixtures carry no season
//     field, so the fetched season's own [min, max] startUtc range
//     (padded a week each way) bounds what the fetch may testify
//     about. A pre-announced next-season doc outside the envelope is
//     spared until its own season is the one being fetched.
//   - COMPLETE fetches only: the caller arms the reaper per route, and
//     only routes whose fetch returns the slice's whole current truth
//     qualify. A CAPPED fetch (athletics' page budget, PBC's card cap)
//     proves absence of nothing — its gaps are budget, not withdrawal.
//   - APPEARANCES are never reaped: evidence-guarded retirement
//     (appearances.ts) already owns vanishing bouts and draw exits,
//     with its own per-parent rules. Two actors on one doc would fight.
//   - The 20% CEILING: a fetch missing more than a fifth of a slice's
//     live docs is treated as a broken fetch, not a mass withdrawal —
//     nothing is reaped and the trip is recorded loudly.
//
// Soft-delete only: status 'cancelled' is the one state the whole
// pipeline already propagates as calendar deletion, and a doc wrongly
// cancelled by a race self-heals — the next successful fetch that
// returns it rewrites it scheduled.

import { Fixture } from './fixture';

export const REAP_CEILING = 0.2;

export interface ReapDecision {
  candidates: Fixture[];
  // Live same-source docs the fetch was measured against.
  liveCount: number;
  guardTripped: boolean;
}

const sourceOfId = (id: string): string => id.split('-')[0];

export function reapCandidates(
  existing: readonly Fixture[],
  incoming: readonly Fixture[],
  source: string,
  nowIso: string,
  // The REQUEST WINDOW's end, for fetches that are complete only up to
  // a date boundary (athletics' rolling 120 days, WTA's 180): the
  // envelope must never extend past what the fetch actually asked for.
  // Without this cap the first armed athletics run would have cancelled
  // twenty real meetings sitting a few days past the window edge —
  // window-clipped, not withdrawn (live-verified against production by
  // the Prompt 7 review). Whole-season fetches pass nothing.
  windowEndUtc?: string,
): ReapDecision {
  if (incoming.length === 0) {
    return { candidates: [], liveCount: 0, guardTripped: false };
  }
  const incomingIds = new Set(incoming.map((f) => f.id));
  const starts = incoming.map((f) => f.startUtc).sort();
  // The envelope is padded a week each way: a genuine withdrawal at a
  // season's edge sits DAYS beyond the remaining fixtures' range and
  // must still be provable-absent, while adjacent seasons sit MONTHS
  // apart and must stay out of reach. (Smallest real gap in the served
  // config: a soccer summer break, ~6 weeks — four times the pad.)
  const pad = 7 * 86_400_000;
  const envelopeMin = new Date(Date.parse(starts[0]) - pad).toISOString();
  const paddedMax = new Date(
    Date.parse(starts[starts.length - 1]) + pad,
  ).toISOString();
  const envelopeMax =
    windowEndUtc && windowEndUtc < paddedMax ? windowEndUtc : paddedMax;
  // The measured population is the IN-ENVELOPE live docs — what this
  // fetch can actually testify about. Dividing by the whole slice
  // diluted the ceiling whenever two seasons' future docs coexisted
  // under one followKey (F1 in October: ~15 live 2026 sessions beside
  // ~120 pre-announced 2027 ones — a truncated 2026 fetch missing 14 of
  // 15 read as 10%, not the 93% it really was).
  const live = existing.filter(
    (e) =>
      sourceOfId(e.id) === source &&
      e.parentFixtureId === undefined &&
      e.status !== 'cancelled' &&
      e.startUtc >= nowIso &&
      e.startUtc >= envelopeMin &&
      e.startUtc <= envelopeMax,
  );
  const candidates = live.filter((e) => !incomingIds.has(e.id));
  const guardTripped =
    live.length > 0 && candidates.length / live.length > REAP_CEILING;
  // Candidates are returned even when the guard trips — the dry-run
  // report needs the list; the CALLER must not apply a tripped set.
  return { candidates, liveCount: live.length, guardTripped };
}
