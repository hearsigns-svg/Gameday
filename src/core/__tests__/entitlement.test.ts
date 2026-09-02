import {
  EntitlementState,
  FREE_PLAN,
  isPremiumEffective,
  OFFLINE_GRACE_MS,
  PAID_RENEW_WINDOW_MS,
  planEntitlementFrom,
  PREMIUM_PLAN,
  renewWindowEndsAt,
  TRIAL_KEEP_WINDOW_MS,
  trialKeepBoundary,
} from '../entitlement';

const now = Date.parse('2026-10-01T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const D = 86_400_000;
const H = 3_600_000;

const premium = (over: Partial<EntitlementState> = {}): EntitlementState => ({
  tier: 'premium',
  source: 'store',
  premiumUntil: iso(now + 20 * D),
  observedAt: iso(now - H),
  ...over,
});

describe('isPremiumEffective — offline grace', () => {
  it('premium with a future period end is effective', () => {
    expect(isPremiumEffective(premium(), now)).toBe(true);
  });
  it('premium with no period end stays effective (the store said so)', () => {
    expect(isPremiumEffective(premium({ premiumUntil: null }), now)).toBe(true);
  });
  it('a lapsed period end stays effective inside the offline grace, not after', () => {
    expect(isPremiumEffective(premium({ premiumUntil: iso(now - OFFLINE_GRACE_MS + H) }), now)).toBe(true);
    expect(isPremiumEffective(premium({ premiumUntil: iso(now - OFFLINE_GRACE_MS - H) }), now)).toBe(false);
  });
  it('free is never effective premium', () => {
    expect(isPremiumEffective({ tier: 'free', source: 'none', observedAt: iso(now) }, now)).toBe(false);
  });
});

describe('planEntitlementFrom — the flag and the downgrade policy', () => {
  it('an OPEN sync gate makes everyone plan as premium, whatever the state', () => {
    const lapsed: EntitlementState = {
      tier: 'free',
      source: 'store',
      lapseKind: 'paid',
      endedAt: iso(now - 10 * D),
      observedAt: iso(now),
    };
    expect(planEntitlementFrom(lapsed, now, true)).toEqual(PREMIUM_PLAN);
  });

  it('effective premium plans as premium; plain free plans as free with no removals', () => {
    expect(planEntitlementFrom(premium(), now, false)).toEqual(PREMIUM_PLAN);
    expect(
      planEntitlementFrom({ tier: 'free', source: 'none', observedAt: iso(now) }, now, false),
    ).toEqual(FREE_PLAN);
  });

  it('trial not converted: boundary = trial start + 30 days, anchored to the receipt', () => {
    const start = now - 40 * D;
    const p = planEntitlementFrom(
      { tier: 'free', source: 'store', lapseKind: 'trial', trialStartedAt: iso(start), observedAt: iso(now) },
      now,
      false,
    );
    expect(p.tier).toBe('free');
    expect(p.removeAfterUtc).toBe(iso(start + TRIAL_KEEP_WINDOW_MS));
    expect(p.removeFuture).toBeUndefined();
  });

  it('trial lapse without a receipt anchor removes nothing (under-removing is the safe failure)', () => {
    expect(
      planEntitlementFrom(
        { tier: 'free', source: 'store', lapseKind: 'trial', trialStartedAt: null, observedAt: iso(now) },
        now,
        false,
      ),
    ).toEqual(FREE_PLAN);
  });

  it('paid lapse: nothing added or removed inside the 72-hour renew window', () => {
    const ended = now - 24 * H;
    const p = planEntitlementFrom(
      { tier: 'free', source: 'store', lapseKind: 'paid', endedAt: iso(ended), observedAt: iso(now) },
      now,
      false,
    );
    expect(p).toEqual(FREE_PLAN);
  });

  it('paid lapse: at 72 hours every future placed event is removed', () => {
    const ended = now - PAID_RENEW_WINDOW_MS;
    const p = planEntitlementFrom(
      { tier: 'free', source: 'store', lapseKind: 'paid', endedAt: iso(ended), observedAt: iso(now) },
      now,
      false,
    );
    expect(p).toEqual({ tier: 'free', removeFuture: true });
  });

  it('paid lapse with no end time never removes', () => {
    expect(
      planEntitlementFrom(
        { tier: 'free', source: 'store', lapseKind: 'paid', endedAt: null, observedAt: iso(now) },
        now,
        false,
      ),
    ).toEqual(FREE_PLAN);
  });

  it('restore: premium again → premium plan, no removal effects linger', () => {
    const restored = premium({ lapseKind: null, endedAt: null });
    expect(planEntitlementFrom(restored, now, false)).toEqual(PREMIUM_PLAN);
  });
});

describe('the boundary readers the downgrade screen will use', () => {
  it('renewWindowEndsAt and trialKeepBoundary answer only for their lapse kind', () => {
    const ended = iso(now - H);
    expect(
      renewWindowEndsAt({ tier: 'free', source: 'store', lapseKind: 'paid', endedAt: ended, observedAt: iso(now) }),
    ).toBe(iso(now - H + PAID_RENEW_WINDOW_MS));
    expect(
      renewWindowEndsAt({ tier: 'free', source: 'store', lapseKind: 'trial', endedAt: ended, observedAt: iso(now) }),
    ).toBeNull();
    const start = iso(now - 5 * D);
    expect(
      trialKeepBoundary({ tier: 'free', source: 'store', lapseKind: 'trial', trialStartedAt: start, observedAt: iso(now) }),
    ).toBe(iso(now - 5 * D + TRIAL_KEEP_WINDOW_MS));
    expect(
      trialKeepBoundary({ tier: 'free', source: 'store', lapseKind: 'paid', trialStartedAt: start, observedAt: iso(now) }),
    ).toBeNull();
  });
});
