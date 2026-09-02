import { FREE_STATE } from '../entitlement';
import {
  billingTransition,
  CustomerInfoLike,
  entitlementFromCustomerInfo,
  PREMIUM_ENTITLEMENT_ID,
} from '../billingState';

const now = Date.parse('2026-10-01T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const D = 86_400_000;

const info = (e: Partial<CustomerInfoLike['entitlements']['all'][string]> | null): CustomerInfoLike => ({
  entitlements: { all: e ? { [PREMIUM_ENTITLEMENT_ID]: { isActive: false, periodType: 'NORMAL', latestPurchaseDate: null, expirationDate: null, ...e } } : {} },
});

describe('entitlementFromCustomerInfo', () => {
  it('no entitlement record → free from the store, never a lapse', () => {
    const s = entitlementFromCustomerInfo(info(null), FREE_STATE, now);
    expect(s.tier).toBe('free');
    expect(s.source).toBe('store');
    expect(s.lapseKind ?? null).toBeNull();
  });

  it('an active trial is premium with the receipt anchoring trialStartedAt', () => {
    const s = entitlementFromCustomerInfo(
      info({ isActive: true, periodType: 'TRIAL', latestPurchaseDate: iso(now - 2 * D), expirationDate: iso(now + 12 * D) }),
      FREE_STATE,
      now,
    );
    expect(s.tier).toBe('premium');
    expect(s.trialStartedAt).toBe(iso(now - 2 * D));
    expect(s.premiumUntil).toBe(iso(now + 12 * D));
  });

  it('an active paid period keeps a previously known trial start (for a later lapse)', () => {
    const prior = { ...FREE_STATE, tier: 'premium' as const, trialStartedAt: iso(now - 20 * D) };
    const s = entitlementFromCustomerInfo(
      info({ isActive: true, periodType: 'NORMAL', latestPurchaseDate: iso(now - 6 * D), expirationDate: iso(now + 359 * D) }),
      prior,
      now,
    );
    expect(s.tier).toBe('premium');
    expect(s.trialStartedAt).toBe(iso(now - 20 * D));
  });

  it('an inactive trial record is a TRIAL lapse ended at its expiry', () => {
    const s = entitlementFromCustomerInfo(
      info({ isActive: false, periodType: 'TRIAL', latestPurchaseDate: iso(now - 16 * D), expirationDate: iso(now - 2 * D) }),
      FREE_STATE,
      now,
    );
    expect(s.tier).toBe('free');
    expect(s.lapseKind).toBe('trial');
    expect(s.endedAt).toBe(iso(now - 2 * D));
    expect(s.trialStartedAt).toBe(iso(now - 16 * D));
  });

  it('an inactive paid record is a PAID lapse (RevenueCat keeps access through billing grace, so inactive = the store declared the end)', () => {
    const s = entitlementFromCustomerInfo(
      info({ isActive: false, periodType: 'NORMAL', latestPurchaseDate: iso(now - 40 * D), expirationDate: iso(now - 1 * D) }),
      FREE_STATE,
      now,
    );
    expect(s.lapseKind).toBe('paid');
    expect(s.endedAt).toBe(iso(now - 1 * D));
  });
});

describe('billingTransition — funnel events from state changes, not taps', () => {
  const free = FREE_STATE;
  const trial = { ...FREE_STATE, tier: 'premium' as const, trialStartedAt: iso(now), premiumUntil: iso(now + 14 * D) };
  const paid = { ...FREE_STATE, tier: 'premium' as const, trialStartedAt: iso(now), premiumUntil: iso(now + 379 * D) };
  const trialInfo = info({ isActive: true, periodType: 'TRIAL', latestPurchaseDate: iso(now), expirationDate: iso(now + 14 * D) });
  const paidInfo = info({ isActive: true, periodType: 'NORMAL', latestPurchaseDate: iso(now + 14 * D), expirationDate: iso(now + 379 * D) });

  it('free → trial = trial_started; free → paid = subscription_started', () => {
    expect(billingTransition(free, trial, trialInfo)).toBe('trial_started');
    expect(billingTransition(free, paid, paidInfo)).toBe('subscription_started');
  });
  it('trial → paid period = trial_converted; same period twice = nothing', () => {
    expect(billingTransition(trial, paid, paidInfo)).toBe('trial_converted');
    expect(billingTransition(paid, paid, paidInfo)).toBeNull();
  });
  it('premium → free = lapsed by kind; a lapse → premium again = restored', () => {
    const lapsedTrial = { ...FREE_STATE, lapseKind: 'trial' as const, endedAt: iso(now) };
    const lapsedPaid = { ...FREE_STATE, lapseKind: 'paid' as const, endedAt: iso(now) };
    expect(billingTransition(trial, lapsedTrial)).toBe('lapsed_trial');
    expect(billingTransition(paid, lapsedPaid)).toBe('lapsed_paid');
    expect(billingTransition(lapsedPaid, paid, paidInfo)).toBe('restored');
  });
});
