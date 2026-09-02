// Entitlements — PURE, in core because the planner, the settings rows,
// the schedule badges and the reminders all read it. Round 5 (owner
// rulings 2026-09-02).
//
// The store (RevenueCat in Stage 3) is the source of truth for WHETHER
// the user is Premium; this module decides what that means for the
// calendar: which planner effects apply, and — after a downgrade —
// which placed events stay and which are removed.
//
// THE RULES (Stage 1 rulings, verbatim in DECISIONS):
//   * Free: the planner skips `create` only. `update` and the delete
//     loop are untouched; placed events keep receiving time changes and
//     cancellations. Removal is never gated on any tier.
//   * Trial not converted: boundary = trial start + 30 days, anchored to
//     the store receipt. Placed events dated on/before the boundary
//     stay; placed events dated after it are removed.
//   * Paid subscription not renewed: once the store declares it ended a
//     72-hour renew window opens — nothing added or removed meanwhile;
//     at 72 hours every FUTURE placed event is removed. Past events are
//     never touched, on any path.
//   * Restore: resubscribing re-syncs everything in one pass (Premium
//     again → no gating; the planner's normal create path refills).
//   * Removals run ledger-scoped, batched under the delete cap, the
//     ledger clearing per event (the engine's existing delete op).

export type EntitlementTier = 'free' | 'premium';

// What the billing layer knows, persisted locally so the planner can
// read it offline. `source` says who wrote it: nothing yet, a test
// fixture (the flag-on test build), or the store SDK (Stage 3).
export interface EntitlementState {
  tier: EntitlementTier;
  source: 'none' | 'test' | 'store';
  // End of the current paid/trial period as the store reports it.
  premiumUntil?: string | null;
  // The store receipt's trial start — the downgrade boundary's anchor.
  trialStartedAt?: string | null;
  // When the store declared the subscription ENDED (after its own
  // billing grace). Opens the 72-hour renew window for a paid lapse.
  endedAt?: string | null;
  // Which kind of period lapsed. Absent while premium or never premium.
  lapseKind?: 'trial' | 'paid' | null;
  // When this state was last confirmed with the store.
  observedAt: string;
}

export const FREE_STATE: EntitlementState = {
  tier: 'free',
  source: 'none',
  observedAt: '1970-01-01T00:00:00.000Z',
};

// Offline grace: a cached Premium whose period end has passed stays
// effective this long past the end, so a phone in a dead zone on
// renewal day does not lose its calendar for want of a receipt check.
export const OFFLINE_GRACE_MS = 3 * 86_400_000;
export const TRIAL_KEEP_WINDOW_MS = 30 * 86_400_000;
export const PAID_RENEW_WINDOW_MS = 72 * 3_600_000;

// What the planner is told. Deliberately smaller than the state: the
// planner never reasons about receipts, only about effects.
export interface PlanEntitlement {
  tier: EntitlementTier;
  // Placed events STARTING after this instant are removed (trial keep
  // window). Absent = no boundary removal.
  removeAfterUtc?: string;
  // Every placed event that has not yet started is removed (paid lapse
  // past the renew window).
  removeFuture?: boolean;
}

export const PREMIUM_PLAN: PlanEntitlement = { tier: 'premium' };
export const FREE_PLAN: PlanEntitlement = { tier: 'free' };

export function isPremiumEffective(state: EntitlementState, nowMs: number): boolean {
  if (state.tier !== 'premium') return false;
  const until = Date.parse(state.premiumUntil ?? '');
  if (!Number.isFinite(until)) return true; // the store said premium, no end given
  return nowMs < until + OFFLINE_GRACE_MS;
}

// The downgrade policy. `gateOpen` is the feature flag: while the sync
// gate is open (launch default until Stage 5) everyone plans as
// Premium and no downgrade effect applies — the flag is the whole
// rollout switch, so its open state must be inert.
export function planEntitlementFrom(
  state: EntitlementState,
  nowMs: number,
  gateOpen: boolean,
): PlanEntitlement {
  if (gateOpen) return PREMIUM_PLAN;
  if (isPremiumEffective(state, nowMs)) return PREMIUM_PLAN;
  if (state.lapseKind === 'trial') {
    const start = Date.parse(state.trialStartedAt ?? '');
    if (Number.isFinite(start)) {
      return {
        tier: 'free',
        removeAfterUtc: new Date(start + TRIAL_KEEP_WINDOW_MS).toISOString(),
      };
    }
    // No receipt anchor: nothing can be dated against a boundary, so
    // nothing is removed — under-removing is the safe failure.
    return FREE_PLAN;
  }
  if (state.lapseKind === 'paid') {
    const ended = Date.parse(state.endedAt ?? '');
    if (Number.isFinite(ended) && nowMs >= ended + PAID_RENEW_WINDOW_MS) {
      return { tier: 'free', removeFuture: true };
    }
    // Inside the renew window (or the end time is unknown): nothing
    // added, nothing removed.
    return FREE_PLAN;
  }
  return FREE_PLAN;
}

// Whether the paid-lapse renew window is currently open — the
// downgrade screen and its single notification key on this (Stage 4).
export function renewWindowEndsAt(state: EntitlementState): string | null {
  if (state.lapseKind !== 'paid') return null;
  const ended = Date.parse(state.endedAt ?? '');
  if (!Number.isFinite(ended)) return null;
  return new Date(ended + PAID_RENEW_WINDOW_MS).toISOString();
}

export function trialKeepBoundary(state: EntitlementState): string | null {
  if (state.lapseKind !== 'trial') return null;
  const start = Date.parse(state.trialStartedAt ?? '');
  if (!Number.isFinite(start)) return null;
  return new Date(start + TRIAL_KEEP_WINDOW_MS).toISOString();
}
