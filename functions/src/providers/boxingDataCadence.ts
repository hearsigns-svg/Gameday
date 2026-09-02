// boxing-data polling cadence — PURE (owner ruling 2026-09-02: stay on
// the free tier and live inside 100 requests per subscription cycle,
// with headroom; Pro is revisited when a free user base gives the spend
// something to serve).
//
// THE PLAN. Every run costs one schedule call plus one bouts call per
// card fetched. A daily schedule call alone is ~30 of the 100, and a
// busy month of cards took the rest — the September 2026 exhaustion.
// So the SCHEDULE cadence is sparse by default and dense only when it
// matters, and the persisted remaining-quota figure gates every call:
//
//   baseline  — a schedule call every ~3 days (70h: 72h with the same
//               two-hour slack the daily cap used, so a late run does
//               not push the next one a whole day) while no known card
//               starts within the dense window;
//   dense     — daily (22h) while any known card starts within 3 days,
//               because that is when start times and undercards move;
//   bouts     — first sight, one refetch when ≤5 days out and ≥3 days
//               after the first (unchanged), plus ONE final look inside
//               the last 24 hours (ring-walk changes land late) — at most
//               three calls per card, ever;
//   reserve   — a call is never made that would take the cycle below
//               QUOTA_RESERVE remaining. The quota_low alert (alerts.ts)
//               fires when the PROJECTED spend to the window's reset
//               exceeds what is left above the reserve — before the wall,
//               by construction never after it.
//
// EXPECTED SPEND per 30-day cycle (recorded for the trade): baseline
// schedule calls ≈10; dense days ≈2 extra per card week ≈ 6–8; bouts:
// the seven-day window sees ≈16–24 distinct cards a month at ≤3 calls
// each but typically 2 → ≈32–48. Typical ≈ 50, worst ≈ 75, against
// 90 spendable (100 − reserve 10). WORST-CASE STALENESS: a card
// announced right after a baseline run is first seen up to 70h later; a
// card-start time change is caught within 24h inside the dense window
// and within 70h outside it; a bout (ring-walk) time change is caught by
// the final look inside the last 24h — so at fight time a bout is at
// most ~24h stale, and a card ≥3 days out at most ~3 days.

export const BASELINE_INTERVAL_MS = 70 * 3_600_000;
export const DENSE_INTERVAL_MS = 22 * 3_600_000;
export const DENSE_WINDOW_MS = 3 * 86_400_000;
export const QUOTA_RESERVE = 10;
export const MAX_CARDS_PER_RUN = 6;
// Cards per run the projection assumes when history is thin.
export const ASSUMED_CARDS_PER_RUN = 2;

export interface KnownCard {
  id: string;
  startUtc: string;
}

export interface QuotaSnapshot {
  remaining: number | null;
  resetAt?: string | null;
  limit?: number | null;
  // When the figure was observed (the marker stamps it).
  at?: string | null;
}

export type CadenceMode = 'baseline' | 'dense';

export interface CadencePlan {
  action: 'poll' | 'skip';
  reason?: 'cadence' | 'quota_reserve';
  mode: CadenceMode;
  intervalMs: number;
  nextEligibleAt: string | null;
  // How many bouts calls this run may make without breaching the
  // reserve (the schedule call itself is counted first).
  boutBudget: number;
}

// Dense while any known card starts within the window (a card already
// under way but not finished also counts — its undercard is still live).
export function cadenceModeFor(
  cards: readonly KnownCard[],
  nowMs: number,
  windowMs: number = DENSE_WINDOW_MS,
): CadenceMode {
  for (const c of cards) {
    const start = Date.parse(c.startUtc);
    if (!Number.isFinite(start)) continue;
    const untilStart = start - nowMs;
    if (untilStart <= windowMs && untilStart > -12 * 3_600_000) return 'dense';
  }
  return 'baseline';
}

// How long a persisted quota figure without a reset time stays trusted.
export const QUOTA_KNOWLEDGE_TTL_MS = 7 * 86_400_000;

// A persisted quota is only knowledge of THIS window. Once the vendor's
// reset time has passed the figure is stale — and since the gate makes
// no call while it holds, nothing would ever refresh it: a remaining=0
// carried across the reset would hold the poller shut forever. Past the
// reset (or, with no reset time, a week after it was observed) the
// quota is unknown again and the run goes ahead to learn the new figure.
export function currentQuota(
  quota: QuotaSnapshot | null | undefined,
  nowMs: number,
): QuotaSnapshot | null {
  if (!quota || quota.remaining === null || quota.remaining === undefined) return null;
  const resetMs = Date.parse(quota.resetAt ?? '');
  if (Number.isFinite(resetMs)) return nowMs < resetMs ? quota : null;
  const atMs = Date.parse(quota.at ?? '');
  if (Number.isFinite(atMs)) return nowMs - atMs < QUOTA_KNOWLEDGE_TTL_MS ? quota : null;
  return null;
}

export function boutBudgetFor(
  quota: QuotaSnapshot | null | undefined,
  maxCards: number = MAX_CARDS_PER_RUN,
  reserve: number = QUOTA_RESERVE,
): number {
  if (!quota || quota.remaining === null || quota.remaining === undefined) return maxCards;
  // One schedule call comes off the top before any bouts call.
  return Math.max(0, Math.min(maxCards, quota.remaining - reserve - 1));
}

export function planBoxingDataRun(input: {
  nowMs: number;
  lastSuccessAt: string | null;
  cards: readonly KnownCard[];
  quota: QuotaSnapshot | null;
}): CadencePlan {
  const mode = cadenceModeFor(input.cards, input.nowMs);
  const intervalMs = mode === 'dense' ? DENSE_INTERVAL_MS : BASELINE_INTERVAL_MS;
  const lastMs = Date.parse(input.lastSuccessAt ?? '');
  const nextEligibleMs = Number.isFinite(lastMs) ? lastMs + intervalMs : input.nowMs;
  const quota = currentQuota(input.quota, input.nowMs);
  const base = {
    mode,
    intervalMs,
    nextEligibleAt: Number.isFinite(lastMs) ? new Date(nextEligibleMs).toISOString() : null,
    boutBudget: boutBudgetFor(quota),
  };
  // The reserve is inviolable: with the schedule call itself the run
  // would dip below it, so the run does not happen.
  const remaining = quota?.remaining;
  if (remaining !== null && remaining !== undefined && remaining - 1 < QUOTA_RESERVE) {
    return { ...base, action: 'skip', reason: 'quota_reserve' };
  }
  if (input.nowMs < nextEligibleMs) return { ...base, action: 'skip', reason: 'cadence' };
  return { ...base, action: 'poll' };
}

// What the cycle will cost from now to its reset at the current mode:
// runs × (schedule + expected bouts). The alert compares this with what
// is left above the reserve — paging while there is still time to act.
export function projectedSpendToReset(input: {
  nowMs: number;
  resetAt: string | null | undefined;
  mode: CadenceMode;
  cardsPerRun?: number;
}): number | null {
  const resetMs = Date.parse(input.resetAt ?? '');
  if (!Number.isFinite(resetMs) || resetMs <= input.nowMs) return null;
  const intervalMs = input.mode === 'dense' ? DENSE_INTERVAL_MS : BASELINE_INTERVAL_MS;
  const runs = Math.ceil((resetMs - input.nowMs) / intervalMs);
  return runs * (1 + (input.cardsPerRun ?? ASSUMED_CARDS_PER_RUN));
}
