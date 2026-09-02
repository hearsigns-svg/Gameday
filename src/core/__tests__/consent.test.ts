// analytics.ts reaches flags → firebase; neither is exercised here.
jest.mock('../flags', () => ({ flags: () => ({ analyticsEnabled: true }) }));
jest.mock('../storage', () => {
  const mem = new Map<string, unknown>();
  return {
    readJson: (k: string, fallback: unknown) => (mem.has(k) ? mem.get(k) : fallback),
    writeJson: (k: string, v: unknown) => void mem.set(k, v),
  };
});

import {
  consentState,
  effectiveConsent,
  PRE_CONSENT_ADS,
  PRE_CONSENT_ANALYTICS,
  recordConsent,
  UNDECIDED,
} from '../consent';
import { consentMapFor } from '../analytics';

describe('consent — one switch for analytics and ads', () => {
  it('undecided resolves to the pre-decision defaults: analytics on (test-build period), ads off', () => {
    expect(consentState()).toEqual(UNDECIDED);
    expect(effectiveConsent(UNDECIDED)).toEqual({ analytics: PRE_CONSENT_ANALYTICS, ads: PRE_CONSENT_ADS });
    expect(PRE_CONSENT_ADS).toBe(false);
  });

  it('a recorded answer wins over the defaults, for both signals', () => {
    const s = recordConsent({ analytics: false, ads: false });
    expect(s.decidedAt).not.toBeNull();
    expect(effectiveConsent(consentState())).toEqual({ analytics: false, ads: false });
    recordConsent({ analytics: true, ads: true });
    expect(effectiveConsent(consentState())).toEqual({ analytics: true, ads: true });
  });

  it('the Firebase consent map follows the choice: every ad signal moves together', () => {
    expect(consentMapFor({ analytics: true, ads: false })).toEqual({
      analytics_storage: true,
      ad_storage: false,
      ad_user_data: false,
      ad_personalization: false,
    });
    expect(consentMapFor({ analytics: false, ads: true })).toEqual({
      analytics_storage: false,
      ad_storage: true,
      ad_user_data: true,
      ad_personalization: true,
    });
  });
});
