// Billing state → entitlement state — PURE. Round 5 Stage 3.
//
// The store SDK (RevenueCat) hands us a CustomerInfo; this module turns
// the parts we need into the EntitlementState the planner reads
// (core/entitlement.ts). Structural input types so the mapping is
// testable without the SDK, and so a vendor swap touches one adapter.
//
// THE FACTS WE NEED: is the Premium entitlement active; when does its
// period end; was it a trial; and — when it is NOT active but was —
// which kind of period lapsed and when the store declared the end.
// RevenueCat keeps an entitlement ACTIVE through the store's billing
// grace, so "inactive with an expiration in the past" already means the
// store has declared the end (ruling 3: the 72-hour renew window opens
// from that instant).

import { EntitlementState, FREE_STATE } from './entitlement';

export const PREMIUM_ENTITLEMENT_ID = 'premium';

export interface EntitlementInfoLike {
  isActive: boolean;
  periodType: 'NORMAL' | 'TRIAL' | 'INTRO' | string;
  latestPurchaseDate: string | null; // ISO
  originalPurchaseDate?: string | null;
  expirationDate: string | null; // ISO, null = lifetime
  willRenew?: boolean;
  unsubscribeDetectedAt?: string | null;
  billingIssueDetectedAt?: string | null;
}

export interface CustomerInfoLike {
  entitlements: {
    all: Record<string, EntitlementInfoLike | undefined>;
  };
  originalAppUserId?: string;
}

// `prior` lets a lapse remember what it lapsed FROM: once the store
// reports the entitlement inactive, its periodType still says what the
// last period was (TRIAL vs NORMAL) — but a receipt we never saw active
// (a fresh install restoring nothing) must not invent a lapse.
export function entitlementFromCustomerInfo(
  info: CustomerInfoLike | null | undefined,
  prior: EntitlementState,
  nowMs: number,
  entitlementId: string = PREMIUM_ENTITLEMENT_ID,
): EntitlementState {
  const observedAt = new Date(nowMs).toISOString();
  const e = info?.entitlements?.all?.[entitlementId];
  if (!e) {
    // No entitlement record at all: never premium on this account.
    return { ...FREE_STATE, source: 'store', observedAt };
  }
  const isTrial = e.periodType === 'TRIAL';
  if (e.isActive) {
    return {
      tier: 'premium',
      source: 'store',
      premiumUntil: e.expirationDate,
      // The receipt anchors the trial keep-window (ruling 3): the trial
      // period's own purchase date. Kept once set, so a converted trial
      // that later lapses still knows when its trial began.
      trialStartedAt: isTrial ? e.latestPurchaseDate : (prior.trialStartedAt ?? null),
      endedAt: null,
      lapseKind: null,
      observedAt,
    };
  }
  // Inactive with a record: the store has declared an end.
  const endedAt = e.expirationDate;
  const lapseKind: 'trial' | 'paid' = isTrial ? 'trial' : 'paid';
  return {
    tier: 'free',
    source: 'store',
    premiumUntil: e.expirationDate,
    trialStartedAt: isTrial ? e.latestPurchaseDate : (prior.trialStartedAt ?? null),
    endedAt,
    lapseKind,
    observedAt,
  };
}

// The funnel transitions the analytics layer logs (Stage 3): computed
// from the state change, never from UI events, so a purchase completed
// in the store's own sheet counts exactly once.
export type BillingTransition =
  | 'trial_started'
  | 'trial_converted'
  | 'subscription_started'
  | 'lapsed_trial'
  | 'lapsed_paid'
  | 'restored'
  | null;

export function billingTransition(
  prev: EntitlementState,
  next: EntitlementState,
  nextInfo?: CustomerInfoLike | null,
): BillingTransition {
  const e = nextInfo?.entitlements?.all?.[PREMIUM_ENTITLEMENT_ID];
  const nextTrial = e?.periodType === 'TRIAL';
  if (prev.tier !== 'premium' && next.tier === 'premium') {
    if (prev.lapseKind) return 'restored';
    return nextTrial ? 'trial_started' : 'subscription_started';
  }
  if (prev.tier === 'premium' && next.tier === 'premium') {
    // A trial that is now a paid period converted.
    const prevWasTrial = prev.trialStartedAt !== null && prev.trialStartedAt !== undefined &&
      prev.premiumUntil !== next.premiumUntil && !nextTrial && e?.periodType === 'NORMAL';
    return prevWasTrial ? 'trial_converted' : null;
  }
  if (prev.tier === 'premium' && next.tier === 'free') {
    return next.lapseKind === 'trial' ? 'lapsed_trial' : 'lapsed_paid';
  }
  return null;
}
